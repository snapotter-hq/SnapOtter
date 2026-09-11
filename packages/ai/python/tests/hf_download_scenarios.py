"""Fakes and scenarios for the accelerated-download progress seam in
install_feature.py (issue #871).

Shared by two harnesses so the fake huggingface_hub has one owner:
  - test_install_feature_download.py drives it under pytest (local depth);
  - tests/unit/features/install-feature-download-progress.test.ts spawns
    `python3 hf_download_scenarios.py <installer.py> <scenario>` and reads the
    JSON on stdout. That one is the CI gate: the runners have python3 but no
    pytest.

No pytest import in this module, on purpose."""

import importlib.util
import json
import os
import sys
import tempfile
import types

MIB = 1024 * 1024
EXPECTED_SIZE = 512 * MIB
ARCHIVE = "v2.0.0/upscale-enhance-amd64-gpu.tar.gz"
BODY = b"archive"


def load_installer(path):
    spec = importlib.util.spec_from_file_location("install_feature_scenario_target", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class RecordingTqdm:
    """Stand-in for huggingface_hub.utils.tqdm.tqdm: the class both xet_get and
    http_get instantiate through _get_progress_bar_context and feed with
    update(bytes) as the transfer moves. Mirrors the real constructor shape
    (keyword-only bar settings, the `name` group) and the real disabled-bar
    behaviour (n seeded from `initial`, update() returns early)."""

    def __init__(self, *args, **kwargs):
        self.n = kwargs.get("initial", 0)
        self.total = kwargs.get("total")
        self.disable = kwargs.get("disable", False)

    def update(self, n=1):
        if self.disable:
            return
        self.n += n

    def close(self):
        pass


def fake_hub(transfer, seam="class", initial=0, total=None):
    """Build the fake huggingface_hub modules.

    `transfer(bar)` runs the simulated download against whatever class sits on
    huggingface_hub.utils.tqdm at call time, exactly as the library would.
    seam: "class" (RecordingTqdm), "not_a_class" (tqdm is the integer 42), or
    "missing" (no utils.tqdm module at all). Returns (modules, tqdm_module)."""
    hub = types.ModuleType("huggingface_hub")
    modules = {"huggingface_hub": hub}
    tqdm_mod = None
    if seam != "missing":
        utils = types.ModuleType("huggingface_hub.utils")
        tqdm_mod = types.ModuleType("huggingface_hub.utils.tqdm")
        tqdm_mod.tqdm = RecordingTqdm if seam == "class" else 42
        utils.tqdm = tqdm_mod
        hub.utils = utils
        modules["huggingface_hub.utils"] = utils
        modules["huggingface_hub.utils.tqdm"] = tqdm_mod

    def hf_hub_download(repo_id, filename, repo_type, local_dir):
        if transfer is not None:
            bar = tqdm_mod.tqdm(
                unit="B", unit_scale=True, total=total, initial=initial,
                desc=filename, disable=True, name="huggingface_hub.xet_get",
            )
            transfer(bar)
            bar.close()
        target = os.path.join(local_dir, filename)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(BODY)
        return target

    hub.hf_hub_download = hf_hub_download
    return modules, tqdm_mod


HUB_MODULE_NAMES = ("huggingface_hub", "huggingface_hub.utils", "huggingface_hub.utils.tqdm")


def run_download(
    installer,
    transfer,
    seam="class",
    expected_size=EXPECTED_SIZE,
    initial=0,
    total=None,
    reporter=None,
    clock=None,
):
    """Run installer.download_with_hf_hub against the fakes and return a
    JSON-able record: return value, every emitted frame, whether the seam was
    restored, and the archive body if one was written. Restores sys.modules
    and the installer's patched attributes afterwards."""
    modules, tqdm_mod = fake_hub(transfer, seam=seam, initial=initial, total=total)
    saved_modules = {name: sys.modules.get(name) for name in HUB_MODULE_NAMES}
    for name in HUB_MODULE_NAMES:
        sys.modules.pop(name, None)
    sys.modules.update(modules)

    frames = []
    saved_emit = installer.emit_progress
    saved_reporter = installer.make_download_reporter
    saved_monotonic = installer.time.monotonic
    installer.emit_progress = lambda p, s: frames.append([p, s])
    if reporter is not None:
        installer.make_download_reporter = lambda *a, **k: reporter
    if clock is not None:
        installer.time.monotonic = clock

    work = tempfile.mkdtemp()
    dest = os.path.join(work, "staging", os.path.basename(ARCHIVE))
    os.makedirs(os.path.dirname(dest))
    try:
        ok = installer.download_with_hf_hub(
            "deepsafe/feature-bundles", ARCHIVE, dest, expected_size, 2, 85
        )
    finally:
        installer.emit_progress = saved_emit
        installer.make_download_reporter = saved_reporter
        installer.time.monotonic = saved_monotonic
        for name in HUB_MODULE_NAMES:
            sys.modules.pop(name, None)
            if saved_modules[name] is not None:
                sys.modules[name] = saved_modules[name]

    if tqdm_mod is None:
        seam_restored = True
    else:
        seam_restored = tqdm_mod.tqdm is (RecordingTqdm if seam == "class" else 42)
    archive = None
    if os.path.exists(dest):
        with open(dest, "rb") as f:
            archive = f.read().decode()
    return {"ok": ok, "frames": frames, "seamRestored": seam_restored, "archive": archive}


def in_flight(frames):
    """The frames between the "starting" frame and the "downloaded" frame:
    the transfer itself. Raises if either boundary is missing, so a renamed
    stage text fails loudly instead of yielding an empty window."""
    start = next(i for i, (_, s) in enumerate(frames) if "accelerated" in s.lower())
    end = next(i for i, (_, s) in enumerate(frames) if s.startswith("Downloaded"))
    return frames[start + 1 : end]


def steps(count, size):
    def transfer(bar):
        for _ in range(count):
            bar.update(size)

    return transfer


def _raising_transfer(bar):
    raise RuntimeError("xet CAS unreachable")


def _raising_reporter(done, total=None):
    raise ValueError("reporter bug")


def _ticking_clock(step_s):
    now = [0.0]

    def monotonic():
        now[0] += step_s
        return now[0]

    return monotonic


SCENARIOS = {
    # The reported bug: bytes in flight must surface as moving-percent frames.
    "inflight": lambda inst: run_download(inst, steps(16, 32 * MIB)),
    # 12 x 10 MiB under the 32 MiB byte throttle with a frozen clock: only
    # the 1st, 5th and 9th updates cross the threshold.
    "throttle": lambda inst: run_download(inst, steps(12, 10 * MIB), clock=lambda: 0.0),
    # A trickle of 1 MiB updates spaced 6 s apart must still frame each one,
    # or a slow link reads as stalled to the watchdog.
    "trickle": lambda inst: run_download(
        inst, steps(8, 1 * MIB), expected_size=8 * MIB, clock=_ticking_clock(6.0)
    ),
    # http_get resumes with initial=resume_size; the percent must count from
    # there, not from zero.
    "resume": lambda inst: run_download(
        inst, steps(1, 16 * MIB), expected_size=128 * MIB, initial=96 * MIB
    ),
    # No manifest size: fall back to the bar's own total.
    "no_expected_size": lambda inst: run_download(
        inst, steps(4, 32 * MIB), expected_size=0, total=128 * MIB
    ),
    # The transfer raises: the caller falls back, and the seam is restored.
    "raises": lambda inst: run_download(inst, _raising_transfer),
    # A transfer that never delivers bytes must never frame (watchdog contract).
    "no_bytes": lambda inst: run_download(inst, lambda bar: None),
    # The reporter itself blows up: the transfer must still complete.
    "reporter_raises": lambda inst: run_download(
        inst, steps(4, 32 * MIB), reporter=_raising_reporter
    ),
    # Drifted clients: no seam module, or a seam that is not a class. The
    # transfer cannot be watched, so the caller must decline it.
    "seam_missing": lambda inst: run_download(inst, None, seam="missing"),
    "not_a_class": lambda inst: run_download(inst, None, seam="not_a_class"),
}


def run_scenario(name, installer_path):
    return SCENARIOS[name](load_installer(installer_path))


if __name__ == "__main__":
    print(json.dumps(run_scenario(sys.argv[2], sys.argv[1])))
