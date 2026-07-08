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
