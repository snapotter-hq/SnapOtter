"""Runtime GPU/CUDA detection utility."""
import functools
import os


@functools.lru_cache(maxsize=1)
def gpu_available():
    """Return True if a usable CUDA GPU is present at runtime."""
    # Allow explicit disable via env var (set to "false" or "0")
    override = os.environ.get("STIRLING_GPU")
    if override is not None and override.lower() in ("0", "false", "no"):
        return False

    # Use torch.cuda as the source of truth. It actually probes
    # the hardware. onnxruntime's get_available_providers() only
    # reports compiled-in backends, not whether a GPU exists.
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        pass

    return False


def onnx_providers():
    """Return ONNX Runtime execution providers in priority order."""
    if gpu_available():
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]
