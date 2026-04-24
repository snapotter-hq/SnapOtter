"""Runtime GPU/CUDA detection utility."""
import functools
import json
import os
import subprocess
import sys


def emit_info(msg):
    """Emit an informational JSON message to stderr for the bridge to capture."""
    print(json.dumps({"info": msg}), file=sys.stderr, flush=True)


@functools.lru_cache(maxsize=1)
def gpu_available():
    """Return True if a usable CUDA GPU is present at runtime."""
    # Allow explicit disable via env var (set to "false" or "0")
    override = os.environ.get("SNAPOTTER_GPU")
    if override is not None and override.lower() in ("0", "false", "no"):
        return False

    # Use torch.cuda as the source of truth when available. It actually
    # probes the hardware. Fall back to onnxruntime provider detection
    # when torch is not installed (e.g. CPU-only images without PyTorch).
    try:
        import torch
        avail = torch.cuda.is_available()
        if avail:
            name = torch.cuda.get_device_name(0)
            print(f"[gpu] CUDA available via torch: {name}", file=sys.stderr, flush=True)
        else:
            print("[gpu] torch loaded but CUDA not available", file=sys.stderr, flush=True)
        return avail
    except ImportError as e:
        print(f"[gpu] torch not importable: {e}", file=sys.stderr, flush=True)

    # Fallback: check if onnxruntime-gpu is installed and CUDA EP is available,
    # then verify an actual NVIDIA GPU is present via nvidia-smi.
    try:
        import onnxruntime as _ort
        providers = _ort.get_available_providers()
        if "CUDAExecutionProvider" not in providers:
            return False
        # CUDA EP is compiled in — verify hardware is actually present.
        # nvidia-smi is the most reliable cross-platform check.
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            print(f"[gpu] CUDA available via ONNX Runtime + nvidia-smi: {result.stdout.strip()}",
                  file=sys.stderr, flush=True)
            return True
        return False
    except (ImportError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def onnx_providers():
    """Return (providers, device) tuple.

    providers: ONNX Runtime execution providers in priority order.
    device: "cuda" or "cpu" — reflects which hardware will actually be used.
    """
    if gpu_available():
        return (["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda")
    emit_info("No GPU detected, processing on CPU")
    return (["CPUExecutionProvider"], "cpu")


def safe_onnx_session(model_path, providers=None):
    """Create an ONNX Runtime InferenceSession with graceful CUDA EP fallback.

    Returns (session, device) where device is "cuda" or "cpu".
    """
    import onnxruntime as ort

    device = "cpu"
    if providers is None:
        providers, device = onnx_providers()

    try:
        session = ort.InferenceSession(model_path, providers=providers)
        return session, device
    except Exception as e:
        if "CUDAExecutionProvider" in providers:
            emit_info(f"CUDA init failed ({e}), falling back to CPU")
            session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            return session, "cpu"
        raise
