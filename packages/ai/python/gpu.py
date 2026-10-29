"""Runtime GPU/CUDA detection utility."""
import errno
import functools
import json
import os
import subprocess
import sys


_OOM_MARKERS = (
    "out of memory",
    "not enough memory",
    "can't allocate memory",
    "cannot allocate memory",
    "[errno 12]",
    "unable to allocate",
    "failed to allocate",
    "cudaerrormemoryallocation",
    "cublas_status_alloc_failed",
    "bad_alloc",
    "memoryerror",
)
_HOST_OOM_MARKERS = (
    "not enough memory",
    "can't allocate memory",
    "cannot allocate memory",
    "[errno 12]",
    "unable to allocate",
    "bad_alloc",
    "memoryerror",
)
_MODEL_LOAD_ERROR_MARKERS = (
    "invalidprotobuf",
    "invalid_protobuf",
    "protobuf parsing failed",
    "invalidgraph",
    "invalid_graph",
    "no_suchfile",
    "nosuchfile",
    "file doesn't exist",
    "modelproto does not have a graph",
    "checksum",
    "hash of downloaded file",
    "does not match the known hash",
    "snapotter_allow_model_download",
)


def _is_oom(err):
    if isinstance(err, MemoryError):
        return True
    if isinstance(err, OSError) and err.errno == errno.ENOMEM:
        return True
    m = str(err).lower()
    return any(s in m for s in _OOM_MARKERS)


def _is_host_oom(err):
    if isinstance(err, MemoryError):
        return True
    if isinstance(err, OSError) and err.errno == errno.ENOMEM:
        return True
    m = str(err).lower()
    if any(s in m for s in _HOST_OOM_MARKERS):
        return True
    return "defaultcpuallocator" in m and _is_oom(err)


def _is_model_load_error(err):
    if isinstance(err, EOFError):
        return True
    if isinstance(err, OSError):
        return err.errno != errno.ENOMEM
    m = f"{type(err).__name__} {err}".lower()
    return any(s in m for s in _MODEL_LOAD_ERROR_MARKERS)


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
    except (OSError, subprocess.TimeoutExpired):
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
    Runtime). Tools bound to a single framework should instead call
    the matching per-framework helper (torch_gpu_available,
    ctranslate2_gpu_available) so a GPU that only ONNX can use is not mistaken
    for a torch GPU.
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

    # A GPU is physically present but neither supported framework can use it.
    # OCR is now an isolated portable CPU ONNX runtime, so Paddle must never be
    # imported as a fallback probe here (the old GPU wheel could crash while
    # resolving libcuda on otherwise valid CPU-only hosts).
    gpu_name = _nvidia_smi_gpu_name()
    if gpu_name:
        print(f"[gpu] nvidia-smi found GPU ({gpu_name}) but neither torch nor ONNX "
              "Runtime can use it; reinstall the relevant AI feature for GPU support",
              file=sys.stderr, flush=True)
    return False


def _parse_cuda_arch(entry):
    """Parse a torch arch string into (major, minor, is_ptx, arch_specific).

    torch reports SASS targets as ``sm_90`` and PTX targets as ``compute_90``;
    a ``+PTX`` suffix is tolerated too. Arch-specific targets carry a letter
    suffix (``sm_90a``, ``sm_100f``) and only run on that exact capability.
    """
    text = str(entry).strip().lower()
    is_ptx = text.endswith("+ptx")
    if is_ptx:
        text = text[: -len("+ptx")]
    prefix, separator, digits = text.partition("_")
    if prefix not in ("sm", "compute") or not separator:
        return None
    arch_specific = digits[-1:].isalpha()
    digits = digits.rstrip("abcdefghijklmnopqrstuvwxyz")
    if len(digits) < 2 or not digits.isdigit():
        return None
    return int(digits[:-1]), int(digits[-1]), is_ptx or prefix == "compute", arch_specific


def _torch_device_supported(torch, capability):
    """Return (supported, arch_list) for a device compute capability.

    A wheel only runs on a device when it carries SASS for the same major arch
    at or below the device's minor version, or PTX at or below the device (PTX
    is forward compatible across majors, never backward). SASS is never
    compatible across majors: sm_90 code does not run on sm_100 or sm_120.
    Arch-specific targets cover only their exact capability. When the build
    cannot report or the list cannot be understood, the device keeps its GPU
    support rather than being disabled on a guess.
    """
    get_arch_list = getattr(torch.cuda, "get_arch_list", None)
    if not callable(get_arch_list):
        return True, []
    try:
        arch_list = list(get_arch_list() or [])
    except Exception as e:
        print(
            f"[gpu] cannot read torch's compiled arch list ({e}); "
            "assuming the GPU is usable",
            file=sys.stderr,
            flush=True,
        )
        return True, []
    if not arch_list:
        return True, arch_list

    major, minor = capability
    understood = False
    for entry in arch_list:
        parsed = _parse_cuda_arch(entry)
        if parsed is None:
            continue
        understood = True
        entry_major, entry_minor, is_ptx, arch_specific = parsed
        if arch_specific:
            if (entry_major, entry_minor) == (major, minor):
                return True, arch_list
        elif is_ptx:
            if (entry_major, entry_minor) <= (major, minor):
                return True, arch_list
        elif entry_major == major and entry_minor <= minor:
            return True, arch_list

    if not understood:
        return True, arch_list
    return False, arch_list


