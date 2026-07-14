"""Fault-injection tests for the v3 immutable runtime installer."""

from __future__ import annotations

import datetime as dt
import base64
import errno
import fcntl
import hashlib
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from packages.ai.python import install_runtime


TARGET = "linux-amd64-cpu-py312"
FAMILY = "ocr"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class RuntimeFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.ai_data_dir = root / "ai"
        self.archive = root / "runtime.tar.gz"
        self.files = {
            "venv/bin/python": (b"#!/bin/sh\n", 0o755),
            "ocr_runner.py": (b"# immutable OCR entrypoint\n", 0o644),
            "ocr_runtime.py": (b"# immutable OCR adapter\n", 0o644),
            "models/pp-ocrv6-small.onnx": (b"small model bytes", 0o644),
            "models/pp-ocrv6-medium.onnx": (b"medium model bytes", 0o644),
            "smoke.py": (
                b"import os, pathlib, sys\n"
                b"assert os.environ['SNAPOTTER_NETWORK_DISABLED'] == '1'\n"
                b"assert os.environ['SNAPOTTER_ALLOW_MODEL_DOWNLOAD'] == '0'\n"
                b"assert os.environ['HF_HUB_OFFLINE'] == '1'\n"
                b"assert os.environ['TRANSFORMERS_OFFLINE'] == '1'\n"
                b"assert os.environ['PIP_NO_INDEX'] == '1'\n"
                b"assert os.environ['PYTHONDONTWRITEBYTECODE'] == '1'\n"
                b"assert 'PYTHONPATH' not in os.environ\n"
                b"assert 'PYTHONHOME' not in os.environ\n"
                b"runtime = pathlib.Path(os.environ['SNAPOTTER_RUNTIME_ROOT'])\n"
                b"assert runtime.resolve() == pathlib.Path.cwd().resolve()\n"
                b"log = os.environ.get('SNAPOTTER_SMOKE_LOG')\n"
                b"if log:\n"
                b"    with open(log, 'a', encoding='utf-8') as handle:\n"
                b"        handle.write(str(runtime) + '\\n')\n"
                b"if os.environ.get('FAIL_FINAL') == '1' and 'staging' not in str(runtime):\n"
                b"    sys.exit(23)\n"
                b"if os.environ.get('FLOOD_SMOKE') == '1':\n"
                b"    os.write(2, b'x' * (2 * 1024 * 1024))\n"
                b"if os.environ.get('FAIL_SMOKE_WITH_DETAIL') == '1':\n"
                b"    sys.stderr.write('representative smoke diagnostic')\n"
                b"    sys.exit(24)\n",
                0o644,
            ),
        }
        self._write_archive()

    def _write_archive(self, additions=(), *, mode: str = "w:gz") -> None:
        with tarfile.open(self.archive, mode) as archive:
            for name, (data, mode) in self.files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = mode
                archive.addfile(info, io.BytesIO(data))
            for info, data in additions:
                archive.addfile(info, None if data is None else io.BytesIO(data))

    def artifact(self) -> dict:
        archive_bytes = self.archive.read_bytes()
        return {
            "family": FAMILY,
            "target": TARGET,
            "generation": "1.0.0-abc123",
            "version": "1.0.0",
            "platform": "linux",
            "arch": "amd64",
            "archive": {
                "sha256": _sha256(archive_bytes),
                "size": len(archive_bytes),
                "expandedSize": sum(len(data) for data, _mode in self.files.values()),
            },
            "files": [
                {
                    "path": name,
                    "sha256": _sha256(data),
                    "size": len(data),
                    "mode": mode,
                }
                for name, (data, mode) in sorted(self.files.items())
            ],
            "runtime": {
                "pythonPath": "venv/bin/python",
                "entrypoint": "ocr_runner.py",
                "adapterPath": "ocr_runtime.py",
            },
            "models": {
                "pp-ocrv6-small": _sha256(self.files["models/pp-ocrv6-small.onnx"][0]),
                "pp-ocrv6-medium": _sha256(
                    self.files["models/pp-ocrv6-medium.onnx"][0]
                ),
            },
            "compatibility": {
                "protocolVersion": 1,
                "snapotterVersion": "2.1.0",
            },
            "capabilities": {
                "qualities": ["balanced", "best"],
                "providers": ["CPUExecutionProvider"],
            },
            "resources": {"minimumMemoryBytes": 4 * 1024 * 1024 * 1024},
        }

    def smoke_command(self) -> list[str]:
        return [sys.executable, "{runtime}/smoke.py"]

    def authenticated_index(self, artifact: dict | None = None) -> bytes:
        value = {
            "schemaVersion": 1,
            "artifacts": [artifact or self.artifact()],
            "signature": {
                "keyId": "test-key",
                "algorithm": "ed25519",
                "value": "authenticated-by-test-caller",
            },
        }
        return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )


class InstallRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix="snapotter-install-runtime-"
        )
        self.root = Path(self.temporary_directory.name)
        self.fixture = RuntimeFixture(self.root)
        self.host = install_runtime.HostInfo(platform="linux", machine="x86_64")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _active_path(self) -> Path:
        return self.fixture.ai_data_dir / "v3" / "active" / "ocr.json"

    def _activation_path(self) -> Path:
        return self.fixture.ai_data_dir / "v3" / "rollback" / "ocr.json"

    def _generation_lock_path(self, generation: str = "1.0.0-abc123") -> Path:
        return (
            self.fixture.ai_data_dir
            / "v3"
            / "locks"
            / "generations"
            / FAMILY
            / f"{generation}.lock"
        )

    def _assert_shared_generation_probe_is_blocked(self, lock_path: Path) -> None:
        descriptor = os.open(
            lock_path,
            os.O_RDONLY
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            with self.assertRaises(BlockingIOError):
                fcntl.flock(descriptor, fcntl.LOCK_SH | fcntl.LOCK_NB)
        finally:
            os.close(descriptor)

    def _commit(self, generation: str = "1.0.0-abc123") -> bool:
        return install_runtime.commit_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=generation,
        )

    def _write_previous_active(self) -> bytes:
        artifact = self.fixture.artifact()
        artifact["generation"] = "0.9.0-previous"
        install_runtime.install_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            artifact=artifact,
            authenticated_index=self.fixture.authenticated_index(artifact),
            archive_path=self.fixture.archive,
            smoke_command=self.fixture.smoke_command(),
            host=self.host,
        )
        self._commit("0.9.0-previous")
        return self._active_path().read_bytes()

    def _install(self, **kwargs):
        artifact = self.fixture.artifact()
        return install_runtime.install_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            artifact=artifact,
            authenticated_index=self.fixture.authenticated_index(artifact),
            archive_path=self.fixture.archive,
            smoke_command=self.fixture.smoke_command(),
            host=self.host,
            **kwargs,
        )

    @staticmethod
    def _write_gc_descriptor(path: Path, family: str, generation: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(
            install_runtime._canonical_json(
                {
                    "schemaVersion": install_runtime.DESCRIPTOR_SCHEMA_VERSION,
                    "family": family,
                    "generation": generation,
                    "artifact": {
                        "signedIndex": {
                            "path": f"indexes/{'a' * 64}.json",
                        }
                    },
                }
            )
        )

    def _install_with_post_verification_action(self, action):
        verified = threading.Event()
        proceed = threading.Event()
        outcome: dict[str, object] = {}
        original_verify = install_runtime._verify_archive

        def pause_after_verification(*args, **kwargs):
            result = original_verify(*args, **kwargs)
            verified.set()
            if not proceed.wait(timeout=5):
                raise RuntimeError(
                    "test timed out waiting to resume archive installation"
                )
            return result

        def run_install() -> None:
            try:
                outcome["result"] = self._install()
            except BaseException as error:
                outcome["error"] = error

        with mock.patch.object(
            install_runtime, "_verify_archive", side_effect=pause_after_verification
        ):
            worker = threading.Thread(target=run_install, daemon=True)
            worker.start()
            try:
                self.assertTrue(
                    verified.wait(timeout=5),
                    "installer did not reach the post-verification barrier",
                )
                action()
            finally:
                proceed.set()
                worker.join(timeout=10)

        self.assertFalse(worker.is_alive(), "installer did not finish after barrier")
        error = outcome.get("error")
        if isinstance(error, BaseException):
            raise error
        return outcome["result"]

    def test_success_runs_one_final_smoke_then_atomically_activates(self) -> None:
        smoke_log = self.root / "smoke.log"

        with mock.patch.dict(
            os.environ,
            {"PYTHONPATH": "/ambient/python", "PYTHONHOME": "/ambient/home"},
        ):
            result = self._install(smoke_env={"SNAPOTTER_SMOKE_LOG": str(smoke_log)})

        generation_root = (
            self.fixture.ai_data_dir
            / "v3"
            / "runtimes"
            / FAMILY
            / TARGET
            / "1.0.0-abc123"
        )
        self.assertEqual(result.generation_root, generation_root.resolve())
        self.assertEqual(len(smoke_log.read_text(encoding="utf-8").splitlines()), 1)
        descriptor = json.loads(self._active_path().read_text(encoding="utf-8"))
        self.assertEqual(descriptor["family"], FAMILY)
        self.assertEqual(descriptor["generation"], "1.0.0-abc123")
        self.assertEqual(descriptor["artifact"]["target"], TARGET)
        self.assertEqual(
            descriptor["artifact"]["models"], self.fixture.artifact()["models"]
        )
        self.assertEqual(
            descriptor["artifact"]["modelFiles"]["pp-ocrv6-small"],
            {
                "path": f"runtimes/{FAMILY}/{TARGET}/1.0.0-abc123/models/pp-ocrv6-small.onnx",
                "sha256": self.fixture.artifact()["models"]["pp-ocrv6-small"],
                "size": len(self.fixture.files["models/pp-ocrv6-small.onnx"][0]),
            },
        )
        self.assertEqual(
            descriptor["runtime"]["pythonPath"],
            f"runtimes/{FAMILY}/{TARGET}/1.0.0-abc123/venv/bin/python",
        )
        self.assertEqual(
            descriptor["runtime"]["integrityFiles"]["adapter"],
            {
                "path": f"runtimes/{FAMILY}/{TARGET}/1.0.0-abc123/ocr_runtime.py",
                "sha256": _sha256(self.fixture.files["ocr_runtime.py"][0]),
                "size": len(self.fixture.files["ocr_runtime.py"][0]),
            },
        )
        self.assertFalse(any((self.fixture.ai_data_dir / "v3" / "staging").iterdir()))

    def test_first_install_stays_pending_until_commit_and_reconcile_is_idempotent(
        self,
    ) -> None:
        result = self._install()
        marker = json.loads(self._activation_path().read_bytes())
        self.assertEqual(marker["status"], "pending")

        restored = install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )

        self.assertEqual(restored, {FAMILY: None})
        self.assertFalse(self._active_path().exists())
        self.assertFalse(self._activation_path().exists())
        self.assertFalse(result.generation_root.exists())
        self.assertEqual(
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            ),
            {},
        )

    def test_reconcile_handles_crash_after_pending_marker_before_descriptor_swap(
        self,
    ) -> None:
        result = self._install()
        self._active_path().unlink()

        restored = install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )

        self.assertEqual(restored, {FAMILY: None})
        self.assertFalse(self._activation_path().exists())
        self.assertFalse(result.generation_root.exists())

        self.assertEqual(restored, {FAMILY: None})
        self.assertFalse(self._active_path().exists())
        self.assertFalse(result.generation_root.exists())
        self.assertEqual(
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            ),
            {},
        )

    def test_upgrade_pending_activation_reconciles_to_exact_committed_descriptor(
        self,
    ) -> None:
        previous = self._write_previous_active()
        upgraded = self._install()

        self.assertEqual(
            json.loads(self._activation_path().read_bytes())["status"], "pending"
        )
        self.assertEqual(
            json.loads(self._active_path().read_bytes())["generation"],
            upgraded.generation,
        )

        restored = install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )

        self.assertEqual(restored, {FAMILY: "0.9.0-previous"})
        self.assertEqual(self._active_path().read_bytes(), previous)
        self.assertFalse(upgraded.generation_root.exists())
        marker = json.loads(self._activation_path().read_bytes())
        self.assertEqual(marker["status"], "committed")
        self.assertEqual(marker["activatedGeneration"], "0.9.0-previous")
        self.assertEqual(marker["activatedDescriptorSha256"], _sha256(previous))
        self.assertIsNone(marker["previousDescriptorB64"])

    def test_commit_is_idempotent_and_startup_reconciliation_preserves_it(self) -> None:
        result = self._install()

        self.assertTrue(self._commit(result.generation))
        committed = self._activation_path().read_bytes()
        self.assertEqual(json.loads(committed)["status"], "committed")
        self.assertFalse(self._commit(result.generation))
        self.assertEqual(self._activation_path().read_bytes(), committed)

        self.assertEqual(
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            ),
            {},
        )
        self.assertTrue(self._active_path().exists())
        self.assertTrue(result.generation_root.exists())

    def test_commit_does_not_turn_unrelated_gc_failure_into_an_ambiguous_result(
        self,
    ) -> None:
        result = self._install()

        with mock.patch.object(
            install_runtime,
            "recover_and_gc",
            side_effect=install_runtime.InstallError("unrelated GC failure"),
        ):
            self.assertTrue(self._commit(result.generation))

        self.assertEqual(
            json.loads(self._activation_path().read_bytes())["status"], "committed"
        )

    def test_commit_and_reconcile_fail_closed_on_corrupt_or_symlinked_state(self) -> None:
        result = self._install()
        active_before = self._active_path().read_bytes()
        marker_before = self._activation_path().read_bytes()

        self._activation_path().write_bytes(b"not-json\n")
        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            self._commit(result.generation)
        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            )
        self.assertEqual(self._active_path().read_bytes(), active_before)

        outside = self.root / "outside-activation.json"
        outside.write_bytes(marker_before)
        self._activation_path().unlink()
        self._activation_path().symlink_to(outside)
        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            self._commit(result.generation)
        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            )
        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(outside.read_bytes(), marker_before)

    def test_activation_state_rejects_non_descriptor_previous_bytes(self) -> None:
        result = self._install()
        marker = json.loads(self._activation_path().read_bytes())
        marker["previousDescriptorB64"] = "bm90LWEtZGVzY3JpcHRvcg=="
        marker["previousGeneration"] = None
        marker["previousIndexPath"] = None
        self._activation_path().write_bytes(install_runtime._canonical_json(marker))

        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            self._commit(result.generation)
        with self.assertRaisesRegex(install_runtime.InstallError, "activation state"):
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            )

    def test_commit_and_reconcile_reject_same_generation_descriptor_replacement(
        self,
    ) -> None:
        result = self._install()
        marker_before = self._activation_path().read_bytes()
        replacement = json.loads(self._active_path().read_bytes())
        replacement["activatedAt"] = "2026-07-13T23:59:59.000Z"
        self._active_path().write_bytes(install_runtime._canonical_json(replacement))
        active_before = self._active_path().read_bytes()

        with self.assertRaisesRegex(install_runtime.InstallError, "active runtime changed"):
            self._commit(result.generation)
        with self.assertRaisesRegex(install_runtime.InstallError, "active runtime changed"):
            install_runtime.reconcile_pending_activations(
                ai_data_dir=self.fixture.ai_data_dir
            )

        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(self._activation_path().read_bytes(), marker_before)

    def test_mutable_state_is_shared_gid_writable_for_arbitrary_container_uids(
        self,
    ) -> None:
        self._install()

        v3_root = self.fixture.ai_data_dir / "v3"
        shared_directories = (
            v3_root,
            v3_root / "locks",
            v3_root / "locks" / "generations",
            v3_root / "locks" / "generations" / FAMILY,
            v3_root / "staging",
            v3_root / "runtimes",
            v3_root / "runtimes" / FAMILY,
            v3_root / "runtimes" / FAMILY / TARGET,
            v3_root / "active",
        )
        for path in shared_directories:
            with self.subTest(path=path):
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o2770)

        self.assertEqual(
            stat.S_IMODE((v3_root / "locks" / "mutation.lock").stat().st_mode),
            0o660,
        )
        self.assertEqual(
            stat.S_IMODE(self._generation_lock_path().stat().st_mode),
            0o660,
        )
        self.assertEqual(stat.S_IMODE(self._active_path().stat().st_mode), 0o660)

        generation_root = v3_root / "runtimes" / FAMILY / TARGET / "1.0.0-abc123"
        self.assertEqual(stat.S_IMODE(generation_root.stat().st_mode), 0o755)

    def test_target_preflight_fails_before_creating_v3_state(self) -> None:
        artifact = self.fixture.artifact()
        artifact["target"] = "linux-arm64-cpu-py311"
        artifact["arch"] = "arm64"

        with self.assertRaisesRegex(install_runtime.PreflightError, "target"):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

    def test_memory_preflight_is_signed_and_runs_before_creating_v3_state(self) -> None:
        artifact = self.fixture.artifact()
        del artifact["resources"]
        with self.assertRaisesRegex(install_runtime.PreflightError, "memory"):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
                effective_memory_bytes=8 * 1024 * 1024 * 1024,
            )
        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

        artifact = self.fixture.artifact()
        with self.assertRaisesRegex(
            install_runtime.PreflightError,
            r"4294967296 bytes required, 3221225472 available",
        ):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
                effective_memory_bytes=3 * 1024 * 1024 * 1024,
            )
        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

    def test_effective_memory_resolves_private_and_host_cgroup_namespaces(self) -> None:
        gib = 1024 * 1024 * 1024

        def read_from(files):
            def read_text(path, *args, **kwargs):
                value = files.get(str(path))
                if value is None:
                    raise FileNotFoundError(path)
                return value

            return read_text

        private_files = {
            "/proc/self/cgroup": "0::/\n",
            "/proc/self/mountinfo": (
                "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime "
                "- cgroup2 cgroup rw\n"
            ),
            "/sys/fs/cgroup/memory.max": str(6 * gib),
        }
        with mock.patch.object(os, "sysconf", side_effect=[8 * gib, 1]), mock.patch.object(
            Path, "read_text", new=read_from(private_files)
        ):
            self.assertEqual(install_runtime._effective_memory_bytes(), 6 * gib)

        host_files = {
            "/proc/self/cgroup": "0::/system.slice/docker-deadbeef.scope\n",
            "/proc/self/mountinfo": (
                "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime "
                "- cgroup2 cgroup rw\n"
            ),
            "/sys/fs/cgroup/system.slice/docker-deadbeef.scope/memory.max": str(
                6 * gib
            ),
            "/sys/fs/cgroup/system.slice/memory.max": str(5 * gib),
            "/sys/fs/cgroup/memory.max": "max\n",
        }
        with mock.patch.object(os, "sysconf", side_effect=[8 * gib, 1]), mock.patch.object(
            Path, "read_text", new=read_from(host_files)
        ):
            self.assertEqual(install_runtime._effective_memory_bytes(), 5 * gib)

    def test_effective_memory_fails_closed_for_unreadable_identified_controller(
        self,
    ) -> None:
        gib = 1024 * 1024 * 1024
        files = {
            "/proc/self/cgroup": "0::/docker/deadbeef\n",
            "/proc/self/mountinfo": (
                "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime "
                "- cgroup2 cgroup rw\n"
            ),
        }

        def read_text(path, *args, **kwargs):
            value = files.get(str(path))
            if value is None:
                raise PermissionError(path)
            return value

        with mock.patch.object(os, "sysconf", side_effect=[8 * gib, 1]), mock.patch.object(
            Path, "read_text", new=read_text
        ):
            with self.assertRaisesRegex(install_runtime.PreflightError, "cgroup memory"):
                install_runtime._effective_memory_bytes()

    def test_effective_memory_fails_closed_when_mount_metadata_is_unreadable(
        self,
    ) -> None:
        gib = 1024 * 1024 * 1024

        def read_text(path, *args, **kwargs):
            if str(path) == "/proc/self/cgroup":
                return "0::/docker/deadbeef\n"
            raise PermissionError(path)

        with mock.patch.object(os, "sysconf", side_effect=[8 * gib, 1]), mock.patch.object(
            Path, "read_text", new=read_text
        ):
            with self.assertRaisesRegex(install_runtime.PreflightError, "cgroup memory"):
                install_runtime._effective_memory_bytes()

    def test_effective_memory_fails_closed_when_linux_membership_is_unavailable(
        self,
    ) -> None:
        gib = 1024 * 1024 * 1024
        for membership in (PermissionError("denied"), "malformed-membership\n"):
            def read_text(path, *args, **kwargs):
                if isinstance(membership, BaseException):
                    raise membership
                return membership

            with self.subTest(membership=repr(membership)), mock.patch.object(
                sys, "platform", "linux"
            ), mock.patch.object(os, "sysconf", side_effect=[8 * gib, 1]), mock.patch.object(
                Path, "read_text", new=read_text
            ):
                with self.assertRaisesRegex(
                    install_runtime.PreflightError, "cgroup memory"
                ):
                    install_runtime._effective_memory_bytes()

    def test_model_digests_must_bind_to_files_in_the_exact_manifest(self) -> None:
        artifact = self.fixture.artifact()
        artifact["models"]["pp-ocrv6-small"] = "f" * 64

        with self.assertRaisesRegex(install_runtime.PreflightError, "model digest"):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

    def test_symlinked_archive_and_v3_root_are_rejected(self) -> None:
        archive_link = self.root / "runtime-link.tar.gz"
        archive_link.symlink_to(self.fixture.archive)
        artifact = self.fixture.artifact()
        with self.assertRaisesRegex(install_runtime.PreflightError, "archive.*symlink"):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=archive_link,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

        external = self.root / "external-v3"
        external.mkdir()
        self.fixture.ai_data_dir.mkdir()
        (self.fixture.ai_data_dir / "v3").symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(install_runtime.InstallError, "v3 root.*symlink"):
            self._install()

    def test_archive_with_multiple_hard_links_is_rejected_before_state_creation(
        self,
    ) -> None:
        archive_alias = self.root / "runtime-hardlink.tar.gz"
        os.link(self.fixture.archive, archive_alias)
        artifact = self.fixture.artifact()

        with self.assertRaisesRegex(
            install_runtime.PreflightError, "exactly one hard link"
        ):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=archive_alias,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFOs are POSIX-only")
    def test_archive_fifo_is_rejected_without_waiting_for_a_writer(self) -> None:
        fifo = self.root / "runtime.fifo"
        os.mkfifo(fifo)
        artifact = self.fixture.artifact()
        outcome: dict[str, object] = {}

        def try_install() -> None:
            try:
                install_runtime.install_runtime(
                    ai_data_dir=self.fixture.ai_data_dir,
                    artifact=artifact,
                    authenticated_index=self.fixture.authenticated_index(artifact),
                    archive_path=fifo,
                    smoke_command=self.fixture.smoke_command(),
                    host=self.host,
                )
            except BaseException as error:
                outcome["error"] = error

        worker = threading.Thread(target=try_install, daemon=True)
        worker.start()
        worker.join(timeout=2)

        self.assertFalse(worker.is_alive(), "opening an archive FIFO blocked")
        self.assertIsInstance(outcome.get("error"), install_runtime.PreflightError)
        self.assertFalse((self.fixture.ai_data_dir / "v3").exists())

    def test_archive_path_replacement_after_verification_cannot_change_extraction(
        self,
    ) -> None:
        original_runner = self.fixture.files["ocr_runner.py"][0]
        replacement = self.root / "replacement.tar.gz"
        replacement_files = dict(self.fixture.files)
        replacement_files["ocr_runner.py"] = (
            b"!" + original_runner[1:],
            self.fixture.files["ocr_runner.py"][1],
        )
        with tarfile.open(replacement, "w:gz") as archive:
            for name, (data, mode) in replacement_files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = mode
                archive.addfile(info, io.BytesIO(data))

        verified_archive = self.root / "verified-runtime.tar.gz"

        def replace_archive_path() -> None:
            self.fixture.archive.rename(verified_archive)
            replacement.rename(self.fixture.archive)

        result = self._install_with_post_verification_action(replace_archive_path)

        self.assertEqual(
            (result.generation_root / "ocr_runner.py").read_bytes(), original_runner
        )

    def test_in_place_archive_mutation_after_verification_is_rejected_and_cleaned(
        self,
    ) -> None:
        self.fixture.archive = self.root / "runtime.tar"
        self.fixture._write_archive(mode="w")
        with tarfile.open(self.fixture.archive, "r:") as archive:
            runner_offset = archive.getmember("ocr_runner.py").offset_data
        original_runner = self.fixture.files["ocr_runner.py"][0]
        tampered_runner = b"!" + original_runner[1:]
        previous = self._write_previous_active()

        def mutate_open_archive() -> None:
            fd = os.open(self.fixture.archive, os.O_WRONLY)
            try:
                self.assertEqual(
                    os.pwrite(fd, tampered_runner, runner_offset),
                    len(tampered_runner),
                )
                os.fsync(fd)
            finally:
                os.close(fd)

        with self.assertRaisesRegex(
            install_runtime.IntegrityError, "archive changed while being installed"
        ):
            self._install_with_post_verification_action(mutate_open_archive)

        self.assertEqual(self._active_path().read_bytes(), previous)
        staging = self.fixture.ai_data_dir / "v3" / "staging"
        self.assertFalse(staging.exists() and any(staging.iterdir()))

    def test_archive_descriptor_is_closed_when_verification_fails(self) -> None:
        artifact = self.fixture.artifact()
        artifact["archive"]["sha256"] = "0" * 64
        real_open = os.open
        archive_fds: list[int] = []

        def tracking_open(path, flags, mode=0o777, *, dir_fd=None):
            if dir_fd is None:
                fd = real_open(path, flags, mode)
            else:
                fd = real_open(path, flags, mode, dir_fd=dir_fd)
            if Path(path) == self.fixture.archive:
                archive_fds.append(fd)
            return fd

        with mock.patch.object(install_runtime.os, "open", side_effect=tracking_open):
            with self.assertRaisesRegex(install_runtime.IntegrityError, "digest"):
                install_runtime.install_runtime(
                    ai_data_dir=self.fixture.ai_data_dir,
                    artifact=artifact,
                    authenticated_index=self.fixture.authenticated_index(artifact),
                    archive_path=self.fixture.archive,
                    smoke_command=self.fixture.smoke_command(),
                    host=self.host,
                )

        self.assertEqual(len(archive_fds), 1)
        with self.assertRaises(OSError):
            os.fstat(archive_fds[0])

    def test_archive_descriptors_are_closed_when_tar_parsing_fails(self) -> None:
        self.fixture.archive.write_bytes(b"this is not a tar archive")
        artifact = self.fixture.artifact()
        real_open = os.open
        real_dup = os.dup
        archive_fds: list[int] = []

        def tracking_open(path, flags, mode=0o777, *, dir_fd=None):
            if dir_fd is None:
                fd = real_open(path, flags, mode)
            else:
                fd = real_open(path, flags, mode, dir_fd=dir_fd)
            if Path(path) == self.fixture.archive:
                archive_fds.append(fd)
            return fd

        def tracking_dup(fd):
            duplicate = real_dup(fd)
            if archive_fds and fd == archive_fds[0]:
                archive_fds.append(duplicate)
            return duplicate

        with (
            mock.patch.object(install_runtime.os, "open", side_effect=tracking_open),
            mock.patch.object(install_runtime.os, "dup", side_effect=tracking_dup),
        ):
            with self.assertRaises(install_runtime.UnsafeArchiveError):
                install_runtime.install_runtime(
                    ai_data_dir=self.fixture.ai_data_dir,
                    artifact=artifact,
                    authenticated_index=self.fixture.authenticated_index(artifact),
                    archive_path=self.fixture.archive,
                    smoke_command=self.fixture.smoke_command(),
                    host=self.host,
                )

        self.assertEqual(len(archive_fds), 2)
        for fd in archive_fds:
            with self.subTest(fd=fd), self.assertRaises(OSError):
                os.fstat(fd)

    def test_disk_preflight_happens_before_staging(self) -> None:
        usage = shutil.disk_usage(self.root)
        tiny_usage = usage._replace(free=0)

        with mock.patch.object(
            install_runtime.shutil, "disk_usage", return_value=tiny_usage
        ):
            with self.assertRaisesRegex(install_runtime.PreflightError, "disk space"):
                self._install()

        staging = self.fixture.ai_data_dir / "v3" / "staging"
        self.assertFalse(staging.exists() and any(staging.iterdir()))

    def test_existing_verified_generation_reactivates_with_descriptor_only_space(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        self._active_path().unlink()
        usage = shutil.disk_usage(self.root)
        descriptor_only = usage._replace(free=install_runtime.DESCRIPTOR_RESERVE_BYTES)

        with mock.patch.object(
            install_runtime.shutil, "disk_usage", return_value=descriptor_only
        ):
            result = self._install()

        self.assertTrue(result.activated)
        self.assertTrue(self._active_path().is_file())

    def test_retry_repairs_a_corrupted_preserved_authenticated_index(self) -> None:
        self._install()
        expected = self.fixture.authenticated_index()
        descriptor = json.loads(self._active_path().read_bytes())
        index_path = (
            self.fixture.ai_data_dir
            / "v3"
            / descriptor["artifact"]["signedIndex"]["path"]
        )
        index_path.write_bytes(b"x" * len(expected))

        result = self._install()

        self.assertFalse(result.activated)
        self.assertEqual(index_path.read_bytes(), expected)

    def test_old_unreferenced_generation_is_collected_before_space_preflight(
        self,
    ) -> None:
        orphan = (
            self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET / "0.9.0-old"
        )
        orphan.mkdir(parents=True)
        (orphan / "large.bin").write_bytes(b"old")
        usage = shutil.disk_usage(self.root)

        def disk_usage_after_gc(_path):
            self.assertFalse(orphan.exists())
            return usage

        with mock.patch.object(
            install_runtime.shutil, "disk_usage", side_effect=disk_usage_after_gc
        ):
            self._install()

    def test_archive_digest_size_and_exact_file_manifest_are_enforced(self) -> None:
        cases = []
        wrong_digest = self.fixture.artifact()
        wrong_digest["archive"]["sha256"] = "0" * 64
        cases.append(("archive digest", wrong_digest))
        wrong_size = self.fixture.artifact()
        wrong_size["archive"]["size"] += 1
        cases.append(("archive size", wrong_size))
        wrong_file_digest = self.fixture.artifact()
        wrong_file_digest["files"][0]["sha256"] = "0" * 64
        cases.append(("file digest", wrong_file_digest))
        wrong_file_mode = self.fixture.artifact()
        wrong_file_mode["files"][0]["mode"] = 0o600
        cases.append(("file mode", wrong_file_mode))
        missing_file = self.fixture.artifact()
        missing_file["files"] = missing_file["files"][:-1]
        cases.append(("extra file", missing_file))

        for label, artifact in cases:
            with self.subTest(label=label):
                previous = self._write_previous_active()
                with self.assertRaises(install_runtime.InstallError):
                    install_runtime.install_runtime(
                        ai_data_dir=self.fixture.ai_data_dir,
                        artifact=artifact,
                        authenticated_index=self.fixture.authenticated_index(artifact),
                        archive_path=self.fixture.archive,
                        smoke_command=self.fixture.smoke_command(),
                        host=self.host,
                    )
                self.assertEqual(self._active_path().read_bytes(), previous)

    def test_unsafe_tar_entries_are_rejected_without_changing_active(self) -> None:
        unsafe_entries = []
        for name in ("/absolute", "../escape", "a/../../escape"):
            info = tarfile.TarInfo(name)
            info.size = 1
            info.mode = 0o644
            unsafe_entries.append((name, info, b"x"))

        link = tarfile.TarInfo("unsafe-link")
        link.type = tarfile.SYMTYPE
        link.linkname = "ocr_runner.py"
        unsafe_entries.append(("symlink", link, None))
        hardlink = tarfile.TarInfo("unsafe-hardlink")
        hardlink.type = tarfile.LNKTYPE
        hardlink.linkname = "ocr_runner.py"
        unsafe_entries.append(("hardlink", hardlink, None))
        device = tarfile.TarInfo("unsafe-device")
        device.type = tarfile.CHRTYPE
        unsafe_entries.append(("device", device, None))
        setuid = tarfile.TarInfo("unsafe-setuid")
        setuid.size = 1
        setuid.mode = 0o4755
        unsafe_entries.append(("setuid", setuid, b"x"))

        previous = self._write_previous_active()
        for label, info, data in unsafe_entries:
            with self.subTest(label=label):
                self.fixture._write_archive([(info, data)])
                artifact = self.fixture.artifact()
                # Keep the normal file manifest but acknowledge the new archive bytes.
                artifact["archive"]["size"] = self.fixture.archive.stat().st_size
                artifact["archive"]["sha256"] = _sha256(
                    self.fixture.archive.read_bytes()
                )
                artifact["archive"]["expandedSize"] += info.size
                with self.assertRaises(install_runtime.UnsafeArchiveError):
                    install_runtime.install_runtime(
                        ai_data_dir=self.fixture.ai_data_dir,
                        artifact=artifact,
                        authenticated_index=self.fixture.authenticated_index(artifact),
                        archive_path=self.fixture.archive,
                        smoke_command=self.fixture.smoke_command(),
                        host=self.host,
                    )
                self.assertEqual(self._active_path().read_bytes(), previous)

        duplicate = tarfile.TarInfo("ocr_runner.py")
        duplicate.size = 1
        duplicate.mode = 0o644
        self.fixture._write_archive([(duplicate, b"x")])
        artifact = self.fixture.artifact()
        artifact["archive"]["size"] = self.fixture.archive.stat().st_size
        artifact["archive"]["sha256"] = _sha256(self.fixture.archive.read_bytes())
        artifact["archive"]["expandedSize"] += 1
        with self.assertRaises(install_runtime.UnsafeArchiveError):
            install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

    def test_entry_and_expanded_byte_ceilings_are_enforced(self) -> None:
        previous = self._write_previous_active()
        with self.assertRaisesRegex(install_runtime.UnsafeArchiveError, "entries"):
            self._install(
                limits=install_runtime.ExtractionLimits(
                    max_entries=2, max_bytes=100_000
                )
            )
        self.assertEqual(self._active_path().read_bytes(), previous)

        with self.assertRaisesRegex(install_runtime.UnsafeArchiveError, "expanded"):
            self._install(
                limits=install_runtime.ExtractionLimits(max_entries=100, max_bytes=2)
            )
        self.assertEqual(self._active_path().read_bytes(), previous)

    def test_final_smoke_failure_keeps_active_and_retry_reuses_verified_generation(
        self,
    ) -> None:
        previous = self._write_previous_active()
        with self.assertRaisesRegex(install_runtime.SmokeError, "final"):
            self._install(smoke_env={"FAIL_FINAL": "1"})
        self.assertEqual(self._active_path().read_bytes(), previous)

        final_root = (
            self.fixture.ai_data_dir
            / "v3"
            / "runtimes"
            / FAMILY
            / TARGET
            / "1.0.0-abc123"
        )
        self.assertTrue(final_root.is_dir())

        result = self._install()
        self.assertEqual(result.generation_root, final_root.resolve())
        self.assertEqual(
            json.loads(self._active_path().read_bytes())["generation"], "1.0.0-abc123"
        )
        self._commit(result.generation)

        descriptor_bytes = self._active_path().read_bytes()
        second = self._install()
        self.assertEqual(second.generation_root, final_root.resolve())
        self.assertEqual(self._active_path().read_bytes(), descriptor_bytes)

        corrupted = json.loads(descriptor_bytes)
        corrupted["runtime"]["entrypoint"] = "runtimes/ocr/elsewhere.py"
        self._active_path().write_text(json.dumps(corrupted), encoding="utf-8")
        corrupted_bytes = self._active_path().read_bytes()
        corrupted_marker = self._activation_path().read_bytes()

        repaired = self._install()
        self.assertEqual(repaired.generation, "1.0.0-abc123")
        self.assertNotEqual(self._active_path().read_bytes(), corrupted_bytes)
        pending_marker = json.loads(self._activation_path().read_bytes())
        self.assertEqual(pending_marker["status"], "pending")
        self.assertEqual(
            (
                self.fixture.ai_data_dir
                / "v3"
                / pending_marker["invalidPreviousDescriptorFile"]["path"]
            ).read_bytes(),
            corrupted_bytes,
        )
        self.assertEqual(
            (
                self.fixture.ai_data_dir
                / "v3"
                / pending_marker["previousMarkerFile"]["path"]
            ).read_bytes(),
            corrupted_marker,
        )

        resolution = install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=repaired.generation,
        )
        self.assertFalse(resolution.committed)
        self.assertEqual(self._active_path().read_bytes(), corrupted_bytes)
        self.assertEqual(self._activation_path().read_bytes(), corrupted_marker)

        committed = self._install()
        self._commit(committed.generation)
        committed_marker = json.loads(self._activation_path().read_bytes())
        self.assertIsNone(committed_marker["invalidPreviousDescriptorB64"])
        self.assertIsNone(committed_marker["previousMarkerB64"])
        self.assertIsNone(committed_marker["invalidPreviousDescriptorFile"])
        self.assertIsNone(committed_marker["previousMarkerFile"])

    def test_retry_reextracts_a_corrupted_existing_generation(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        final_root = (
            self.fixture.ai_data_dir
            / "v3"
            / "runtimes"
            / FAMILY
            / TARGET
            / "1.0.0-abc123"
        )
        entrypoint = final_root / "ocr_runner.py"
        expected = self.fixture.files["ocr_runner.py"][0]
        entrypoint.write_bytes(b"x" * len(expected))

        self._install()

        self.assertEqual(entrypoint.read_bytes(), expected)

    def test_repair_restores_corrupt_descriptor_during_startup_reconciliation(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt = b'{"corrupt":"descriptor"}\n'
        previous_marker = self._activation_path().read_bytes()
        self._active_path().write_bytes(corrupt)

        repaired = self._install()
        restored = install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )

        self.assertEqual(restored, {FAMILY: None})
        self.assertEqual(self._active_path().read_bytes(), corrupt)
        self.assertEqual(self._activation_path().read_bytes(), previous_marker)
        self.assertTrue(repaired.generation_root.is_dir())

    def test_repair_quarantines_and_restores_an_invalid_activation_marker(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        previous_descriptor = self._active_path().read_bytes()
        corrupt_marker = b'{"corrupt":"marker"}\n'
        self._activation_path().write_bytes(corrupt_marker)

        repaired = self._install()
        pending = json.loads(self._activation_path().read_bytes())
        self.assertEqual(
            (
                self.fixture.ai_data_dir
                / "v3"
                / pending["previousMarkerFile"]["path"]
            ).read_bytes(),
            corrupt_marker,
        )
        resolution = install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=repaired.generation,
        )

        self.assertEqual(resolution.restored_generation, installed.generation)
        self.assertEqual(self._active_path().read_bytes(), previous_descriptor)
        self.assertEqual(self._activation_path().read_bytes(), corrupt_marker)

    def test_repair_recreates_pending_state_for_missing_or_mismatched_commit_marker(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        descriptor = self._active_path().read_bytes()
        committed_marker = self._activation_path().read_bytes()
        parsed_marker = json.loads(committed_marker)
        wrong_generation = {
            **parsed_marker,
            "activatedGeneration": "wrong-generation",
        }
        wrong_digest = {
            **parsed_marker,
            "activatedDescriptorSha256": "f" * 64,
        }

        for label, previous_marker in (
            ("missing", None),
            ("wrong-generation", install_runtime._canonical_json(wrong_generation)),
            ("wrong-digest", install_runtime._canonical_json(wrong_digest)),
        ):
            with self.subTest(label=label):
                self._active_path().write_bytes(descriptor)
                if previous_marker is None:
                    self._activation_path().unlink(missing_ok=True)
                else:
                    self._activation_path().write_bytes(previous_marker)

                repaired = self._install()
                self.assertTrue(repaired.activated)
                pending = json.loads(self._activation_path().read_bytes())
                self.assertEqual(pending["status"], "pending")
                self.assertTrue(pending["repairPreviousState"])

                install_runtime.rollback_runtime(
                    ai_data_dir=self.fixture.ai_data_dir,
                    family=FAMILY,
                    expected_generation=repaired.generation,
                )
                self.assertEqual(self._active_path().read_bytes(), descriptor)
                if previous_marker is None:
                    self.assertFalse(self._activation_path().exists())
                else:
                    self.assertEqual(
                        self._activation_path().read_bytes(), previous_marker
                    )

        self._active_path().write_bytes(descriptor)
        self._activation_path().write_bytes(committed_marker)

    def test_repair_quarantines_large_corrupt_state_without_growing_the_marker(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt_descriptor = b"{" + b"d" * (3 * 1024 * 1024)
        corrupt_marker = b"{" + b"m" * (3 * 1024 * 1024)
        self._active_path().write_bytes(corrupt_descriptor)
        self._activation_path().write_bytes(corrupt_marker)

        repaired = self._install()

        self.assertLess(
            self._activation_path().stat().st_size,
            install_runtime.ACTIVATION_STATE_MAX_BYTES,
        )
        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertEqual(state.invalid_previous_descriptor, corrupt_descriptor)
        self.assertEqual(state.previous_marker, corrupt_marker)
        self.assertEqual(len(state.quarantine_paths), 2)

        install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=repaired.generation,
        )
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertEqual(self._activation_path().read_bytes(), corrupt_marker)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_repair_quarantines_a_large_structurally_valid_descriptor(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        descriptor = json.loads(self._active_path().read_bytes())
        descriptor["ignoredPadding"] = "d" * (install_runtime.DESCRIPTOR_RESERVE_BYTES + 1)
        oversized_descriptor = install_runtime._canonical_json(descriptor)
        self.assertGreater(
            len(oversized_descriptor), install_runtime.DESCRIPTOR_RESERVE_BYTES
        )
        self._active_path().write_bytes(oversized_descriptor)

        repaired = self._install()

        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertTrue(state.repair_previous_state)
        self.assertEqual(state.invalid_previous_descriptor, oversized_descriptor)
        self.assertEqual(len(state.quarantine_paths), 2)
        self.assertLess(
            self._activation_path().stat().st_size,
            install_runtime.ACTIVATION_STATE_MAX_BYTES,
        )

        install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=repaired.generation,
        )
        self.assertEqual(self._active_path().read_bytes(), oversized_descriptor)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_repair_retains_referenced_quarantine_when_marker_restore_fails(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt_descriptor = b'{"corrupt":"descriptor"}\n'
        self._active_path().write_bytes(corrupt_descriptor)
        original_activate = install_runtime._activate_descriptor
        original_restore = install_runtime._restore_optional_state_file

        def fail_active(path, raw):
            if path.resolve(strict=False) == self._active_path().resolve(strict=False):
                raise OSError("simulated active descriptor failure")
            return original_activate(path, raw)

        def fail_marker_restore(path, raw):
            if path.resolve(strict=False) == self._activation_path().resolve(
                strict=False
            ):
                raise OSError("simulated marker restore failure")
            return original_restore(path, raw)

        with mock.patch.object(
            install_runtime, "_activate_descriptor", side_effect=fail_active
        ), mock.patch.object(
            install_runtime,
            "_restore_optional_state_file",
            side_effect=fail_marker_restore,
        ):
            with self.assertRaisesRegex(
                install_runtime.InstallError, "quarantine must be retained"
            ):
                self._install()

        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertTrue(all(path.is_file() for path in state.quarantine_paths))
        install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_late_active_restore_failure_retains_pending_repair_state(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt_descriptor = b'{"corrupt":"descriptor"}\n'
        self._active_path().write_bytes(corrupt_descriptor)
        active_path = self._active_path().resolve(strict=False)
        original_atomic_write = install_runtime._atomic_write
        active_write_count = 0

        def fail_after_active_replace(path, raw):
            nonlocal active_write_count
            if path.resolve(strict=False) != active_path:
                return original_atomic_write(path, raw)
            active_write_count += 1
            if active_write_count == 1:
                original_atomic_write(path, raw)
                raise OSError("simulated late descriptor fsync failure")
            raise OSError("simulated active descriptor restore failure")

        with mock.patch.object(
            install_runtime, "_atomic_write", side_effect=fail_after_active_replace
        ):
            with self.assertRaisesRegex(
                install_runtime.InstallError, "repair state was retained"
            ):
                self._install()

        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertEqual(state.status, "pending")
        self.assertTrue(state.repair_previous_state)
        self.assertEqual(state.invalid_previous_descriptor, corrupt_descriptor)
        self.assertTrue(all(path.is_file() for path in state.quarantine_paths))
        self.assertNotEqual(self._active_path().read_bytes(), corrupt_descriptor)

        install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_restore_fsync_failure_retains_pending_repair_state(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt_descriptor = b'{"corrupt":"descriptor"}\n'
        self._active_path().write_bytes(corrupt_descriptor)
        active_parent = self._active_path().resolve(strict=False).parent
        original_fsync_directory = install_runtime._fsync_directory
        active_fsync_count = 0

        def fail_active_directory_fsync(path):
            nonlocal active_fsync_count
            if path.resolve(strict=False) != active_parent:
                return original_fsync_directory(path)
            active_fsync_count += 1
            raise OSError("simulated active directory fsync failure")

        with mock.patch.object(
            install_runtime,
            "_fsync_directory",
            side_effect=fail_active_directory_fsync,
        ):
            with self.assertRaisesRegex(
                install_runtime.InstallError, "durability.*repair state was retained"
            ):
                self._install()

        self.assertEqual(active_fsync_count, 3)
        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertEqual(state.status, "pending")
        self.assertTrue(state.repair_previous_state)
        self.assertEqual(state.invalid_previous_descriptor, corrupt_descriptor)
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(path.is_file() for path in state.quarantine_paths))

        def fail_reconciliation_active_fsync(path):
            if path.resolve(strict=False) == active_parent:
                raise OSError("simulated reconciliation fsync failure")
            return original_fsync_directory(path)

        with mock.patch.object(
            install_runtime,
            "_fsync_directory",
            side_effect=fail_reconciliation_active_fsync,
        ):
            with self.assertRaisesRegex(
                install_runtime.InstallError, "durability.*repair state was retained"
            ):
                install_runtime.reconcile_pending_activations(
                    ai_data_dir=self.fixture.ai_data_dir
                )
        retained_state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertEqual(retained_state.status, "pending")
        self.assertTrue(
            all(path.is_file() for path in retained_state.quarantine_paths)
        )

        install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_pending_marker_fsync_failure_retains_referenced_quarantine(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        corrupt_descriptor = b'{"corrupt":"descriptor"}\n'
        self._active_path().write_bytes(corrupt_descriptor)
        rollback_parent = self._activation_path().resolve(strict=False).parent
        original_fsync_directory = install_runtime._fsync_directory

        def fail_rollback_directory_fsync(path):
            if path.resolve(strict=False) == rollback_parent:
                raise OSError("simulated pending marker fsync failure")
            return original_fsync_directory(path)

        with mock.patch.object(
            install_runtime,
            "_fsync_directory",
            side_effect=fail_rollback_directory_fsync,
        ):
            with self.assertRaisesRegex(
                install_runtime.InstallError, "activation marker.*repair state was retained"
            ):
                self._install()

        state = install_runtime._read_rollback_marker(
            self._activation_path(), FAMILY
        )
        self.assertEqual(state.status, "pending")
        self.assertTrue(state.repair_previous_state)
        self.assertEqual(state.invalid_previous_descriptor, corrupt_descriptor)
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(path.is_file() for path in state.quarantine_paths))

        install_runtime.reconcile_pending_activations(
            ai_data_dir=self.fixture.ai_data_dir
        )
        self.assertEqual(self._active_path().read_bytes(), corrupt_descriptor)
        self.assertTrue(all(not path.exists() for path in state.quarantine_paths))

    def test_gc_removes_unreferenced_quarantine_from_a_pre_marker_crash(self) -> None:
        v3_root = self.fixture.ai_data_dir / "v3"
        with install_runtime.mutation_lock(v3_root):
            _reference, orphan = install_runtime._quarantine_state_bytes(
                v3_root, FAMILY, "orphan", b"crash-window"
            )
            self.assertTrue(orphan.is_file())
            removed = install_runtime.recover_and_gc(v3_root, keep_unreferenced=0)

        self.assertIn(orphan, removed)
        self.assertFalse(orphan.exists())

    def test_repair_preflight_failure_keeps_the_active_descriptor_and_generation(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        entrypoint = installed.generation_root / "ocr_runner.py"
        corrupted = b"x" * entrypoint.stat().st_size
        entrypoint.write_bytes(corrupted)
        usage = shutil.disk_usage(self.root)._replace(free=0)

        with mock.patch.object(install_runtime.shutil, "disk_usage", return_value=usage):
            with self.assertRaisesRegex(install_runtime.PreflightError, "disk space"):
                self._install()

        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(entrypoint.read_bytes(), corrupted)

    def test_repair_smoke_failure_restores_the_prior_descriptor_and_bytes(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        entrypoint = installed.generation_root / "ocr_runner.py"
        corrupted = b"x" * entrypoint.stat().st_size
        entrypoint.write_bytes(corrupted)

        with self.assertRaisesRegex(install_runtime.SmokeError, "final"):
            self._install(smoke_env={"FAIL_FINAL": "1"})

        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(entrypoint.read_bytes(), corrupted)

    def test_repair_activation_failure_restores_the_prior_descriptor_and_bytes(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        entrypoint = installed.generation_root / "ocr_runner.py"
        corrupted = b"x" * entrypoint.stat().st_size
        entrypoint.write_bytes(corrupted)

        with mock.patch.object(
            install_runtime,
            "_activate_with_rollback",
            side_effect=install_runtime.InstallError("injected activation failure"),
        ):
            with self.assertRaisesRegex(install_runtime.InstallError, "injected"):
                self._install()

        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(entrypoint.read_bytes(), corrupted)

    def test_successful_upgrades_retain_exactly_one_rollback_generation(self) -> None:
        for generation in ("1.0.0-first", "1.0.0-second", "1.0.0-third"):
            artifact = self.fixture.artifact()
            artifact["generation"] = generation
            result = install_runtime.install_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                artifact=artifact,
                authenticated_index=self.fixture.authenticated_index(artifact),
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )
            self._commit(result.generation)

        target_root = self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET
        self.assertEqual(
            sorted(path.name for path in target_root.iterdir()),
            ["1.0.0-second", "1.0.0-third"],
        )
        self.assertEqual(
            json.loads(self._active_path().read_bytes())["generation"],
            "1.0.0-third",
        )
        indexes_root = self.fixture.ai_data_dir / "v3" / "indexes"
        self.assertEqual(len(list(indexes_root.iterdir())), 2)

    def test_rollback_restores_previous_descriptor_and_collects_failed_handoff(self) -> None:
        first = self.fixture.artifact()
        first["generation"] = "1.0.0-first"
        first_result = install_runtime.install_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            artifact=first,
            authenticated_index=self.fixture.authenticated_index(first),
            archive_path=self.fixture.archive,
            smoke_command=self.fixture.smoke_command(),
            host=self.host,
        )
        self._commit(first_result.generation)
        previous = self._active_path().read_bytes()

        second = self.fixture.artifact()
        second["generation"] = "1.0.0-second"
        install_runtime.install_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            artifact=second,
            authenticated_index=self.fixture.authenticated_index(second),
            archive_path=self.fixture.archive,
            smoke_command=self.fixture.smoke_command(),
            host=self.host,
        )

        resolution = install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation="1.0.0-second",
        )

        self.assertFalse(resolution.committed)
        self.assertIsNone(resolution.committed_generation)
        self.assertEqual(resolution.restored_generation, "1.0.0-first")
        self.assertEqual(self._active_path().read_bytes(), previous)
        target_root = self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET
        self.assertEqual(
            sorted(path.name for path in target_root.iterdir()),
            ["1.0.0-first"],
        )
        marker = json.loads(self._activation_path().read_bytes())
        self.assertEqual(marker["status"], "committed")
        self.assertEqual(marker["activatedGeneration"], "1.0.0-first")

    def test_rollback_resolves_an_exact_already_committed_generation_as_success(
        self,
    ) -> None:
        result = self._install()
        self._commit(result.generation)
        active = self._active_path().read_bytes()
        marker = self._activation_path().read_bytes()

        resolution = install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation=result.generation,
        )

        self.assertTrue(resolution.committed)
        self.assertEqual(resolution.committed_generation, result.generation)
        self.assertIsNone(resolution.restored_generation)
        self.assertEqual(self._active_path().read_bytes(), active)
        self.assertEqual(self._activation_path().read_bytes(), marker)

    def test_rollback_deactivates_a_failed_first_generation(self) -> None:
        self._install()

        resolution = install_runtime.rollback_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
            expected_generation="1.0.0-abc123",
        )

        self.assertFalse(resolution.committed)
        self.assertIsNone(resolution.committed_generation)
        self.assertIsNone(resolution.restored_generation)
        self.assertFalse(self._active_path().exists())
        self.assertFalse(
            (
                self.fixture.ai_data_dir
                / "v3"
                / "runtimes"
                / FAMILY
                / TARGET
                / "1.0.0-abc123"
            ).exists()
        )

    def test_deactivate_rejects_a_rollback_directory_symlink_before_mutation(self) -> None:
        self._install()
        active_before = self._active_path().read_bytes()
        rollback_root = self.fixture.ai_data_dir / "v3" / "rollback"
        outside = self.root / "outside-rollback"
        outside.mkdir()
        outside_marker = outside / f"{FAMILY}.json"
        outside_marker.write_text("outside", encoding="utf-8")
        shutil.rmtree(rollback_root)
        rollback_root.symlink_to(outside, target_is_directory=True)

        with self.assertRaisesRegex(install_runtime.InstallError, "rollback.*real directory"):
            install_runtime.deactivate_runtime(
                ai_data_dir=self.fixture.ai_data_dir,
                family=FAMILY,
            )

        self.assertEqual(self._active_path().read_bytes(), active_before)
        self.assertEqual(outside_marker.read_text(encoding="utf-8"), "outside")

    def test_gc_fails_closed_when_the_active_descriptor_is_corrupted(self) -> None:
        result = self._install()
        self._active_path().write_bytes(b"not-json\n")

        with self.assertRaisesRegex(install_runtime.InstallError, "active runtime descriptor"):
            with install_runtime.mutation_lock(self.fixture.ai_data_dir / "v3"):
                install_runtime.recover_and_gc(
                    self.fixture.ai_data_dir / "v3", keep_unreferenced=0
                )

        self.assertTrue(result.generation_root.is_dir())

    def test_retry_does_not_replace_a_corrupted_generation_with_a_live_lease(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        generation = "1.0.0-abc123"
        final_root = (
            self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET / generation
        )
        entrypoint = final_root / "ocr_runner.py"
        entrypoint.write_bytes(b"x" * entrypoint.stat().st_size)
        now = install_runtime._utc_now()
        lease = (
            self.fixture.ai_data_dir
            / "v3"
            / "leases"
            / FAMILY
            / generation
            / "live.json"
        )
        lease.parent.mkdir(parents=True)
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "family": FAMILY,
                    "generation": generation,
                    "pid": os.getpid(),
                    "processNonce": "process-nonce",
                    "requestNonce": "request-nonce",
                    "createdAt": now,
                    "heartbeatAt": now,
                }
            ),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(install_runtime.IntegrityError, "lease"):
            self._install()

        self.assertTrue(final_root.exists())
        self.assertEqual(entrypoint.read_bytes(), b"x" * entrypoint.stat().st_size)
        self.assertEqual(self._active_path().read_bytes(), active_before)

    def test_retry_does_not_exchange_a_corrupted_generation_while_shared_locked(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        entrypoint = installed.generation_root / "ocr_runner.py"
        corrupted = b"x" * entrypoint.stat().st_size
        entrypoint.write_bytes(corrupted)
        lock_path = self._generation_lock_path(installed.generation)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.touch(mode=0o660, exist_ok=True)
        descriptor = os.open(lock_path, os.O_RDONLY)
        fcntl.flock(descriptor, fcntl.LOCK_SH)
        try:
            with mock.patch.object(
                install_runtime,
                "_exchange_directories",
                wraps=install_runtime._exchange_directories,
            ) as exchange:
                with self.assertRaisesRegex(
                    install_runtime.IntegrityError,
                    "retry after active runtime requests finish",
                ):
                    self._install()
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

        exchange.assert_not_called()
        self.assertEqual(entrypoint.read_bytes(), corrupted)
        self.assertEqual(self._active_path().read_bytes(), active_before)

    def test_repair_holds_exclusive_lock_through_capacity_extract_and_activation(
        self,
    ) -> None:
        installed = self._install()
        self._commit(installed.generation)
        entrypoint = installed.generation_root / "ocr_runner.py"
        entrypoint.write_bytes(b"x" * entrypoint.stat().st_size)
        lock_path = self._generation_lock_path(installed.generation)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.touch(mode=0o660, exist_ok=True)
        events: list[str] = []
        original_check_disk_space = install_runtime._check_disk_space
        original_extract = install_runtime._safe_extract
        original_exchange = install_runtime._exchange_directories
        original_smoke = install_runtime._run_smoke
        original_activate = install_runtime._activate_with_rollback

        def check_disk_space(*args, **kwargs):
            self._assert_shared_generation_probe_is_blocked(lock_path)
            events.append("capacity")
            return original_check_disk_space(*args, **kwargs)

        def extract(*args, **kwargs):
            self._assert_shared_generation_probe_is_blocked(lock_path)
            events.append("extract")
            return original_extract(*args, **kwargs)

        def exchange(*args, **kwargs):
            self._assert_shared_generation_probe_is_blocked(lock_path)
            events.append("exchange")
            return original_exchange(*args, **kwargs)

        def smoke(*args, **kwargs):
            self._assert_shared_generation_probe_is_blocked(lock_path)
            events.append("smoke")
            return original_smoke(*args, **kwargs)

        def activate(*args, **kwargs):
            self._assert_shared_generation_probe_is_blocked(lock_path)
            events.append("activate")
            return original_activate(*args, **kwargs)

        with (
            mock.patch.object(
                install_runtime, "_check_disk_space", side_effect=check_disk_space
            ),
            mock.patch.object(install_runtime, "_safe_extract", side_effect=extract),
            mock.patch.object(
                install_runtime, "_exchange_directories", side_effect=exchange
            ),
            mock.patch.object(install_runtime, "_run_smoke", side_effect=smoke),
            mock.patch.object(
                install_runtime, "_activate_with_rollback", side_effect=activate
            ),
        ):
            self._install()

        self.assertEqual(
            events,
            ["capacity", "extract", "exchange", "smoke", "activate"],
        )

    def test_repair_holds_exclusive_lock_during_restorative_exchange(self) -> None:
        installed = self._install()
        self._commit(installed.generation)
        active_before = self._active_path().read_bytes()
        entrypoint = installed.generation_root / "ocr_runner.py"
        corrupted = b"x" * entrypoint.stat().st_size
        entrypoint.write_bytes(corrupted)
        lock_path = self._generation_lock_path(installed.generation)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.touch(mode=0o660, exist_ok=True)
        exchanges = 0
        original_exchange = install_runtime._exchange_directories

        def exchange(*args, **kwargs):
            nonlocal exchanges
            self._assert_shared_generation_probe_is_blocked(lock_path)
            exchanges += 1
            return original_exchange(*args, **kwargs)

        with mock.patch.object(
            install_runtime,
            "_exchange_directories",
            side_effect=exchange,
        ):
            with self.assertRaisesRegex(install_runtime.SmokeError, "final"):
                self._install(smoke_env={"FAIL_FINAL": "1"})

        self.assertEqual(exchanges, 2)
        self.assertEqual(entrypoint.read_bytes(), corrupted)
        self.assertEqual(self._active_path().read_bytes(), active_before)

    def test_smoke_output_is_bounded_and_small_failure_details_are_retained(
        self,
    ) -> None:
        with self.assertRaisesRegex(install_runtime.SmokeError, "output exceeded"):
            self._install(smoke_env={"FLOOD_SMOKE": "1"})

        with self.assertRaisesRegex(
            install_runtime.SmokeError,
            "representative smoke diagnostic",
        ):
            self._install(smoke_env={"FAIL_SMOKE_WITH_DETAIL": "1"})

    def test_recovery_cleans_staging_but_gc_preserves_active_and_leased_generations(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        (v3 / "staging" / "abandoned").mkdir(parents=True)
        target_root = v3 / "runtimes" / FAMILY / TARGET
        for generation in ("active", "leased", "orphan"):
            (target_root / generation).mkdir(parents=True)
        active_path = v3 / "active" / "ocr.json"
        self._write_gc_descriptor(active_path, FAMILY, "active")
        lease = v3 / "leases" / FAMILY / "leased" / "123-nonce.json"
        lease.parent.mkdir(parents=True)
        now = install_runtime._utc_now()
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "family": FAMILY,
                    "generation": "leased",
                    "pid": os.getpid(),
                    "processNonce": "process-nonce",
                    "requestNonce": "request-nonce",
                    "createdAt": now,
                    "heartbeatAt": now,
                }
            )
        )

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse((v3 / "staging" / "abandoned").exists())
        self.assertTrue((target_root / "active").exists())
        self.assertTrue((target_root / "leased").exists())
        self.assertFalse((target_root / "orphan").exists())
        self.assertIn(target_root / "orphan", removed)

    def test_gc_removes_a_stale_lease_even_when_its_pid_was_reused(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "stale-pid-reuse"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "live-pid-stale-heartbeat.json"
        lease.parent.mkdir(parents=True)
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "family": FAMILY,
                    "generation": generation,
                    "pid": os.getpid(),
                    "processNonce": "old-process-nonce",
                    "requestNonce": "old-request-nonce",
                    "createdAt": "2000-01-01T00:00:00.000Z",
                    "heartbeatAt": "2000-01-01T00:00:00.000Z",
                }
            ),
            encoding="utf-8",
        )

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse(generation_root.exists())
        self.assertFalse(lease.exists())
        self.assertIn(generation_root, removed)

    def test_gc_removes_a_stale_kernel_lock_backed_schema_two_lease(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "stale-schema-two"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "schema-two.json"
        lease.parent.mkdir(parents=True)
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "family": FAMILY,
                    "generation": generation,
                    "pid": os.getpid(),
                    "processNonce": "old-process-nonce",
                    "requestNonce": "old-request-nonce",
                    "createdAt": "2000-01-01T00:00:00.000Z",
                    "heartbeatAt": "2000-01-01T00:00:00.000Z",
                }
            ),
            encoding="utf-8",
        )

        with install_runtime.mutation_lock(v3):
            removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse(generation_root.exists())
        self.assertFalse(lease.exists())
        self.assertIn(generation_root, removed)

    def test_gc_preserves_a_stale_lease_with_an_unknown_schema(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "unknown-lease-schema"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "unknown-schema.json"
        lease.parent.mkdir(parents=True)
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 3,
                    "family": FAMILY,
                    "generation": generation,
                    "pid": os.getpid(),
                    "processNonce": "old-process-nonce",
                    "requestNonce": "old-request-nonce",
                    "createdAt": "2000-01-01T00:00:00.000Z",
                    "heartbeatAt": "2000-01-01T00:00:00.000Z",
                }
            ),
            encoding="utf-8",
        )

        with install_runtime.mutation_lock(v3):
            removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease.exists())
        self.assertNotIn(generation_root, removed)

    def test_gc_preserves_a_heartbeat_atomically_replaced_during_stale_cleanup(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "heartbeat-replaced-during-gc"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "request.json"
        lease.parent.mkdir(parents=True)
        stale = {
            "schemaVersion": 1,
            "family": FAMILY,
            "generation": generation,
            "pid": os.getpid(),
            "processNonce": "process-nonce",
            "requestNonce": "request-nonce",
            "createdAt": "2000-01-01T00:00:00.000Z",
            "heartbeatAt": "2000-01-01T00:00:00.000Z",
        }
        lease.write_text(json.dumps(stale), encoding="utf-8")

        def publish_fresh_heartbeat(_lease: object, **_kwargs: object) -> bool:
            fresh = dict(stale)
            fresh["requestNonce"] = "fresh-request-nonce"
            fresh["createdAt"] = install_runtime._utc_now()
            fresh["heartbeatAt"] = fresh["createdAt"]
            replacement = lease.with_suffix(".replacement")
            replacement.write_text(json.dumps(fresh), encoding="utf-8")
            os.replace(replacement, lease)
            return True

        with mock.patch.object(
            install_runtime,
            "_lease_is_stale",
            side_effect=publish_fresh_heartbeat,
        ):
            removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease.exists())
        self.assertEqual(json.loads(lease.read_bytes())["requestNonce"], "fresh-request-nonce")
        self.assertNotIn(generation_root, removed)

    def test_gc_preserves_a_fresh_lease_when_its_pid_is_not_visible(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "fresh-cross-namespace-lease"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "hidden-pid-fresh-heartbeat.json"
        lease.parent.mkdir(parents=True)
        now = install_runtime._utc_now()
        lease.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "family": FAMILY,
                    "generation": generation,
                    # A live process in another PID namespace may not be visible
                    # to the installer even though its heartbeat is current.
                    "pid": 2_147_483_647,
                    "processNonce": "cross-namespace-process-nonce",
                    "requestNonce": "cross-namespace-request-nonce",
                    "createdAt": now,
                    "heartbeatAt": now,
                }
            ),
            encoding="utf-8",
        )

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease.exists())
        self.assertNotIn(generation_root, removed)

    def test_gc_conservatively_preserves_an_ambiguous_malformed_lease(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "ambiguous-lease"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease = v3 / "leases" / FAMILY / generation / "malformed.json"
        lease.parent.mkdir(parents=True)
        lease.write_text("[]", encoding="utf-8")

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease.exists())
        self.assertNotIn(generation_root, removed)

    def test_gc_removes_a_stale_atomic_lease_temporary_file(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "stale-atomic-lease-temp"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease_temp = (
            v3
            / "leases"
            / FAMILY
            / generation
            / (
                "123-11111111-1111-4111-8111-111111111111-"
                "22222222-2222-4222-8222-222222222222.json."
                "33333333-3333-4333-8333-333333333333.tmp"
            )
        )
        lease_temp.parent.mkdir(parents=True)
        lease_temp.write_text("partially-written lease", encoding="utf-8")
        stale_timestamp = dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc).timestamp()
        os.utime(lease_temp, (stale_timestamp, stale_timestamp))

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse(generation_root.exists())
        self.assertFalse(lease_temp.exists())
        self.assertIn(generation_root, removed)

    def test_gc_preserves_a_recent_atomic_lease_temporary_file(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "recent-atomic-lease-temp"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease_temp = (
            v3
            / "leases"
            / FAMILY
            / generation
            / (
                "123-11111111-1111-4111-8111-111111111111-"
                "22222222-2222-4222-8222-222222222222.json."
                "33333333-3333-4333-8333-333333333333.tmp"
            )
        )
        lease_temp.parent.mkdir(parents=True)
        lease_temp.write_text("partially-written lease", encoding="utf-8")

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease_temp.exists())
        self.assertNotIn(generation_root, removed)

    def test_gc_preserves_an_unrecognized_stale_temporary_lease_file(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "unknown-temp-name"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lease_temp = (
            v3 / "leases" / FAMILY / generation / "malformed.json.not-a-uuid.tmp"
        )
        lease_temp.parent.mkdir(parents=True)
        lease_temp.write_text("partially-written lease", encoding="utf-8")
        stale_timestamp = dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc).timestamp()
        os.utime(lease_temp, (stale_timestamp, stale_timestamp))

        removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertTrue(lease_temp.exists())
        self.assertNotIn(generation_root, removed)

    def test_gc_preserves_a_shared_locked_orphan_until_its_reader_releases(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "shared-reader"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)
        lock_path.parent.mkdir(parents=True)
        lock_path.touch(mode=0o660)
        descriptor = os.open(lock_path, os.O_RDONLY)
        fcntl.flock(descriptor, fcntl.LOCK_SH)
        try:
            with install_runtime.mutation_lock(v3):
                removed = install_runtime.recover_and_gc(
                    v3, keep_unreferenced=0
                )

            self.assertTrue(generation_root.exists())
            self.assertNotIn(generation_root, removed)
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

        with install_runtime.mutation_lock(v3):
            removed = install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse(generation_root.exists())
        self.assertIn(generation_root, removed)
        self.assertTrue(lock_path.is_file())

    def test_gc_busy_generations_do_not_consume_unreferenced_retention(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        target_root = v3 / "runtimes" / FAMILY / TARGET
        busy_root = target_root / "newer-busy"
        eligible_root = target_root / "older-eligible"
        busy_root.mkdir(parents=True)
        eligible_root.mkdir()
        os.utime(eligible_root, (1, 1))
        os.utime(busy_root, (2, 2))
        lock_path = self._generation_lock_path("newer-busy")
        lock_path.parent.mkdir(parents=True)
        lock_path.touch(mode=0o660)
        descriptor = os.open(lock_path, os.O_RDONLY)
        fcntl.flock(descriptor, fcntl.LOCK_SH)
        try:
            with install_runtime.mutation_lock(v3):
                removed = install_runtime.recover_and_gc(
                    v3, keep_unreferenced=1
                )
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

        self.assertTrue(busy_root.exists())
        self.assertTrue(eligible_root.exists())
        self.assertNotIn(busy_root, removed)
        self.assertNotIn(eligible_root, removed)

    def test_gc_holds_the_exclusive_generation_lock_during_actual_removal(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "remove-under-lock"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)
        original_remove = install_runtime._remove_without_following
        checked = False

        def inspect_removal(path: Path) -> None:
            nonlocal checked
            if path == generation_root:
                self._assert_shared_generation_probe_is_blocked(lock_path)
                checked = True
            original_remove(path)

        with install_runtime.mutation_lock(v3):
            with mock.patch.object(
                install_runtime,
                "_remove_without_following",
                side_effect=inspect_removal,
            ):
                install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(checked)
        self.assertFalse(generation_root.exists())

    def test_gc_rechecks_for_a_live_lease_after_reacquiring_for_deletion(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "lease-before-delete"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)

        with install_runtime.mutation_lock(v3):
            with mock.patch.object(
                install_runtime,
                "_has_live_lease",
                side_effect=(False, True),
            ) as has_live_lease:
                removed = install_runtime.recover_and_gc(
                    v3, keep_unreferenced=0
                )

        self.assertEqual(has_live_lease.call_count, 2)
        self.assertTrue(generation_root.exists())
        self.assertNotIn(generation_root, removed)

    def test_generation_lock_inode_is_permanent_and_has_shared_state_modes(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "permanent-inode"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)

        with install_runtime.mutation_lock(v3):
            install_runtime.recover_and_gc(v3, keep_unreferenced=1)

        original = lock_path.stat()
        for directory in (
            v3 / "locks",
            v3 / "locks" / "generations",
            v3 / "locks" / "generations" / FAMILY,
        ):
            with self.subTest(directory=directory):
                self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o2770)
        self.assertEqual(stat.S_IMODE(original.st_mode), 0o660)
        self.assertEqual(original.st_nlink, 1)

        with install_runtime.mutation_lock(v3):
            install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertFalse(generation_root.exists())
        self.assertEqual(lock_path.stat().st_ino, original.st_ino)
        generation_root.mkdir()
        with install_runtime.mutation_lock(v3):
            install_runtime.recover_and_gc(v3, keep_unreferenced=1)
        self.assertEqual(lock_path.stat().st_ino, original.st_ino)

    def test_gc_fails_closed_on_a_symlinked_generation_lock(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "symlink-lock"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)
        lock_path.parent.mkdir(parents=True)
        sentinel = self.root / "generation-lock-sentinel"
        sentinel.write_text("sentinel", encoding="utf-8")
        lock_path.symlink_to(sentinel)

        with self.assertRaisesRegex(install_runtime.InstallError, "generation lock"):
            with install_runtime.mutation_lock(v3):
                install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "sentinel")

    def test_gc_fails_closed_on_a_hardlinked_generation_lock(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "hardlink-lock"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)
        lock_path.parent.mkdir(parents=True)
        sentinel = self.root / "hardlinked-generation-lock"
        sentinel.write_text("sentinel", encoding="utf-8")
        os.link(sentinel, lock_path)

        with self.assertRaisesRegex(install_runtime.InstallError, "generation lock"):
            with install_runtime.mutation_lock(v3):
                install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "sentinel")
        self.assertEqual(sentinel.stat().st_nlink, 2)

    def test_gc_fails_closed_when_the_generation_lock_inode_changes_during_flock(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation = "raced-lock-inode"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / generation
        generation_root.mkdir(parents=True)
        lock_path = self._generation_lock_path(generation)
        lock_path.parent.mkdir(parents=True)
        lock_path.touch(mode=0o660)
        original_inode = lock_path.stat().st_ino
        original_flock = fcntl.flock
        raced = False

        def replace_during_flock(descriptor: int, operation: int) -> None:
            nonlocal raced
            if operation == fcntl.LOCK_EX | fcntl.LOCK_NB and not raced:
                lock_path.unlink()
                lock_path.write_bytes(b"replacement")
                raced = True
            original_flock(descriptor, operation)

        with install_runtime.mutation_lock(v3):
            with mock.patch.object(
                install_runtime.fcntl,
                "flock",
                side_effect=replace_during_flock,
            ):
                with self.assertRaisesRegex(
                    install_runtime.InstallError, "generation lock"
                ):
                    install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(raced)
        self.assertTrue(generation_root.exists())
        self.assertNotEqual(lock_path.stat().st_ino, original_inode)

    def test_gc_fails_closed_when_generation_flock_is_unsupported(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / "no-flock"
        generation_root.mkdir(parents=True)

        with install_runtime.mutation_lock(v3):
            with mock.patch.object(
                install_runtime.fcntl,
                "flock",
                side_effect=OSError(errno.ENOLCK, "locks unavailable"),
            ):
                with self.assertRaisesRegex(
                    install_runtime.InstallError, "generation lock"
                ):
                    install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())

    def test_gc_fails_closed_without_a_real_nofollow_open_flag(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        generation_root = v3 / "runtimes" / FAMILY / TARGET / "no-nofollow"
        generation_root.mkdir(parents=True)

        with install_runtime.mutation_lock(v3):
            with mock.patch.object(install_runtime.os, "O_NOFOLLOW", 0):
                with self.assertRaisesRegex(
                    install_runtime.InstallError, "not safely supported"
                ):
                    install_runtime.recover_and_gc(v3, keep_unreferenced=0)

        self.assertTrue(generation_root.exists())

    def test_generation_lock_rejects_unsafe_components(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        with install_runtime.mutation_lock(v3):
            with self.assertRaisesRegex(
                install_runtime.PreflightError, "runtime family"
            ):
                with install_runtime._generation_lock(
                    v3, "../outside", "valid-generation"
                ):
                    self.fail("unsafe generation lock path was accepted")

        self.assertFalse((v3 / "locks" / "outside").exists())

    @unittest.skipUnless(sys.platform != "win32", "fcntl is POSIX-only")
    def test_mutation_lock_is_held_by_an_open_fd_and_excludes_another_process(
        self,
    ) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        ready = self.root / "lock-ready"
        code = (
            "import pathlib, sys, time; "
            "from packages.ai.python.install_runtime import mutation_lock; "
            "v3=pathlib.Path(sys.argv[1]); ready=pathlib.Path(sys.argv[2]); "
            "cm=mutation_lock(v3); cm.__enter__(); ready.write_text('ready'); time.sleep(10)"
        )
        child = subprocess.Popen(
            [sys.executable, "-c", code, str(v3), str(ready)],
            cwd=Path(__file__).resolve().parents[4],
        )
        try:
            for _ in range(100):
                if ready.exists():
                    break
                import time

                time.sleep(0.02)
            self.assertTrue(ready.exists())
            with self.assertRaises(install_runtime.LockBusyError):
                with install_runtime.mutation_lock(v3, blocking=False):
                    pass
        finally:
            child.terminate()
            child.wait(timeout=5)

    def test_mutation_lock_fsyncs_a_new_v3_entry_in_its_parent(self) -> None:
        ai_data_dir = self.root / "fresh-ai-data"
        ai_data_dir.mkdir()
        v3 = ai_data_dir / "v3"
        original_fsync_directory = install_runtime._fsync_directory

        with mock.patch.object(
            install_runtime,
            "_fsync_directory",
            wraps=original_fsync_directory,
        ) as fsync_directory:
            with install_runtime.mutation_lock(v3):
                pass

        fsync_directory.assert_any_call(ai_data_dir)

    def test_mutation_lock_never_follows_a_lock_file_symlink(self) -> None:
        v3 = self.fixture.ai_data_dir / "v3"
        lock_directory = v3 / "locks"
        lock_directory.mkdir(parents=True)
        target = self.root / "must-not-be-locked-or-modified"
        target.write_text("sentinel", encoding="utf-8")
        (lock_directory / "mutation.lock").symlink_to(target)

        with self.assertRaisesRegex(install_runtime.InstallError, "lock.*safely"):
            with install_runtime.mutation_lock(v3):
                self.fail("symlinked lock unexpectedly acquired")

        self.assertEqual(target.read_text(encoding="utf-8"), "sentinel")

    def test_preverified_index_and_local_archive_use_the_same_transaction(self) -> None:
        index = self.root / "index.json"
        index.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "artifacts": [self.fixture.artifact()],
                    "signature": {
                        "keyId": "test-key",
                        "algorithm": "ed25519",
                        "value": "preverified-by-release-client",
                    },
                },
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )

        with self.assertRaises(install_runtime.IndexVerificationError):
            install_runtime.install_from_index(
                ai_data_dir=self.fixture.ai_data_dir,
                index_path=index,
                family=FAMILY,
                target=TARGET,
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

        result = install_runtime.offline_import(
            ai_data_dir=self.fixture.ai_data_dir,
            index_path=index,
            family=FAMILY,
            target=TARGET,
            archive_path=self.fixture.archive,
            smoke_command=self.fixture.smoke_command(),
            host=self.host,
            preverified_index=True,
            expected_index_sha256=_sha256(index.read_bytes()),
        )
        self.assertEqual(result.generation, "1.0.0-abc123")
        descriptor = json.loads(self._active_path().read_bytes())
        signed_index = descriptor["artifact"]["signedIndex"]
        preserved_index = self.fixture.ai_data_dir / "v3" / signed_index["path"]
        self.assertEqual(preserved_index.read_bytes(), index.read_bytes())
        self.assertEqual(signed_index["sha256"], _sha256(index.read_bytes()))
        self.assertEqual(signed_index["size"], len(index.read_bytes()))
        self.assertLess(len(self._active_path().read_bytes()), 64 * 1024)

    def test_preverified_index_is_bound_to_the_callers_authenticated_bytes(
        self,
    ) -> None:
        index = self.root / "index.json"
        index.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "artifacts": [self.fixture.artifact()],
                    "signature": {
                        "keyId": "test-key",
                        "algorithm": "ed25519",
                        "value": "verified-by-the-node-release-client",
                    },
                },
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(
            install_runtime.IndexVerificationError,
            "authenticated index bytes changed",
        ):
            install_runtime.install_from_index(
                ai_data_dir=self.fixture.ai_data_dir,
                index_path=index,
                family=FAMILY,
                target=TARGET,
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
                preverified_index=True,
                expected_index_sha256="0" * 64,
            )

    def test_local_index_reader_never_follows_a_symlink(self) -> None:
        index = self.root / "index.json"
        index.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "artifacts": [self.fixture.artifact()],
                    "signature": {
                        "keyId": "test-key",
                        "algorithm": "ed25519",
                        "value": "verified-by-the-node-release-client",
                    },
                },
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )
        index_link = self.root / "index-link.json"
        index_link.symlink_to(index)

        with self.assertRaisesRegex(
            install_runtime.IndexVerificationError,
            "opened safely",
        ):
            install_runtime.install_from_index(
                ai_data_dir=self.fixture.ai_data_dir,
                index_path=index_link,
                family=FAMILY,
                target=TARGET,
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
                preverified_index=True,
                expected_index_sha256=_sha256(index.read_bytes()),
            )

    def test_local_index_reader_rejects_a_fifo_without_blocking(self) -> None:
        index_fifo = self.root / "index.fifo"
        os.mkfifo(index_fifo)

        with self.assertRaisesRegex(
            install_runtime.IndexVerificationError,
            "regular file",
        ):
            install_runtime.install_from_index(
                ai_data_dir=self.fixture.ai_data_dir,
                index_path=index_fifo,
                family=FAMILY,
                target=TARGET,
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

    def test_local_index_reader_rejects_an_oversized_sparse_file_before_reading(
        self,
    ) -> None:
        index = self.root / "oversized-index.json"
        with index.open("wb") as handle:
            handle.truncate(install_runtime.INDEX_MAX_BYTES + 1)

        with self.assertRaisesRegex(
            install_runtime.IndexVerificationError,
            "size ceiling",
        ):
            install_runtime.install_from_index(
                ai_data_dir=self.fixture.ai_data_dir,
                index_path=index,
                family=FAMILY,
                target=TARGET,
                archive_path=self.fixture.archive,
                smoke_command=self.fixture.smoke_command(),
                host=self.host,
            )

    def test_deactivate_removes_only_the_family_descriptor_and_collects_unleased_runtime(
        self,
    ) -> None:
        self._install()
        other_active = self.fixture.ai_data_dir / "v3" / "active" / "vision-onnx.json"
        self._write_gc_descriptor(other_active, "vision-onnx", "leave-me")

        changed = install_runtime.deactivate_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
        )

        self.assertTrue(changed)
        self.assertFalse(self._active_path().exists())
        self.assertTrue(other_active.exists())
        target_root = self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET
        self.assertFalse((target_root / "1.0.0-abc123").exists())

    def test_deactivate_preserves_a_generation_while_a_live_lease_exists(self) -> None:
        self._install()
        generation = "1.0.0-abc123"
        lease = (
            self.fixture.ai_data_dir
            / "v3"
            / "leases"
            / FAMILY
            / generation
            / "live.json"
        )
        lease.parent.mkdir(parents=True)
        lease.write_text(json.dumps({"pid": os.getpid()}), encoding="utf-8")

        install_runtime.deactivate_runtime(
            ai_data_dir=self.fixture.ai_data_dir,
            family=FAMILY,
        )

        runtime = (
            self.fixture.ai_data_dir / "v3" / "runtimes" / FAMILY / TARGET / generation
        )
        self.assertTrue(runtime.exists())

    def test_reset_deactivates_every_family_without_following_suspicious_state(
        self,
    ) -> None:
        self._install()
        other_active = self.fixture.ai_data_dir / "v3" / "active" / "vision-onnx.json"
        other_active.write_text(
            json.dumps({"family": "vision-onnx", "generation": "leave-me"}),
            encoding="utf-8",
        )

        removed = install_runtime.reset_runtimes(ai_data_dir=self.fixture.ai_data_dir)

        self.assertEqual(removed, 2)
        self.assertEqual(list(other_active.parent.iterdir()), [])

        external = self.root / "external-active"
        external.mkdir()
        (self.fixture.ai_data_dir / "v3" / "active").rmdir()
        (self.fixture.ai_data_dir / "v3" / "active").symlink_to(
            external, target_is_directory=True
        )
        with self.assertRaisesRegex(
            install_runtime.InstallError, "active.*real directory"
        ):
            install_runtime.reset_runtimes(ai_data_dir=self.fixture.ai_data_dir)


if __name__ == "__main__":
    unittest.main()
