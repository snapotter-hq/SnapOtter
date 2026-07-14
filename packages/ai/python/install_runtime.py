"""Transactional installer for immutable SnapOtter v3 family runtimes.

This module deliberately has no downloader and no package-manager integration.
Online installs and offline imports must first resolve a canonical signed index
and a local archive, then pass both through :func:`install_runtime`.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import contextlib
import ctypes
import dataclasses
import datetime as dt
import errno
import fcntl
import hashlib
import json
import os
import platform as platform_module
import posixpath
import re
import selectors
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from pathlib import Path, PurePosixPath
from typing import Callable, Iterator, Mapping, Sequence


SUPPORTED_TARGETS = {
    ("linux", "x86_64"): "linux-amd64-cpu-py312",
    ("linux", "amd64"): "linux-amd64-cpu-py312",
    ("linux", "aarch64"): "linux-arm64-cpu-py311",
    ("linux", "arm64"): "linux-arm64-cpu-py311",
}
SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
UUID_V4_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
ATOMIC_LEASE_TEMP_NAME = re.compile(
    rf"^[1-9][0-9]*-{UUID_V4_PATTERN}-{UUID_V4_PATTERN}\.json\."
    rf"{UUID_V4_PATTERN}\.tmp$"
)
INDEX_MAX_BYTES = 16 * 1024 * 1024
DESCRIPTOR_SCHEMA_VERSION = 1
ROLLBACK_MARKER_SCHEMA_VERSION = 1
DEFAULT_PROTOCOL_VERSION = 1
DESCRIPTOR_RESERVE_BYTES = 1024 * 1024
ACTIVATION_STATE_MAX_BYTES = 2 * DESCRIPTOR_RESERVE_BYTES
QUARANTINE_FILE_MAX_BYTES = 8 * 1024 * 1024
SMOKE_OUTPUT_MAX_BYTES = 1024 * 1024
SMOKE_OUTPUT_DETAIL_BYTES = 2000
SHARED_STATE_DIRECTORY_MODE = 0o2770
SHARED_STATE_FILE_MODE = 0o660
# Dispatchers heartbeat every five seconds. Sixty missed heartbeats gives busy
# hosts ample scheduling tolerance while still making PID reuse self-healing.
LEASE_STALE_AFTER = dt.timedelta(minutes=5)
LEASE_FILE_MAX_BYTES = 64 * 1024
CGROUP_MEMORY_LIMIT_PATHS = (
    Path("/sys/fs/cgroup/memory.max"),
    Path("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
    Path("/sys/fs/cgroup/memory.limit_in_bytes"),
)


class InstallError(RuntimeError):
    """Base class for a rejected or failed installation."""


class PreflightError(InstallError):
    """The selected artifact cannot safely be installed on this host."""


class LockBusyError(InstallError):
    """Another process owns the v3 mutation lock."""


class UnsafeArchiveError(InstallError):
    """An archive member violates the extraction policy."""


class IntegrityError(InstallError):
    """Artifact bytes do not match their declared integrity metadata."""


class SmokeError(InstallError):
    """The staged or final runtime failed its smoke command."""


class IndexVerificationError(InstallError):
    """A canonical object index has not been authenticated by its caller."""


@dataclasses.dataclass(frozen=True)
class HostInfo:
    platform: str = dataclasses.field(default_factory=lambda: sys.platform)
    machine: str = dataclasses.field(default_factory=platform_module.machine)


@dataclasses.dataclass(frozen=True)
class ExtractionLimits:
    max_entries: int = 100_000
    max_bytes: int = 16 * 1024 * 1024 * 1024

    def __post_init__(self) -> None:
        if self.max_entries <= 0 or self.max_bytes <= 0:
            raise ValueError("extraction limits must be positive")


@dataclasses.dataclass(frozen=True)
class InstallResult:
    family: str
    target: str
    generation: str
    generation_root: Path
    descriptor_path: Path
    activated: bool


@dataclasses.dataclass(frozen=True)
class ActivationState:
    status: str
    activated_generation: str
    activated_descriptor_sha256: str
    previous_descriptor: bytes | None
    invalid_previous_descriptor: bytes | None
    previous_marker: bytes | None
    repair_previous_state: bool
    quarantine_paths: tuple[Path, ...]
    previous_generation: str | None
    previous_index_path: str | None


@dataclasses.dataclass(frozen=True)
class RollbackResolution:
    committed: bool
    committed_generation: str | None
    restored_generation: str | None


@dataclasses.dataclass(frozen=True)
class AuthenticatedIndex:
    path: str
    sha256: str
    size: int
    raw: bytes = dataclasses.field(repr=False)


@dataclasses.dataclass(frozen=True)
class _ArchiveSnapshot:
    device: int
    inode: int
    size: int
    modified_ns: int
    sha256: str


def _is_sha256(value: object) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def _require_component(value: object, label: str) -> str:
    if not isinstance(value, str) or SAFE_COMPONENT.fullmatch(value) is None:
        raise PreflightError(f"invalid {label}")
    return value


def _require_mapping(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise PreflightError(f"invalid {label}")
    return value


def _require_positive_int(
    value: object, label: str, *, allow_zero: bool = False
) -> int:
    minimum = 0 if allow_zero else 1
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise PreflightError(f"invalid {label}")
    return value


def _normalized_archive_path(value: object, label: str = "archive path") -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise UnsafeArchiveError(f"invalid {label}")
    if value.startswith("/") or value.endswith("/"):
        raise UnsafeArchiveError(f"invalid {label}: {value!r}")
    path = PurePosixPath(value)
    if any(part in ("", ".", "..") for part in path.parts):
        raise UnsafeArchiveError(f"unsafe {label}: {value!r}")
    normalized = "/".join(path.parts)
    if normalized != value or not path.parts:
        raise UnsafeArchiveError(f"non-canonical {label}: {value!r}")
    return normalized


def _expected_target(host: HostInfo) -> str | None:
    host_platform = host.platform.lower()
    if host_platform.startswith("linux"):
        host_platform = "linux"
    return SUPPORTED_TARGETS.get((host_platform, host.machine.lower()))


def _effective_memory_bytes() -> int:
    """Return configured capacity after finite cgroup v1/v2 limits."""

    try:
        physical = int(os.sysconf("SC_PHYS_PAGES")) * int(os.sysconf("SC_PAGE_SIZE"))
    except (OSError, ValueError, TypeError) as error:
        raise PreflightError("could not determine physical memory capacity") from error
    if physical <= 0:
        raise PreflightError("could not determine physical memory capacity")

    effective = physical
    membership_limits = _process_cgroup_memory_limits()
    if membership_limits is None:
        for path in CGROUP_MEMORY_LIMIT_PATHS:
            try:
                raw = path.read_text(encoding="ascii").strip()
            except (OSError, UnicodeError):
                continue
            if raw == "max" or not raw.isdecimal():
                continue
            limit = int(raw)
            if 0 < limit < effective:
                effective = limit
    else:
        for limit in membership_limits:
            if limit < effective:
                effective = limit
    return effective


def _decode_mountinfo_path(value: str) -> str:
    return re.sub(
        r"\\([0-7]{3})",
        lambda match: chr(int(match.group(1), 8)),
        value,
    )


def _map_cgroup_membership(
    *, mount_root: str, mount_point: str, membership: str
) -> str | None:
    root = posixpath.normpath(mount_root)
    member = posixpath.normpath(membership)
    mounted = posixpath.normpath(mount_point)
    if not root.startswith("/") or not member.startswith("/") or not mounted.startswith("/"):
        return None
    if root == "/":
        suffix = member[1:]
    elif member == root:
        suffix = ""
    elif member.startswith(root + "/"):
        suffix = member[len(root) + 1 :]
    else:
        return None
    candidate = posixpath.normpath(posixpath.join(mounted, suffix))
    if candidate != mounted and not candidate.startswith(mounted + "/"):
        return None
    return candidate


def _process_cgroup_memory_limits() -> list[int] | None:
    try:
        membership_raw = Path("/proc/self/cgroup").read_text(encoding="ascii")
    except (OSError, UnicodeError) as error:
        if sys.platform.startswith("linux"):
            raise PreflightError(
                "unable to read the process cgroup memory capacity"
            ) from error
        return None

    memberships: list[tuple[str, str]] = []
    membership_lines = membership_raw.splitlines()
    if sys.platform.startswith("linux") and not membership_lines:
        raise PreflightError("unable to read the process cgroup memory capacity")
    for line in membership_lines:
        fields = line.split(":", 2)
        if len(fields) != 3 or not fields[2].startswith("/"):
            if sys.platform.startswith("linux"):
                raise PreflightError(
                    "unable to read the process cgroup memory capacity"
                )
            continue
        hierarchy, controllers_raw, membership = fields
        controllers = set(filter(None, controllers_raw.split(",")))
        if hierarchy == "0" and not controllers:
            memberships.append(("cgroup2", membership))
        elif "memory" in controllers:
            memberships.append(("cgroup", membership))
    if not memberships:
        return None

    try:
        mountinfo_raw = Path("/proc/self/mountinfo").read_text(encoding="ascii")
    except (OSError, UnicodeError) as error:
        raise PreflightError(
            "unable to resolve the process cgroup memory capacity"
        ) from error

    mounts: list[tuple[str, str, str, set[str]]] = []
    for line in mountinfo_raw.splitlines():
        fields = line.split(" ")
        try:
            separator = fields.index("-")
        except ValueError:
            continue
        if separator < 6 or separator + 2 >= len(fields):
            continue
        filesystem = fields[separator + 1]
        if filesystem not in {"cgroup", "cgroup2"}:
            continue
        controllers = set(",".join(fields[separator + 3 :]).split(","))
        mounts.append(
            (
                filesystem,
                _decode_mountinfo_path(fields[3]),
                _decode_mountinfo_path(fields[4]),
                controllers,
            )
        )

    selected: tuple[str, str, str] | None = None
    selected_root_length = -1
    for kind, membership in memberships:
        for filesystem, mount_root, mount_point, controllers in mounts:
            if filesystem != kind or (
                filesystem == "cgroup" and "memory" not in controllers
            ):
                continue
            process_path = _map_cgroup_membership(
                mount_root=mount_root,
                mount_point=mount_point,
                membership=membership,
            )
            if process_path is None or len(mount_root) <= selected_root_length:
                continue
            selected = (
                mount_point,
                process_path,
                "memory.max" if filesystem == "cgroup2" else "memory.limit_in_bytes",
            )
            selected_root_length = len(mount_root)
    if selected is None:
        raise PreflightError("unable to resolve the process cgroup memory capacity")

    mount_point, current, filename = selected
    limits: list[int] = []
    unreadable = False
    while True:
        try:
            raw = Path(current, filename).read_text(encoding="ascii").strip()
            if raw != "max" and not raw.isdecimal():
                raise ValueError("malformed cgroup memory capacity")
            if raw != "max" and raw.isdecimal() and int(raw) > 0:
                limits.append(int(raw))
        except (OSError, UnicodeError, ValueError):
            unreadable = True
        if current == mount_point:
            break
        parent = posixpath.dirname(current)
        if parent == current or not parent.startswith(mount_point):
            break
        current = parent
    if unreadable:
        raise PreflightError("unable to read the process cgroup memory capacity")
    return limits


def _validate_artifact(
    artifact: Mapping[str, object],
    host: HostInfo,
    *,
    effective_memory_bytes: int | None = None,
) -> None:
    family = _require_component(artifact.get("family"), "runtime family")
    target = _require_component(artifact.get("target"), "artifact target")
    _require_component(artifact.get("generation"), "generation")
    _require_component(artifact.get("version"), "artifact version")

    expected_target = _expected_target(host)
    if expected_target is None:
        raise PreflightError(
            f"unsupported host target: platform={host.platform!r}, machine={host.machine!r}"
        )
    if target != expected_target:
        raise PreflightError(
            f"artifact target {target!r} does not match host target {expected_target!r}"
        )

    expected_arch = "amd64" if target == "linux-amd64-cpu-py312" else "arm64"
    if artifact.get("platform") != "linux" or artifact.get("arch") != expected_arch:
        raise PreflightError(
            "artifact platform/architecture metadata does not match its target"
        )

    resources = _require_mapping(artifact.get("resources"), "memory resource metadata")
    minimum_memory_bytes = _require_positive_int(
        resources.get("minimumMemoryBytes"), "minimum memory requirement"
    )
    if minimum_memory_bytes > (1 << 53) - 1:
        raise PreflightError("invalid minimum memory requirement")
    available_memory_bytes = (
        _effective_memory_bytes()
        if effective_memory_bytes is None
        else _require_positive_int(effective_memory_bytes, "effective memory capacity")
    )
    if available_memory_bytes < minimum_memory_bytes:
        raise PreflightError(
            "insufficient memory for accurate OCR runtime: "
            f"{minimum_memory_bytes} bytes required, "
            f"{available_memory_bytes} available; Fast OCR remains available"
        )

    archive = _require_mapping(artifact.get("archive"), "archive metadata")
    if not _is_sha256(archive.get("sha256")):
        raise PreflightError("invalid archive SHA-256")
    _require_positive_int(archive.get("size"), "archive size")
    _require_positive_int(
        archive.get("expandedSize"), "expanded archive size", allow_zero=True
    )

    files = artifact.get("files")
    if not isinstance(files, list) or not files:
        raise PreflightError("artifact file manifest must not be empty")
    seen_paths: set[str] = set()
    file_digests: set[str] = set()
    for raw_file in files:
        file_record = _require_mapping(raw_file, "file manifest record")
        path = _normalized_archive_path(file_record.get("path"), "manifest path")
        if path in seen_paths:
            raise PreflightError(f"duplicate manifest path: {path}")
        seen_paths.add(path)
        if not _is_sha256(file_record.get("sha256")):
            raise PreflightError(f"invalid file SHA-256 for {path}")
        file_digests.add(str(file_record["sha256"]))
        _require_positive_int(
            file_record.get("size"), f"file size for {path}", allow_zero=True
        )
        mode = _require_positive_int(file_record.get("mode"), f"file mode for {path}")
        if mode > 0o777 or mode & (stat.S_ISUID | stat.S_ISGID):
            raise PreflightError(f"unsafe file mode for {path}")

    runtime = _require_mapping(artifact.get("runtime"), "runtime paths")
    for key in ("pythonPath", "entrypoint", "adapterPath"):
        runtime_path = _normalized_archive_path(runtime.get(key), f"runtime {key}")
        if runtime_path not in seen_paths:
            raise PreflightError(f"runtime {key} is absent from the file manifest")

    models = _require_mapping(artifact.get("models"), "model digests")
    if not models:
        raise PreflightError("model digest map must not be empty")
    for model_id, digest in models.items():
        _require_component(model_id, "model id")
        if not _is_sha256(digest):
            raise PreflightError(f"invalid model SHA-256 for {model_id}")
        if digest not in file_digests:
            raise PreflightError(
                f"model digest for {model_id} is not bound to a file in the exact manifest"
            )
        matching_files = [
            record
            for record in files
            if isinstance(record, dict)
            and record.get("sha256") == digest
            and str(record.get("path", "")).startswith("models/")
        ]
        if len(matching_files) != 1:
            raise PreflightError(
                f"model digest for {model_id} must identify exactly one models/ file"
            )

    compatibility = _require_mapping(
        artifact.get("compatibility"), "compatibility metadata"
    )
    if compatibility.get("protocolVersion") != DEFAULT_PROTOCOL_VERSION:
        raise PreflightError("unsupported runtime protocol version")
    if not isinstance(
        compatibility.get("snapotterVersion"), str
    ) or not compatibility.get("snapotterVersion"):
        raise PreflightError("invalid SnapOtter compatibility version")

    capabilities = _require_mapping(artifact.get("capabilities"), "capabilities")
    qualities = capabilities.get("qualities")
    providers = capabilities.get("providers")
    if (
        not isinstance(qualities, list)
        or not qualities
        or not all(isinstance(quality, str) and quality for quality in qualities)
        or len(set(qualities)) != len(qualities)
    ):
        raise PreflightError("runtime qualities must be a non-empty unique string list")
    if family == "ocr" and set(qualities) != {"balanced", "best"}:
        raise PreflightError("OCR runtime must declare balanced and best qualities")
    if (
        not isinstance(providers, list)
        or not providers
        or not all(isinstance(provider, str) and provider for provider in providers)
        or len(set(providers)) != len(providers)
    ):
        raise PreflightError("runtime providers must be a non-empty unique string list")


def _existing_ancestor(path: Path) -> Path:
    current = path.resolve(strict=False)
    while not current.exists():
        if current.parent == current:
            return current
        current = current.parent
    return current


def _check_disk_space(
    v3_root: Path,
    artifact: Mapping[str, object],
    *,
    authenticated_index_bytes: int = 0,
) -> None:
    archive = _require_mapping(artifact["archive"], "archive metadata")
    expanded_size = int(archive["expandedSize"])
    # The authenticated archive already occupies disk before this transaction.
    # Reserve only the new generation plus realistic filesystem metadata.
    filesystem_overhead = max(16 * 1024 * 1024, expanded_size // 50)
    needed = (
        expanded_size
        + filesystem_overhead
        + DESCRIPTOR_RESERVE_BYTES
        + authenticated_index_bytes
    )
    free = shutil.disk_usage(_existing_ancestor(v3_root)).free
    if free < needed:
        raise PreflightError(
            f"insufficient disk space: need {needed} bytes, have {free} bytes"
        )


def _check_descriptor_space(
    v3_root: Path, *, authenticated_index_bytes: int = 0
) -> None:
    free = shutil.disk_usage(_existing_ancestor(v3_root)).free
    needed = DESCRIPTOR_RESERVE_BYTES + authenticated_index_bytes
    if free < needed:
        raise PreflightError(
            "insufficient disk space for OCR runtime activation: "
            f"need {needed} bytes, have {free} bytes"
        )


@contextlib.contextmanager
def mutation_lock(v3_root: Path | str, *, blocking: bool = True) -> Iterator[int]:
    """Hold the Linux/POSIX mutation flock for the lifetime of its open fd."""

    root = Path(v3_root)
    if root.exists() or root.is_symlink():
        root_info = root.lstat()
        if root.is_symlink() or not stat.S_ISDIR(root_info.st_mode):
            raise InstallError("v3 root is a symlink or not a real directory")
    else:
        root.mkdir(parents=True, mode=SHARED_STATE_DIRECTORY_MODE)
        root.chmod(SHARED_STATE_DIRECTORY_MODE)
        root_info = root.lstat()
        if root.is_symlink() or not stat.S_ISDIR(root_info.st_mode):
            raise InstallError("v3 root is a symlink or not a real directory")
    try:
        # Confirm the v3 directory entry itself, not only later children within
        # it. Repeating this on every mutation also makes a retry safe after a
        # prior parent-fsync failure whose directory entry remained visible.
        _fsync_directory(root.parent)
    except OSError as error:
        raise InstallError("v3 root durability could not be confirmed") from error
    lock_directory = root / "locks"
    lock_created = not lock_directory.exists()
    lock_directory.mkdir(parents=True, mode=SHARED_STATE_DIRECTORY_MODE, exist_ok=True)
    if lock_created:
        lock_directory.chmod(SHARED_STATE_DIRECTORY_MODE)
    lock_directory_info = lock_directory.lstat()
    if lock_directory.is_symlink() or not stat.S_ISDIR(lock_directory_info.st_mode):
        raise InstallError("v3 lock path is not a real directory")
    lock_path = lock_directory / "mutation.lock"
    open_flags = os.O_RDWR
    if hasattr(os, "O_NOFOLLOW"):
        open_flags |= os.O_NOFOLLOW
    created = False
    try:
        fd = os.open(
            lock_path,
            open_flags | os.O_CREAT | os.O_EXCL,
            SHARED_STATE_FILE_MODE,
        )
        created = True
    except FileExistsError:
        try:
            fd = os.open(lock_path, open_flags)
        except OSError as error:
            raise InstallError("v3 mutation lock cannot be opened safely") from error
    except OSError as error:
        raise InstallError("v3 mutation lock cannot be created safely") from error
    operation = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
    try:
        lock_info = os.fstat(fd)
        if not stat.S_ISREG(lock_info.st_mode):
            raise InstallError("v3 mutation lock is not a regular file")
        if created:
            os.fchmod(fd, SHARED_STATE_FILE_MODE)
        try:
            fcntl.flock(fd, operation)
        except BlockingIOError as error:
            raise LockBusyError(
                "another process is mutating v3 runtime state"
            ) from error
        yield fd
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _validate_generation_lock_identity(
    lock_path: Path, descriptor: int, *, require_mode: bool
) -> os.stat_result:
    """Prove an opened generation lock is still its one public regular inode."""

    try:
        opened = os.fstat(descriptor)
        visible = lock_path.lstat()
    except OSError as error:
        raise InstallError("generation lock identity could not be verified") from error
    if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1:
        raise InstallError(
            "generation lock must be a regular file with exactly one hard link"
        )
    if (
        stat.S_ISLNK(visible.st_mode)
        or not stat.S_ISREG(visible.st_mode)
        or visible.st_nlink != 1
    ):
        raise InstallError(
            "generation lock path must name one non-symlink regular file"
        )
    if (visible.st_dev, visible.st_ino) != (opened.st_dev, opened.st_ino):
        raise InstallError("generation lock inode changed while it was being acquired")
    if require_mode and stat.S_IMODE(opened.st_mode) != SHARED_STATE_FILE_MODE:
        raise InstallError("generation lock does not have the required shared mode")
    return opened


@contextlib.contextmanager
def _generation_lock(
    v3_root: Path | str, family: str, generation: str
) -> Iterator[int | None]:
    """Try to hold one permanent generation inode exclusively without blocking.

    The caller must already hold :func:`mutation_lock`, preserving the global-
    then-generation lock order. ``None`` means another process holds a compatible
    shared or exclusive lock. Every other creation, inspection, or flock failure
    is unsafe and therefore raises instead of being treated as ordinary busy state.
    """

    safe_family = _require_component(family, "runtime family")
    safe_generation = _require_component(generation, "runtime generation")
    no_follow = getattr(os, "O_NOFOLLOW", None)
    close_exec = getattr(os, "O_CLOEXEC", None)
    if not no_follow or not close_exec:
        raise InstallError("generation locks are not safely supported on this platform")

    root = Path(v3_root)
    lock_directory = _ensure_state_directory(
        root, ("locks", "generations", safe_family)
    )
    lock_path = lock_directory / f"{safe_generation}.lock"
    open_flags = os.O_RDWR | no_follow | close_exec
    created = False
    try:
        descriptor = os.open(
            lock_path,
            open_flags | os.O_CREAT | os.O_EXCL,
            SHARED_STATE_FILE_MODE,
        )
        created = True
    except FileExistsError:
        try:
            descriptor = os.open(lock_path, open_flags)
        except OSError as error:
            raise InstallError("generation lock cannot be opened safely") from error
    except OSError as error:
        raise InstallError("generation lock cannot be created safely") from error

    acquired = False
    try:
        opened = _validate_generation_lock_identity(
            lock_path, descriptor, require_mode=False
        )
        if stat.S_IMODE(opened.st_mode) != SHARED_STATE_FILE_MODE:
            try:
                os.fchmod(descriptor, SHARED_STATE_FILE_MODE)
            except OSError as error:
                raise InstallError(
                    "generation lock mode could not be made shared"
                ) from error
        _validate_generation_lock_identity(lock_path, descriptor, require_mode=True)
        if created:
            try:
                os.fsync(descriptor)
                _fsync_directory(lock_directory)
            except OSError as error:
                raise InstallError("generation lock could not be made durable") from error

        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno not in {errno.EWOULDBLOCK, errno.EAGAIN}:
                raise InstallError(
                    "generation lock could not be acquired safely"
                ) from error
            # A path replacement must not be disguised as ordinary contention.
            _validate_generation_lock_identity(
                lock_path, descriptor, require_mode=True
            )
            yield None
            return
        acquired = True
        _validate_generation_lock_identity(lock_path, descriptor, require_mode=True)
        yield descriptor
    finally:
        try:
            if acquired:
                with contextlib.suppress(OSError):
                    fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@contextlib.contextmanager
def _open_archive(path: Path) -> Iterator[int]:
    """Open an archive once without following or blocking on a raced path."""

    flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0)
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    flags |= nofollow | getattr(os, "O_CLOEXEC", 0)
    before_open: os.stat_result | None = None
    if not nofollow:
        try:
            before_open = path.lstat()
        except OSError as error:
            raise PreflightError(
                f"cannot access local runtime archive: {error}"
            ) from error
        if stat.S_ISLNK(before_open.st_mode):
            raise PreflightError(
                "runtime archive is a symlink or cannot be opened safely"
            )

    try:
        fd = os.open(path, flags)
    except OSError as error:
        raise PreflightError(
            f"runtime archive is a symlink or cannot be opened safely: {error}"
        ) from error
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise PreflightError("runtime archive is not a regular file")
        if info.st_nlink != 1:
            raise PreflightError("runtime archive must have exactly one hard link")
        if before_open is not None:
            try:
                after_open = path.lstat()
            except OSError as error:
                raise PreflightError(
                    "runtime archive path changed while it was being opened"
                ) from error
            if (
                stat.S_ISLNK(after_open.st_mode)
                or after_open.st_dev != info.st_dev
                or after_open.st_ino != info.st_ino
            ):
                raise PreflightError(
                    "runtime archive path changed while it was being opened"
                )
        if hasattr(os, "set_blocking"):
            os.set_blocking(fd, True)
        yield fd
    finally:
        os.close(fd)


def _archive_descriptor_state(fd: int) -> tuple[int, int, int, int, int]:
    try:
        info = os.fstat(fd)
    except OSError as error:
        raise IntegrityError(
            f"cannot inspect local runtime archive: {error}"
        ) from error
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise IntegrityError("runtime archive changed while being installed")
    return (
        info.st_dev,
        info.st_ino,
        info.st_size,
        info.st_nlink,
        info.st_mtime_ns,
    )


def _hash_archive_descriptor(fd: int) -> str:
    digest = hashlib.sha256()
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    except OSError as error:
        raise IntegrityError(f"cannot read local runtime archive: {error}") from error
    finally:
        try:
            os.lseek(fd, 0, os.SEEK_SET)
        except OSError:
            pass
    return digest.hexdigest()


def _verify_archive(fd: int, artifact: Mapping[str, object]) -> _ArchiveSnapshot:
    archive = _require_mapping(artifact["archive"], "archive metadata")
    before = _archive_descriptor_state(fd)
    actual_size = before[2]
    if actual_size != archive["size"]:
        raise IntegrityError(
            f"archive size mismatch: expected {archive['size']}, received {actual_size}"
        )
    actual_digest = _hash_archive_descriptor(fd)
    after = _archive_descriptor_state(fd)
    if before != after:
        raise IntegrityError("runtime archive changed while being verified")
    if actual_digest != archive["sha256"]:
        raise IntegrityError(
            f"archive digest mismatch: expected {archive['sha256']}, received {actual_digest}"
        )
    return _ArchiveSnapshot(
        device=after[0],
        inode=after[1],
        size=after[2],
        modified_ns=after[4],
        sha256=actual_digest,
    )


def _verify_archive_unchanged(
    fd: int,
    artifact: Mapping[str, object],
    verified: _ArchiveSnapshot,
) -> None:
    try:
        current = _verify_archive(fd, artifact)
    except IntegrityError as error:
        raise IntegrityError("runtime archive changed while being installed") from error
    if current != verified:
        raise IntegrityError("runtime archive changed while being installed")


def _validate_members(
    members: Sequence[tarfile.TarInfo],
    artifact: Mapping[str, object],
    limits: ExtractionLimits,
) -> list[tuple[tarfile.TarInfo, str]]:
    if len(members) > limits.max_entries:
        raise UnsafeArchiveError(
            f"archive has too many entries: {len(members)} > {limits.max_entries}"
        )

    normalized_members: list[tuple[tarfile.TarInfo, str]] = []
    seen: set[str] = set()
    file_paths: set[str] = set()
    expanded_bytes = 0
    for member in members:
        raw_name = member.name.rstrip("/") if member.isdir() else member.name
        name = _normalized_archive_path(raw_name)
        if name in seen:
            raise UnsafeArchiveError(f"duplicate archive entry: {name}")
        seen.add(name)
        if member.issym() or member.islnk():
            raise UnsafeArchiveError(f"links are forbidden in runtime archives: {name}")
        if member.isdev() or member.isfifo():
            raise UnsafeArchiveError(f"devices and FIFOs are forbidden: {name}")
        if not (member.isdir() or member.isreg()):
            raise UnsafeArchiveError(f"unsupported archive entry type: {name}")
        if member.mode & (stat.S_ISUID | stat.S_ISGID):
            raise UnsafeArchiveError(
                f"setuid/setgid archive entry is forbidden: {name}"
            )
        if member.mode & ~0o777:
            raise UnsafeArchiveError(f"unsupported mode bits in archive entry: {name}")
        if member.isreg():
            if member.size < 0:
                raise UnsafeArchiveError(f"negative archive member size: {name}")
            expanded_bytes += member.size
            file_paths.add(name)
        normalized_members.append((member, name))

    if expanded_bytes > limits.max_bytes:
        raise UnsafeArchiveError(
            f"archive expanded bytes exceed ceiling: {expanded_bytes} > {limits.max_bytes}"
        )
    declared = int(
        _require_mapping(artifact["archive"], "archive metadata")["expandedSize"]
    )
    if expanded_bytes != declared:
        raise IntegrityError(
            f"expanded archive size mismatch: expected {declared}, received {expanded_bytes}"
        )

    for file_path in file_paths:
        parts = PurePosixPath(file_path).parts
        for length in range(1, len(parts)):
            if "/".join(parts[:length]) in file_paths:
                raise UnsafeArchiveError(
                    f"archive file is the parent of another entry: {file_path}"
                )
    return normalized_members


def _ensure_safe_directory(root: Path, relative_parts: Sequence[str]) -> Path:
    current = root
    for part in relative_parts:
        current = current / part
        try:
            current.mkdir(mode=0o755)
        except FileExistsError:
            info = current.lstat()
            if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
                raise UnsafeArchiveError(
                    f"archive parent is not a real directory: {current}"
                )
    return current


def _ensure_state_directory(root: Path, relative_parts: Sequence[str]) -> Path:
    """Create mutable v3 state with the container's shared-GID policy."""

    current = root
    for part in relative_parts:
        current = current / part
        created = False
        try:
            current.mkdir(mode=SHARED_STATE_DIRECTORY_MODE)
            created = True
        except FileExistsError:
            pass
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise InstallError(f"runtime state path is not a real directory: {current}")
        if created:
            current.chmod(SHARED_STATE_DIRECTORY_MODE)
            _fsync_directory(current.parent)
    return current


