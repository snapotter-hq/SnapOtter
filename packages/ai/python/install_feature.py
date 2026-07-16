"""Pre-built AI bundle installer for SnapOtter.

Downloads a pre-built tar.gz archive (or uses a local file), verifies its
SHA256 checksum, extracts site-packages and models, and writes installed.json.

Invoked by the Node.js backend as a subprocess.

Usage:
    python3 install_feature.py <bundleId> <manifestPath> <modelsDir>

Progress is reported via JSON lines on stderr (parsed by the Node bridge).
Final result is a JSON object on stdout.
"""

import errno
import glob
import hashlib
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024
DOWNLOAD_META_BYTES = 64 * 1024 * 1024


# -- Helpers --

def emit_progress(percent: int, stage: str) -> None:
    """Emit a progress update via stderr JSON line."""
    sys.stderr.write(json.dumps({"progress": percent, "stage": stage}) + "\n")
    sys.stderr.flush()


def fail(message: str) -> None:
    """Print error to stderr and exit non-zero."""
    sys.stderr.write(json.dumps({"error": message}) + "\n")
    sys.stderr.flush()
    sys.exit(1)


# -- Architecture detection --

def detect_arch() -> str:
    """Return the bundle archive key for this host.

    Only two archive variants are currently published to the bundle repo:
    'amd64-gpu' and 'arm64-cpu' (see deepsafe/feature-bundles). There is no
    CPU-only amd64 variant yet, so amd64 hosts always resolve to 'amd64-gpu'
    even when no GPU is present: this downloads working CUDA-capable
    packages, just larger than a CPU-only host strictly needs. Do not change
    this to branch on GPU presence without first publishing an 'amd64-cpu'
    archive for every bundle; requesting a key that doesn't exist in the
    manifest fails the install outright (see the archives.get(arch) lookup
    below), which would be worse than the current oversized-but-working
    download.
    """
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "arm64-cpu"
    return "amd64-gpu"


# -- Disk space --

