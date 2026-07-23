"""Contract tests for offline_guard: the strict-offline download gate and the
best-effort bundle-weight symlink helpers. Pure (os + filesystem), no models,
so this runs on any Python the sidecar supports."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import offline_guard  # noqa: E402


# --- downloads_allowed ------------------------------------------------------


def test_downloads_allowed_default_true(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", raising=False)
    assert offline_guard.downloads_allowed() is True


@pytest.mark.parametrize("value", ["0", "false", "FALSE", "False"])
def test_downloads_blocked_by_explicit_off(monkeypatch, value):
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", value)
    assert offline_guard.downloads_allowed() is False


@pytest.mark.parametrize("value", ["1", "true", "yes", "anything"])
def test_downloads_allowed_for_non_off_values(monkeypatch, value):
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", value)
    assert offline_guard.downloads_allowed() is True


# --- ensure_download_allowed ------------------------------------------------


def test_ensure_noop_when_allowed(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", raising=False)
    assert offline_guard.ensure_download_allowed("thing") is None


def test_ensure_raises_actionable_error_when_blocked(monkeypatch):
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0")
    with pytest.raises(RuntimeError) as exc:
        offline_guard.ensure_download_allowed("MyModel weight")
    msg = str(exc.value)
    assert "MyModel weight" in msg
    assert "SNAPOTTER_ALLOW_MODEL_DOWNLOAD" in msg


# --- link_bundled_weight ----------------------------------------------------


def test_link_already_present_returns_true_without_symlink(tmp_path):
    link = tmp_path / "present.pth"
    link.write_text("x")
    target = tmp_path / "target.pth"  # intentionally absent
    assert offline_guard.link_bundled_weight(str(link), str(target)) is True
    assert not link.is_symlink()  # left untouched


def test_link_target_missing_returns_false(tmp_path):
    link = tmp_path / "missing" / "link.pth"
    target = tmp_path / "nope.pth"  # absent
    assert offline_guard.link_bundled_weight(str(link), str(target)) is False
    assert not link.exists()


def test_link_creates_symlink_and_parent_dirs(tmp_path):
    target = tmp_path / "bundle" / "weight.pth"
    target.parent.mkdir()
    target.write_text("weights")
    link = tmp_path / "nested" / "dir" / "weight.pth"
    assert offline_guard.link_bundled_weight(str(link), str(target)) is True
    assert link.is_symlink()
    assert link.read_text() == "weights"  # resolves to the target bytes


def test_link_oserror_returns_false_when_symlink_fails(tmp_path, monkeypatch):
    target = tmp_path / "t.pth"
    target.write_text("w")
    link = tmp_path / "l.pth"

    def raise_oserror(*_a, **_k):
        raise OSError("read-only fs")

    monkeypatch.setattr(offline_guard.os, "symlink", raise_oserror)
    # symlink fails and the link never materialised -> False.
    assert offline_guard.link_bundled_weight(str(link), str(target)) is False


# --- prepare_gfpgan_helper_weights / prepare_codeformer_weights -------------


def test_prepare_gfpgan_links_present_weights(tmp_path, monkeypatch):
    models = tmp_path / "models"
    facelib = models / "gfpgan" / "facelib"
    facelib.mkdir(parents=True)
    for fname in offline_guard.GFPGAN_HELPER_WEIGHTS:
        (facelib / fname).write_text("w")
    monkeypatch.chdir(tmp_path)  # link paths are cwd-relative
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0")  # would raise on any miss
    offline_guard.prepare_gfpgan_helper_weights(str(models))  # must not raise
    for fname in offline_guard.GFPGAN_HELPER_WEIGHTS:
        assert (tmp_path / "gfpgan" / "weights" / fname).exists()


def test_prepare_gfpgan_raises_offline_when_weight_missing(tmp_path, monkeypatch):
    models = tmp_path / "models"  # nothing installed
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0")
    with pytest.raises(RuntimeError):
        offline_guard.prepare_gfpgan_helper_weights(str(models))


def test_prepare_codeformer_links_present_weights(tmp_path, monkeypatch):
    models = tmp_path / "models"
    layout = [
        ("codeformer", "codeformer.pth"),
        ("gfpgan", "facelib", "detection_Resnet50_Final.pth"),
        ("gfpgan", "facelib", "parsing_parsenet.pth"),
        ("realesrgan", "RealESRGAN_x2plus.pth"),
    ]
    for parts in layout:
        p = models.joinpath(*parts)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("w")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0")
    offline_guard.prepare_codeformer_weights(str(models))  # must not raise


def test_prepare_codeformer_raises_offline_when_missing(tmp_path, monkeypatch):
    models = tmp_path / "models"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0")
    with pytest.raises(RuntimeError):
        offline_guard.prepare_codeformer_weights(str(models))
