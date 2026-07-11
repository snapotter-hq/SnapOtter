"""Robustness tests for download_with_resume: the urllib fallback downloader.

These simulate the network/disk failure modes users hit (flaky connections,
Range-ignoring proxies, truncated bodies, disk full, dead URLs) with no real
network, and assert the downloader either self-recovers or fails fast with a
clear, actionable error instead of corrupting the archive or hanging.
"""

import builtins
import errno
import importlib.util
import os
import urllib.error

import pytest


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_resume_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeResp:
    """Minimal stand-in for the urlopen response context manager."""

    def __init__(self, data: bytes, status: int = 200):
        self._data = data
        self._pos = 0
        self.status = status

    def read(self, n: int) -> bytes:
        chunk = self._data[self._pos : self._pos + n]
        self._pos += len(chunk)
        return chunk

    def getcode(self) -> int:
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """Never actually sleep during backoff; record calls instead."""
    installer = load_installer()
    calls = []
    monkeypatch.setattr(installer.time, "sleep", lambda s: calls.append(s))
    return calls


def _patch_urlopen(monkeypatch, installer, handler):
    """handler(req, call_index) -> FakeResp or raises."""
    state = {"n": 0}

    def fake_urlopen(req, timeout=None):
        idx = state["n"]
        state["n"] += 1
        return handler(req, idx)

    monkeypatch.setattr(installer.urllib.request, "urlopen", fake_urlopen)
    return state


def test_fresh_download_succeeds(monkeypatch, tmp_path):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    data = b"x" * 4096
    _patch_urlopen(monkeypatch, installer, lambda req, i: FakeResp(data, 200))

    dest = tmp_path / "bundle.tar.gz"
    installer.download_with_resume("https://h/f", str(dest), len(data), 2, 85)

    assert dest.read_bytes() == data
    assert not (tmp_path / "bundle.tar.gz.partial").exists()
    assert not (tmp_path / "bundle.tar.gz.meta").exists()


def test_range_ignored_200_restarts_instead_of_corrupting(monkeypatch, tmp_path, no_sleep):
    """A resumable partial exists, but the server ignores Range and returns 200
    with the full body. The downloader must restart (truncate) rather than
    append the full body onto the partial and corrupt the archive."""
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    data = b"GOOD" * 1024

    dest = tmp_path / "bundle.tar.gz"
    partial = tmp_path / "bundle.tar.gz.partial"
    meta = tmp_path / "bundle.tar.gz.meta"
    # A stale partial that would corrupt the file if appended to.
    partial.write_bytes(b"STALEPARTIAL")
    meta.write_text('{"bytesDownloaded": 12}')

    # Server ignores the Range header and always sends the full body as 200.
    _patch_urlopen(monkeypatch, installer, lambda req, i: FakeResp(data, 200))

    installer.download_with_resume("https://h/f", str(dest), len(data), 2, 85)

    # Exactly the good bytes, not STALEPARTIAL + data.
    assert dest.read_bytes() == data
    assert no_sleep == []  # no retry needed; it restarted cleanly in one pass


def test_proper_206_resume_appends(monkeypatch, tmp_path):
    """When the server honors Range with 206, the partial is kept and only the
    remaining bytes are appended."""
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    full = b"HEADER" + b"TAILDATA" * 512
    head_len = 6

    dest = tmp_path / "bundle.tar.gz"
    partial = tmp_path / "bundle.tar.gz.partial"
    meta = tmp_path / "bundle.tar.gz.meta"
    partial.write_bytes(full[:head_len])
    meta.write_text(f'{{"bytesDownloaded": {head_len}}}')

    def handler(req, i):
        assert req.get_header("Range") == f"bytes={head_len}-"
        return FakeResp(full[head_len:], 206)

    _patch_urlopen(monkeypatch, installer, handler)
    installer.download_with_resume("https://h/f", str(dest), len(full), 2, 85)
    assert dest.read_bytes() == full


def test_disk_full_fails_fast_without_retry(monkeypatch, tmp_path, no_sleep):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    data = b"y" * 4096
    dest = tmp_path / "bundle.tar.gz"
    partial_path = str(dest) + ".partial"

    real_open = builtins.open

    def fake_open(path, mode="r", *a, **k):
        if str(path) == partial_path and ("w" in mode or "a" in mode):
            real = real_open(path, mode, *a, **k)

            class NoSpace:
                def __enter__(self):
                    return self

                def __exit__(self, *_):
                    real.close()
                    return False

                def write(self, _data):
                    raise OSError(errno.ENOSPC, "No space left on device")

            return NoSpace()
        return real_open(path, mode, *a, **k)

    monkeypatch.setattr(builtins, "open", fake_open)
    _patch_urlopen(monkeypatch, installer, lambda req, i: FakeResp(data, 200))

    with pytest.raises(RuntimeError, match="disk space"):
        installer.download_with_resume("https://h/f", str(dest), len(data), 2, 85)

    assert no_sleep == []  # disk-full is not retried
    assert not os.path.exists(partial_path)


def test_http_404_fails_fast_without_retry(monkeypatch, tmp_path, no_sleep):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    dest = tmp_path / "bundle.tar.gz"

    def handler(req, i):
        raise urllib.error.HTTPError("https://h/f", 404, "Not Found", {}, None)

    _patch_urlopen(monkeypatch, installer, handler)

    with pytest.raises(RuntimeError, match="HTTP 404"):
        installer.download_with_resume("https://h/f", str(dest), 4096, 2, 85)

    assert no_sleep == []  # a 404 won't fix on retry


def test_429_is_retried(monkeypatch, tmp_path, no_sleep):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    data = b"z" * 2048
    dest = tmp_path / "bundle.tar.gz"

    def handler(req, i):
        if i == 0:
            raise urllib.error.HTTPError("https://h/f", 429, "Too Many Requests", {}, None)
        return FakeResp(data, 200)

    _patch_urlopen(monkeypatch, installer, handler)
    installer.download_with_resume("https://h/f", str(dest), len(data), 2, 85)

    assert dest.read_bytes() == data
    assert len(no_sleep) == 1  # backed off once, then succeeded


def test_truncated_body_is_retried_then_succeeds(monkeypatch, tmp_path, no_sleep):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    full = b"c" * 4096
    dest = tmp_path / "bundle.tar.gz"

    def handler(req, i):
        if i == 0:
            return FakeResp(full[:-100], 200)  # truncated / error page
        return FakeResp(full, 200)

    _patch_urlopen(monkeypatch, installer, handler)
    installer.download_with_resume("https://h/f", str(dest), len(full), 2, 85)

    assert dest.read_bytes() == full
    assert len(no_sleep) == 1


def test_connection_error_retried_then_raises_after_max(monkeypatch, tmp_path, no_sleep):
    installer = load_installer()
    monkeypatch.setattr(installer, "emit_progress", lambda p, s: None)
    dest = tmp_path / "bundle.tar.gz"

    def handler(req, i):
        raise urllib.error.URLError("connection reset by peer")

    _patch_urlopen(monkeypatch, installer, handler)

    with pytest.raises(RuntimeError, match="after 5 attempts"):
        installer.download_with_resume("https://h/f", str(dest), 4096, 2, 85)

    assert len(no_sleep) == 4  # 5 attempts => 4 backoffs
    assert not os.path.exists(str(dest) + ".partial")
    assert not os.path.exists(str(dest) + ".meta")
