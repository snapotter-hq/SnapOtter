"""Mechanics of the general distribution reconciliation in install_feature.py.

The version-conflict suite covers the field failure (AI-20260726-001). This one
covers the parts of the machinery that failure does not exercise: what a
rollback restores, what the uninstall is allowed to touch, and that generalising
the reconciliation did not swallow the onnxruntime flavour rule it replaced
(#490), which is the one collision where the newer or later version is NOT the
right winner.
"""

import importlib.util
import os

CUDA_PROVIDER_LIB = "libonnxruntime_providers_cuda.so"


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_reconcile_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def write_dist(sp, name, version, files, extra_record=()):
    """Lay out a distribution: `files` maps relative path -> contents."""
    recorded = []
    for rel, contents in files.items():
        target = sp / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents)
        recorded.append(rel)
    dist_info = sp / f"{name}-{version}.dist-info"
    dist_info.mkdir(parents=True, exist_ok=True)
    (dist_info / "METADATA").write_text(f"Name: {name}\nVersion: {version}\n")
    recorded += [
        f"{name}-{version}.dist-info/METADATA",
        f"{name}-{version}.dist-info/RECORD",
    ]
    recorded += list(extra_record)
    (dist_info / "RECORD").write_text("\n".join(f"{rel},," for rel in recorded) + "\n")


def merge(installer, staging, venv_sp, quarantine):
    """The sequence _install runs, so the tests cannot drift from production."""
    installer.reconcile_onnxruntime(str(staging), str(venv_sp))
    plan = installer.plan_reconciliation(str(staging), str(venv_sp))
    installer.supersede_distributions(str(venv_sp), plan, str(quarantine))
    installer.move_tree(str(staging), str(venv_sp))
    return plan


def trees(tmp_path):
    staging = tmp_path / "staging"
    venv_sp = tmp_path / "venv-sp"
    quarantine = tmp_path / "venv" / ".superseded"
    staging.mkdir()
    venv_sp.mkdir()
    return staging, venv_sp, quarantine


def dist_infos(sp, prefix):
    return sorted(n for n in os.listdir(sp) if n.startswith(prefix) and n.endswith(".dist-info"))


# -- the onnxruntime flavour rule survives generalisation (#490) --


