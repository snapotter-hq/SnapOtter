"""gpu_available() must recognize a GPU that only paddle can use.

The OCR feature bundle ships paddlepaddle-gpu but no torch or ONNX Runtime. On an
OCR-only GPU host the torch and ONNX probes both come up empty, so before this
fix gpu_available() fell through to a plain nvidia-smi check that returned False
by design, and OCR silently downgraded to Tesseract. gpu_available() now probes
paddle too, in an isolated subprocess, but only after nvidia-smi confirms a GPU
is physically present (importing paddlepaddle-gpu in-process segfaults on a
GPU-less host and would wedge the shared AI dispatcher).
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import gpu  # noqa: E402


# --- The isolated paddle probe --------------------------------------------

def test_paddle_probe_true_when_subprocess_reports_cuda(monkeypatch):
    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(gpu.subprocess, "run", fake_run)
    assert gpu._try_paddle_cuda_subprocess() is True


def test_paddle_probe_false_when_subprocess_reports_no_cuda(monkeypatch):
    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="")

    monkeypatch.setattr(gpu.subprocess, "run", fake_run)
    assert gpu._try_paddle_cuda_subprocess() is False


def test_paddle_probe_false_on_timeout(monkeypatch):
    def fake_run(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, 30)

    monkeypatch.setattr(gpu.subprocess, "run", fake_run)
    assert gpu._try_paddle_cuda_subprocess() is False


# --- gpu_available() orchestration -----------------------------------------

def _patch_probes(monkeypatch, torch, onnx, smi):
    """Stub the three existing probes and reset the lru_cache for one call."""
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_torch_cuda", lambda: torch)
    monkeypatch.setattr(gpu, "_try_onnx_cuda", lambda: onnx)
    monkeypatch.setattr(gpu, "_nvidia_smi_gpu_name", lambda: smi)
    gpu.gpu_available.cache_clear()


def test_gpu_available_true_when_only_paddle_sees_gpu(monkeypatch):
    # OCR-only GPU box: torch and ONNX absent, GPU present, paddle can use it.
    _patch_probes(monkeypatch, torch=False, onnx=False, smi="NVIDIA GeForce RTX 4070")
    monkeypatch.setattr(gpu, "_try_paddle_cuda_subprocess", lambda: True)
    assert gpu.gpu_available() is True


def test_gpu_available_false_when_paddle_cannot_use_gpu(monkeypatch):
    # GPU present but paddle is a CPU build or cannot init CUDA: stay conservative.
    _patch_probes(monkeypatch, torch=False, onnx=False, smi="NVIDIA GeForce RTX 4070")
    monkeypatch.setattr(gpu, "_try_paddle_cuda_subprocess", lambda: False)
    assert gpu.gpu_available() is False


def test_gpu_available_never_probes_paddle_without_a_gpu(monkeypatch):
    # Safety invariant: on a GPU-less host a paddlepaddle-gpu import segfaults, so
    # the probe must never run when nvidia-smi finds no GPU.
    _patch_probes(monkeypatch, torch=False, onnx=False, smi=None)
    called = {"paddle": False}

    def spy():
        called["paddle"] = True
        return True

    monkeypatch.setattr(gpu, "_try_paddle_cuda_subprocess", spy)
    assert gpu.gpu_available() is False
    assert called["paddle"] is False
