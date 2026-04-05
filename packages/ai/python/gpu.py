"""Runtime GPU/CUDA detection utility."""
import functools
import os


@functools.lru_cache(maxsize=1)
def gpu_available():
    """Return True if a usable CUDA GPU is present at runtime."""
    override = os.environ.get("STIRLING_GPU")
    if override is not None:
        return override.lower() in ("1", "true", "yes")

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