def _try_torch_cuda():
    """Check GPU via torch.cuda. Returns True if CUDA is usable."""
    try:
        import torch
    except Exception as e:
        print(f"[gpu] torch not importable: {e}", file=sys.stderr, flush=True)
        return False

    try:
        cuda_available = torch.cuda.is_available()
    except Exception as e:
        print(json.dumps({"warning": f"[gpu] torch CUDA probe failed: {e}"}), file=sys.stderr, flush=True)
        return False

    if cuda_available:
        try:
            name = torch.cuda.get_device_name(0)
        except Exception:
            name = "CUDA device 0"
        try:
            capability = torch.cuda.get_device_capability(0)
            supported, arch_list = _torch_device_supported(torch, capability)
        except Exception as e:
            print(
                f"[gpu] cannot verify torch kernels for {name} ({e}); "
                "assuming the GPU is usable",
                file=sys.stderr,
                flush=True,
            )
            return True
        if not supported:
            sm = f"sm_{capability[0]}{capability[1]}"
            hint = (
                " RTX 50-series and other Blackwell cards need a cu128 torch build."
                if capability >= (10, 0)
                else ""
            )
            emit_info(
                f"GPU {name} is {sm}, but this torch build has no kernels for it "
                f"(built for {', '.join(str(arch) for arch in arch_list)}). "
                f"Torch-based tools will run on CPU.{hint}"
            )
            return False
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
    except Exception:
        return False


def torch_gpu_available():
    """True iff torch itself can use CUDA (honors the SNAPOTTER_GPU override).

    Torch-based tools (upscale, denoise, face enhancement, HQ inpainting) must
    gate on this rather than gpu_available(), which can report True based on
    ONNX Runtime while torch is a CPU-only build. Routing those tools to CUDA
    on a device torch cannot use would crash them.
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


def onnx_gpu_available():
    """True iff ONNX Runtime itself can use CUDA (honors the SNAPOTTER_GPU override).

    ONNX-based tools (background removal, LaMa inpainting/outpainting, DDColor,
    photo restoration) require CUDAExecutionProvider in onnxruntime plus a
    usable GPU, not merely a CUDA-enabled torch build (#490).
    """
    if _override_disables_gpu():
        return False
    return _try_onnx_cuda()


def gpu_frameworks_available():
    """Return per-framework CUDA availability for the sidecar readiness payload."""
    return {
        "torch": bool(torch_gpu_available()),
        "onnx": bool(onnx_gpu_available()),
        "ctranslate2": bool(ctranslate2_gpu_available()),
    }



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
            emit_info("GPU detected by torch but CUDAExecutionProvider is missing from onnxruntime. "
                      "A bundle install likely replaced onnxruntime-gpu with the CPU build (#490); "
                      "reinstall the Background Removal bundle from Settings > AI Features to "
                      "restore the GPU build")
        except ImportError:
            emit_info("onnxruntime not installed, cannot check CUDA provider")
    emit_info("No GPU detected, processing on CPU")
    return (["CPUExecutionProvider"], "cpu")


def safe_onnx_session(model_path, providers=None):
    """Create an ONNX Runtime InferenceSession with graceful CUDA EP fallback.

    Returns (session, device) where device is "cuda" or "cpu", read from the
    providers the session actually runs on, so explicit providers report CUDA
    too and a CUDA provider ONNX Runtime dropped reports CPU.
    """
    import onnxruntime as ort

    if providers is None:
        providers, _ = onnx_providers()

    try:
        session = ort.InferenceSession(model_path, providers=providers)
    except Exception as e:
        if (
            "CUDAExecutionProvider" in providers
            and not _is_host_oom(e)
            and not _is_model_load_error(e)
        ):
            emit_info(f"CUDA init failed ({e}), falling back to CPU")
            session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            return session, "cpu"
        raise

    get_providers = getattr(session, "get_providers", None)
    active_providers = get_providers() if callable(get_providers) else providers
    device = "cuda" if "CUDAExecutionProvider" in active_providers else "cpu"
    return session, device