def _safe_extract(
    archive_fd: int,
    destination: Path,
    artifact: Mapping[str, object],
    limits: ExtractionLimits,
) -> None:
    destination.mkdir(mode=0o755, parents=True, exist_ok=False)
    try:
        duplicate_fd = os.dup(archive_fd)
        try:
            archive_file = os.fdopen(duplicate_fd, "rb")
        except BaseException:
            os.close(duplicate_fd)
            raise
        with archive_file:
            archive_file.seek(0)
            with tarfile.open(fileobj=archive_file, mode="r:*") as archive:
                members = _validate_members(archive.getmembers(), artifact, limits)
                directory_modes: list[tuple[Path, int]] = []
                for member, name in members:
                    parts = PurePosixPath(name).parts
                    if member.isdir():
                        directory = _ensure_safe_directory(destination, parts)
                        # Apply restrictive directory modes only after children are
                        # written; otherwise a safe 0555 entry can make its own
                        # later archive children impossible to create.
                        directory_modes.append((directory, member.mode & 0o777))
                        continue

                    parent = _ensure_safe_directory(destination, parts[:-1])
                    output_path = parent / parts[-1]
                    source = archive.extractfile(member)
                    if source is None:
                        raise IntegrityError(f"could not read archive member: {name}")
                    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
                    if hasattr(os, "O_NOFOLLOW"):
                        flags |= os.O_NOFOLLOW
                    fd = os.open(output_path, flags, member.mode & 0o777)
                    written = 0
                    try:
                        with os.fdopen(fd, "wb", closefd=False) as output:
                            while True:
                                chunk = source.read(1024 * 1024)
                                if not chunk:
                                    break
                                written += len(chunk)
                                if written > member.size:
                                    raise IntegrityError(
                                        f"archive member exceeds declared size: {name}"
                                    )
                                output.write(chunk)
                            output.flush()
                    finally:
                        os.close(fd)
                        source.close()
                    if written != member.size:
                        raise IntegrityError(
                            f"archive member size mismatch for {name}: expected {member.size}, got {written}"
                        )
                    os.chmod(output_path, member.mode & 0o777, follow_symlinks=False)
                for directory, mode in sorted(
                    directory_modes, key=lambda item: len(item[0].parts), reverse=True
                ):
                    os.chmod(directory, mode, follow_symlinks=False)
        os.chmod(destination, 0o755, follow_symlinks=False)
        _sync_extracted_tree(destination)
    except (tarfile.TarError, OSError) as error:
        if isinstance(error, InstallError):
            raise
        raise UnsafeArchiveError(
            f"runtime archive extraction failed: {error}"
        ) from error