def _existing_ancestor(path: str) -> str:
    """Nearest existing ancestor of path (so disk_usage never raises on a
    not-yet-created dir like the venv)."""
    p = os.path.abspath(path)
    while p and not os.path.exists(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    return p or "/"


def check_disk_space(path: str, needed_bytes: int) -> None:
    """Fail if insufficient disk space on the filesystem holding path."""
    usage = shutil.disk_usage(_existing_ancestor(path))
    if usage.free < needed_bytes:
        free_gb = usage.free / (1024 ** 3)
        need_gb = needed_bytes / (1024 ** 3)
        fail(
            f"Insufficient disk space: need {need_gb:.1f} GB, "
            f"have {free_gb:.1f} GB free. "
            f"Free up space and retry."
        )


def estimate_extracted(compressed: int, extracted: int) -> int:
    """Extracted-size estimate for the disk preflight. When the manifest omits
    extractedSize (0), the budget would otherwise collapse to just the
    compressed size and under-reserve for the extracted payload; fall back to a
    conservative 3x of compressed (measured extracted/compressed ratios reach
    ~3x). This is only the early sanity bail; the accurate guard is the
    real-on-disk re-check just before the destructive venv write."""
    return extracted if extracted > 0 else compressed * 3


def dir_size(path: str) -> int:
    """Total size in bytes of all files under path (best-effort)."""
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def same_filesystem(a: str, b: str) -> bool:
    """True if paths a and b live on the same filesystem (so a rename between
    them is a cheap metadata op rather than a full copy)."""
    try:
        return os.stat(_existing_ancestor(a)).st_dev == os.stat(_existing_ancestor(b)).st_dev
    except OSError:
        return False


# -- Venv site-packages discovery --

def get_site_packages_dir(venv_path: str) -> str:
    """Find the site-packages directory inside a Python venv."""
    matches = glob.glob(os.path.join(venv_path, "lib", "python*", "site-packages"))
    if matches:
        return matches[0]
    return ""


# -- SHA256 verification --

def verify_sha256(filepath: str, expected: str) -> bool:
    """Stream-hash a file and compare to expected hex digest."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest() == expected


# -- Download with resume --

def _set_env_temporarily(key: str, value: str):
    previous = os.environ.get(key)
    os.environ[key] = value
    return previous


def _restore_env(key: str, previous) -> None:
    if previous is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = previous


def _cleanup_hf_local_dir(local_dir: str, archive_file: str) -> None:
    if "/" in archive_file:
        top_level = archive_file.split("/", 1)[0]
        shutil.rmtree(os.path.join(local_dir, top_level), ignore_errors=True)
    shutil.rmtree(os.path.join(local_dir, ".cache"), ignore_errors=True)


def ensure_hf_hub(venv_path: str) -> None:
    """Guarantee the accelerated Hugging Face client is importable before the
    download so the multi-GB bundle transfer takes the fast Xet path.

    The installer runs under the on-disk venv (PYTHON_VENV_PATH, i.e.
    /data/ai/venv in Docker). That venv is normally seeded from the image's
    /opt/venv, which bakes huggingface-hub[hf_xet]. But an install whose venv
    predates the base package (an upgrade where the reseed stamp didn't move, a
    hand-copied or offline-imported venv) would import-fail in
    download_with_hf_hub and silently fall back to the slow single-stream urllib
    downloader. Self-heal by pip-installing the client into this same venv.

    A bundle install already requires network and lifts the offline guard (see
    main()), so this adds no new offline dependency; if the pip install fails we
    fall through to the resumable urllib downloader, the correct degraded path.
    """
    try:
        import huggingface_hub  # noqa: F401

        return
    except Exception:
        pass

    python_path = os.path.join(venv_path, "bin", "python3")
    if not os.path.exists(python_path):
        return

    emit_progress(1, "Preparing accelerated download client...")
    try:
        subprocess.run(
            [
                python_path, "-m", "pip", "install", "--quiet",
                "huggingface-hub[hf_xet,hf_transfer]==0.36.2",
            ],
            capture_output=True, text=True, timeout=300, check=True,
        )
        # The finder caches the venv's site-packages listing; drop it so the
        # just-installed package is visible to the import in download_with_hf_hub.
        importlib.invalidate_caches()
    except Exception as e:
        emit_progress(1, f"Accelerated client unavailable ({e}); using resumable download.")


def download_with_hf_hub(
    bundle_repo: str,
    archive_file: str,
    dest: str,
    expected_size: int,
    progress_start: int,
    progress_end: int,
    force_download: bool = False,
) -> bool:
    """Download through huggingface_hub when available.

    huggingface_hub 0.32+ can use hf_xet for faster large-file transfers and
    manages retries/resume internally. Return False when the client is missing
    or fails so callers can fall back to the manual urllib downloader.
    """
    try:
        from huggingface_hub import hf_hub_download
    except Exception:
        return False

    # Enable hf_transfer (Rust multi-connection downloader) ONLY when the
    # package is actually importable. For a Xet-backed repo hf_xet takes
    # precedence and this is a no-op, but if the Xet CAS endpoint is unreachable
    # (e.g. a firewall that allows huggingface.co but blocks transfer.xethub.hf.co)
    # hf_hub_download falls back to plain HTTP, and hf_transfer makes that
    # fallback multi-connection instead of single-stream. Gating on the import
    # avoids the "HF_HUB_ENABLE_HF_TRANSFER set but package missing" hard error
    # on a venv that only has hf_xet.
    try:
        import hf_transfer  # noqa: F401

        os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")
    except Exception:
        pass

    local_dir = os.path.dirname(dest)
    os.makedirs(local_dir, exist_ok=True)
    emit_progress(progress_start, "Downloading with accelerated Hugging Face client...")

    previous_progress = _set_env_temporarily("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    try:
        downloaded_path = hf_hub_download(
            repo_id=bundle_repo,
            filename=archive_file,
            repo_type="model",
            local_dir=local_dir,
            force_download=force_download,
        )
    except Exception as e:
        emit_progress(
            progress_start,
            f"Accelerated download unavailable, using resumable fallback: {e}",
        )
        # Reclaim any partial blob/metadata hf_hub_download staged under
        # local_dir/.cache so the urllib fallback starts clean and disk is freed.
        _cleanup_hf_local_dir(local_dir, archive_file)
        return False
    finally:
        _restore_env("HF_HUB_DISABLE_PROGRESS_BARS", previous_progress)

    try:
        if not os.path.exists(downloaded_path):
            emit_progress(
                progress_start,
                "Accelerated download did not produce an archive, using resumable fallback...",
            )
            return False

        if os.path.abspath(downloaded_path) != os.path.abspath(dest):
            if os.path.exists(dest):
                os.unlink(dest)
            os.replace(downloaded_path, dest)

        size = os.path.getsize(dest)
        if expected_size > 0:
            pct = min(size / expected_size, 1.0)
            progress = int(progress_start + pct * (progress_end - progress_start))
        else:
            progress = progress_end
        emit_progress(
            min(progress, progress_end),
            f"Downloaded with accelerated client ({size / (1024**3):.1f} GB)",
        )
        return True
    except Exception as e:
        emit_progress(
            progress_start,
            f"Accelerated download post-processing failed, using resumable fallback: {e}",
        )
        return False
    finally:
        # Always drop the hf staging tree (local_dir/<top>, local_dir/.cache).
        # On success the archive is already moved to dest; on any failure this
        # stops the transient hf cache copy from leaking across the fallback.
        _cleanup_hf_local_dir(local_dir, archive_file)


def download_with_resume(
    url: str,
    dest: str,
    expected_size: int,
    progress_start: int,
    progress_end: int,
) -> None:
    """Download a file with resume support via Range headers.

    Uses .partial and .meta sidecar files for crash recovery.
    """
    partial_path = dest + ".partial"
    meta_path = dest + ".meta"

    # Check for existing partial download
    bytes_downloaded = 0
    if os.path.exists(partial_path) and os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            bytes_downloaded = meta.get("bytesDownloaded", 0)
            if bytes_downloaded > 0:
                actual_size = os.path.getsize(partial_path)
                if actual_size != bytes_downloaded:
                    bytes_downloaded = 0  # Mismatch, restart
        except (json.JSONDecodeError, OSError):
            bytes_downloaded = 0

    if bytes_downloaded == 0 and os.path.exists(partial_path):
        os.unlink(partial_path)

    def _cleanup_partial() -> None:
        for p in (partial_path, meta_path):
            if os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass

    max_retries = 5
    for attempt in range(max_retries):
        try:
            headers = {"User-Agent": "snapotter-installer/2.0"}
            if bytes_downloaded > 0:
                headers["Range"] = f"bytes={bytes_downloaded}-"
                emit_progress(
                    progress_start,
                    f"Resuming download from {bytes_downloaded / (1024**3):.1f} GB...",
                )

            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as resp:
                status = getattr(resp, "status", None) or resp.getcode()
                # If we asked to resume (sent a Range) but the server sent the
                # whole file back (200 instead of 206 Partial Content -- a proxy
                # or CDN that ignores Range), restart from byte 0. Appending a
                # full body onto the existing partial would corrupt the archive
                # and fail the checksum on every retry.
                if bytes_downloaded > 0 and status != 206:
                    bytes_downloaded = 0
                mode = "ab" if bytes_downloaded > 0 else "wb"
                next_meta_at = bytes_downloaded + DOWNLOAD_META_BYTES
                with open(partial_path, mode) as f:
                    while True:
                        chunk = resp.read(DOWNLOAD_CHUNK_BYTES)
                        if not chunk:
                            break
                        f.write(chunk)
                        bytes_downloaded += len(chunk)

                        # Update progress
                        if expected_size > 0:
                            pct = bytes_downloaded / expected_size
                            progress = int(
                                progress_start + pct * (progress_end - progress_start)
                            )
                            progress = min(progress, progress_end)
                            stage = f"Downloading... {bytes_downloaded / (1024**3):.1f} GB"
                            emit_progress(progress, stage)

                        # Write meta periodically so a crash can resume.
                        if bytes_downloaded >= next_meta_at:
                            with open(meta_path, "w") as mf:
                                json.dump({"bytesDownloaded": bytes_downloaded}, mf)
                            next_meta_at = bytes_downloaded + DOWNLOAD_META_BYTES

            # Guard against a truncated body or an error page served as the
            # archive: the completed size must match what the manifest expects.
            # A mismatch is retryable (transient truncation / a stale CDN edge).
            if expected_size > 0 and bytes_downloaded != expected_size:
                raise RuntimeError(
                    f"incomplete download: got {bytes_downloaded} bytes, "
                    f"expected {expected_size} (truncated response or error page)"
                )

            # Download complete
            os.rename(partial_path, dest)
            if os.path.exists(meta_path):
                os.unlink(meta_path)
            return

        except urllib.error.HTTPError as e:
            # HTTPError subclasses OSError, so it MUST be caught before the
            # OSError clause below. 4xx (except 408 Timeout / 429 Too Many
            # Requests) won't fix on retry -- a wrong URL, a private repo, or a
            # removed archive -- so fail fast with the manual-download hint.
            if 400 <= e.code < 500 and e.code not in (408, 429):
                _cleanup_partial()
                raise RuntimeError(
                    f"Download failed with HTTP {e.code} ({e.reason}). The archive "
                    f"URL may be wrong or access-restricted."
                )
            _retry_or_raise(e, attempt, max_retries, bytes_downloaded, meta_path,
                            progress_start, _cleanup_partial)
        except OSError as e:
            # Disk full is not transient: retrying can't create space. Fail fast
            # with an actionable message instead of burning the backoff budget.
            # (URLError/connection errors also land here; their errno is None, so
            # they fall through to the retry path.)
            if getattr(e, "errno", None) == errno.ENOSPC:
                _cleanup_partial()
                raise RuntimeError(
                    "Ran out of disk space while downloading the bundle. "
                    "Free up space and retry."
                )
            _retry_or_raise(e, attempt, max_retries, bytes_downloaded, meta_path,
                            progress_start, _cleanup_partial)
        except Exception as e:
            _retry_or_raise(e, attempt, max_retries, bytes_downloaded, meta_path,
                            progress_start, _cleanup_partial)


def _retry_or_raise(err, attempt, max_retries, bytes_downloaded, meta_path,
                    progress_start, cleanup) -> None:
    """Shared transient-failure handler for download_with_resume: persist resume
    metadata and back off, or clean up and raise on the final attempt."""
    try:
        with open(meta_path, "w") as mf:
            json.dump({"bytesDownloaded": bytes_downloaded}, mf)
    except OSError:
        pass

    if attempt < max_retries - 1:
        delay = min(60, 5 * (2 ** attempt))
        emit_progress(
            progress_start,
            f"Download failed (attempt {attempt + 1}/{max_retries}), "
            f"retrying in {delay}s: {err}",
        )
        time.sleep(delay)
    else:
        cleanup()
        raise RuntimeError(f"Failed to download after {max_retries} attempts: {err}")


# -- Safe tar extraction --

def safe_extract(tar_path: str, staging_dir: str) -> None:
    """Extract a tar.gz with security guards."""
    os.makedirs(staging_dir, exist_ok=True)
    with tarfile.open(tar_path, "r:gz") as tf:
        for member in tf.getmembers():
            # Block symlinks, hardlinks, devices
            if not member.isfile() and not member.isdir():
                raise RuntimeError(f"Blocked unsafe tar entry type: {member.name}")
            # Block absolute paths and traversal
            if member.name.startswith("/") or ".." in member.name.split("/"):
                raise RuntimeError(f"Blocked unsafe tar path: {member.name}")
        # The filter= kwarg was added in Python 3.12; the manual guards above
        # already block unsafe entries on older interpreters (e.g. 3.11).
        if sys.version_info >= (3, 12):
            tf.extractall(staging_dir, filter="data")
        else:
            tf.extractall(staging_dir)


# -- File move --

def move_tree(src: str, dst: str) -> None:
    """Merge src into dst, replacing entries crash-atomically where possible.

    This writes into the SHARED /data/ai/venv site-packages, so a crash mid-move
    must never leave a package in a half-replaced state (that tears the venv and
    breaks every other AI tool). For a file replacing a file, os.replace swaps in
    place with NO delete-then-write window, so an interruption leaves either the
    old or the new file intact, never a missing one. Cross-filesystem copies go
    through a temp sibling then an atomic rename for the same reason. Renames
    (vs copytree) also avoid transiently doubling the payload on disk."""
    if not os.path.isdir(src):
        return
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.isdir(s) and os.path.isdir(d):
            # Both dirs exist: merge recursively rather than replace.
            move_tree(s, d)
            continue
        try:
            # A type mismatch (dir<->file) can't be atomically swapped by rename,
            # so clear the destination first. A file-over-file or new entry needs
            # no pre-delete: os.replace is atomic and leaves no torn window.
            if os.path.exists(d) and os.path.isdir(d) != os.path.isdir(s):
                if os.path.isdir(d):
                    shutil.rmtree(d)
                else:
                    os.remove(d)
            os.replace(s, d)
            continue
        except OSError as e:
            if getattr(e, "errno", None) != errno.EXDEV:
                raise
        # Cross-filesystem: rename isn't allowed. Copy to a temp sibling and then
        # atomically replace, so a mid-copy ENOSPC never leaves a truncated file
        # where a working one used to be.
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d)
        else:
            tmp = d + ".part"
            shutil.copy2(s, tmp)
            os.replace(tmp, d)
    # Remove whatever remains of src (emptied by renames, or copied originals).
    shutil.rmtree(src, ignore_errors=True)


# -- ONNX Runtime flavor reconciliation (GPU wins) --

def _onnx_dist_infos(sp_dir: str) -> tuple:
    """Return (cpu, gpu) lists of onnxruntime dist-info directory names.

    Wheel metadata dirs are `<normalized-name>-<version>.dist-info`, and name
    normalization turns every other onnxruntime distribution into
    `onnxruntime_<suffix>` (onnxruntime-gpu -> onnxruntime_gpu), so a directory
    starting with exactly "onnxruntime-" can only be the CPU build.
    """
    if not os.path.isdir(sp_dir):
        return ([], [])
    names = os.listdir(sp_dir)
    cpu = sorted(n for n in names if n.startswith("onnxruntime-") and n.endswith(".dist-info"))
    gpu = sorted(n for n in names if n.startswith("onnxruntime_gpu-") and n.endswith(".dist-info"))
    return (cpu, gpu)


def reconcile_onnxruntime(staging_sp: str, site_packages_dir: str) -> None:
    """Never let a bundle downgrade the venv's ONNX Runtime from GPU to CPU.

    `onnxruntime` (CPU) and `onnxruntime-gpu` unpack into the SAME package
    directory (`onnxruntime/`), so whichever bundle lands last wins
    file-by-file. A CPU build arriving after the GPU build (e.g. transcription's
    faster-whisper dependency, after background-removal put onnxruntime-gpu in
    place) silently strips CUDAExecutionProvider while the surviving
    onnxruntime_gpu dist-info keeps claiming it is installed (#490). The GPU
    build ships CPUExecutionProvider too, so it satisfies every consumer of the
    CPU build; the reverse is not true. Hence: GPU wins, in both install orders.
    """
    staging_cpu, staging_gpu = _onnx_dist_infos(staging_sp)
    venv_cpu, venv_gpu = _onnx_dist_infos(site_packages_dir)

    if staging_cpu and (venv_gpu or staging_gpu):
        # Incoming CPU flavor while a GPU build exists: drop the CPU metadata,
        # and when the staged package files ARE the CPU build (no GPU flavor in
        # this same bundle), drop them too so they cannot clobber the venv's
        # GPU libraries.
        for name in staging_cpu:
            shutil.rmtree(os.path.join(staging_sp, name), ignore_errors=True)
        if not staging_gpu:
            pkg_dir = os.path.join(staging_sp, "onnxruntime")
            if os.path.isdir(pkg_dir):
                shutil.rmtree(pkg_dir, ignore_errors=True)
        sys.stderr.write(
            "[install] kept the GPU build of onnxruntime: dropped this bundle's CPU "
            "onnxruntime so it cannot disable CUDA for other AI tools (#490)\n"
        )
        sys.stderr.flush()

    if staging_gpu and venv_cpu:
        # Incoming GPU flavor over a CPU install: the GPU files win the merge;
        # clear the venv's stale CPU metadata so pip reflects reality. This also
        # makes reinstalling any GPU bundle repair a venv clobbered before this
        # guard existed.
        for name in venv_cpu:
            shutil.rmtree(os.path.join(site_packages_dir, name), ignore_errors=True)
        sys.stderr.write(
            "[install] replacing the CPU build of onnxruntime with the GPU build; "
            "removed its stale metadata\n"
        )
        sys.stderr.flush()


# -- Fixups (NCCL wheel) --

def apply_fixups(staging_dir: str, venv_path: str) -> None:
    """Install any wheels from fixups/ directory (local only, no network)."""
    fixups_dir = os.path.join(staging_dir, "fixups")
    if not os.path.isdir(fixups_dir):
        return
    wheels = [f for f in os.listdir(fixups_dir) if f.endswith(".whl")]
    if not wheels:
        return
    python_path = os.path.join(venv_path, "bin", "python3")
    if not os.path.exists(python_path):
        return
    for wheel in wheels:
        pkg_name = wheel.split("-")[0]
        try:
            subprocess.run(
                [python_path, "-m", "pip", "install", "--no-index",
                 f"--find-links={fixups_dir}", pkg_name],
                capture_output=True, text=True, timeout=60,
            )
        except Exception:
            pass  # Non-fatal


# -- installed.json management --

def read_installed(ai_dir: str) -> dict:
    """Read the current installed.json, returning empty structure if missing."""
    path = os.path.join(ai_dir, "installed.json")
    if not os.path.exists(path):
        return {"bundles": {}}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"bundles": {}}


def write_installed_atomic(ai_dir: str, data: dict) -> None:
    """Write installed.json atomically (write .tmp then rename)."""
    path = os.path.join(ai_dir, "installed.json")
    tmp_path = path + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.rename(tmp_path, path)


# -- Main --

def main() -> None:
    """Run the install with runtime-download restrictions lifted.

    In strict offline mode (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0) the sidecar
    runs with HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE=1; a bundle install is an
    explicitly user-initiated download, so those flags are lifted here
    regardless. The previous values are restored in the finally block because
    this script can run in-process inside the long-lived dispatcher, where
    os.environ changes would otherwise leak into every later request.
    """
    saved = {key: os.environ.get(key) for key in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE")}
    os.environ["HF_HUB_OFFLINE"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "0"
    try:
        _install()
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _install() -> None:
    if len(sys.argv) < 4:
        fail(
            f"Usage: {sys.argv[0]} <bundleId> <manifestPath> <modelsDir>\n"
            f"Got {len(sys.argv) - 1} argument(s)"
        )

    bundle_id = sys.argv[1]
    manifest_path = sys.argv[2]
    models_dir = sys.argv[3]
    ai_dir = os.path.dirname(models_dir)
    staging_base = os.path.join(ai_dir, "staging")
    venv_path = os.environ.get("PYTHON_VENV_PATH", os.path.join(ai_dir, "venv"))

    # -- Load manifest --
    emit_progress(0, "Reading manifest...")

    try:
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
    except Exception as e:
        fail(f"Failed to read manifest: {e}")

    bundles = manifest.get("bundles", {})
    if bundle_id not in bundles:
        fail(f"Unknown bundle: {bundle_id}")

    bundle = bundles[bundle_id]
    archives = bundle.get("archives")
    if not archives:
        fail(f"Bundle '{bundle_id}' has no archives in manifest (v2 required)")

    # -- Detect architecture --
    arch = detect_arch()
    archive = archives.get(arch)
    if not archive:
        fail(f"No archive for architecture '{arch}' in bundle '{bundle_id}'")

    archive_file = archive["file"]
    expected_sha256 = archive["sha256"]
    compressed_size = archive.get("compressedSize", 0)
    extracted_size = archive.get("extractedSize", 0)

    # -- Check for local file override (testing / offline) --
    local_path = os.environ.get("SNAPOTTER_BUNDLE_LOCAL_PATH")

    if local_path:
        # Local mode: use the file directly, verify checksum
        emit_progress(5, "Using local bundle archive...")
        tar_path = local_path

        if not os.path.exists(tar_path):
            fail(f"Local bundle file not found: {tar_path}")

        # Verify checksum
        emit_progress(10, "Verifying checksum...")
        if not verify_sha256(tar_path, expected_sha256):
            fail(
                f"SHA256 checksum mismatch for local file.\n"
                f"Expected: {expected_sha256}\n"
                f"This usually means the manifest and archive are out of sync."
            )
    else:
        # Remote mode: download from HuggingFace
        bundle_repo = manifest.get("bundleRepo", "deepsafe/feature-bundles")
        url = f"https://huggingface.co/{bundle_repo}/resolve/main/{archive_file}"

        # Disk space check (early sanity bail before a multi-GB download).
        # estimate_extracted covers the extractedSize:0 case so the budget can't
        # collapse to just the compressed size; the accurate guard is the
        # real-on-disk re-check just before the destructive venv write below.
        needed = compressed_size + estimate_extracted(compressed_size, extracted_size)
        needed += 500 * 1024 * 1024  # 500 MB buffer
        if needed > 0:
            check_disk_space(ai_dir, needed)

        # Download
        os.makedirs(staging_base, exist_ok=True)
        tar_path = os.path.join(staging_base, f"{bundle_id}-{arch}.tar.gz")

        emit_progress(2, f"Downloading {bundle.get('name', bundle_id)} bundle...")

        # Make sure the accelerated Xet client is importable in this venv, so a
        # drifted/upgraded venv doesn't silently fall back to slow urllib.
        ensure_hf_hub(venv_path)

        try:
            if not download_with_hf_hub(
                bundle_repo,
                archive_file,
                tar_path,
                compressed_size,
                2,
                85,
            ):
                download_with_resume(url, tar_path, compressed_size, 2, 85)
        except RuntimeError as e:
            fail(
                f"{e}\n\n"
                f"You can download the bundle manually from:\n"
                f"  {url}\n"
                f"Then upload it via Settings > AI Features > Offline Import."
            )

        # Verify checksum
        emit_progress(86, "Verifying integrity...")
        if not verify_sha256(tar_path, expected_sha256):
            # Delete and retry once from scratch
            os.unlink(tar_path)
            emit_progress(86, "Checksum mismatch, retrying download...")
            try:
                if not download_with_hf_hub(
                    bundle_repo,
                    archive_file,
                    tar_path,
                    compressed_size,
                    2,
                    85,
                    force_download=True,
                ):
                    download_with_resume(url, tar_path, compressed_size, 2, 85)
            except RuntimeError as e:
                fail(str(e))

            if not verify_sha256(tar_path, expected_sha256):
                os.unlink(tar_path)
                fail(
                    f"SHA256 checksum mismatch after re-download.\n"
                    f"Expected: {expected_sha256}\n"
                    f"The archive may be corrupted. Try again later."
                )

    # -- Extract to staging --
    staging_dir = os.path.join(ai_dir, f"staging-{bundle_id}")
    emit_progress(88, "Extracting packages and models...")

    try:
        if os.path.exists(staging_dir):
            shutil.rmtree(staging_dir)
        safe_extract(tar_path, staging_dir)
    except Exception as e:
        if os.path.exists(staging_dir):
            shutil.rmtree(staging_dir, ignore_errors=True)
        if isinstance(e, OSError) and getattr(e, "errno", None) == errno.ENOSPC:
            fail(
                "Ran out of disk space while extracting the bundle. "
                "Free up space and retry."
            )
        fail(f"Failed to extract archive: {e}")

    # -- Read bundle.json from tar --
    bundle_json_path = os.path.join(staging_dir, "bundle.json")
    if not os.path.exists(bundle_json_path):
        shutil.rmtree(staging_dir, ignore_errors=True)
        fail("Archive is missing bundle.json")

    try:
        with open(bundle_json_path, "r") as f:
            bundle_meta = json.load(f)
    except Exception as e:
        shutil.rmtree(staging_dir, ignore_errors=True)
        fail(f"Invalid bundle.json: {e}")

    version = bundle_meta.get("version", manifest.get("imageVersion", "unknown"))
    model_ids = bundle_meta.get("models", [])

    # -- Disk re-check before the first destructive venv write --
    # The upfront check ran before the download and used an estimate; now the
    # payload is really on disk, so measure it and verify there's room to place
    # it before we start writing into the venv. Running here (after the
    # local/remote branches merge) also covers the offline-import path, which
    # skipped the upfront check entirely. Each budget is checked against the
    # filesystem the bytes actually land on: when the venv lives on a
    # different filesystem than staging, the site-packages payload is COPIED
    # onto the venv's disk, so that disk (not ai_dir's) must hold it. Models
    # stay under ai_dir either way, moving by rename.
    disk_floor = 1024 ** 3  # 1 GB for fixups / installed.json / slack
    staging_sp = os.path.join(staging_dir, "site-packages")
    if not same_filesystem(staging_dir, venv_path):
        sp_bytes = dir_size(staging_sp) if os.path.isdir(staging_sp) else 0
        check_disk_space(venv_path, sp_bytes + disk_floor)
    check_disk_space(ai_dir, disk_floor)

    # -- Move site-packages --
    emit_progress(92, "Installing packages...")
    site_packages_dir = get_site_packages_dir(venv_path)
    venv_writing_marker = os.path.join(ai_dir, "venv.writing")

    try:
        if os.path.isdir(staging_sp) and site_packages_dir:
            # Breadcrumb the destructive shared-venv write. If the process is
            # killed mid-move (OOM/SIGKILL/power loss), move_tree can leave the
            # venv torn, which breaks OTHER installed tools. The marker survives
            # the crash; on next boot recoverInterruptedInstalls sees it and
            # reseeds the venv back to a known-good base. We clear it the instant
            # the site-packages move completes, since the venv is consistent
            # again then (a later models-move failure can't tear the venv).
            with open(venv_writing_marker, "w") as mf:
                json.dump(
                    {
                        "bundleId": bundle_id,
                        "startedAt": datetime.now(timezone.utc).isoformat(),
                    },
                    mf,
                )
            reconcile_onnxruntime(staging_sp, site_packages_dir)
            move_tree(staging_sp, site_packages_dir)
            if os.path.exists(venv_writing_marker):
                os.unlink(venv_writing_marker)

        # -- Move models --
        emit_progress(95, "Installing models...")
        staging_models = os.path.join(staging_dir, "models")
        if os.path.isdir(staging_models):
            os.makedirs(models_dir, exist_ok=True)
            move_tree(staging_models, models_dir)
    except OSError as e:
        shutil.rmtree(staging_dir, ignore_errors=True)
        if getattr(e, "errno", None) == errno.ENOSPC:
            fail("Ran out of disk space while installing the bundle. Free up space and retry.")
        fail(f"Failed to install bundle files: {e}")

    # -- Apply fixups --
    emit_progress(97, "Finalizing...")
    apply_fixups(staging_dir, venv_path)

    # -- Verify the bundle actually imports --
    # File-copy completion does NOT prove the bundle works: an incomplete
    # extraction or an ABI mismatch (e.g. a numpy/torch/protobuf skew) can leave
    # every file present yet the module unimportable, so the tool "installs" but
    # fails at first use. Import the bundle's key native libraries in the venv
    # now; if that fails, refuse to mark the bundle installed so the user gets a
    # clear retry instead of a silently broken tool.
    smoke_imports = bundle.get("smokeImports") or []
    if smoke_imports and os.environ.get("SNAPOTTER_SKIP_INSTALL_SMOKE") != "1":
        emit_progress(99, "Verifying installation...")
        venv_python = os.path.join(venv_path, "bin", "python3")
        if os.path.exists(venv_python):
            import_stmt = "\n".join(f"import {mod}" for mod in smoke_imports)
            try:
                proc = subprocess.run(
                    [venv_python, "-c", import_stmt],
                    capture_output=True, text=True, timeout=300,
                )
            except subprocess.TimeoutExpired:
                shutil.rmtree(staging_dir, ignore_errors=True)
                fail("Installation verification timed out. Please retry the install.")
            if proc.returncode != 0:
                shutil.rmtree(staging_dir, ignore_errors=True)
                tail = "\n".join((proc.stderr or "").strip().splitlines()[-6:])
                fail(
                    "Installation verification failed: the bundle installed but its "
                    "libraries could not be loaded, so the tool would not work.\n"
                    f"{tail}\n\n"
                    "This usually means an interrupted or corrupted install. Retry the "
                    "install; if it keeps failing, use Settings > AI Features > Reset AI "
                    "Environment, then reinstall."
                )

    # -- Write installed.json --
    emit_progress(98, "Recording installation...")
    installed = read_installed(ai_dir)
    installed["bundles"][bundle_id] = {
        "version": version,
        "installedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "models": model_ids,
    }
    write_installed_atomic(ai_dir, installed)

    # -- Cleanup --
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir, ignore_errors=True)
    # Clean up downloaded tar (but not if local override)
    if not local_path and os.path.exists(tar_path):
        os.unlink(tar_path)

    # -- Done --
    emit_progress(100, "Complete")

    result = {
        "success": True,
        "bundleId": bundle_id,
        "version": version,
        "models": model_ids,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
