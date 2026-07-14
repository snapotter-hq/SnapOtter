"""Accurate OCR must never re-enter the mutable legacy Python dispatcher."""

from pathlib import Path

from packages.ai.python import dispatcher


def test_legacy_dispatcher_does_not_allow_ocr_scripts():
    assert "ocr" not in dispatcher.ALLOWED_SCRIPTS
    assert "ocr_pdf" not in dispatcher.ALLOWED_SCRIPTS


def test_shared_requirements_do_not_install_paddle():
    python_root = Path(__file__).resolve().parents[1]
    for name in ("requirements.txt", "requirements-gpu.txt"):
        requirements = (python_root / name).read_text(encoding="utf-8").lower()
        assert "paddleocr" not in requirements
        assert "paddlepaddle" not in requirements
