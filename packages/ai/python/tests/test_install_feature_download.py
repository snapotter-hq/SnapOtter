import hashlib
import importlib.util
import json
import os
import sys
import types

import pytest


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_main_temporarily_lifts_hugging_face_offline_flags(monkeypatch):
    """An explicit bundle install stays online while runtime remains fail-closed."""
    installer = load_installer()
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    observed = {}

    def fake_install():
        observed["hf"] = os.environ["HF_HUB_OFFLINE"]
        observed["transformers"] = os.environ["TRANSFORMERS_OFFLINE"]

    monkeypatch.setattr(installer, "_install", fake_install)

    installer.main()

    assert observed == {"hf": "0", "transformers": "0"}
    assert os.environ["HF_HUB_OFFLINE"] == "1"
    assert os.environ["TRANSFORMERS_OFFLINE"] == "1"


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


# -- download_and_verify: checksum-mismatch retry contract (issue #714) --

GOOD_BYTES = b"good archive bytes"
BAD_BYTES = b"corrupt archive bytes"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _last_error(capsys) -> str:
    """Parse the JSON error line fail() writes to stderr."""
    err_lines = [line for line in capsys.readouterr().err.strip().splitlines() if line]
    payload = json.loads(err_lines[-1])
    return payload["error"]


def test_download_and_verify_accepts_good_first_download(monkeypatch, tmp_path):
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"
    calls = {"hf": 0, "resume": 0}

    def fake_hf(*args, **kwargs):
        calls["hf"] += 1
        with open(args[2], "wb") as f:
            f.write(GOOD_BYTES)
        return True

    def fake_resume(url, tar_path, *rest):
        calls["resume"] += 1

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.download_and_verify(
        "deepsafe/feature-bundles",
        "v2.0.0/background-removal-amd64-gpu.tar.gz",
        str(dest),
        _sha256(GOOD_BYTES),
        len(GOOD_BYTES),
    )

    assert calls == {"hf": 1, "resume": 0}
    assert dest.read_bytes() == GOOD_BYTES


def test_checksum_mismatch_retries_with_sequential_downloader(monkeypatch, tmp_path):
    """A corrupt accelerated download must be retried over the plain sequential
    downloader, not by re-running the transport that just produced bad bytes
    (issue #714: hf_xet parallel writes corrupt on some bind mounts, so a
    force_download re-run fails the same way forever)."""
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"
    calls = {"hf": 0, "resume": 0}

    def fake_hf(*args, **kwargs):
        calls["hf"] += 1
        with open(args[2], "wb") as f:
            f.write(BAD_BYTES)
        return True

    def fake_resume(url, tar_path, *rest):
        calls["resume"] += 1
        assert not os.path.exists(tar_path), "corrupt file must be gone before retry"
        with open(tar_path, "wb") as f:
            f.write(GOOD_BYTES)

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.download_and_verify(
        "deepsafe/feature-bundles",
        "v2.0.0/background-removal-amd64-gpu.tar.gz",
        str(dest),
        _sha256(GOOD_BYTES),
        len(GOOD_BYTES),
    )

    assert calls["hf"] == 1, "accelerated client must not be re-run after a mismatch"
    assert calls["resume"] == 1
    assert dest.read_bytes() == GOOD_BYTES


def test_mismatch_retry_discards_stale_resume_sidecars(monkeypatch, tmp_path):
    """A mismatch is positive evidence of corruption, so the retry must not
    resume from .partial/.meta sidecars a previously killed run left behind
    (welding stale bytes onto the fresh download would fail the checksum again
    and misdiagnose the cause as the user's storage)."""
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"
    (tmp_path / "background-removal-amd64-gpu.tar.gz.partial").write_bytes(b"stale")
    (tmp_path / "background-removal-amd64-gpu.tar.gz.meta").write_text(
        '{"bytesDownloaded": 5}'
    )

    def fake_hf(*args, **kwargs):
        with open(args[2], "wb") as f:
            f.write(BAD_BYTES)
        return True

    def fake_resume(url, tar_path, *rest):
        assert not os.path.exists(tar_path + ".partial"), "stale .partial must be wiped"
        assert not os.path.exists(tar_path + ".meta"), "stale .meta must be wiped"
        with open(tar_path, "wb") as f:
            f.write(GOOD_BYTES)

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.download_and_verify(
        "deepsafe/feature-bundles",
        "v2.0.0/background-removal-amd64-gpu.tar.gz",
        str(dest),
        _sha256(GOOD_BYTES),
        len(GOOD_BYTES),
    )

    assert dest.read_bytes() == GOOD_BYTES


def test_hf_unavailable_falls_back_to_sequential_download(monkeypatch, tmp_path):
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"
    seen = {}

    def fake_resume(url, tar_path, *rest):
        seen["url"] = url
        with open(tar_path, "wb") as f:
            f.write(GOOD_BYTES)

    monkeypatch.setattr(installer, "download_with_hf_hub", lambda *a, **k: False)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    installer.download_and_verify(
        "deepsafe/feature-bundles",
        "v2.0.0/background-removal-amd64-gpu.tar.gz",
        str(dest),
        _sha256(GOOD_BYTES),
        len(GOOD_BYTES),
    )

    assert seen["url"] == (
        "https://huggingface.co/deepsafe/feature-bundles"
        "/resolve/main/v2.0.0/background-removal-amd64-gpu.tar.gz"
    )
    assert dest.read_bytes() == GOOD_BYTES