def test_an_incoming_cpu_onnxruntime_still_cannot_evict_the_gpu_build(tmp_path):
    """The flavour rule drops the CPU build from staging before the general pass
    runs, so the general pass must never see an incoming `onnxruntime` and must
    leave `onnxruntime-gpu` installed. Newer-or-later would get this wrong: the
    CPU wheel is a different distribution writing the same package directory."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(
        venv_sp, "onnxruntime_gpu", "1.20.1",
        {
            "onnxruntime/__init__.py": "gpu",
            f"onnxruntime/capi/{CUDA_PROVIDER_LIB}": "cuda",
            "onnxruntime/capi/onnxruntime_pybind11_state.so": "gpu",
        },
    )
    write_dist(
        staging, "onnxruntime", "1.20.1",
        {
            "onnxruntime/__init__.py": "cpu",
            "onnxruntime/capi/onnxruntime_pybind11_state.so": "cpu",
        },
    )
    write_dist(staging, "faster_whisper", "1.2.1", {"faster_whisper/__init__.py": "fw"})

    merge(installer, staging, venv_sp, quarantine)

    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "gpu"
    assert dist_infos(venv_sp, "onnxruntime_gpu-") == ["onnxruntime_gpu-1.20.1.dist-info"]
    assert dist_infos(venv_sp, "onnxruntime-") == []
    # The rest of the bundle still installs.
    assert (venv_sp / "faster_whisper" / "__init__.py").read_text() == "fw"


def test_an_incoming_gpu_onnxruntime_replaces_the_cpu_build(tmp_path):
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(
        venv_sp, "onnxruntime", "1.20.1",
        {
            "onnxruntime/__init__.py": "cpu",
            "onnxruntime/capi/onnxruntime_pybind11_state.so": "cpu",
        },
    )
    write_dist(
        staging, "onnxruntime_gpu", "1.20.1",
        {
            "onnxruntime/__init__.py": "gpu",
            f"onnxruntime/capi/{CUDA_PROVIDER_LIB}": "cuda",
            "onnxruntime/capi/onnxruntime_pybind11_state.so": "gpu",
        },
    )

    merge(installer, staging, venv_sp, quarantine)

    assert (venv_sp / "onnxruntime" / "capi" / CUDA_PROVIDER_LIB).exists()
    assert (venv_sp / "onnxruntime" / "capi" / "onnxruntime_pybind11_state.so").read_text() == "gpu"
    assert dist_infos(venv_sp, "onnxruntime-") == []
    assert dist_infos(venv_sp, "onnxruntime_gpu-") == ["onnxruntime_gpu-1.20.1.dist-info"]


# -- what the uninstall is allowed to touch --


def test_console_scripts_outside_site_packages_are_left_alone(tmp_path):
    """RECORD points at `../../../bin/<name>` for entry points. Those cannot
    shadow an import, and this installer was handed site-packages, not the venv
    root. Laid out at the real depth so the escape actually resolves onto the
    venv's bin directory rather than harmlessly missing it."""
    installer = load_installer()
    venv = tmp_path / "venv"
    venv_sp = venv / "lib" / "python3.12" / "site-packages"
    staging = tmp_path / "staging"
    quarantine = venv / ".superseded"
    venv_sp.mkdir(parents=True)
    staging.mkdir()
    bin_dir = venv / "bin"
    bin_dir.mkdir()
    (bin_dir / "tqdm").write_text("#!/bin/sh")
    assert (venv_sp / ".." / ".." / ".." / "bin" / "tqdm").resolve() == (bin_dir / "tqdm").resolve()
    write_dist(venv_sp, "tqdm", "4.68.3", {"tqdm/__init__.py": "old"},
               extra_record=["../../../bin/tqdm", "/etc/hosts"])
    write_dist(staging, "tqdm", "4.69.1", {"tqdm/__init__.py": "new"})

    # Pinned at the source, because whether an escaping path survives a move
    # depends on how deep the quarantine happens to sit: reading it is the only
    # place the answer is unambiguous.
    owned = installer.distribution_files(str(venv_sp), "tqdm-4.68.3.dist-info")
    assert not [rel for rel in owned if rel.startswith("/") or ".." in rel.split("/")]

    merge(installer, staging, venv_sp, quarantine)

    assert (bin_dir / "tqdm").exists()
    assert (venv_sp / "tqdm" / "__init__.py").read_text() == "new"


def test_a_directory_another_distribution_still_uses_is_not_pruned(tmp_path):
    """Two distributions can share a namespace directory. Emptying one of them
    must not take the other's files with it."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "google_api", "1.0.0", {"google/api/__init__.py": "api-old"})
    write_dist(venv_sp, "google_cloud", "2.0.0", {"google/cloud/__init__.py": "cloud"})
    write_dist(staging, "google_api", "1.1.0", {"google/api/__init__.py": "api-new"})

    merge(installer, staging, venv_sp, quarantine)

    assert (venv_sp / "google" / "cloud" / "__init__.py").read_text() == "cloud"
    assert (venv_sp / "google" / "api" / "__init__.py").read_text() == "api-new"


def test_uninstalling_one_opencv_flavour_leaves_cv2_for_its_siblings(tmp_path):
    """The three opencv projects all own `cv2/`, the way onnxruntime's two
    flavours own `onnxruntime/`.

    Reproduced live: superseding opencv-contrib-python deleted every file its
    RECORD listed, which is the same `cv2/` that opencv-python and
    opencv-python-headless were still claiming. The merge only puts back the
    files of the distribution it is placing, so the venv lost cv2 outright and
    rembg, mediapipe, basicsr, realesrgan and gfpgan all stopped importing.
    """
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    shared = {"cv2/__init__.py": "shared", "cv2/cv2.abi3.so": "shared-binary"}
    write_dist(venv_sp, "opencv_python_headless", "4.10.0.84", dict(shared))
    write_dist(venv_sp, "opencv_python", "4.11.0.86", dict(shared))
    write_dist(venv_sp, "opencv_contrib_python", "4.11.0.86", dict(shared))
    write_dist(staging, "opencv_contrib_python", "4.13.0.92",
               {"cv2/__init__.py": "contrib-new", "cv2/cv2.abi3.so": "contrib-binary"})

    merge(installer, staging, venv_sp, quarantine)

    assert (venv_sp / "cv2" / "__init__.py").read_text() == "contrib-new"
    assert (venv_sp / "cv2" / "cv2.abi3.so").read_text() == "contrib-binary"
    assert dist_infos(venv_sp, "opencv_contrib_python-") == ["opencv_contrib_python-4.13.0.92.dist-info"]
    assert dist_infos(venv_sp, "opencv_python-") == ["opencv_python-4.11.0.86.dist-info"]


def test_a_refused_install_does_not_take_a_siblings_shared_import_with_it(tmp_path):
    """The rollback has the same hazard from the other side: removing what the
    bundle placed must not remove files another installed distribution owns."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "opencv_python_headless", "4.10.0.84",
               {"cv2/__init__.py": "headless", "cv2/cv2.abi3.so": "headless-binary"})
    write_dist(staging, "opencv_contrib_python", "4.13.0.92",
               {"cv2/__init__.py": "contrib", "cv2/cv2.abi3.so": "contrib-binary"})

    plan = merge(installer, staging, venv_sp, quarantine)
    installer.rollback_reconciliation(str(venv_sp), plan, str(quarantine))

    assert (venv_sp / "cv2" / "__init__.py").exists()
    assert dist_infos(venv_sp, "opencv_python_headless-") == ["opencv_python_headless-4.10.0.84.dist-info"]
    assert dist_infos(venv_sp, "opencv_contrib_python-") == []