def _sync_extracted_tree(root: Path) -> None:
    """Durably flush one completed extraction without thousands of file fsyncs."""

    if sys.platform.startswith("linux"):
        flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        fd = os.open(root, flags)
        try:
            libc = ctypes.CDLL(None, use_errno=True)
            syncfs = getattr(libc, "syncfs", None)
            if syncfs is None:
                raise OSError("libc does not expose syncfs")
            syncfs.argtypes = [ctypes.c_int]
            syncfs.restype = ctypes.c_int
            if syncfs(fd) != 0:
                error_number = ctypes.get_errno()
                raise OSError(error_number, os.strerror(error_number))
        finally:
            os.close(fd)
        return

    # Development/test fallback for non-Linux hosts. Official runtime targets
    # use the single syncfs call above.
    for directory, _directory_names, file_names in os.walk(root, followlinks=False):
        for name in file_names:
            fd = os.open(Path(directory) / name, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    for directory, _directory_names, _file_names in os.walk(root, topdown=False):
        _fsync_directory(Path(directory))


def _manifest_by_path(
    artifact: Mapping[str, object],
) -> dict[str, Mapping[str, object]]:
    return {
        str(record["path"]): record
        for record in artifact["files"]
        if isinstance(record, dict)
    }


def _verify_generation(root: Path, artifact: Mapping[str, object]) -> None:
    if not root.exists() or root.is_symlink() or not root.is_dir():
        raise IntegrityError(f"runtime generation is not a real directory: {root}")
    manifest = _manifest_by_path(artifact)
    actual_paths: set[str] = set()
    for directory, directory_names, file_names in os.walk(root, followlinks=False):
        directory_path = Path(directory)
        for name in list(directory_names):
            path = directory_path / name
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise IntegrityError(
                    f"runtime contains an unsafe directory entry: {path}"
                )
        for name in file_names:
            path = directory_path / name
            info = path.lstat()
            relative = path.relative_to(root).as_posix()
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
                raise IntegrityError(f"runtime contains a non-regular file: {relative}")
            if info.st_nlink != 1:
                raise IntegrityError(f"runtime contains a hard-linked file: {relative}")
            actual_paths.add(relative)

    expected_paths = set(manifest)
    if actual_paths != expected_paths:
        extra = sorted(actual_paths - expected_paths)
        missing = sorted(expected_paths - actual_paths)
        raise IntegrityError(
            f"runtime file manifest mismatch: extra={extra}, missing={missing}"
        )

    for relative, expected in manifest.items():
        path = root / relative
        info = path.lstat()
        if info.st_size != expected["size"]:
            raise IntegrityError(f"file size mismatch: {relative}")
        if stat.S_IMODE(info.st_mode) != expected["mode"]:
            raise IntegrityError(f"file mode mismatch: {relative}")
        if _hash_file(path) != expected["sha256"]:
            raise IntegrityError(f"file digest mismatch: {relative}")


def _smoke_environment(
    runtime_root: Path, additions: Mapping[str, str] | None
) -> dict[str, str]:
    environment = dict(os.environ)
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "PYTHONHOME",
        "PYTHONPATH",
    ):
        environment.pop(key, None)
    environment.update(
        {
            "SNAPOTTER_NETWORK_DISABLED": "1",
            "SNAPOTTER_RUNTIME_ROOT": str(runtime_root),
            "SNAPOTTER_ALLOW_MODEL_DOWNLOAD": "0",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "PIP_NO_INDEX": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
            "NO_PROXY": "*",
            "no_proxy": "*",
        }
    )
    if additions:
        for key, value in additions.items():
            if not isinstance(key, str) or not isinstance(value, str):
                raise PreflightError(
                    "smoke environment keys and values must be strings"
                )
            environment[key] = value
    return environment


def _run_smoke(
    runtime_root: Path,
    smoke_command: Sequence[str],
    phase: str,
    smoke_env: Mapping[str, str] | None,
    timeout_seconds: int,
) -> None:
    if not smoke_command or not all(
        isinstance(part, str) and part for part in smoke_command
    ):
        raise PreflightError("smoke command must be a non-empty string sequence")
    command = [part.replace("{runtime}", str(runtime_root)) for part in smoke_command]
    try:
        process = subprocess.Popen(
            command,
            cwd=runtime_root,
            env=_smoke_environment(runtime_root, smoke_env),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except OSError as error:
        raise SmokeError(f"{phase} runtime smoke could not run: {error}") from error

    output_tail = {"stdout": bytearray(), "stderr": bytearray()}
    output_bytes = 0
    deadline = time.monotonic() + timeout_seconds
    selector = selectors.DefaultSelector()
    assert process.stdout is not None
    assert process.stderr is not None
    streams = {
        process.stdout.fileno(): ("stdout", process.stdout),
        process.stderr.fileno(): ("stderr", process.stderr),
    }
    try:
        for file_descriptor, (_label, stream) in streams.items():
            os.set_blocking(file_descriptor, False)
            selector.register(stream, selectors.EVENT_READ)

        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout_seconds)
            for key, _events in selector.select(timeout=min(remaining, 0.1)):
                file_descriptor = key.fileobj.fileno()
                label, stream = streams[file_descriptor]
                try:
                    chunk = os.read(file_descriptor, 64 * 1024)
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(stream)
                    stream.close()
                    continue
                output_bytes += len(chunk)
                tail = output_tail[label]
                tail.extend(chunk)
                if len(tail) > SMOKE_OUTPUT_DETAIL_BYTES:
                    del tail[:-SMOKE_OUTPUT_DETAIL_BYTES]
                if output_bytes > SMOKE_OUTPUT_MAX_BYTES:
                    raise SmokeError(
                        f"{phase} runtime smoke output exceeded "
                        f"{SMOKE_OUTPUT_MAX_BYTES} bytes"
                    )

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(command, timeout_seconds)
        return_code = process.wait(timeout=remaining)
    except subprocess.TimeoutExpired as error:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise SmokeError(
            f"{phase} runtime smoke timed out after {timeout_seconds} seconds"
        ) from error
    except Exception:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise
    finally:
        selector.close()
        for _label, stream in streams.values():
            if not stream.closed:
                stream.close()

    if return_code != 0:
        detail_bytes = output_tail["stderr"] or output_tail["stdout"]
        detail = detail_bytes.decode("utf-8", errors="replace").strip()
        raise SmokeError(
            f"{phase} runtime smoke failed with exit code {return_code}"
            + (f": {detail}" if detail else "")
        )


