"""Liveness reporting for the long silent install stages.

The install watchdog (INSTALL_STALL_MS, default 20 min) only counts JSON
progress frames on stderr as liveness. Verify (86%), extract (88%) and the
site-packages/models moves (92/95%) used to emit a single frame and then go
silent through multi-GB work, so a legitimate install on a slow disk got
killed as "stalled" (issue #505's second report). These tests pin the
callback hooks that let the install loop emit frames from inside the real
work, so a frame always means actual bytes moved, never a timer.
"""

import hashlib
import importlib.util
import io
import json
import os
import sys
import tarfile

import pytest


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location(
        "install_feature_liveness_under_test", script_path
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


# -- file_sha256 --


def test_file_sha256_reports_cumulative_bytes(tmp_path):
    installer = load_installer()
    payload = b"x" * 100_000
    blob = tmp_path / "blob.bin"
    blob.write_bytes(payload)

    seen = []
    digest = installer.file_sha256(str(blob), progress_cb=seen.append)

    assert digest == hashlib.sha256(payload).hexdigest()
    assert seen, "expected at least one progress callback"
    assert seen == sorted(seen), "reported byte counts must be monotonic"
    assert seen[-1] == len(payload)


def test_file_sha256_without_callback_is_unchanged(tmp_path):
    installer = load_installer()
    blob = tmp_path / "blob.bin"
    blob.write_bytes(b"abc")

    assert installer.file_sha256(str(blob)) == hashlib.sha256(b"abc").hexdigest()


# -- safe_extract --


def build_archive(tmp_path, file_count=5, file_size=10_000):
    src = tmp_path / "content"
    src.mkdir()
    for i in range(file_count):
        (src / f"f{i}.bin").write_bytes(os.urandom(file_size))
    tar_path = tmp_path / "bundle.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tf:
        for i in range(file_count):
            tf.add(src / f"f{i}.bin", arcname=f"pkg/f{i}.bin")
    return tar_path


def test_safe_extract_reports_read_activity(tmp_path):
    installer = load_installer()
    tar_path = build_archive(tmp_path)
    staging = tmp_path / "staging"

    seen = []
    installer.safe_extract(str(tar_path), str(staging), progress_cb=seen.append)

    assert seen, "expected read-activity callbacks during extraction"
    assert seen == sorted(seen), "cumulative bytes read must be monotonic"
    # All files extracted intact
    extracted = sorted(os.listdir(staging / "pkg"))
    assert extracted == [f"f{i}.bin" for i in range(5)]


def test_safe_extract_without_callback_is_unchanged(tmp_path):
    installer = load_installer()
    tar_path = build_archive(tmp_path, file_count=2)
    staging = tmp_path / "staging"

    installer.safe_extract(str(tar_path), str(staging))

    assert sorted(os.listdir(staging / "pkg")) == ["f0.bin", "f1.bin"]


def test_safe_extract_still_blocks_unsafe_entries_with_callback(tmp_path):
    installer = load_installer()
    tar_path = tmp_path / "evil.tar.gz"
    data = b"gotcha"
    with tarfile.open(tar_path, "w:gz") as tf:
        info = tarfile.TarInfo(name="../escape.bin")
        info.size = len(data)
        tf.addfile(info, io.BytesIO(data))

    with pytest.raises(RuntimeError, match="unsafe tar path"):
        installer.safe_extract(str(tar_path), str(tmp_path / "staging"), progress_cb=lambda n: None)


# -- move_tree --


def test_move_tree_reports_each_moved_file(tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    (src / "pkg" / "sub").mkdir(parents=True)
    dst.mkdir()
    (src / "top.py").write_text("a")
    (src / "pkg" / "mod.py").write_text("b")
    (src / "pkg" / "sub" / "deep.py").write_text("c")

    ticks = []
    installer.move_tree(str(src), str(dst), progress_cb=lambda: ticks.append(1))

    assert (dst / "top.py").exists()
    assert (dst / "pkg" / "mod.py").exists()
    assert (dst / "pkg" / "sub" / "deep.py").exists()
    # One tick per entry moved: whole-directory renames may count as a single
    # move, but at least every top-level entry must tick.
    assert len(ticks) >= 2


def test_move_tree_reports_files_when_merging_into_existing_dirs(tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    (src / "pkg").mkdir(parents=True)
    (dst / "pkg").mkdir(parents=True)
    (src / "pkg" / "new.py").write_text("n")
    (dst / "pkg" / "old.py").write_text("o")

    ticks = []
    installer.move_tree(str(src), str(dst), progress_cb=lambda: ticks.append(1))

    assert (dst / "pkg" / "new.py").exists()
    assert (dst / "pkg" / "old.py").exists()
    assert len(ticks) == 1


# -- emit_progress broken-pipe guard --


class _BrokenStderr:
    def __init__(self):
        self.write_attempts = 0

    def write(self, _data):
        self.write_attempts += 1
        raise BrokenPipeError(32, "Broken pipe")

    def flush(self):
        raise BrokenPipeError(32, "Broken pipe")


def test_emit_progress_swallows_broken_pipe_and_disables_itself(monkeypatch):
    # Progress frames are advisory liveness. If the parent died and the pipe
    # is broken, a frame raising BrokenPipeError (an OSError) into move_tree
    # or file_sha256 would be misdiagnosed as a storage failure and could
    # abort a working shared-venv merge. The emitter must swallow the error
    # and stop trying instead.
    installer = load_installer()
    broken = _BrokenStderr()
    monkeypatch.setattr(sys, "stderr", broken)

    installer.emit_progress(50, "stage one")
    installer.emit_progress(51, "stage two")

    assert broken.write_attempts == 1, "emission must be disabled after the first failure"


# -- throttled activity reporter --


def test_counting_reader_stays_monotonic_across_seeks(tmp_path):
    # tarfile re-reads the gzip stream after the guard scan (seek back to 0).
    # The reader must count cumulative bytes READ, never file position, or the
    # "GB processed" text runs backwards and throttling misbehaves.
    installer = load_installer()
    blob = tmp_path / "blob.bin"
    blob.write_bytes(b"0123456789")

    seen = []
    with open(blob, "rb") as raw:
        reader = installer._CountingReader(raw, seen.append)
        reader.read(4)
        reader.seek(0)
        reader.read(4)

    assert seen == [4, 8]


def test_move_tree_reports_byte_activity_during_cross_fs_copies(tmp_path, monkeypatch):
    # A single multi-GB model copied across filesystems (EXDEV) used to emit
    # nothing until the whole file finished, which can exceed the 20-minute
    # stall watchdog on slow disks. Chunked copies must report byte deltas.
    installer = load_installer()
    monkeypatch.setattr(installer, "COPY_CHUNK_BYTES", 4)

    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (src / "model.onnx").write_bytes(b"m" * 10)

    real_replace = os.replace

    def exdev_replace(a, b):
        # Force the cross-filesystem path for the src->dst move, but let the
        # temp-sibling promotion inside the copy path succeed.
        if a.startswith(str(src)):
            raise OSError(18, "Invalid cross-device link")
        return real_replace(a, b)

    monkeypatch.setattr(installer.os, "replace", exdev_replace)

    deltas = []
    installer.move_tree(
        str(src), str(dst), progress_cb=lambda: None, copy_activity_cb=deltas.append
    )

    assert (dst / "model.onnx").read_bytes() == b"m" * 10
    assert len(deltas) >= 2, "chunked copy must report more than once per file"
    assert sum(deltas) == 10


def test_install_flow_wires_liveness_reporters():
    # Wiring guard: the primitives are useless if the install flow stops
    # passing them. Delete any of these call-site arguments and the #505
    # stall-kill quietly returns while every primitive test stays green.
    base = os.path.join(os.path.dirname(__file__), "..")
    with open(os.path.join(base, "install_feature.py")) as f:
        source = f.read()

    assert 'make_activity_reporter(86, "Verifying integrity...")' in source
    assert 'make_activity_reporter(88, "Extracting packages and models...")' in source
    assert 'make_move_reporter(92, "Installing packages...")' in source
    # Model bundles are a handful of huge files, so the models move must
    # report every entry, not every 500th.
    assert 'make_move_reporter(95, "Installing models...", every=1)' in source


def test_move_reporter_emits_every_nth_entry(capsys):
    installer = load_installer()

    cb = installer.make_move_reporter(92, "Installing packages...", every=3)
    for _ in range(7):
        cb()

    lines = [line for line in capsys.readouterr().err.splitlines() if line.strip()]
    frames = [json.loads(line) for line in lines]
    # Entries 3 and 6 emit; 7 total calls -> 2 frames.
    assert len(frames) == 2
    assert all(f["progress"] == 92 for f in frames)
    assert "3 entries" in frames[0]["stage"]
    assert "6 entries" in frames[1]["stage"]


def test_activity_reporter_throttles_and_emits_json_frames(capsys):
    installer = load_installer()

    cb = installer.make_activity_reporter(88, "Extracting packages and models...")
    one_gb = 1024**3
    cb(10)  # first activity emits immediately
    cb(20)  # below the delta threshold: suppressed
    cb(one_gb)  # past the threshold: emits

    lines = [line for line in capsys.readouterr().err.splitlines() if line.strip()]
    frames = [json.loads(line) for line in lines]
    assert len(frames) == 2
    assert all(f["progress"] == 88 for f in frames)
    assert all(f["stage"].startswith("Extracting packages and models...") for f in frames)
    assert "1.0 GB" in frames[1]["stage"]
