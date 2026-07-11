import importlib.util
import os
import sys
import types


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_download_with_hf_hub_uses_accelerated_client(monkeypatch, tmp_path):
    installer = load_installer()
    downloaded = tmp_path / "hf-cache" / "bundle.tar.gz"
    downloaded.parent.mkdir()

    calls = {}

    def fake_hf_hub_download(**kwargs):
        calls.update(kwargs)
        downloaded.write_bytes(b"archive")
        return str(downloaded)

    fake_module = types.ModuleType("huggingface_hub")
    fake_module.hf_hub_download = fake_hf_hub_download
    monkeypatch.setitem(sys.modules, "huggingface_hub", fake_module)

    progress = []
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: progress.append((p, s)))

    dest = tmp_path / "staging" / "object-eraser-colorize-amd64-gpu.tar.gz"
    dest.parent.mkdir()

    assert (
        installer.download_with_hf_hub(
            "snapotter/feature-bundles",
            "v2.0.0/object-eraser-colorize-amd64-gpu.tar.gz",
            str(dest),
            100,
            2,
            85,
        )
        is True
    )

    assert dest.read_bytes() == b"archive"
    assert calls["repo_id"] == "snapotter/feature-bundles"
    assert calls["repo_type"] == "model"
    assert calls["filename"] == "v2.0.0/object-eraser-colorize-amd64-gpu.tar.gz"
    assert any("accelerated" in stage.lower() for _, stage in progress)


def test_download_with_hf_hub_cleans_cache_when_download_raises(monkeypatch, tmp_path):
    """A failed accelerated download must not leak its .cache staging tree onto
    disk before the urllib fallback runs."""
    installer = load_installer()
    staging = tmp_path / "staging"
    staging.mkdir()
    # Simulate a partial hf cache tree left behind by a failed transfer.
    leaked_cache = staging / ".cache" / "huggingface" / "download"
    leaked_cache.mkdir(parents=True)
    (leaked_cache / "blob.incomplete").write_bytes(b"partial")
    leaked_nested = staging / "v2.0.0"
    leaked_nested.mkdir()

    def fake_hf_hub_download(**_kwargs):
        raise RuntimeError("xet CAS unreachable")

    fake_module = types.ModuleType("huggingface_hub")
    fake_module.hf_hub_download = fake_hf_hub_download
    monkeypatch.setitem(sys.modules, "huggingface_hub", fake_module)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    dest = staging / "object-eraser-colorize-amd64-gpu.tar.gz"

    assert (
        installer.download_with_hf_hub(
            "deepsafe/feature-bundles",
            "v2.0.0/object-eraser-colorize-amd64-gpu.tar.gz",
            str(dest),
            100,
            2,
            85,
        )
        is False
    )
    # Both the .cache tree and the nested archive dir are reclaimed.
    assert not (staging / ".cache").exists()
    assert not (staging / "v2.0.0").exists()


def test_ensure_hf_hub_noops_when_client_already_importable(monkeypatch, tmp_path):
    installer = load_installer()
    fake_module = types.ModuleType("huggingface_hub")
    monkeypatch.setitem(sys.modules, "huggingface_hub", fake_module)

    ran = {"pip": False}
    monkeypatch.setattr(
        installer.subprocess, "run", lambda *a, **k: ran.__setitem__("pip", True)
    )
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.ensure_hf_hub(str(tmp_path))
    assert ran["pip"] is False


def test_ensure_hf_hub_self_heals_missing_client(monkeypatch, tmp_path):
    """On a drifted venv where huggingface_hub is missing, ensure_hf_hub must
    pip-install it into that venv rather than let the caller fall back to the
    slow single-stream urllib downloader silently."""
    installer = load_installer()
    monkeypatch.delitem(sys.modules, "huggingface_hub", raising=False)

    # Make the huggingface_hub import fail deterministically so ensure_hf_hub
    # takes its self-heal branch.
    import builtins

    real_import = builtins.__import__

    def blocked_import(name, *a, **k):
        if name == "huggingface_hub":
            raise ImportError("No module named 'huggingface_hub'")
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", blocked_import)

    venv = tmp_path / "venv"
    (venv / "bin").mkdir(parents=True)
    (venv / "bin" / "python3").write_text("")

    pip_calls = []
    monkeypatch.setattr(
        installer.subprocess,
        "run",
        lambda cmd, **k: pip_calls.append(cmd) or types.SimpleNamespace(returncode=0),
    )
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.ensure_hf_hub(str(venv))

    assert len(pip_calls) == 1
    cmd = pip_calls[0]
    assert cmd[0] == str(venv / "bin" / "python3")
    assert "install" in cmd
    spec = next(part for part in cmd if part.startswith("huggingface-hub["))
    assert "hf_xet" in spec
    assert "hf_transfer" in spec
