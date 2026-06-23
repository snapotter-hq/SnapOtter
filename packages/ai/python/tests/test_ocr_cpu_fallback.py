"""OCR must degrade gracefully on CPU-only hosts.

The amd64 AI bundle ships paddlepaddle-gpu, whose native libraries dlopen
libcuda.so.1 at import time and segfault on a host without a GPU (libcuda is the
driver lib, injected only by nvidia-container-toolkit on GPU hosts). That segfault
crashes the shared long-lived AI dispatcher and wedges all AI. So on a CPU-only
host the PaddleOCR tiers (balanced/best) must transparently fall back to Tesseract
and must never reach the paddle import.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ocr  # noqa: E402


def test_effective_quality_downgrades_paddle_tiers_on_cpu(monkeypatch):
    monkeypatch.setattr(ocr, "gpu_available", lambda: False)
    assert ocr.effective_quality("balanced") == "fast"
    assert ocr.effective_quality("best") == "fast"
    assert ocr.effective_quality("fast") == "fast"


def test_effective_quality_preserves_paddle_tiers_on_gpu(monkeypatch):
    monkeypatch.setattr(ocr, "gpu_available", lambda: True)
    assert ocr.effective_quality("balanced") == "balanced"
    assert ocr.effective_quality("best") == "best"
    assert ocr.effective_quality("fast") == "fast"


def test_run_paddleocr_v5_refuses_on_cpu_before_import(monkeypatch):
    # Must raise a GPU-specific error (the guard), NOT attempt the paddle import
    # that would segfault on a CPU-only host.
    monkeypatch.setattr(ocr, "gpu_available", lambda: False)
    with pytest.raises(ImportError, match="GPU"):
        ocr.run_paddleocr_v5("/nonexistent.png", "en")


def test_run_paddleocr_vl_refuses_on_cpu_before_import(monkeypatch):
    monkeypatch.setattr(ocr, "gpu_available", lambda: False)
    with pytest.raises(ImportError, match="GPU"):
        ocr.run_paddleocr_vl("/nonexistent.png")
