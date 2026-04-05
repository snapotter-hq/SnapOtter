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

    # Always check actual hardware, even if STIRLING_GPU=true.
    # The env var can disable GPU but never force-enable it,
    # because the :cuda image bakes STIRLING_GPU=true and we
    # still need to handle "no GPU attached" gracefully.
    try:
        import onnxruntime
        if "CUDAExecutionProvider" in onnxruntime.get_available_providers():
            return True
    except ImportError:
        pass

    try:
        import torch
        if torch.cuda.is_available():
            return True
    except ImportError:
        pass

    return False


def onnx_providers():
    """Return ONNX Runtime execution providers in priority order."""
    if gpu_available():
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]
