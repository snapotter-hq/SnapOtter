"""ONNX Runtime flavor reconciliation tests (GPU wins).

The invariant under test: a bundle install must never downgrade the shared
venv's ONNX Runtime from the GPU build to the CPU build. Both PyPI packages
(`onnxruntime` and `onnxruntime-gpu`) install into the SAME site-packages
directory (`onnxruntime/`), so a bundle that carries the CPU build (e.g.
transcription, via faster-whisper's transitive dependency) overwrites the GPU
build's native libraries file-by-file during move_tree, while the stale
`onnxruntime_gpu-*.dist-info` metadata survives. pip then claims the GPU build
is installed but `CUDAExecutionProvider` is gone and every ONNX tool silently
runs on CPU (snapotter-hq/SnapOtter#490).
"""

import importlib.util
import os

CUDA_PROVIDER_LIB = "libonnxruntime_providers_cuda.so"


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_onnx_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def make_onnxruntime(sp, flavor, version="1.20.1"):
    """Lay out a fake onnxruntime install of the given flavor under sp."""
    capi = sp / "onnxruntime" / "capi"
    capi.mkdir(parents=True, exist_ok=True)
    (sp / "onnxruntime" / "__init__.py").write_text(flavor)
    (capi / "onnxruntime_pybind11_state.so").write_text(flavor)
    if flavor == "gpu":
        (capi / CUDA_PROVIDER_LIB).write_text("cuda")
        dist_info = sp / f"onnxruntime_gpu-{version}.dist-info"
        dist_info.mkdir()
        (dist_info / "METADATA").write_text("Name: onnxruntime-gpu")
    else:
        dist_info = sp / f"onnxruntime-{version}.dist-info"
        dist_info.mkdir()
        (dist_info / "METADATA").write_text("Name: onnxruntime")


def dist_infos(sp, prefix):
    return sorted(
        n for n in os.listdir(sp)
        if n.startswith(prefix) and n.endswith(".dist-info")
    )


def cpu_dist_infos(sp):
    return [n for n in dist_infos(sp, "onnxruntime-")]


def gpu_dist_infos(sp):
    return [n for n in dist_infos(sp, "onnxruntime_gpu-")]


def test_incoming_cpu_bundle_cannot_clobber_gpu_install(tmp_path):
    """The #490 scenario: GPU bundle installed first, transcription second."""
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(venv_sp, "gpu")
    make_onnxruntime(staging, "cpu")
    # The rest of the incoming bundle must survive untouched.
    (staging / "faster_whisper").mkdir()
    (staging / "faster_whisper" / "__init__.py").write_text("fw")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    # The GPU build survives: CUDA provider lib intact, core lib not downgraded.
    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "gpu"
    # Metadata stays truthful: GPU dist-info only, no CPU dist-info shipped in.
    assert gpu_dist_infos(venv_sp) == ["onnxruntime_gpu-1.20.1.dist-info"]
    assert cpu_dist_infos(venv_sp) == []
    # The bundle's own packages still landed.
    assert (venv_sp / "faster_whisper" / "__init__.py").read_text() == "fw"


def test_incoming_gpu_bundle_replaces_cpu_and_clears_stale_metadata(tmp_path):
    """Reverse order: transcription first, then a GPU bundle. GPU wins."""
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(venv_sp, "cpu")
    make_onnxruntime(staging, "gpu")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "gpu"
    # The stale CPU dist-info is gone, so pip metadata matches reality.
    assert cpu_dist_infos(venv_sp) == []
    assert gpu_dist_infos(venv_sp) == ["onnxruntime_gpu-1.20.1.dist-info"]


def test_cpu_bundle_into_empty_venv_installs_normally(tmp_path):
    """No GPU build anywhere (e.g. transcription alone): nothing to protect."""
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(staging, "cpu")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "cpu"
    assert cpu_dist_infos(venv_sp) == ["onnxruntime-1.20.1.dist-info"]


def test_cpu_reinstall_over_cpu_is_untouched(tmp_path):
    """arm64 and CPU-only stacks: CPU-over-CPU merges are business as usual."""
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(venv_sp, "cpu")
    make_onnxruntime(staging, "cpu")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "cpu"
    assert cpu_dist_infos(venv_sp) == ["onnxruntime-1.20.1.dist-info"]


def test_gpu_reinstall_over_gpu_is_untouched(tmp_path):
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(venv_sp, "gpu")
    make_onnxruntime(staging, "gpu")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert gpu_dist_infos(venv_sp) == ["onnxruntime_gpu-1.20.1.dist-info"]


def test_staging_with_both_flavors_ships_gpu_metadata_only(tmp_path):
    """Defensive: a bundle built with both flavors (GPU installed last, so the
    package files are the GPU build) must not ship the stale CPU metadata."""
    installer = load_installer()
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    staging.mkdir()
    venv_sp.mkdir()
    make_onnxruntime(staging, "gpu")
    # Simulate the leftover CPU dist-info next to the GPU files.
    cpu_meta = staging / "onnxruntime-1.20.1.dist-info"
    cpu_meta.mkdir()
    (cpu_meta / "METADATA").write_text("Name: onnxruntime")

    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    installer.move_tree(str(staging), str(venv_sp))

    # The GPU package files ship; the stale CPU metadata does not.
    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert cpu_dist_infos(venv_sp) == []
    assert gpu_dist_infos(venv_sp) == ["onnxruntime_gpu-1.20.1.dist-info"]