def test_files_the_incoming_copy_does_not_carry_are_left_where_they_are(tmp_path):
    """Bundle archives are not always complete wheels.

    Reproduced live: upscale-enhance carries setuptools 74.1.3 as `setuptools/`
    plus its dist-info, and nothing else. The version it replaced also owned
    `_distutils_hack/` and `distutils-precedence.pth`, the shim that gives
    Python 3.12 a `distutils`. Removing everything the old RECORD listed deleted
    the shim, nothing wrote it back, and basicsr, realesrgan and gfpgan all
    stopped importing on a venv where every bundle reported installed.
    """
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(
        venv_sp, "setuptools", "78.1.1",
        {
            "setuptools/__init__.py": "78",
            "setuptools/_vendor/old.py": "78-vendored",
            "_distutils_hack/__init__.py": "shim",
            "distutils-precedence.pth": "import _distutils_hack",
        },
    )
    # The archive's RECORD is the wheel's, and claims files the archive does not
    # actually carry. That is what made the first attempt at this guard fail on
    # the real node: reading RECORD alone still cleared the shim.
    write_dist(
        staging, "setuptools", "74.1.3", {"setuptools/__init__.py": "74"},
        extra_record=["_distutils_hack/__init__.py", "distutils-precedence.pth"],
    )

    merge(installer, staging, venv_sp, quarantine)

    assert (venv_sp / "_distutils_hack" / "__init__.py").read_text() == "shim"
    assert (venv_sp / "distutils-precedence.pth").read_text() == "import _distutils_hack"
    # The part the incoming copy does cover is fully replaced, stale files and all.
    assert (venv_sp / "setuptools" / "__init__.py").read_text() == "74"
    assert not (venv_sp / "setuptools" / "_vendor" / "old.py").exists()
    assert dist_infos(venv_sp, "setuptools-") == ["setuptools-74.1.3.dist-info"]


def test_stale_bytecode_of_a_removed_module_is_discarded(tmp_path):
    """A `.pyc` orphaned by the uninstall keeps the package directory alive and
    would block the incoming version's directory from landing cleanly."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "numba", "0.65.1", {"numba/dropped.py": "old"})
    cache = venv_sp / "numba" / "__pycache__"
    cache.mkdir(parents=True)
    (cache / "dropped.cpython-312.pyc").write_bytes(b"stale")
    write_dist(staging, "numba", "0.66.0", {"numba/kept.py": "new"})

    merge(installer, staging, venv_sp, quarantine)

    assert not (venv_sp / "numba" / "dropped.py").exists()
    assert not (cache / "dropped.cpython-312.pyc").exists()
    assert (venv_sp / "numba" / "kept.py").read_text() == "new"


def test_a_distribution_with_no_record_still_loses_its_metadata(tmp_path):
    """Without a RECORD the file list is unknowable, but leaving the old
    dist-info behind would report two versions installed. Drop what we can."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "click", "8.4.1", {"click/__init__.py": "old"})
    (venv_sp / "click-8.4.1.dist-info" / "RECORD").unlink()
    write_dist(staging, "click", "8.4.2", {"click/__init__.py": "new"})

    merge(installer, staging, venv_sp, quarantine)

    assert dist_infos(venv_sp, "click-") == ["click-8.4.2.dist-info"]
    assert (venv_sp / "click" / "__init__.py").read_text() == "new"