def _utc_now() -> str:
    return (
        dt.datetime.now(dt.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _authenticated_index(
    raw: bytes,
    artifact: Mapping[str, object],
) -> AuthenticatedIndex:
    """Bind caller-authenticated canonical bytes to exactly this artifact."""

    if not isinstance(raw, bytes) or not raw or len(raw) > INDEX_MAX_BYTES:
        raise IndexVerificationError("authenticated runtime index has an invalid size")
    try:
        index = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as error:
        raise IndexVerificationError(
            f"invalid authenticated runtime index: {error}"
        ) from error
    if not isinstance(index, dict) or index.get("schemaVersion") != 1:
        raise IndexVerificationError(
            "authenticated runtime index uses an unsupported schema"
        )
    if raw != _canonical_json(index):
        raise IndexVerificationError(
            "authenticated runtime index is not canonical JSON"
        )
    signature = index.get("signature")
    if not isinstance(signature, dict):
        raise IndexVerificationError(
            "authenticated runtime index has no signature envelope"
        )
    for key in ("keyId", "algorithm", "value"):
        if not isinstance(signature.get(key), str) or not signature[key]:
            raise IndexVerificationError(
                f"authenticated runtime index signature is missing {key}"
            )
    artifacts = index.get("artifacts")
    if (
        not isinstance(artifacts, list)
        or sum(candidate == artifact for candidate in artifacts) != 1
    ):
        raise IndexVerificationError(
            "authenticated runtime index does not bind exactly one selected artifact"
        )
    digest = hashlib.sha256(raw).hexdigest()
    return AuthenticatedIndex(
        path=f"indexes/{digest}.json",
        sha256=digest,
        size=len(raw),
        raw=raw,
    )


def _persist_authenticated_index(v3_root: Path, index: AuthenticatedIndex) -> Path:
    _ensure_state_directory(v3_root, ("indexes",))
    destination = v3_root / index.path
    try:
        info = destination.lstat()
    except FileNotFoundError:
        info = None
    if info is not None:
        matches = (
            not stat.S_ISLNK(info.st_mode)
            and stat.S_ISREG(info.st_mode)
            and info.st_nlink == 1
            and info.st_size == index.size
            and destination.read_bytes() == index.raw
        )
        if matches:
            return destination
        _remove_without_following(destination)
    _atomic_write(destination, index.raw)
    info = destination.lstat()
    if (
        info.st_nlink != 1
        or info.st_size != index.size
        or destination.read_bytes() != index.raw
    ):
        raise IntegrityError(
            "preserved authenticated runtime index does not match its digest"
        )
    return destination


def _authenticated_index_write_bytes(v3_root: Path, index: AuthenticatedIndex) -> int:
    destination = v3_root / index.path
    try:
        info = destination.lstat()
    except FileNotFoundError:
        return index.size
    if stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode):
        if (
            info.st_nlink == 1
            and info.st_size == index.size
            and destination.read_bytes() == index.raw
        ):
            return 0
    return index.size


def _descriptor(
    artifact: Mapping[str, object],
    activated_at: str,
    signed_index: AuthenticatedIndex,
) -> dict[str, object]:
    family = str(artifact["family"])
    target = str(artifact["target"])
    generation = str(artifact["generation"])
    prefix = PurePosixPath("runtimes", family, target, generation)
    runtime = _require_mapping(artifact["runtime"], "runtime paths")
    compatibility = _require_mapping(
        artifact["compatibility"], "compatibility metadata"
    )
    capabilities = _require_mapping(artifact["capabilities"], "capabilities")
    archive = _require_mapping(artifact["archive"], "archive metadata")
    manifest = _manifest_by_path(artifact)
    runtime_files = {}
    for key, artifact_key in (
        ("python", "pythonPath"),
        ("entrypoint", "entrypoint"),
        ("adapter", "adapterPath"),
    ):
        relative_path = str(runtime[artifact_key])
        record = manifest[relative_path]
        runtime_files[key] = {
            "path": str(prefix / relative_path),
            "sha256": record["sha256"],
            "size": record["size"],
        }
    model_files = {}
    for model_id, digest in dict(artifact["models"]).items():
        matching = [
            record
            for record in artifact["files"]
            if isinstance(record, dict)
            and record.get("sha256") == digest
            and str(record.get("path", "")).startswith("models/")
        ]
        record = matching[0]
        model_files[model_id] = {
            "path": str(prefix / str(record["path"])),
            "sha256": digest,
            "size": record["size"],
        }
    return {
        "schemaVersion": DESCRIPTOR_SCHEMA_VERSION,
        "family": family,
        "generation": generation,
        "status": "ready",
        "activatedAt": activated_at,
        "artifact": {
            "version": artifact["version"],
            "target": target,
            "platform": artifact["platform"],
            "arch": artifact["arch"],
            "sha256": archive["sha256"],
            "signedIndex": {
                "path": signed_index.path,
                "sha256": signed_index.sha256,
                "size": signed_index.size,
            },
            "models": dict(artifact["models"]),
            "modelFiles": model_files,
        },
        "runtime": {
            "pythonPath": str(prefix / str(runtime["pythonPath"])),
            "entrypoint": str(prefix / str(runtime["entrypoint"])),
            "integrityFiles": runtime_files,
        },
        "compatibility": {
            "protocolVersion": compatibility["protocolVersion"],
            "snapotterVersion": compatibility["snapotterVersion"],
        },
        "capabilities": {
            "qualities": list(capabilities["qualities"]),
            "providers": list(capabilities["providers"]),
        },
        "health": {"status": "healthy", "checkedAt": activated_at},
    }


def _canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def _fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    fd = os.open(path, flags)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _atomic_write(path: Path, data: bytes) -> None:
    parent_created = not path.parent.exists()
    path.parent.mkdir(parents=True, mode=SHARED_STATE_DIRECTORY_MODE, exist_ok=True)
    if parent_created:
        path.parent.chmod(SHARED_STATE_DIRECTORY_MODE)
    if path.parent.is_symlink() or not path.parent.is_dir():
        raise InstallError("activation path is not a real directory")
    if path.exists() and (path.is_symlink() or not path.is_file()):
        raise InstallError("active descriptor is not a regular file")
    temporary_path = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(temporary_path, flags, SHARED_STATE_FILE_MODE)
    try:
        os.fchmod(fd, SHARED_STATE_FILE_MODE)
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        _fsync_directory(path.parent)
    finally:
        os.close(fd)
        with contextlib.suppress(FileNotFoundError):
            temporary_path.unlink()


def _activate_descriptor(path: Path, data: bytes) -> None:
    """Replace one descriptor, restoring its prior bytes on a late fsync error."""

    existed = path.exists()
    previous = path.read_bytes() if existed else None
    try:
        _atomic_write(path, data)
    except Exception:
        try:
            current = path.read_bytes() if path.exists() else None
            if current != previous:
                if existed and previous is not None:
                    _atomic_write(path, previous)
                else:
                    path.unlink(missing_ok=True)
                    _fsync_directory(path.parent)
        except Exception:
            # Preserve the original installation error. Filesystem failure can
            # make perfect rollback impossible, but restoration is best-effort.
            pass
        raise


def _read_optional_state_file(path: Path, label: str, max_bytes: int) -> bytes | None:
    """Read one bounded no-follow state file from a stable open descriptor."""

    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise InstallError(f"{label} is not a readable regular file") from error
    try:
        before = os.fstat(fd)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_size > max_bytes
        ):
            raise InstallError(f"{label} is not a bounded private regular file")
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(fd, min(remaining, 64 * 1024))
            if not chunk:
                raise InstallError(f"{label} changed while it was read")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(fd, 1):
            raise InstallError(f"{label} changed while it was read")
        after = os.fstat(fd)
        if (
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
        ):
            raise InstallError(f"{label} changed while it was read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _descriptor_references(raw: bytes, family: str) -> tuple[str | None, str | None]:
    """Return GC references from a valid canonical descriptor, if available."""

    try:
        descriptor = json.loads(raw)
        if not isinstance(descriptor, dict) or raw != _canonical_json(descriptor):
            return None, None
        generation = descriptor.get("generation")
        if (
            descriptor.get("schemaVersion") != DESCRIPTOR_SCHEMA_VERSION
            or descriptor.get("family") != family
            or not isinstance(generation, str)
            or SAFE_COMPONENT.fullmatch(generation) is None
        ):
            return None, None
        artifact = descriptor.get("artifact")
        signed_index = artifact.get("signedIndex") if isinstance(artifact, dict) else None
        index_path = signed_index.get("path") if isinstance(signed_index, dict) else None
        if not isinstance(index_path, str) or re.fullmatch(
            r"indexes/[a-f0-9]{64}\.json", index_path
        ) is None:
            index_path = None
        return generation, index_path
    except (UnicodeDecodeError, ValueError, TypeError):
        return None, None


def _rollback_marker_path(v3_root: Path, family: str) -> Path:
    return v3_root / "rollback" / f"{family}.json"


def _quarantine_state_bytes(
    v3_root: Path, family: str, label: str, raw: bytes
) -> tuple[dict[str, object], Path]:
    if len(raw) > QUARANTINE_FILE_MAX_BYTES:
        raise InstallError(
            f"{label} exceeds the {QUARANTINE_FILE_MAX_BYTES} byte repair ceiling"
        )
    quarantine_root = _ensure_state_directory(v3_root, ("quarantine",))
    name = f"{family}-{uuid.uuid4()}-{label}.bin"
    path = quarantine_root / name
    _atomic_write(path, raw)
    return (
        {
            "path": f"quarantine/{name}",
            "sha256": hashlib.sha256(raw).hexdigest(),
            "size": len(raw),
        },
        path,
    )


def _read_quarantine_state_bytes(
    v3_root: Path, value: object, label: str
) -> tuple[bytes | None, Path | None]:
    if value is None:
        return None, None
    record = _require_mapping(value, f"{label} quarantine reference")
    relative_path = record.get("path")
    if (
        not isinstance(relative_path, str)
        or not re.fullmatch(r"quarantine/[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.bin", relative_path)
        or not _is_sha256(record.get("sha256"))
    ):
        raise InstallError(f"invalid {label} quarantine reference")
    size = _require_positive_int(
        record.get("size"), f"{label} quarantine size", allow_zero=True
    )
    if size > QUARANTINE_FILE_MAX_BYTES:
        raise InstallError(f"invalid {label} quarantine size")
    quarantine_root = v3_root / "quarantine"
    try:
        root_info = quarantine_root.lstat()
    except OSError as error:
        raise InstallError(f"missing {label} quarantine state") from error
    if stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode):
        raise InstallError("runtime quarantine path is not a real directory")
    path = v3_root / relative_path
    raw = _read_optional_state_file(path, label, QUARANTINE_FILE_MAX_BYTES)
    if (
        raw is None
        or len(raw) != size
        or hashlib.sha256(raw).hexdigest() != record["sha256"]
    ):
        raise InstallError(f"{label} quarantine state failed integrity validation")
    return raw, path


def _remove_quarantine_paths(paths: Sequence[Path]) -> None:
    for path in paths:
        with contextlib.suppress(FileNotFoundError):
            path.unlink()
            _fsync_directory(path.parent)


def _rollback_marker(
    *,
    family: str,
    status: str,
    activated_generation: str,
    activated_descriptor_sha256: str,
    previous: bytes | None,
    invalid_previous: bytes | None = None,
    previous_marker: bytes | None = None,
    repair_previous_state: bool = False,
    invalid_previous_reference: Mapping[str, object] | None = None,
    previous_marker_reference: Mapping[str, object] | None = None,
) -> bytes:
    if status not in {"pending", "committed"}:
        raise ValueError("activation status must be pending or committed")
    previous_generation, previous_index_path = (
        _descriptor_references(previous, family) if previous is not None else (None, None)
    )
    if previous is not None and (
        invalid_previous is not None or invalid_previous_reference is not None
    ):
        raise ValueError("valid and invalid previous descriptors are mutually exclusive")
    if invalid_previous is not None and invalid_previous_reference is not None:
        raise ValueError("invalid previous descriptor has duplicate storage")
    if previous_marker is not None and previous_marker_reference is not None:
        raise ValueError("previous activation marker has duplicate storage")
    if invalid_previous is not None and len(invalid_previous) > DESCRIPTOR_RESERVE_BYTES:
        raise ValueError("invalid previous descriptor exceeds its size ceiling")
    if previous_marker is not None and len(previous_marker) > 2 * DESCRIPTOR_RESERVE_BYTES:
        raise ValueError("previous activation marker exceeds its size ceiling")
    return _canonical_json(
        {
            "schemaVersion": ROLLBACK_MARKER_SCHEMA_VERSION,
            "family": family,
            "status": status,
            "activatedGeneration": activated_generation,
            "activatedDescriptorSha256": activated_descriptor_sha256,
            "previousDescriptorB64": (
                base64.b64encode(previous).decode("ascii") if previous is not None else None
            ),
            "invalidPreviousDescriptorB64": (
                base64.b64encode(invalid_previous).decode("ascii")
                if invalid_previous is not None
                else None
            ),
            "invalidPreviousDescriptorFile": invalid_previous_reference,
            "previousMarkerB64": (
                base64.b64encode(previous_marker).decode("ascii")
                if previous_marker is not None
                else None
            ),
            "previousMarkerFile": previous_marker_reference,
            "repairPreviousState": repair_previous_state,
            "previousGeneration": previous_generation,
            "previousIndexPath": previous_index_path,
        }
    )


