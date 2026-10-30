"""Byte-budgeted cache of loaded model sessions for the persistent dispatcher.

The dispatcher runs every script with a fresh globals dict, so a session built
inside a script dies with the run and the next request re-reads the .onnx and
re-uploads the weights (5 to 14 s for BiRefNet on a 3090, #776). Modules stay
in sys.modules across runs, so scripts import this one and ask it for sessions.

The budget is in bytes, not sessions: a BiRefNet is ~1.3 GB of weights plus an
inference arena ONNX Runtime grows on first use (~7.5 GB at 1200x1800) that
never shrinks, so two of them exhausted a 24 GB card. A count cannot express
that once several tools share the cache.

Env knobs (0 means auto, matching the API's convention):
  AI_SESSION_CACHE_BYTES   total budget. Auto is 40% of GPU VRAM, or no
                           caching on a CPU-only host. Set 1 to disable
                           caching on a GPU host.
  AI_SESSION_IDLE_TIMEOUT  seconds an unused session stays loaded. Auto is 600.
"""
import gc
import os
import subprocess
import sys
import threading
import time
from collections import OrderedDict

AUTO_VRAM_FRACTION = 0.4
AUTO_IDLE_TIMEOUT_S = 600
_REAPER_POLL_S = 15

# Resident cost per byte of .onnx file, calibrated on the #776 report: a 928 MB
# BiRefNet held ~7.5 GB on CUDA (weights plus a grown arena). Deliberately
# conservative. CPU sessions hold weights plus activations, no arena.
_CUDA_COST_FACTOR = 8
_CPU_COST_FACTOR = 4

_lock = threading.RLock()
_entries = OrderedDict()  # key -> _Entry, least recently used first
_busy = False
_used_this_request = set()
_reaper = None


class _Entry:
    __slots__ = ("value", "cost", "last_used")

    def __init__(self, value, cost):
        self.value = value
        self.cost = cost
        self.last_used = time.monotonic()


def _env_non_negative_int(name):
    raw = (os.environ.get(name) or "").strip()
    try:
        val = int(float(raw)) if raw else 0
    except (ValueError, OverflowError):
        return 0
    return max(val, 0)


def _visible_gpu_index():
    """GPU index to read, "all" when it can't be pinned, None when none are visible."""
    visible = os.environ.get("CUDA_VISIBLE_DEVICES")
    if visible is None:
        return "all"
    first = visible.split(",")[0].strip()
    if first == "" or first == "-1":
        return None
    return int(first) if first.isdigit() else "all"


def _total_vram_bytes():
    """Total VRAM of the GPU the sidecar uses, or 0.

    The background-removal bundle ships onnxruntime without torch, so torch
    alone would leave exactly those hosts with caching silently off. When the
    device can't be pinned (nvidia-smi orders by PCI bus, CUDA by speed, and
    CUDA_VISIBLE_DEVICES may hold UUIDs) the smallest card is used, so the
    budget errs low instead of sizing itself from a bigger GPU than ORT runs on.
    """
    index = _visible_gpu_index()
    if index is None:
        return 0
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.mem_get_info()[1]
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            totals = [int(line) * 1024 * 1024 for line in out.stdout.split()]
            return min(totals) if index == "all" else totals[index]
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
        pass
    return 0


_auto_budget_cache = None


def _auto_budget():
    global _auto_budget_cache
    # SNAPOTTER_GPU=0 forces CPU, so a VRAM-derived budget would be meaningless.
    if (os.environ.get("SNAPOTTER_GPU") or "").lower() in ("0", "false", "no"):
        return 0
    if _auto_budget_cache is None:
        budget = int(_total_vram_bytes() * AUTO_VRAM_FRACTION)
        # A zero may be a probe that timed out on a busy host; keep asking.
        if budget > 0:
            _auto_budget_cache = budget
        return budget
    return _auto_budget_cache