def test_name_spelling_does_not_hide_a_collision(tmp_path):
    """`hf_xet` and `hf-xet` are the same project. Comparing raw directory names
    would miss the collision and leave both versions installed."""
    installer = load_installer()
    staging, venv_sp, _q = trees(tmp_path)
    write_dist(venv_sp, "hf_xet", "1.5.1", {"hf_xet/__init__.py": "old"})
    write_dist(staging, "hf-xet", "1.5.2", {"hf_xet/__init__.py": "new"})

    plan = installer.plan_reconciliation(str(staging), str(venv_sp))

    assert [item["name"] for item in plan] == ["hf-xet"]
    assert plan[0]["superseded"] == [("1.5.1", "hf_xet-1.5.1.dist-info")]


# -- rollback --


def test_a_refused_install_puts_the_displaced_version_back(tmp_path):
    """The whole reason superseded files are quarantined rather than deleted: a
    bundle that fails verification must not keep the versions it took from the
    bundles that were already working."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(
        venv_sp, "tokenizers", "0.20.3",
        {"tokenizers/__init__.py": "0.20.3", "tokenizers/native.so": "old-binary"},
    )
    write_dist(venv_sp, "transformers", "4.46.3", {"transformers/__init__.py": "keep"})
    write_dist(
        staging, "tokenizers", "0.23.1",
        {"tokenizers/__init__.py": "0.23.1", "tokenizers/other.so": "new-binary"},
    )
    write_dist(staging, "faster_whisper", "1.2.1", {"faster_whisper/__init__.py": "new"})

    plan = merge(installer, staging, venv_sp, quarantine)
    installer.rollback_reconciliation(str(venv_sp), plan, str(quarantine))

    assert dist_infos(venv_sp, "tokenizers-") == ["tokenizers-0.20.3.dist-info"]
    assert (venv_sp / "tokenizers" / "__init__.py").read_text() == "0.20.3"
    assert (venv_sp / "tokenizers" / "native.so").read_text() == "old-binary"
    assert not (venv_sp / "tokenizers" / "other.so").exists()
    # The bundle's own new distribution goes away with it.
    assert not (venv_sp / "faster_whisper").exists()
    assert dist_infos(venv_sp, "faster_whisper-") == []
    # An unrelated distribution is untouched either way.
    assert (venv_sp / "transformers" / "__init__.py").read_text() == "keep"
    assert not os.path.exists(quarantine)


def test_a_rollback_leaves_an_unchanged_distribution_alone(tmp_path):
    """A distribution already at the staged version never enters the plan, so a
    rollback must not delete files that were correct before this install."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "certifi", "2026.7.22", {"certifi/cacert.pem": "bundle"})
    write_dist(staging, "certifi", "2026.7.22", {"certifi/cacert.pem": "bundle"})
    write_dist(staging, "rembg", "2.0.62", {"rembg/__init__.py": "new"})

    plan = merge(installer, staging, venv_sp, quarantine)
    installer.rollback_reconciliation(str(venv_sp), plan, str(quarantine))

    assert (venv_sp / "certifi" / "cacert.pem").read_text() == "bundle"
    assert dist_infos(venv_sp, "certifi-") == ["certifi-2026.7.22.dist-info"]
    assert not (venv_sp / "rembg").exists()


def test_rollback_without_a_quarantine_is_harmless(tmp_path):
    """Nothing collided, so there is nothing to restore and the venv is left as
    it was before the bundle landed."""
    installer = load_installer()
    staging, venv_sp, quarantine = trees(tmp_path)
    write_dist(venv_sp, "numpy", "1.26.4", {"numpy/__init__.py": "base"})
    write_dist(staging, "mediapipe", "0.10.35", {"mediapipe/__init__.py": "new"})

    plan = merge(installer, staging, venv_sp, quarantine)
    installer.rollback_reconciliation(str(venv_sp), plan, str(quarantine))

    assert (venv_sp / "numpy" / "__init__.py").read_text() == "base"
    assert sorted(os.listdir(venv_sp)) == ["numpy", "numpy-1.26.4.dist-info"]