def _read_rollback_marker(path: Path, family: str) -> ActivationState:
    raw = _read_optional_state_file(
        path, "runtime activation state", ACTIVATION_STATE_MAX_BYTES
    )
    if raw is None:
        raise InstallError(f"no activation state is available for runtime family {family}")
    try:
        marker = json.loads(raw)
        if not isinstance(marker, dict) or raw != _canonical_json(marker):
            raise ValueError
        activated_generation = marker.get("activatedGeneration")
        activated_descriptor_sha256 = marker.get("activatedDescriptorSha256")
        status = marker.get("status")
        if (
            marker.get("schemaVersion") != ROLLBACK_MARKER_SCHEMA_VERSION
            or marker.get("family") != family
            or status not in {"pending", "committed"}
            or not isinstance(activated_generation, str)
            or SAFE_COMPONENT.fullmatch(activated_generation) is None
            or not _is_sha256(activated_descriptor_sha256)
        ):
            raise ValueError
        encoded = marker.get("previousDescriptorB64")
        if encoded is None:
            previous = None
        elif isinstance(encoded, str):
            previous = base64.b64decode(encoded, validate=True)
            if len(previous) > DESCRIPTOR_RESERVE_BYTES:
                raise ValueError
        else:
            raise ValueError
        invalid_encoded = marker.get("invalidPreviousDescriptorB64")
        if invalid_encoded is None:
            invalid_previous = None
        elif isinstance(invalid_encoded, str):
            invalid_previous = base64.b64decode(invalid_encoded, validate=True)
            if len(invalid_previous) > DESCRIPTOR_RESERVE_BYTES:
                raise ValueError
        else:
            raise ValueError
        invalid_previous_file, invalid_previous_path = _read_quarantine_state_bytes(
            path.parent.parent,
            marker.get("invalidPreviousDescriptorFile"),
            "invalid previous descriptor",
        )
        if invalid_previous is not None and invalid_previous_file is not None:
            raise ValueError
        if invalid_previous_file is not None:
            invalid_previous = invalid_previous_file
        previous_marker_encoded = marker.get("previousMarkerB64")
        if previous_marker_encoded is None:
            previous_marker = None
        elif isinstance(previous_marker_encoded, str):
            previous_marker = base64.b64decode(previous_marker_encoded, validate=True)
            if len(previous_marker) > 2 * DESCRIPTOR_RESERVE_BYTES:
                raise ValueError
        else:
            raise ValueError
        previous_marker_file, previous_marker_path = _read_quarantine_state_bytes(
            path.parent.parent,
            marker.get("previousMarkerFile"),
            "previous activation marker",
        )
        if previous_marker is not None and previous_marker_file is not None:
            raise ValueError
        if previous_marker_file is not None:
            previous_marker = previous_marker_file
        if previous is not None and invalid_previous is not None:
            raise ValueError
        repair_previous_state = marker.get("repairPreviousState", False)
        if not isinstance(repair_previous_state, bool):
            raise ValueError
        if (
            (not repair_previous_state and (invalid_previous is not None or previous_marker is not None))
            or (status == "committed" and repair_previous_state)
        ):
            raise ValueError
        generation, index_path = (
            _descriptor_references(previous, family)
            if previous is not None
            else (None, None)
        )
        if previous is not None and (generation is None or index_path is None):
            raise ValueError
        if marker.get("previousGeneration") != generation or marker.get(
            "previousIndexPath"
        ) != index_path:
            raise ValueError
        return ActivationState(
            status=status,
            activated_generation=activated_generation,
            activated_descriptor_sha256=activated_descriptor_sha256,
            previous_descriptor=previous,
            invalid_previous_descriptor=invalid_previous,
            previous_marker=previous_marker,
            repair_previous_state=repair_previous_state,
            quarantine_paths=tuple(
                candidate
                for candidate in (invalid_previous_path, previous_marker_path)
                if candidate is not None
            ),
            previous_generation=generation,
            previous_index_path=index_path,
        )
    except (UnicodeDecodeError, ValueError, TypeError, binascii.Error) as error:
        raise InstallError("runtime activation state is invalid") from error


def _restore_optional_state_file(path: Path, previous: bytes | None) -> None:
    if previous is None:
        if path.exists() or path.is_symlink():
            path.unlink()
            _fsync_directory(path.parent)
    else:
        _atomic_write(path, previous)


def _activate_with_rollback(
    *,
    v3_root: Path,
    descriptor_path: Path,
    family: str,
    generation: str,
    descriptor: bytes,
) -> None:
    """Activate while retaining exact prior descriptor bytes for handoff rollback."""

    _ensure_state_directory(v3_root, ("active",))
    _ensure_state_directory(v3_root, ("rollback",))
    previous_descriptor = _read_optional_state_file(
        descriptor_path, "active runtime descriptor", QUARANTINE_FILE_MAX_BYTES
    )
    previous_descriptor_raw = previous_descriptor
    previous_generation = None
    previous_index_path = None
    invalid_previous_descriptor = None
    if previous_descriptor is not None:
        previous_generation, previous_index_path = _descriptor_references(
            previous_descriptor, family
        )
        if (
            len(previous_descriptor) > DESCRIPTOR_RESERVE_BYTES
            or previous_generation is None
            or previous_index_path is None
        ):
            invalid_previous_descriptor = previous_descriptor
            previous_descriptor = None
    marker_path = _rollback_marker_path(v3_root, family)
    previous_marker = _read_optional_state_file(
        marker_path, "runtime activation state", QUARANTINE_FILE_MAX_BYTES
    )
    repair_previous_state = invalid_previous_descriptor is not None
    preserve_previous_marker = False
    if previous_marker is not None:
        try:
            previous_state = _read_rollback_marker(marker_path, family)
        except InstallError:
            repair_previous_state = True
        else:
            if previous_state.status == "pending":
                raise InstallError(
                    "a pending runtime activation must be reconciled before another activation"
                )
            if (
                previous_descriptor_raw is None
                or previous_generation != previous_state.activated_generation
                or hashlib.sha256(previous_descriptor_raw).hexdigest()
                != previous_state.activated_descriptor_sha256
            ):
                repair_previous_state = True
    elif previous_descriptor_raw is not None:
        repair_previous_state = True
    preserve_previous_marker = repair_previous_state and previous_marker is not None
    quarantine_paths: list[Path] = []
    invalid_previous_reference = None
    previous_marker_reference = None
    try:
        if invalid_previous_descriptor is not None:
            invalid_previous_reference, quarantine_path = _quarantine_state_bytes(
                v3_root,
                family,
                "invalid-descriptor",
                invalid_previous_descriptor,
            )
            quarantine_paths.append(quarantine_path)
        if preserve_previous_marker and previous_marker is not None:
            previous_marker_reference, quarantine_path = _quarantine_state_bytes(
                v3_root,
                family,
                "previous-marker",
                previous_marker,
            )
            quarantine_paths.append(quarantine_path)
        pending_marker = _rollback_marker(
            family=family,
            status="pending",
            activated_generation=generation,
            activated_descriptor_sha256=hashlib.sha256(descriptor).hexdigest(),
            previous=previous_descriptor,
            repair_previous_state=repair_previous_state,
            invalid_previous_reference=invalid_previous_reference,
            previous_marker_reference=previous_marker_reference,
        )
    except Exception:
        _remove_quarantine_paths(quarantine_paths)
        raise
    try:
        _atomic_write(marker_path, pending_marker)
    except Exception as marker_error:
        try:
            current_marker = _read_optional_state_file(
                marker_path,
                "runtime activation state",
                ACTIVATION_STATE_MAX_BYTES,
            )
        except Exception as inspection_error:
            raise InstallError(
                "runtime activation marker publication failed and its pending "
                "repair state was retained"
            ) from ExceptionGroup(
                "activation-marker publication and inspection failures",
                [marker_error, inspection_error],
            )
        if current_marker != previous_marker:
            raise InstallError(
                "runtime activation marker publication failed after changing activation "
                "state; its pending repair state was retained"
            ) from marker_error
        try:
            _fsync_directory(marker_path.parent)
        except Exception as durability_error:
            raise InstallError(
                "runtime activation marker publication failed and prior marker "
                "durability could not be confirmed; its pending repair state was retained"
            ) from ExceptionGroup(
                "activation-marker publication and prior-marker durability failures",
                [marker_error, durability_error],
            )
        _remove_quarantine_paths(quarantine_paths)
        raise
    try:
        _activate_descriptor(descriptor_path, descriptor)
    except Exception as activation_error:
        try:
            current_descriptor = _read_optional_state_file(
                descriptor_path,
                "active runtime descriptor",
                QUARANTINE_FILE_MAX_BYTES,
            )
        except Exception as inspection_error:
            raise InstallError(
                "runtime activation failed and its pending repair state was retained"
            ) from ExceptionGroup(
                "activation and active-state inspection failures",
                [activation_error, inspection_error],
            )
        if current_descriptor != previous_descriptor_raw:
            raise InstallError(
                "runtime activation failed after changing the active descriptor; "
                "its pending repair state was retained"
            ) from activation_error
        try:
            _fsync_directory(descriptor_path.parent)
        except Exception as durability_error:
            raise InstallError(
                "runtime activation failed and restored descriptor durability could "
                "not be confirmed; its pending repair state was retained"
            ) from ExceptionGroup(
                "activation and restored-descriptor durability failures",
                [activation_error, durability_error],
            )
        try:
            _restore_optional_state_file(marker_path, previous_marker)
        except Exception as restore_error:
            raise InstallError(
                "runtime activation failed and its repair quarantine must be retained"
            ) from ExceptionGroup(
                "activation and marker restoration failures",
                [activation_error, restore_error],
            )
        _remove_quarantine_paths(quarantine_paths)
        raise


def _activation_state_needs_repair(
    v3_root: Path, descriptor_path: Path, family: str
) -> bool:
    previous_descriptor = _read_optional_state_file(
        descriptor_path, "active runtime descriptor", QUARANTINE_FILE_MAX_BYTES
    )
    needs_repair = (
        previous_descriptor is not None
        and (
            len(previous_descriptor) > DESCRIPTOR_RESERVE_BYTES
            or _descriptor_references(previous_descriptor, family) == (None, None)
        )
    )
    marker_path = _rollback_marker_path(v3_root, family)
    previous_marker = _read_optional_state_file(
        marker_path, "runtime activation state", QUARANTINE_FILE_MAX_BYTES
    )
    if previous_marker is None:
        return needs_repair or previous_descriptor is not None
    try:
        state = _read_rollback_marker(marker_path, family)
    except InstallError:
        return True
    if state.status == "pending":
        current_generation, _current_index = (
            _descriptor_references(previous_descriptor, family)
            if previous_descriptor is not None
            else (None, None)
        )
        if (
            current_generation != state.activated_generation
            or previous_descriptor is None
            or hashlib.sha256(previous_descriptor).hexdigest()
            != state.activated_descriptor_sha256
        ):
            raise InstallError(
                "a pending runtime activation must be reconciled before another activation"
            )
        return needs_repair
    if previous_descriptor is None:
        return True
    previous_generation, _previous_index = _descriptor_references(
        previous_descriptor, family
    )
    return (
        needs_repair
        or previous_generation != state.activated_generation
        or hashlib.sha256(previous_descriptor).hexdigest()
        != state.activated_descriptor_sha256
    )


def _active_matches(
    path: Path,
    artifact: Mapping[str, object],
    signed_index: AuthenticatedIndex,
) -> bool:
    try:
        value = json.loads(path.read_bytes())
        if not isinstance(value, dict) or not isinstance(value.get("activatedAt"), str):
            return False
        expected = _descriptor(artifact, value["activatedAt"], signed_index)
        health = value.get("health")
        if not isinstance(health, dict) or not isinstance(health.get("checkedAt"), str):
            return False
        expected["health"]["checkedAt"] = health["checkedAt"]
        return value == expected
    except (OSError, ValueError, TypeError):
        return False


def _remove_without_following(path: Path) -> None:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        path.unlink()
    else:
        shutil.rmtree(path)


