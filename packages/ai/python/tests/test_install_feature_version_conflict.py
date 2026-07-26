"""Regression reproduction for the shared-venv version conflict (AI-20260726-001).

`reconcile_onnxruntime` fixes exactly one package pair. Every OTHER distribution
that two bundles both provide is merged by `move_tree` file-by-file, with no
uninstall of the version already in the venv, so two versions end up overlaid:
the pure-Python modules come from whichever bundle wrote last while the compiled
extension CPython actually imports can come from the other.

Observed live on ubuntu-gpu-amd64 after Settings > AI Features > Install All:
seventeen distributions carried two or three versions at once. Three of them
broke a tool.

  tokenizers 0.20.3 (inpaint-hq, pinned by transformers 4.46.3) and 0.23.1
  (transcription, needed by faster-whisper) both present. The package directory
  held tokenizers.cpython-312-x86_64-linux-gnu.so from 0.20.3 next to
  tokenizers.abi3.so from 0.23.1; CPython prefers the platform-specific suffix,
  so 0.23.1's `decoders/__init__.py` ran against 0.20.3's binary and raised
  "AttributeError: module 'decoders' has no attribute 'DecodeStream'". The
  transcription install failed its own smoke gate and could not be installed at
  all on that host.

  scipy 1.12.0 and 1.17.1 -> Real-ESRGAN cannot import, `upscale` fails.
  huggingface_hub 0.36.2, 1.19.0 and 1.22.0 -> transformers refuses to import,
  the high-quality Object Eraser path fails.

The invariant these tests assert is deliberately modest and does not presume a
particular fix: after a bundle's site-packages has been merged into the venv,
exactly ONE version of any given distribution should remain, and no extension
module belonging to the superseded version should survive. Both are xfail today.
Marked strict, so whoever implements general reconciliation gets a failing test
telling them to remove the marker rather than a silently passing one.
"""

import importlib.util
import os

import pytest

PACKAGE = "tokenizers"
OLD_VERSION = "0.20.3"
NEW_VERSION = "0.23.1"
# The two extension-module names the real bundles ship. CPython's importer
# prefers the platform-specific suffix over the stable-ABI one, which is why the
# older binary wins even when the newer package files land last.
OLD_EXTENSION = "tokenizers.cpython-312-x86_64-linux-gnu.so"
NEW_EXTENSION = "tokenizers.abi3.so"


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_conflict_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def make_distribution(site_packages, version, extension):
    """Lay out one version of the package, the way a bundle archive carries it."""
    package_dir = site_packages / PACKAGE
    (package_dir / "decoders").mkdir(parents=True, exist_ok=True)
    (package_dir / "__init__.py").write_text(f"__version__ = {version!r}\n")
    (package_dir / "decoders" / "__init__.py").write_text(f"# decoders for {version}\n")
    (package_dir / extension).write_text(f"native {version}")
    dist_info = site_packages / f"{PACKAGE}-{version}.dist-info"
    dist_info.mkdir(parents=True, exist_ok=True)
    (dist_info / "METADATA").write_text(f"Name: {PACKAGE}\nVersion: {version}\n")
    (dist_info / "RECORD").write_text(
        "\n".join(
            [
                f"{PACKAGE}/__init__.py,,",
                f"{PACKAGE}/decoders/__init__.py,,",
                f"{PACKAGE}/{extension},,",
                f"{PACKAGE}-{version}.dist-info/METADATA,,",
                f"{PACKAGE}-{version}.dist-info/RECORD,,",
            ]
        )
        + "\n"
    )


def merge_bundle(tmp_path):
    """Run the installer's real merge sequence for a second bundle."""
    installer = load_installer()
    site_packages = tmp_path / "venv-site-packages"
    staging = tmp_path / "staging-site-packages"
    site_packages.mkdir()
    staging.mkdir()

    make_distribution(site_packages, OLD_VERSION, OLD_EXTENSION)
    make_distribution(staging, NEW_VERSION, NEW_EXTENSION)

    installer.reconcile_onnxruntime(str(staging), str(site_packages))
    installer.move_tree(str(staging), str(site_packages))
    return site_packages


def dist_info_versions(site_packages):
    return sorted(
        entry.name.removesuffix(".dist-info").split("-", 1)[1]
        for entry in site_packages.iterdir()
        if entry.name.startswith(f"{PACKAGE}-") and entry.name.endswith(".dist-info")
    )


@pytest.mark.xfail(
    strict=True,
    reason="AI-20260726-001: only onnxruntime is reconciled, so both versions survive the merge",
)
def test_merging_a_second_bundle_leaves_one_distribution_version(tmp_path):
    site_packages = merge_bundle(tmp_path)
    assert dist_info_versions(site_packages) == [NEW_VERSION]


@pytest.mark.xfail(
    strict=True,
    reason="AI-20260726-001: the superseded native extension survives and CPython imports it first",
)
def test_merging_a_second_bundle_removes_the_superseded_extension(tmp_path):
    site_packages = merge_bundle(tmp_path)
    package_dir = site_packages / PACKAGE
    assert (package_dir / NEW_EXTENSION).exists()
    assert not (package_dir / OLD_EXTENSION).exists()


def test_the_conflict_reproduces_exactly_as_observed_in_the_field(tmp_path):
    """Positive control: this documents today's behaviour and must stay green.

    It fails only if the merge stops producing the overlaid state, which is the
    same event that flips the two xfails above. Keeping it lets the reproduction
    be read without running the broken case.
    """
    site_packages = merge_bundle(tmp_path)
    package_dir = site_packages / PACKAGE

    assert dist_info_versions(site_packages) == [OLD_VERSION, NEW_VERSION]
    assert (package_dir / OLD_EXTENSION).exists()
    assert (package_dir / NEW_EXTENSION).exists()
    # The pure-Python half comes from the incoming bundle...
    assert NEW_VERSION in (package_dir / "__init__.py").read_text()
    # ...while the binary CPython would load first is the superseded one.
    assert OLD_VERSION in (package_dir / OLD_EXTENSION).read_text()
