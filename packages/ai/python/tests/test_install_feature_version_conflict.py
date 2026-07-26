"""Regression reproduction for the shared-venv version conflict (AI-20260726-001).

`reconcile_onnxruntime` fixed exactly one package pair. Every OTHER distribution
that two bundles both provided was merged by `move_tree` file-by-file, with no
uninstall of the version already in the venv, so two versions ended up overlaid:
the pure-Python modules came from whichever bundle wrote last while the compiled
extension CPython actually imports could come from the other.

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

The invariant is deliberately modest and does not presume a particular winner:
after a bundle's site-packages has been merged into the venv, exactly ONE
version of any given distribution remains, and no file belonging to the
superseded version survives to shadow it.
"""

import importlib.util
import os

import pytest

CASES = {
    # distribution, older version, newer version, older extension, newer extension
    "tokenizers": ("0.20.3", "0.23.1", "tokenizers.cpython-312-x86_64-linux-gnu.so", "tokenizers.abi3.so"),
    "scipy": ("1.12.0", "1.17.1", "_lib/_ccallback_c.cpython-312-x86_64-linux-gnu.so", "_lib/_ccallback_c.abi3.so"),
    "huggingface_hub": ("0.36.2", "1.22.0", None, None),
}


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_conflict_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def make_distribution(site_packages, package, version, extension):
    """Lay out one version of the package, the way a bundle archive carries it."""
    package_dir = site_packages / package
    (package_dir / "decoders").mkdir(parents=True, exist_ok=True)
    (package_dir / "__init__.py").write_text(f"__version__ = {version!r}\n")
    (package_dir / "decoders" / "__init__.py").write_text(f"# decoders for {version}\n")
    owned = [
        f"{package}/__init__.py",
        f"{package}/decoders/__init__.py",
    ]
    if extension:
        target = package_dir / extension
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"native {version}")
        owned.append(f"{package}/{extension}")
    dist_info = site_packages / f"{package}-{version}.dist-info"
    dist_info.mkdir(parents=True, exist_ok=True)
    (dist_info / "METADATA").write_text(f"Name: {package}\nVersion: {version}\n")
    owned += [
        f"{package}-{version}.dist-info/METADATA",
        f"{package}-{version}.dist-info/RECORD",
    ]
    (dist_info / "RECORD").write_text("\n".join(f"{path},," for path in owned) + "\n")


def merge_bundle(tmp_path, package, installed_version, incoming_version,
                 installed_extension, incoming_extension):
    """Run the installer's real merge sequence for a second bundle."""
    installer = load_installer()
    site_packages = tmp_path / "venv-site-packages"
    staging = tmp_path / "staging-site-packages"
    quarantine = tmp_path / "quarantine"
    site_packages.mkdir()
    staging.mkdir()

    make_distribution(site_packages, package, installed_version, installed_extension)
    make_distribution(staging, package, incoming_version, incoming_extension)

    installer.reconcile_onnxruntime(str(staging), str(site_packages))
    plan = installer.plan_reconciliation(str(staging), str(site_packages))
    installer.supersede_distributions(str(site_packages), plan, str(quarantine))
    installer.move_tree(str(staging), str(site_packages))
    return site_packages


def dist_info_versions(site_packages, package):
    return sorted(
        entry.name.removesuffix(".dist-info").split("-", 1)[1]
        for entry in site_packages.iterdir()
        if entry.name.startswith(f"{package}-") and entry.name.endswith(".dist-info")
    )


@pytest.mark.parametrize("package", sorted(CASES))
@pytest.mark.parametrize("upgrade", [True, False], ids=["upgrade", "downgrade"])
def test_merging_a_second_bundle_leaves_one_distribution_version(tmp_path, package, upgrade):
    """Whichever direction the second bundle moves the version, only one remains.

    Both directions matter: Install All has no fixed order, and the field
    failure needed only that two bundles disagreed, not that the newer one
    landed second.
    """
    older, newer, older_ext, newer_ext = CASES[package]
    installed, incoming = (older, newer) if upgrade else (newer, older)
    installed_ext, incoming_ext = (older_ext, newer_ext) if upgrade else (newer_ext, older_ext)

    site_packages = merge_bundle(
        tmp_path, package, installed, incoming, installed_ext, incoming_ext
    )

    assert dist_info_versions(site_packages, package) == [incoming]
    assert incoming in (site_packages / package / "__init__.py").read_text()


@pytest.mark.parametrize("package", ["tokenizers", "scipy"])
def test_merging_a_second_bundle_removes_the_superseded_extension(tmp_path, package):
    """The exact tokenizers mechanism: CPython prefers the platform-specific
    suffix, so a surviving `.cpython-312-*.so` from the old version would be
    loaded under the new version's Python modules."""
    older, newer, older_ext, newer_ext = CASES[package]

    site_packages = merge_bundle(tmp_path, package, older, newer, older_ext, newer_ext)

    package_dir = site_packages / package
    assert (package_dir / newer_ext).exists()
    assert not (package_dir / older_ext).exists()


def test_a_reinstall_of_the_same_version_is_left_alone(tmp_path):
    """Placing what is already there must not churn the venv: nothing is
    superseded, so nothing is removed and nothing can be torn."""
    installer = load_installer()
    site_packages = tmp_path / "venv-site-packages"
    staging = tmp_path / "staging-site-packages"
    site_packages.mkdir()
    staging.mkdir()
    make_distribution(site_packages, "tokenizers", "0.20.3", None)
    make_distribution(staging, "tokenizers", "0.20.3", None)

    plan = installer.plan_reconciliation(str(staging), str(site_packages))

    assert plan == []


def test_reinstalling_a_bundle_repairs_a_venv_already_carrying_both_versions(tmp_path):
    """Self-heal for hosts that ran the broken installer.

    Someone who already clicked Install All has a venv with both versions
    overlaid. Reinstalling any bundle that provides the distribution has to
    clear the other version rather than add a third.
    """
    installer = load_installer()
    site_packages = tmp_path / "venv-site-packages"
    staging = tmp_path / "staging-site-packages"
    quarantine = tmp_path / "quarantine"
    site_packages.mkdir()
    staging.mkdir()
    make_distribution(site_packages, "tokenizers", "0.20.3", "tokenizers.cpython-312-x86_64-linux-gnu.so")
    make_distribution(site_packages, "tokenizers", "0.23.1", "tokenizers.abi3.so")
    make_distribution(staging, "tokenizers", "0.23.1", "tokenizers.abi3.so")

    plan = installer.plan_reconciliation(str(staging), str(site_packages))
    installer.supersede_distributions(str(site_packages), plan, str(quarantine))
    installer.move_tree(str(staging), str(site_packages))

    assert dist_info_versions(site_packages, "tokenizers") == ["0.23.1"]
    assert not (site_packages / "tokenizers" / "tokenizers.cpython-312-x86_64-linux-gnu.so").exists()
