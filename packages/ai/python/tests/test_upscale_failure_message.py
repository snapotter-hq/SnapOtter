"""What Real-ESRGAN tells the user when it cannot run (AI-20260726-002).

Observed on ubuntu-gpu-amd64 with `upscale-enhance` installed and working
weights on disk: scipy was carrying 1.12.0 and 1.17.1 at once, so the import
chain raised

    cannot import name '_promote' from 'scipy.spatial.transform._rotation'

and the tool answered "Install the upscale-enhance feature", which the user had
already done. The advice has to follow the shape of the failure, not the fact
that one occurred.
"""

import importlib.util
import os


def load_upscale():
    script_path = os.path.join(os.path.dirname(__file__), "..", "upscale.py")
    spec = importlib.util.spec_from_file_location("upscale_message_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_a_broken_dependency_does_not_ask_for_an_install_that_already_happened():
    upscale = load_upscale()
    failure = ImportError(
        "cannot import name '_promote' from 'scipy.spatial.transform._rotation'"
    )

    message = upscale.realesrgan_failure_message(failure)

    assert "_promote" in message
    assert "Install the upscale-enhance feature" not in message
    assert "Reinstall" in message
    assert "model=lanczos" in message


def test_a_missing_module_still_asks_for_the_install():
    upscale = load_upscale()

    message = upscale.realesrgan_failure_message(ModuleNotFoundError("No module named 'realesrgan'"))

    assert "Install the upscale-enhance feature" in message


def test_missing_weights_still_ask_for_the_install():
    """The bundle carries the .pth files, so absent weights mean absent bundle."""
    upscale = load_upscale()

    message = upscale.realesrgan_failure_message(
        FileNotFoundError("RealESRGAN model not found: /data/ai/models/RealESRGAN_x4plus.pth")
    )

    assert "Install the upscale-enhance feature" in message


def test_a_runtime_failure_points_at_a_repair_rather_than_an_install():
    upscale = load_upscale()

    message = upscale.realesrgan_failure_message(RuntimeError("CUDA error: no kernel image"))

    assert "Install the upscale-enhance feature" not in message
    assert "Reset AI Environment" in message


def test_default_and_fallback_tile_sizes_distinguish_cpu_and_gpu():
    upscale = load_upscale()

    assert upscale.default_tile_size(False) == 256
    assert upscale.default_tile_size(True) == 512
    assert upscale.fallback_tile_size(512) == 256
    assert upscale.fallback_tile_size(256) == 128


def test_oom_errors_report_memory_remedy_rather_than_reinstall():
    upscale = load_upscale()

    cpu_oom = RuntimeError(
        "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
    )
    assert upscale.is_oom_error(cpu_oom) is True
    assert upscale.is_oom_error(MemoryError("unable to allocate array")) is True
    assert upscale.is_oom_error(RuntimeError("CUDA error: no kernel image")) is False

    message = upscale.realesrgan_failure_message(cpu_oom)
    assert "out of memory" in message.lower()
    assert "Reinstall" not in message
    assert "Reset AI Environment" not in message
    assert "model=lanczos" in message

    bare_oom = upscale.realesrgan_failure_message(MemoryError())
    assert "MemoryError" in bare_oom
    assert "out of memory" in bare_oom.lower()


