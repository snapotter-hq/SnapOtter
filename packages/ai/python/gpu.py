"""Runtime GPU/CUDA detection utility."""
import functools
import json
import os
import subprocess
import sys


def emit_info(msg):
    """Emit an informational JSON message to stderr for the bridge to capture."""
    print(json.dumps({"info": msg}), file=sys.stderr, flush=True)


def _nvidia_smi_gpu_name():
    """Return GPU name from nvidia-smi, or None if unavailable."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def _override_disables_gpu():
    """True if SNAPOTTER_GPU is explicitly set to a falsy value (0/false/no)."""
    override = os.environ.get("SNAPOTTER_GPU")
    return override is not None and override.lower() in ("0", "false", "no")


@functools.lru_cache(maxsize=1)
def gpu_available():
    """Return True if a usable CUDA GPU is present at runtime.

    This is the general "can any framework use a GPU" check (torch, then ONNX
    Runtime, then paddle). Tools bound to a single framework should instead call
    the matching per-framework helper (torch_gpu_available,
    ctranslate2_gpu_available) so a GPU that only paddle or ONNX can use is not
    mistaken for a torch GPU.
    """
    if _override_disables_gpu():
        return False

    # Try torch first -- it probes the hardware directly.
    torch_available = _try_torch_cuda()
    if torch_available:
        return True

    # torch either isn't installed or can't use CUDA. Fall through to
    # ONNX Runtime + nvidia-smi so ONNX-based tools can still use GPU.
    onnx_available = _try_onnx_cuda()
    if onnx_available:
        return True

    # A GPU is physically present but neither torch nor ONNX Runtime can use it.
    # The OCR bundle ships paddlepaddle-gpu, which still can, so probe paddle in
    # an isolated subprocess. This runs only now that nvidia-smi confirms a GPU,
    # and never in-process, because a GPU-less paddle import segfaults.
    gpu_name = _nvidia_smi_gpu_name()
    if gpu_name:
        if _try_paddle_cuda_subprocess():
            return True
        print(f"[gpu] nvidia-smi found GPU ({gpu_name}) but neither torch, ONNX "
              "Runtime, nor paddle can use it; reinstall AI features for GPU support",
              file=sys.stderr, flush=True)
    return False


def _try_torch_cuda():
    """Check GPU via torch.cuda. Returns True if CUDA is usable."""
    try:
        import torch
    except ImportError as e:
        print(f"[gpu] torch not importable: {e}", file=sys.stderr, flush=True)
        return False

    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        print(f"[gpu] CUDA available via torch: {name}", file=sys.stderr, flush=True)
        return True

    # CUDA not available -- diagnose why.
    cuda_version = getattr(torch.version, "cuda", None)
    if not cuda_version:
        gpu_name = _nvidia_smi_gpu_name()
        if gpu_name:
            print(f"[gpu] torch is a CPU-only build but GPU is present ({gpu_name}) "
                  "-- reinstall AI features to get CUDA support",
                  file=sys.stderr, flush=True)
        else:
            print("[gpu] torch is a CPU-only build and no GPU detected",
                  file=sys.stderr, flush=True)
        return False

    # torch has CUDA compiled in but can't access the GPU.
    diag = [f"torch has CUDA {cuda_version} but cannot access GPU"]
    ld_path = os.environ.get("LD_LIBRARY_PATH", "")
    diag.append(f"LD_LIBRARY_PATH={'<empty>' if not ld_path else ld_path}")
    try:
        torch.cuda.init()
    except RuntimeError as e:
        diag.append(f"torch.cuda.init(): {e}")
    gpu_name = _nvidia_smi_gpu_name()
    if gpu_name:
        diag.append(f"nvidia-smi sees GPU ({gpu_name}) but torch cannot use it")
    else:
        diag.append("nvidia-smi also cannot find a GPU")
    print(f"[gpu] {'; '.join(diag)}", file=sys.stderr, flush=True)
    return False


def _try_onnx_cuda():
    """Check GPU via ONNX Runtime CUDAExecutionProvider + nvidia-smi."""
    try:
        import onnxruntime as _ort
        providers = _ort.get_available_providers()
        if "CUDAExecutionProvider" not in providers:
            return False
        gpu_name = _nvidia_smi_gpu_name()
        if gpu_name:
            print(f"[gpu] CUDA available via ONNX Runtime + nvidia-smi: {gpu_name}",
                  file=sys.stderr, flush=True)
            return True
        return False
    except (ImportError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _try_paddle_cuda_subprocess():
    """Check GPU via paddle in an isolated subprocess.

    The OCR bundle ships paddlepaddle-gpu with no torch or ONNX Runtime, so paddle
    is the only framework that can see the GPU on an OCR-only host. Importing
    paddlepaddle-gpu in-process segfaults on a GPU-less machine, so this runs in a
    throwaway subprocess and callers must confirm a GPU is present (via nvidia-smi)
    before invoking it. Returns True only when paddle has a CUDA build and a
    visible GPU. The result is signalled through the exit code so paddle's own
    import chatter on stdout cannot corrupt the reading.
    """
    probe = (
        "import paddle, sys; "
        "sys.exit(0 if (paddle.is_compiled_with_cuda() "
        "and paddle.device.cuda.device_count() > 0) else 1)"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", probe],
            capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    if result.returncode == 0:
        print("[gpu] CUDA available via paddle (paddlepaddle-gpu)",
              file=sys.stderr, flush=True)
        return True
    return False


def torch_gpu_available():
    """True iff torch itself can use CUDA (honors the SNAPOTTER_GPU override).

    Torch-based tools (upscale, denoise, face enhancement, restore) must gate on
    this rather than gpu_available(), which can report True based on paddle or
    ONNX Runtime while torch is a CPU-only build. Routing those tools to CUDA on a
    device torch cannot use would crash them.
    """
    if _override_disables_gpu():
        return False
    return _try_torch_cuda()


def ctranslate2_gpu_available():
    """True iff CTranslate2 (faster-whisper's backend) can use CUDA.

    Transcription runs on CTranslate2, not torch, so it cannot reuse torch's
    probe; torch may not even be installed in the transcription bundle. Honors the
    SNAPOTTER_GPU override and returns False when CTranslate2 is absent.
    """
    if _override_disables_gpu():
        return False
    try:
        import ctranslate2
        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


def onnx_providers():
    """Return (providers, device) tuple.

    providers: ONNX Runtime execution providers in priority order.
    device: "cuda" or "cpu" -- reflects which hardware will actually be used.
    """
    if gpu_available():
        try:
            import onnxruntime as _ort
            available = _ort.get_available_providers()
            if "CUDAExecutionProvider" in available:
                return (["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda")
            emit_info("GPU detected by torch but CUDAExecutionProvider not available in onnxruntime "
                      "-- install onnxruntime-gpu for GPU acceleration")
        except ImportError:
            emit_info("onnxruntime not installed, cannot check CUDA provider")
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
