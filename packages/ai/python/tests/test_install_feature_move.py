"""Crash-atomicity tests for move_tree, which writes into the SHARED venv.

The invariant under test: a crash (or ENOSPC) partway through move_tree must
never leave a destination entry missing. Because the venv is shared by every AI
tool, a half-replaced package is what tears the venv and breaks unrelated tools.
"""

import errno
import importlib.util
import os

import pytest


def load_installer():
    script_path = os.path.join(os.path.dirname(__file__), "..", "install_feature.py")
    spec = importlib.util.spec_from_file_location("install_feature_move_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_file_over_file_is_replaced_without_a_delete_window(monkeypatch, tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (dst / "pkg.py").write_text("OLD")
    (src / "pkg.py").write_text("NEW")

    removed = []
    real_remove = os.remove
    monkeypatch.setattr(installer.os, "remove", lambda p: removed.append(p) or real_remove(p))

    installer.move_tree(str(src), str(dst))

    assert (dst / "pkg.py").read_text() == "NEW"
    # The old file was atomically replaced, never deleted-then-rewritten.
    assert str(dst / "pkg.py") not in removed


def test_crash_mid_move_leaves_every_dest_old_or_new_never_missing(monkeypatch, tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    for name in ("a.py", "b.py", "c.py"):
        (dst / name).write_text(f"OLD_{name}")
        (src / name).write_text(f"NEW_{name}")

    real_replace = os.replace
    state = {"n": 0}

    def flaky_replace(s, d):
        state["n"] += 1
        if state["n"] == 2:
            raise OSError("simulated crash mid-move")
        return real_replace(s, d)

    monkeypatch.setattr(installer.os, "replace", flaky_replace)

    with pytest.raises(OSError):
        installer.move_tree(str(src), str(dst))

    # Regardless of listdir order, every destination file must still exist and
    # hold either its old or its new content -- never a torn/missing entry.
    for name in ("a.py", "b.py", "c.py"):
        assert (dst / name).exists()
        assert (dst / name).read_text() in (f"OLD_{name}", f"NEW_{name}")


def test_merges_directories_and_overwrites_files(tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    (src / "pkg").mkdir(parents=True)
    (dst / "pkg").mkdir(parents=True)
    (dst / "pkg" / "keep.py").write_text("KEEP")
    (src / "pkg" / "keep.py").write_text("UPDATED")
    (src / "pkg" / "new.py").write_text("NEW")

    installer.move_tree(str(src), str(dst))

    assert (dst / "pkg" / "keep.py").read_text() == "UPDATED"
    assert (dst / "pkg" / "new.py").read_text() == "NEW"


def test_type_mismatch_dir_replaces_file(tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (dst / "x").write_text("i-am-a-file")
    (src / "x").mkdir()
    (src / "x" / "inner.py").write_text("dir-content")

    installer.move_tree(str(src), str(dst))

    assert (dst / "x").is_dir()
    assert (dst / "x" / "inner.py").read_text() == "dir-content"


def test_exdev_file_copies_via_temp_then_atomic_replace(monkeypatch, tmp_path):
    installer = load_installer()
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (dst / "f.py").write_text("OLD")
    (src / "f.py").write_text("NEW")

    real_replace = os.replace
    seen = {"exdev": False, "part": False}

    def exdev_for_direct_move(s, d):
        if s == str(src / "f.py"):
            seen["exdev"] = True
            raise OSError(errno.EXDEV, "cross-device link")
        if s.endswith(".part"):
            seen["part"] = True
        return real_replace(s, d)

    monkeypatch.setattr(installer.os, "replace", exdev_for_direct_move)

    installer.move_tree(str(src), str(dst))

    assert (dst / "f.py").read_text() == "NEW"
    assert seen["exdev"] and seen["part"]
    # No leftover temp file.
    assert not (dst / "f.py.part").exists()