def test_first_download_failure_reports_manual_hint(monkeypatch, tmp_path, capsys):
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"

    def fake_resume(url, tar_path, *rest):
        raise RuntimeError("Failed to download after 5 attempts: boom")

    monkeypatch.setattr(installer, "download_with_hf_hub", lambda *a, **k: False)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    with pytest.raises(SystemExit):
        installer.download_and_verify(
            "deepsafe/feature-bundles",
            "v2.0.0/background-removal-amd64-gpu.tar.gz",
            str(dest),
            _sha256(GOOD_BYTES),
            len(GOOD_BYTES),
        )

    error = _last_error(capsys)
    assert "Failed to download after 5 attempts: boom" in error
    assert "resolve/main/v2.0.0/background-removal-amd64-gpu.tar.gz" in error
    assert "Offline Import" in error


def test_retry_download_failure_keeps_mismatch_context(monkeypatch, tmp_path, capsys):
    """When the sequential re-download after a mismatch itself fails, the error
    must still say a checksum mismatch started it (with the digests), so a
    #714-class corruption is distinguishable from a plain flaky download."""
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"

    def fake_hf(*args, **kwargs):
        with open(args[2], "wb") as f:
            f.write(BAD_BYTES)
        return True

    def fake_resume(url, tar_path, *rest):
        raise RuntimeError("Failed to download after 5 attempts: boom")

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    with pytest.raises(SystemExit):
        installer.download_and_verify(
            "deepsafe/feature-bundles",
            "v2.0.0/background-removal-amd64-gpu.tar.gz",
            str(dest),
            _sha256(GOOD_BYTES),
            len(GOOD_BYTES),
        )

    error = _last_error(capsys)
    assert "Checksum mismatch" in error
    assert _sha256(GOOD_BYTES) in error
    assert _sha256(BAD_BYTES) in error
    assert "Failed to download after 5 attempts: boom" in error
    assert "Offline Import" in error


def test_verify_read_error_fails_with_json_error(monkeypatch, tmp_path, capsys):
    """EIO while hashing the multi-GB archive (a live possibility on the flaky
    mounts this retry exists for) must surface as a JSON error frame the Node
    bridge can parse, not a raw traceback."""
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"

    def fake_hf(*args, **kwargs):
        with open(args[2], "wb") as f:
            f.write(GOOD_BYTES)
        return True

    def broken_hash(path):
        raise OSError(5, "Input/output error")

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", lambda *a: None)
    monkeypatch.setattr(installer, "file_sha256", broken_hash)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    with pytest.raises(SystemExit):
        installer.download_and_verify(
            "deepsafe/feature-bundles",
            "v2.0.0/background-removal-amd64-gpu.tar.gz",
            str(dest),
            _sha256(GOOD_BYTES),
            len(GOOD_BYTES),
        )

    error = _last_error(capsys)
    assert "Input/output error" in error
    assert "Offline Import" in error


def test_checksum_mismatch_failure_reports_both_hashes(monkeypatch, tmp_path, capsys):
    """When both transports produce wrong bytes, the error must state the
    expected AND actual digests and point at the offline-import workaround."""
    installer = load_installer()
    dest = tmp_path / "background-removal-amd64-gpu.tar.gz"

    def fake_hf(*args, **kwargs):
        with open(args[2], "wb") as f:
            f.write(BAD_BYTES)
        return True

    def fake_resume(url, tar_path, *rest):
        with open(tar_path, "wb") as f:
            f.write(BAD_BYTES)

    monkeypatch.setattr(installer, "download_with_hf_hub", fake_hf)
    monkeypatch.setattr(installer, "download_with_resume", fake_resume)
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    with pytest.raises(SystemExit):
        installer.download_and_verify(
            "deepsafe/feature-bundles",
            "v2.0.0/background-removal-amd64-gpu.tar.gz",
            str(dest),
            _sha256(GOOD_BYTES),
            len(GOOD_BYTES),
        )

    error = _last_error(capsys)
    assert _sha256(GOOD_BYTES) in error
    assert _sha256(BAD_BYTES) in error
    assert "Offline Import" in error
    assert not dest.exists()


def test_local_bundle_checksum_error_reports_actual_hash(monkeypatch, tmp_path, capsys):
    installer = load_installer()
    archive_entry = {
        "file": "v2.0.0/background-removal.tar.gz",
        "sha256": _sha256(GOOD_BYTES),
        "compressedSize": len(GOOD_BYTES),
        "extractedSize": 0,
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "bundles": {
                    "background-removal": {
                        "archives": {
                            "amd64-gpu": archive_entry,
                            "arm64-cpu": archive_entry,
                        }
                    }
                }
            }
        )
    )
    models_dir = tmp_path / "ai" / "models"
    models_dir.mkdir(parents=True)
    local = tmp_path / "local.tar.gz"
    local.write_bytes(BAD_BYTES)

    monkeypatch.setenv("SNAPOTTER_BUNDLE_LOCAL_PATH", str(local))
    monkeypatch.setattr(
        sys,
        "argv",
        ["install_feature.py", "background-removal", str(manifest_path), str(models_dir)],
    )
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)

    with pytest.raises(SystemExit):
        installer._install()

    error = _last_error(capsys)
    assert _sha256(GOOD_BYTES) in error
    assert _sha256(BAD_BYTES) in error