def _exchange_directories(left: Path, right: Path) -> None:
    """Atomically exchange two real directories on the supported host OS."""

    for path in (left, right):
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError as error:
            raise InstallError(
                "runtime repair exchange path disappeared before replacement"
            ) from error
        if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
            raise InstallError("runtime repair exchange path is not a real directory")

    libc = ctypes.CDLL(None, use_errno=True)
    left_bytes = os.fsencode(left)
    right_bytes = os.fsencode(right)
    if sys.platform.startswith("linux"):
        renameat2 = getattr(libc, "renameat2", None)
        if renameat2 is None:
            raise InstallError("host libc does not support atomic runtime repair")
        renameat2.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        renameat2.restype = ctypes.c_int
        result = renameat2(-100, left_bytes, -100, right_bytes, 2)
    elif sys.platform == "darwin":
        renamex_np = getattr(libc, "renamex_np", None)
        if renamex_np is None:
            raise InstallError("host libc does not support atomic runtime repair")
        renamex_np.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        renamex_np.restype = ctypes.c_int
        result = renamex_np(left_bytes, right_bytes, 2)
    else:
        raise InstallError("host platform does not support atomic runtime repair")
    if result != 0:
        error_number = ctypes.get_errno()
        raise InstallError(
            f"filesystem does not support atomic runtime repair: {os.strerror(error_number)}"
        )


def _active_descriptor_references(path: Path) -> tuple[str, str, str]:
    family = path.stem
    if SAFE_COMPONENT.fullmatch(family) is None:
        raise InstallError("active runtime descriptor has an invalid family name")
    raw = _read_optional_state_file(
        path, "active runtime descriptor", DESCRIPTOR_RESERVE_BYTES
    )
    if raw is None:
        raise InstallError("active runtime descriptor disappeared during GC")
    generation, index_path = _descriptor_references(raw, family)
    if generation is None or index_path is None:
        raise InstallError("active runtime descriptor is invalid; refusing garbage collection")
    return family, generation, index_path


def _read_active_generations(v3_root: Path) -> set[tuple[str, str]]:
    active: set[tuple[str, str]] = set()
    active_root = _active_root_for_mutation(v3_root)
    if active_root is not None:
        for descriptor_path in active_root.glob("*.json"):
            family, generation, _index_path = _active_descriptor_references(
                descriptor_path
            )
            active.add((family, generation))
    rollback_root = _rollback_root_for_mutation(v3_root)
    if rollback_root is not None:
        for marker_path in rollback_root.glob("*.json"):
            family = marker_path.stem
            if SAFE_COMPONENT.fullmatch(family) is None:
                raise InstallError("runtime rollback path has an invalid family name")
            state = _read_rollback_marker(marker_path, family)
            if state.previous_generation is not None:
                active.add((family, state.previous_generation))
    return active


def _read_active_index_paths(v3_root: Path) -> set[str]:
    active: set[str] = set()
    active_root = _active_root_for_mutation(v3_root)
    if active_root is not None:
        for descriptor_path in active_root.glob("*.json"):
            _family, _generation, index_path = _active_descriptor_references(
                descriptor_path
            )
            active.add(index_path)
    rollback_root = _rollback_root_for_mutation(v3_root)
    if rollback_root is not None:
        for marker_path in rollback_root.glob("*.json"):
            family = marker_path.stem
            if SAFE_COMPONENT.fullmatch(family) is None:
                raise InstallError("runtime rollback path has an invalid family name")
            state = _read_rollback_marker(marker_path, family)
            if state.previous_index_path is not None:
                active.add(state.previous_index_path)
    return active


def _collect_unreferenced_indexes(v3_root: Path) -> list[Path]:
    indexes_root = v3_root / "indexes"
    try:
        info = indexes_root.lstat()
    except FileNotFoundError:
        return []
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise InstallError("v3 indexes path is not a real directory")

    referenced = _read_active_index_paths(v3_root)
    removed: list[Path] = []
    for path in indexes_root.iterdir():
        relative = f"indexes/{path.name}"
        if relative in referenced:
            continue
        _remove_without_following(path)
        removed.append(path)
    if removed:
        _fsync_directory(indexes_root)
    return removed


def _collect_unreferenced_quarantine(v3_root: Path) -> list[Path]:
    quarantine_root = v3_root / "quarantine"
    try:
        info = quarantine_root.lstat()
    except FileNotFoundError:
        return []
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise InstallError("v3 quarantine path is not a real directory")

    referenced: set[Path] = set()
    rollback_root = _rollback_root_for_mutation(v3_root)
    if rollback_root is not None:
        for marker_path in rollback_root.glob("*.json"):
            family = marker_path.stem
            if SAFE_COMPONENT.fullmatch(family) is None:
                raise InstallError("runtime rollback path has an invalid family name")
            referenced.update(_read_rollback_marker(marker_path, family).quarantine_paths)

    removed: list[Path] = []
    for path in quarantine_root.iterdir():
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
            raise InstallError(f"unexpected runtime quarantine entry: {path.name}")
        if path in referenced:
            continue
        path.unlink()
        removed.append(path)
    if removed:
        _fsync_directory(quarantine_root)
    return removed


def _parse_lease_timestamp(value: object) -> dt.datetime | None:
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(dt.timezone.utc)


def _lease_is_stale(
    lease: object,
    *,
    family: str,
    generation: str,
    now: dt.datetime,
) -> bool | None:
    """Return stale state, or ``None`` when lease bytes are ambiguous."""

    if not isinstance(lease, dict):
        return None
    pid = lease.get("pid")
    # Schema 1 is the legacy heartbeat format; schema 2 adds the kernel-lock
    # lifetime barrier without changing these lease identity/timestamp fields.
    schema_version = lease.get("schemaVersion")
    if (
        type(schema_version) is not int
        or schema_version not in (1, 2)
        or lease.get("family") != family
        or lease.get("generation") != generation
        or type(pid) is not int
        or pid <= 0
        or not isinstance(lease.get("processNonce"), str)
        or not lease.get("processNonce")
        or not isinstance(lease.get("requestNonce"), str)
        or not lease.get("requestNonce")
    ):
        return None

    created_at = _parse_lease_timestamp(lease.get("createdAt"))
    heartbeat_at = _parse_lease_timestamp(lease.get("heartbeatAt"))
    if created_at is None or heartbeat_at is None or heartbeat_at < created_at:
        return None
    if heartbeat_at > now + LEASE_STALE_AFTER:
        # Clock regressions and timestamps implausibly far in the future are
        # ambiguous. Keep the generation rather than risking a live request.
        return None
    return now - heartbeat_at > LEASE_STALE_AFTER