def budget_bytes(providers=()):
    """Explicit budget if set; otherwise VRAM-derived, and only for CUDA sessions.

    A VRAM-sized budget says nothing about host RAM, so CPU sessions are cached
    only when the operator sets AI_SESSION_CACHE_BYTES.
    """
    explicit = _env_non_negative_int("AI_SESSION_CACHE_BYTES")
    if explicit:
        return explicit
    return _auto_budget() if "CUDAExecutionProvider" in providers else 0


def idle_timeout_s():
    return _env_non_negative_int("AI_SESSION_IDLE_TIMEOUT") or AUTO_IDLE_TIMEOUT_S


def session_cost(model_path, providers):
    """Estimated resident bytes for a session, or None when the file is unknown."""
    try:
        size = os.path.getsize(model_path)
    except OSError:
        return None
    factor = _CUDA_COST_FACTOR if "CUDAExecutionProvider" in providers else _CPU_COST_FACTOR
    return size * factor


def _log(msg):
    print(f"[session-cache] {msg}", file=sys.stderr, flush=True)


def _drop(key):
    entry = _entries.pop(key)
    _used_this_request.discard(key)
    return entry.cost


def _evict_until_fits(cost, budget):
    """Drop least recently used entries until `cost` fits. Caller holds the lock."""
    evicted = False
    while _entries and sum(e.cost for e in _entries.values()) + cost > budget:
        key = next(iter(_entries))
        _drop(key)
        _log(f"evicted {key[0]} to fit a new session")
        evicted = True
    if evicted:
        # Dropping the reference alone does not return VRAM; a collection must run.
        gc.collect()


def get_session(model, providers, create, cost, **call_opts):
    """Return the cached session for (model, providers), creating it on a miss.

    `create` is a zero-argument factory. `cost` is session_cost() or None. A
    session is built without being cached when the cost is unknown, exceeds the
    whole budget, or the call carries per-call options (call_opts), which must
    not be silently shared between jobs.
    """
    if call_opts:
        return create()
    key = (model, tuple(providers))
    with _lock:
        entry = _entries.get(key)
        if entry is not None:
            entry.last_used = time.monotonic()
            _entries.move_to_end(key)
            _used_this_request.add(key)
            return entry.value

        budget = budget_bytes(providers)
        if cost is None or budget <= 0:
            return create()
        if cost > budget:
            # Too big to keep, but it still has to fit on the card next to
            # whatever is cached, so make room instead of loading beside it.
            evict_all("making room for an uncacheable session")
            return create()

        _evict_until_fits(cost, budget)
        value = create()
        _entries[key] = _Entry(value, cost)
        _used_this_request.add(key)
        return value


def evict_all(reason):
    """Drop every session, e.g. after an out-of-memory failure left VRAM fragmented.

    Returns whether anything was held, so a caller can retry only when there
    was memory to give back.
    """
    with _lock:
        if not _entries:
            return False
        _entries.clear()
        _used_this_request.clear()
        _log(f"evicted all sessions ({reason})")
    gc.collect()
    return True


def request_started():
    global _busy
    with _lock:
        _busy = True
        _used_this_request.clear()


def request_finished():
    global _busy
    with _lock:
        now = time.monotonic()
        for key in _used_this_request:
            if key in _entries:
                _entries[key].last_used = now
        _used_this_request.clear()
        _busy = False


def evict_idle(now=None):
    """Drop sessions unused for the idle timeout. Never runs while a request is in flight."""
    now = time.monotonic() if now is None else now
    timeout = idle_timeout_s()
    with _lock:
        if _busy:
            return 0
        stale = [k for k, e in _entries.items() if now - e.last_used >= timeout]
        for key in stale:
            _drop(key)
            _log(f"evicted {key[0]} after {timeout}s idle")
    if stale:
        gc.collect()
    return len(stale)


def start_idle_reaper():
    """Start the background idle-eviction thread (idempotent)."""
    global _reaper
    with _lock:
        if _reaper is not None:
            return

        def _loop():
            while True:
                time.sleep(_REAPER_POLL_S)
                try:
                    evict_idle()
                except Exception as e:
                    _log(f"idle eviction failed: {e}")

        _reaper = threading.Thread(target=_loop, name="session-cache-reaper", daemon=True)
        _reaper.start()