def _atomic_lease_temp_is_stale(
    name: str,
    *,
    modified_at: float,
    now: dt.datetime,
) -> bool | None:
    """Classify only temporary files emitted by the lease atomic writer."""

    if ATOMIC_LEASE_TEMP_NAME.fullmatch(name) is None:
        return None
    try:
        modified = dt.datetime.fromtimestamp(modified_at, tz=dt.timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None
    return now - modified > LEASE_STALE_AFTER


def _read_lease_snapshot(
    lease_path: Path, expected_info: os.stat_result
) -> tuple[object, tuple[int, int]] | None:
    """Read one bounded regular-file inode without following a replacement."""

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lease_path, flags)
    try:
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_dev != expected_info.st_dev
            or opened.st_ino != expected_info.st_ino
            or opened.st_size > LEASE_FILE_MAX_BYTES
        ):
            return None
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, min(8192, LEASE_FILE_MAX_BYTES + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > LEASE_FILE_MAX_BYTES:
                return None
        return json.loads(b"".join(chunks)), (opened.st_dev, opened.st_ino)
    finally:
        os.close(descriptor)


def _remove_stale_lease_snapshot(
    lease_path: Path, expected_identity: tuple[int, int]
) -> bool:
    """Quarantine exactly the inode classified stale; never unlink its replacement.

    Return true only when the stale inode was removed without observing a newer
    public entry. False makes the caller retain the generation for this GC pass.
    """

    quarantine = lease_path.with_name(f".{lease_path.name}.{uuid.uuid4()}.gc")
    try:
        os.replace(lease_path, quarantine)
        _fsync_directory(lease_path.parent)
    except FileNotFoundError:
        return True
    except OSError:
        return False

    try:
        moved = quarantine.lstat()
        moved_identity = (moved.st_dev, moved.st_ino)
        if stat.S_ISREG(moved.st_mode) and moved_identity == expected_identity:
            quarantine.unlink()
            _fsync_directory(lease_path.parent)
            # A heartbeat may have published a fresh inode after quarantine.
            # Retain the generation whenever that overlap is observable.
            return not lease_path.exists()

        # The heartbeat won the race before quarantine. Restore that exact
        # regular inode without overwriting an even newer heartbeat.
        if not stat.S_ISREG(moved.st_mode) or stat.S_ISLNK(moved.st_mode):
            return False
        try:
            os.link(quarantine, lease_path, follow_symlinks=False)
            _fsync_directory(lease_path.parent)
        except FileExistsError:
            pass
        except OSError:
            return False
        quarantine.unlink()
        _fsync_directory(lease_path.parent)
        return False
    except OSError:
        # A surviving quarantine is conservative: the lease directory remains
        # non-empty and a later GC can retry after inspecting its exact inode.
        return False


def _has_live_lease(v3_root: Path, family: str, generation: str) -> bool:
    """Inspect and quarantine leases while the caller holds generation ``LOCK_EX``.

    The exclusive per-generation lock is the primary lifetime barrier. Lease
    quarantine remains defense in depth for stale clients and crash residue.
    """

    lease_root = v3_root / "leases" / family / generation
    if not lease_root.exists():
        return False
    if lease_root.is_symlink() or not lease_root.is_dir():
        return True
    live = False
    for lease_path in lease_root.iterdir():
        try:
            info = lease_path.lstat()
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
                live = True
                continue
            now = dt.datetime.now(dt.timezone.utc)
            stale_temporary = _atomic_lease_temp_is_stale(
                lease_path.name,
                modified_at=info.st_mtime,
                now=now,
            )
            if stale_temporary is not None:
                if stale_temporary:
                    lease_path.unlink()
                else:
                    live = True
                continue
            snapshot = _read_lease_snapshot(lease_path, info)
            if snapshot is None:
                live = True
                continue
            lease, identity = snapshot
            stale = _lease_is_stale(
                lease,
                family=family,
                generation=generation,
                now=now,
            )
            if stale is True:
                if not _remove_stale_lease_snapshot(lease_path, identity):
                    live = True
            else:
                # PID visibility is namespace-local. A current heartbeat is
                # authoritative even when the lease owner cannot be observed
                # from this installer process.
                live = True
        except (OSError, ValueError, TypeError):
            live = True
    if not live:
        with contextlib.suppress(OSError):
            lease_root.rmdir()
    return live


def recover_staging(v3_root: Path | str) -> list[Path]:
    """Remove staging left by a process that no longer holds the mutation lock."""

    root = Path(v3_root)
    removed: list[Path] = []
    staging_root = root / "staging"
    if staging_root.is_dir() and not staging_root.is_symlink():
        for path in staging_root.iterdir():
            _remove_without_following(path)
            removed.append(path)
    return removed


def recover_and_gc(
    v3_root: Path | str,
    *,
    keep_unreferenced: int = 1,
    _protected_generations: set[tuple[str, str]] | None = None,
) -> list[Path]:
    """Remove abandoned staging and safely collect unreferenced generations.

    The caller must hold ``mutation_lock`` when other writers may be active.
    A generation named by any active descriptor or a live/ambiguous lease is
    always retained. ``keep_unreferenced`` keeps the newest additional rollback
    generations per family/target. ``_protected_generations`` names installer
    targets whose exclusive lock is already held by this caller.
    """

    if keep_unreferenced < 0:
        raise ValueError("keep_unreferenced must not be negative")
    root = Path(v3_root)
    removed = recover_staging(root)

    active = _read_active_generations(root)
    if _protected_generations:
        active.update(_protected_generations)
    runtimes_root = root / "runtimes"
    if not runtimes_root.is_dir() or runtimes_root.is_symlink():
        removed.extend(_collect_unreferenced_indexes(root))
        removed.extend(_collect_unreferenced_quarantine(root))
        return removed
    for family_root in runtimes_root.iterdir():
        if family_root.is_symlink() or not family_root.is_dir():
            continue
        family = family_root.name
        for target_root in family_root.iterdir():
            if target_root.is_symlink() or not target_root.is_dir():
                continue
            candidates: list[tuple[int, Path, str]] = []
            for generation_root in target_root.iterdir():
                if generation_root.is_symlink() or not generation_root.is_dir():
                    continue
                generation = generation_root.name
                if (family, generation) in active:
                    continue
                with _generation_lock(root, family, generation) as generation_fd:
                    if generation_fd is None or _has_live_lease(
                        root, family, generation
                    ):
                        # Busy and lease-ambiguous generations are ineligible;
                        # neither is allowed to consume rollback retention.
                        continue
                    try:
                        modified_ns = generation_root.lstat().st_mtime_ns
                    except OSError:
                        continue
                    candidates.append((modified_ns, generation_root, generation))
            candidates.sort(key=lambda candidate: candidate[0], reverse=True)
            for _modified_ns, path, generation in candidates[keep_unreferenced:]:
                # The first probe only selects eligible retention candidates.
                # This second acquire and lease recheck authorizes deletion.
                with _generation_lock(root, family, generation) as generation_fd:
                    if generation_fd is None or _has_live_lease(
                        root, family, generation
                    ):
                        continue
                    _remove_without_following(path)
                    removed.append(path)
    removed.extend(_collect_unreferenced_indexes(root))
    removed.extend(_collect_unreferenced_quarantine(root))
    return removed


def _state_root_for_mutation(
    v3_root: Path, name: str, label: str
) -> Path | None:
    state_root = v3_root / name
    try:
        mode = state_root.lstat().st_mode
    except FileNotFoundError:
        return None
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise InstallError(f"v3 {label} path is not a real directory")
    return state_root


def _active_root_for_mutation(v3_root: Path) -> Path | None:
    return _state_root_for_mutation(v3_root, "active", "active")


def _rollback_root_for_mutation(v3_root: Path) -> Path | None:
    return _state_root_for_mutation(v3_root, "rollback", "rollback")


def _unlink_active_descriptor(path: Path) -> bool:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return False
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise InstallError(f"active descriptor is not a regular file: {path.name}")
    path.unlink()
    _fsync_directory(path.parent)
    return True


def _validate_pending_reconciliation(
    v3_root: Path, family: str, state: ActivationState
) -> tuple[Path, bytes | None, bool]:
    if state.status != "pending":
        raise InstallError("runtime activation is already committed")
    descriptor_path = v3_root / "active" / f"{family}.json"
    current = _read_optional_state_file(
        descriptor_path, "active runtime descriptor", QUARANTINE_FILE_MAX_BYTES
    )
    current_generation, _current_index = (
        _descriptor_references(current, family)
        if current is not None
        else (None, None)
    )
    if (
        current_generation == state.activated_generation
        and current is not None
        and hashlib.sha256(current).hexdigest()
        == state.activated_descriptor_sha256
    ):
        return descriptor_path, current, True
    restorable_descriptor = (
        state.previous_descriptor
        if state.previous_descriptor is not None
        else state.invalid_previous_descriptor
    )
    if current == restorable_descriptor:
        return descriptor_path, current, False
    raise InstallError(
        "active runtime changed while a pending activation awaited reconciliation"
    )


def _reconcile_pending_under_lock(
    *,
    v3_root: Path,
    family: str,
    marker_path: Path,
    state: ActivationState,
    expected_generation: str | None = None,
) -> str | None:
    if expected_generation is not None and state.activated_generation != expected_generation:
        raise InstallError(
            "runtime activation state does not match the failed generation"
        )
    descriptor_path, observed, activated = _validate_pending_reconciliation(
        v3_root, family, state
    )
    current = _read_optional_state_file(
        descriptor_path, "active runtime descriptor", QUARANTINE_FILE_MAX_BYTES
    )
    if current != observed:
        raise InstallError("active runtime changed during activation reconciliation")
    if activated:
        _restore_optional_state_file(
            descriptor_path,
            state.previous_descriptor
            if state.previous_descriptor is not None
            else state.invalid_previous_descriptor,
        )
    else:
        try:
            _fsync_directory(descriptor_path.parent)
        except OSError as error:
            raise InstallError(
                "restored descriptor durability could not be confirmed; its pending "
                "repair state was retained"
            ) from error
    repair_state = state.repair_previous_state
    if repair_state:
        _restore_optional_state_file(marker_path, state.previous_marker)
        with contextlib.suppress(OSError):
            _remove_quarantine_paths(state.quarantine_paths)
        return state.previous_generation
    if state.previous_descriptor is None:
        _unlink_active_descriptor(marker_path)
    else:
        if state.previous_generation is None:
            raise InstallError("runtime activation state has no restorable generation")
        _activate_descriptor(
            marker_path,
            _rollback_marker(
                family=family,
                status="committed",
                activated_generation=state.previous_generation,
                activated_descriptor_sha256=hashlib.sha256(
                    state.previous_descriptor
                ).hexdigest(),
                previous=None,
            ),
        )
    return state.previous_generation


def commit_runtime(
    *, ai_data_dir: Path | str, family: str, expected_generation: str
) -> bool:
    """Commit a pending activation after its dispatcher handoff succeeds.

    Repeating the same commit is a no-op. A mismatched, corrupt, or symlinked
    activation record fails closed without changing the active descriptor.
    """

    safe_family = _require_component(family, "runtime family")
    safe_generation = _require_component(expected_generation, "runtime generation")
    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    with mutation_lock(v3_root):
        rollback_root = _rollback_root_for_mutation(v3_root)
        if rollback_root is None:
            raise InstallError(
                f"no activation state is available for runtime family {safe_family}"
            )
        marker_path = rollback_root / f"{safe_family}.json"
        state = _read_rollback_marker(marker_path, safe_family)
        if state.activated_generation != safe_generation:
            raise InstallError(
                "runtime activation state does not match the committed generation"
            )
        descriptor_path = v3_root / "active" / f"{safe_family}.json"
        current = _read_optional_state_file(
            descriptor_path, "active runtime descriptor", DESCRIPTOR_RESERVE_BYTES
        )
        current_generation, _current_index = (
            _descriptor_references(current, safe_family)
            if current is not None
            else (None, None)
        )
        if (
            current_generation != safe_generation
            or current is None
            or hashlib.sha256(current).hexdigest()
            != state.activated_descriptor_sha256
        ):
            raise InstallError(
                "active runtime changed before activation could be committed"
            )
        if state.status == "committed":
            return False
        _activate_descriptor(
            marker_path,
            _rollback_marker(
                family=safe_family,
                status="committed",
                activated_generation=state.activated_generation,
                activated_descriptor_sha256=state.activated_descriptor_sha256,
                previous=(
                    None
                    if state.repair_previous_state
                    else state.previous_descriptor
                ),
            ),
        )
        with contextlib.suppress(OSError):
            _remove_quarantine_paths(state.quarantine_paths)
        return True


def reconcile_pending_activations(
    *, ai_data_dir: Path | str
) -> dict[str, str | None]:
    """Roll back every uncommitted activation left by a crashed API process."""

    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    with mutation_lock(v3_root):
        rollback_root = _rollback_root_for_mutation(v3_root)
        if rollback_root is None:
            return {}
        states: list[tuple[str, Path, ActivationState]] = []
        for marker_path in sorted(rollback_root.glob("*.json")):
            family = marker_path.stem
            if SAFE_COMPONENT.fullmatch(family) is None:
                raise InstallError("runtime activation path has an invalid family name")
            state = _read_rollback_marker(marker_path, family)
            if state.status == "pending":
                _validate_pending_reconciliation(v3_root, family, state)
                states.append((family, marker_path, state))

        restored: dict[str, str | None] = {}
        restored_invalid_state = False
        for family, marker_path, state in states:
            restored_invalid_state = (
                restored_invalid_state or state.repair_previous_state
            )
            restored[family] = _reconcile_pending_under_lock(
                v3_root=v3_root,
                family=family,
                marker_path=marker_path,
                state=state,
            )
        if not restored_invalid_state:
            recover_and_gc(v3_root, keep_unreferenced=0)
        return restored


def deactivate_runtime(*, ai_data_dir: Path | str, family: str) -> bool:
    """Atomically stop routing new jobs to one family and collect safe generations."""

    safe_family = _require_component(family, "runtime family")
    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    with mutation_lock(v3_root):
        active_root = _active_root_for_mutation(v3_root)
        rollback_root = _rollback_root_for_mutation(v3_root)
        changed = (
            _unlink_active_descriptor(active_root / f"{safe_family}.json")
            if active_root is not None
            else False
        )
        if rollback_root is not None:
            rollback_path = rollback_root / f"{safe_family}.json"
            if rollback_path.exists() or rollback_path.is_symlink():
                _unlink_active_descriptor(rollback_path)
        recover_and_gc(v3_root, keep_unreferenced=0)
        return changed


def rollback_runtime(
    *, ai_data_dir: Path | str, family: str, expected_generation: str
) -> RollbackResolution:
    """Resolve an uncertain handoff without undoing an exact committed activation."""

    safe_family = _require_component(family, "runtime family")
    safe_generation = _require_component(expected_generation, "runtime generation")
    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    with mutation_lock(v3_root):
        rollback_root = _rollback_root_for_mutation(v3_root)
        if rollback_root is None:
            raise InstallError(
                f"no rollback state is available for runtime family {safe_family}"
            )
        marker_path = rollback_root / f"{safe_family}.json"
        state = _read_rollback_marker(marker_path, safe_family)
        if state.activated_generation != safe_generation:
            raise InstallError(
                "runtime activation state does not match the failed generation"
            )
        if state.status == "committed":
            descriptor_path = v3_root / "active" / f"{safe_family}.json"
            current = _read_optional_state_file(
                descriptor_path,
                "active runtime descriptor",
                DESCRIPTOR_RESERVE_BYTES,
            )
            current_generation, _current_index = (
                _descriptor_references(current, safe_family)
                if current is not None
                else (None, None)
            )
            if (
                current_generation != safe_generation
                or current is None
                or hashlib.sha256(current).hexdigest()
                != state.activated_descriptor_sha256
            ):
                raise InstallError(
                    "committed runtime activation no longer matches its descriptor"
                )
            return RollbackResolution(
                committed=True,
                committed_generation=safe_generation,
                restored_generation=None,
            )
        previous_generation = _reconcile_pending_under_lock(
            v3_root=v3_root,
            family=safe_family,
            marker_path=marker_path,
            state=state,
            expected_generation=safe_generation,
        )
        if not state.repair_previous_state:
            recover_and_gc(v3_root, keep_unreferenced=0)
        return RollbackResolution(
            committed=False,
            committed_generation=None,
            restored_generation=previous_generation,
        )


def reset_runtimes(*, ai_data_dir: Path | str) -> int:
    """Deactivate every v3 family and collect every generation without a live lease."""

    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    with mutation_lock(v3_root):
        active_root = _active_root_for_mutation(v3_root)
        rollback_root = _rollback_root_for_mutation(v3_root)
        removed_descriptors = 0
        if active_root is not None:
            for path in sorted(active_root.iterdir()):
                if path.name.startswith(".") and path.name.endswith(".tmp"):
                    _remove_without_following(path)
                    continue
                if path.suffix != ".json":
                    raise InstallError(
                        f"unexpected entry in v3 active directory: {path.name}"
                    )
                if _unlink_active_descriptor(path):
                    removed_descriptors += 1
        if rollback_root is not None:
            for path in sorted(rollback_root.iterdir()):
                if path.suffix != ".json":
                    raise InstallError(
                        f"unexpected entry in v3 rollback directory: {path.name}"
                    )
                _unlink_active_descriptor(path)
        recover_and_gc(v3_root, keep_unreferenced=0)
        return removed_descriptors


def install_runtime(
    *,
    ai_data_dir: Path | str,
    artifact: Mapping[str, object],
    authenticated_index: bytes,
    archive_path: Path | str,
    smoke_command: Sequence[str],
    host: HostInfo | None = None,
    smoke_env: Mapping[str, str] | None = None,
    smoke_timeout_seconds: int = 120,
    limits: ExtractionLimits = ExtractionLimits(),
    effective_memory_bytes: int | None = None,
) -> InstallResult:
    """Install and activate one local artifact as an atomic v3 transaction."""

    actual_host = host or HostInfo()
    # This is intentionally before even creating the lock directory.
    _validate_artifact(
        artifact, actual_host, effective_memory_bytes=effective_memory_bytes
    )
    selected_index = _authenticated_index(authenticated_index, artifact)
    if smoke_timeout_seconds <= 0:
        raise PreflightError("smoke timeout must be positive")

    source_input = Path(archive_path)
    v3_root = Path(ai_data_dir).resolve(strict=False) / "v3"
    family = str(artifact["family"])
    target = str(artifact["target"])
    generation = str(artifact["generation"])
    final_root = v3_root / "runtimes" / family / target / generation
    descriptor_path = v3_root / "active" / f"{family}.json"

    with _open_archive(source_input) as source, mutation_lock(v3_root):
        # The global lock proves no live installer owns anything in staging.
        # Final generations are not collected here: a later fault must not
        # disturb rollback state, and an interrupted final may be this retry's
        # immutable input.
        recover_staging(v3_root)
        verified_archive = _verify_archive(source, artifact)
        activation_repair = _activation_state_needs_repair(
            v3_root, descriptor_path, family
        )

        repair_existing = False
        if final_root.exists() or final_root.is_symlink():
            try:
                _verify_generation(final_root, artifact)
            except (IntegrityError, OSError):
                repair_existing = True
            else:
                _run_smoke(
                    final_root,
                    smoke_command,
                    "final",
                    smoke_env,
                    smoke_timeout_seconds,
                )
                index_write_bytes = _authenticated_index_write_bytes(
                    v3_root, selected_index
                )
                _check_descriptor_space(
                    v3_root,
                    authenticated_index_bytes=index_write_bytes,
                )
                _persist_authenticated_index(v3_root, selected_index)
                if not activation_repair and _active_matches(
                    descriptor_path, artifact, selected_index
                ):
                    recover_and_gc(v3_root, keep_unreferenced=0)
                    return InstallResult(
                        family,
                        target,
                        generation,
                        final_root,
                        descriptor_path,
                        activated=False,
                    )
                activated_at = _utc_now()
                _activate_with_rollback(
                    v3_root=v3_root,
                    descriptor_path=descriptor_path,
                    family=family,
                    generation=generation,
                    descriptor=_canonical_json(
                        _descriptor(artifact, activated_at, selected_index)
                    ),
                )
                if not activation_repair:
                    recover_and_gc(v3_root, keep_unreferenced=0)
                return InstallResult(
                    family,
                    target,
                    generation,
                    final_root,
                    descriptor_path,
                    activated=True,
                )

        with _generation_lock(v3_root, family, generation) as generation_fd:
            if generation_fd is None:
                raise IntegrityError(
                    "cannot install or repair runtime generation while it is in use; "
                    "retry after active runtime requests finish"
                )
            if _has_live_lease(v3_root, family, generation):
                raise IntegrityError(
                    "cannot install or repair runtime generation while a live or "
                    "ambiguous lease exists; retry after active runtime requests finish"
                )

            # Discard older unreferenced generations before capacity accounting.
            # The target is protected by this already-held generation lock and
            # must not be re-probed as an ordinary unreferenced GC candidate.
            # During descriptor repair, retain every generation until exact
            # handoff commit so corrupt-but-restorable state is never destroyed.
            if not activation_repair:
                recover_and_gc(
                    v3_root,
                    keep_unreferenced=0,
                    _protected_generations={(family, generation)},
                )
            index_write_bytes = _authenticated_index_write_bytes(
                v3_root, selected_index
            )
            _check_disk_space(
                v3_root,
                artifact,
                authenticated_index_bytes=index_write_bytes,
            )
            _persist_authenticated_index(v3_root, selected_index)

            staging_root = v3_root / "staging"
            _ensure_state_directory(v3_root, ("staging",))
            transaction_root = Path(
                tempfile.mkdtemp(prefix=f"{family}-{generation}-", dir=staging_root)
            )
            transaction_root.chmod(SHARED_STATE_DIRECTORY_MODE)
            staged_runtime = transaction_root / "runtime"
            replacement_exchanged = False
            activation_completed = False
            try:
                try:
                    _safe_extract(source, staged_runtime, artifact, limits)
                except Exception:
                    _verify_archive_unchanged(source, artifact, verified_archive)
                    raise
                _verify_archive_unchanged(source, artifact, verified_archive)

                _ensure_state_directory(v3_root, ("runtimes", family, target))
                if staged_runtime.stat().st_dev != final_root.parent.stat().st_dev:
                    raise InstallError(
                        "staging and final runtime directories are not on the same filesystem"
                    )
                _verify_generation(staged_runtime, artifact)
                if repair_existing:
                    if _has_live_lease(v3_root, family, generation):
                        raise IntegrityError(
                            "cannot replace corrupted runtime generation while a live or "
                            "ambiguous lease exists; retry after active runtime requests finish"
                        )
                    _exchange_directories(staged_runtime, final_root)
                    replacement_exchanged = True
                else:
                    os.rename(staged_runtime, final_root)
                _fsync_directory(final_root.parent)
                _verify_generation(final_root, artifact)
                _run_smoke(
                    final_root,
                    smoke_command,
                    "final",
                    smoke_env,
                    smoke_timeout_seconds,
                )

                activated_at = _utc_now()
                _activate_with_rollback(
                    v3_root=v3_root,
                    descriptor_path=descriptor_path,
                    family=family,
                    generation=generation,
                    descriptor=_canonical_json(
                        _descriptor(artifact, activated_at, selected_index)
                    ),
                )
                activation_completed = True
                if not activation_repair:
                    recover_and_gc(v3_root, keep_unreferenced=0)
                return InstallResult(
                    family,
                    target,
                    generation,
                    final_root,
                    descriptor_path,
                    activated=True,
                )
            except Exception as install_error:
                if replacement_exchanged and not activation_completed:
                    try:
                        _exchange_directories(staged_runtime, final_root)
                        _fsync_directory(final_root.parent)
                    except Exception as restore_error:
                        raise InstallError(
                            "runtime repair failed and the prior generation could not be restored"
                        ) from ExceptionGroup(
                            "runtime repair and restoration failures",
                            [install_error, restore_error],
                        )
                raise
            finally:
                # Once renamed, the immutable unreferenced final is deliberate and
                # recoverable. Everything still in staging is safe to discard.
                _remove_without_following(transaction_root)


IndexVerifier = Callable[[bytes, Mapping[str, object]], bool]


def _read_bounded_regular_index(path: Path) -> bytes:
    no_follow = getattr(os, "O_NOFOLLOW", None)
    if no_follow is None:
        raise IndexVerificationError(
            "runtime index cannot be opened safely on this platform"
        )
    flags = (
        os.O_RDONLY
        | no_follow
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise IndexVerificationError(
            "runtime index could not be opened safely"
        ) from error

    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise IndexVerificationError("runtime index is not a regular file")
        if before.st_size > INDEX_MAX_BYTES:
            raise IndexVerificationError("runtime index exceeds its size ceiling")

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(
                descriptor,
                min(1024 * 1024, INDEX_MAX_BYTES + 1 - total),
            )
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > INDEX_MAX_BYTES:
                raise IndexVerificationError(
                    "runtime index exceeds its size ceiling"
                )

        after = os.fstat(descriptor)
        stable_fields = (
            "st_dev",
            "st_ino",
            "st_mode",
            "st_size",
            "st_mtime_ns",
            "st_ctime_ns",
        )
        if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
            raise IndexVerificationError("runtime index changed while it was read")
        raw = b"".join(chunks)
        if len(raw) != before.st_size:
            raise IndexVerificationError("runtime index changed while it was read")
        return raw
    finally:
        os.close(descriptor)


def _load_canonical_index(
    path: Path,
    *,
    preverified: bool,
    verifier: IndexVerifier | None,
    expected_sha256: str | None,
) -> tuple[Mapping[str, object], bytes]:
    raw = _read_bounded_regular_index(path)
    if preverified and expected_sha256 is None:
        raise IndexVerificationError(
            "preverified runtime index has no authenticated digest"
        )
    if expected_sha256 is not None:
        if SHA256.fullmatch(expected_sha256) is None:
            raise IndexVerificationError("runtime index digest is invalid")
        if hashlib.sha256(raw).hexdigest() != expected_sha256:
            raise IndexVerificationError("caller's authenticated index bytes changed")
    try:
        index = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as error:
        raise IndexVerificationError(f"invalid runtime index JSON: {error}") from error
    if not isinstance(index, dict) or index.get("schemaVersion") != 1:
        raise IndexVerificationError("unsupported runtime index schema")
    if raw != _canonical_json(index):
        raise IndexVerificationError("runtime index is not canonical JSON")
    signature = index.get("signature")
    if not isinstance(signature, dict):
        raise IndexVerificationError("runtime index has no signature envelope")
    for key in ("keyId", "algorithm", "value"):
        if not isinstance(signature.get(key), str) or not signature[key]:
            raise IndexVerificationError(f"runtime index signature is missing {key}")
    signed_payload = dict(index)
    signed_payload.pop("signature")
    if not preverified:
        if verifier is None or not verifier(_canonical_json(signed_payload), signature):
            raise IndexVerificationError(
                "runtime index signature has not been verified"
            )
    return index, raw


def install_from_index(
    *,
    ai_data_dir: Path | str,
    index_path: Path | str,
    family: str,
    target: str,
    archive_path: Path | str,
    smoke_command: Sequence[str],
    preverified_index: bool = False,
    index_verifier: IndexVerifier | None = None,
    expected_index_sha256: str | None = None,
    **install_options,
) -> InstallResult:
    """Resolve one object from an authenticated local index and install it."""

    index, authenticated_index = _load_canonical_index(
        Path(index_path),
        preverified=preverified_index,
        verifier=index_verifier,
        expected_sha256=expected_index_sha256,
    )
    artifacts = index.get("artifacts")
    if not isinstance(artifacts, list):
        raise IndexVerificationError("runtime index artifacts must be a list")
    matches = [
        artifact
        for artifact in artifacts
        if isinstance(artifact, dict)
        and artifact.get("family") == family
        and artifact.get("target") == target
    ]
    if len(matches) != 1:
        raise IndexVerificationError(
            f"expected one indexed artifact for {family}/{target}, found {len(matches)}"
        )
    return install_runtime(
        ai_data_dir=ai_data_dir,
        artifact=matches[0],
        authenticated_index=authenticated_index,
        archive_path=archive_path,
        smoke_command=smoke_command,
        **install_options,
    )


def offline_import(**options) -> InstallResult:
    """Offline archives intentionally share the exact indexed transaction."""

    return install_from_index(**options)


def _parse_smoke_command(value: str) -> list[str]:
    try:
        command = json.loads(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"invalid JSON smoke command: {error}"
        ) from error
    if not isinstance(command, list) or not all(
        isinstance(part, str) for part in command
    ):
        raise argparse.ArgumentTypeError("smoke command must be a JSON string array")
    return command


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command_name in ("install", "import"):
        install_parser = subparsers.add_parser(command_name)
        install_parser.add_argument("--ai-data-dir", required=True, type=Path)
        install_parser.add_argument("--index", required=True, type=Path)
        install_parser.add_argument("--archive", required=True, type=Path)
        install_parser.add_argument("--family", required=True)
        install_parser.add_argument("--target", required=True)
        install_parser.add_argument("--expected-index-sha256")
        install_parser.add_argument(
            "--smoke-command", required=True, type=_parse_smoke_command
        )
        install_parser.add_argument(
            "--preverified-index",
            action="store_true",
            help="assert the caller already authenticated the signed canonical index",
        )
    gc_parser = subparsers.add_parser("gc")
    gc_parser.add_argument("--ai-data-dir", required=True, type=Path)
    gc_parser.add_argument("--keep-unreferenced", type=int, default=1)
    deactivate_parser = subparsers.add_parser("deactivate")
    deactivate_parser.add_argument("--ai-data-dir", required=True, type=Path)
    deactivate_parser.add_argument("--family", required=True)
    rollback_parser = subparsers.add_parser("rollback")
    rollback_parser.add_argument("--ai-data-dir", required=True, type=Path)
    rollback_parser.add_argument("--family", required=True)
    rollback_parser.add_argument("--expected-generation", required=True)
    commit_parser = subparsers.add_parser("commit")
    commit_parser.add_argument("--ai-data-dir", required=True, type=Path)
    commit_parser.add_argument("--family", required=True)
    commit_parser.add_argument("--expected-generation", required=True)
    reconcile_parser = subparsers.add_parser("reconcile")
    reconcile_parser.add_argument("--ai-data-dir", required=True, type=Path)
    reset_parser = subparsers.add_parser("reset")
    reset_parser.add_argument("--ai-data-dir", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _build_parser().parse_args(argv)
    try:
        if arguments.command == "deactivate":
            changed = deactivate_runtime(
                ai_data_dir=arguments.ai_data_dir,
                family=arguments.family,
            )
            print(json.dumps({"deactivated": changed, "family": arguments.family}))
            return 0
        if arguments.command == "rollback":
            resolution = rollback_runtime(
                ai_data_dir=arguments.ai_data_dir,
                family=arguments.family,
                expected_generation=arguments.expected_generation,
            )
            print(
                json.dumps(
                    {
                        "family": arguments.family,
                        "failedGeneration": arguments.expected_generation,
                        "committed": resolution.committed,
                        "committedGeneration": resolution.committed_generation,
                        "restoredGeneration": resolution.restored_generation,
                    }
                )
            )
            return 0
        if arguments.command == "commit":
            changed = commit_runtime(
                ai_data_dir=arguments.ai_data_dir,
                family=arguments.family,
                expected_generation=arguments.expected_generation,
            )
            print(
                json.dumps(
                    {
                        "committed": changed,
                        "family": arguments.family,
                        "generation": arguments.expected_generation,
                    }
                )
            )
            return 0
        if arguments.command == "reconcile":
            restored = reconcile_pending_activations(
                ai_data_dir=arguments.ai_data_dir
            )
            print(json.dumps({"restored": restored}))
            return 0
        if arguments.command == "reset":
            removed = reset_runtimes(ai_data_dir=arguments.ai_data_dir)
            print(json.dumps({"deactivatedFamilies": removed}))
            return 0
        if arguments.command == "gc":
            v3_root = arguments.ai_data_dir.resolve(strict=False) / "v3"
            with mutation_lock(v3_root):
                removed = recover_and_gc(
                    v3_root, keep_unreferenced=arguments.keep_unreferenced
                )
            print(json.dumps({"removed": [str(path) for path in removed]}))
            return 0

        installer = (
            offline_import if arguments.command == "import" else install_from_index
        )
        result = installer(
            ai_data_dir=arguments.ai_data_dir,
            index_path=arguments.index,
            family=arguments.family,
            target=arguments.target,
            archive_path=arguments.archive,
            smoke_command=arguments.smoke_command,
            preverified_index=arguments.preverified_index,
            expected_index_sha256=arguments.expected_index_sha256,
        )
        print(
            json.dumps(
                {
                    "family": result.family,
                    "target": result.target,
                    "generation": result.generation,
                    "generationRoot": str(result.generation_root),
                    "activated": result.activated,
                }
            )
        )
        return 0
    except InstallError as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
