"""Pre-built AI bundle installer for SnapOtter.

Downloads a pre-built tar.gz archive (or uses a local file), verifies its
SHA256 checksum, extracts site-packages and models, and writes installed.json.

Invoked by the Node.js backend as a subprocess.

Usage:
    python3 install_feature.py <bundleId> <manifestPath> <modelsDir>

Progress is reported via JSON lines on stderr (parsed by the Node bridge).
Final result is a JSON object on stdout.
"""

import glob
import hashlib
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
    """Return 'amd64-gpu' or 'arm64-cpu' based on host + GPU."""
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "arm64-cpu"
    return "amd64-gpu"


# -- Disk space --

def check_disk_space(path: str, needed_bytes: int) -> None:
    """Fail if insufficient disk space."""
    usage = shutil.disk_usage(path)
    if usage.free < needed_bytes:
        free_gb = usage.free / (1024 ** 3)
        need_gb = needed_bytes / (1024 ** 3)
        fail(
            f"Insufficient disk space: need {need_gb:.1f} GB, "
            f"have {free_gb:.1f} GB free. "
            f"Free up space and retry."
        )


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

    max_retries = 3
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
                mode = "ab" if bytes_downloaded > 0 else "wb"
                with open(partial_path, mode) as f:
                    while True:
                        chunk = resp.read(65536)
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

                        # Write meta periodically (every 10 MB)
                        if bytes_downloaded % (10 * 1024 * 1024) < 65536:
                            with open(meta_path, "w") as mf:
                                json.dump({"bytesDownloaded": bytes_downloaded}, mf)

            # Download complete
            os.rename(partial_path, dest)
            if os.path.exists(meta_path):
                os.unlink(meta_path)
            return

        except Exception as e:
            # Write meta for resume on next attempt
            with open(meta_path, "w") as mf:
                json.dump({"bytesDownloaded": bytes_downloaded}, mf)

            if attempt < max_retries - 1:
                delay = 10 * (2 ** attempt)
                emit_progress(
                    progress_start,
                    f"Download failed (attempt {attempt + 1}/{max_retries}), "
                    f"retrying in {delay}s: {e}",
                )
                time.sleep(delay)
            else:
                # Clean up on final failure
                for p in (partial_path, meta_path):
                    if os.path.exists(p):
                        os.unlink(p)
                raise RuntimeError(
                    f"Failed to download after {max_retries} attempts: {e}"
                )


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
    """Recursively merge src into dst, overwriting existing files."""
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)
        shutil.rmtree(src)


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

        # Disk space check
        needed = compressed_size + extracted_size + 500 * 1024 * 1024  # 500 MB buffer
        if needed > 0:
            check_disk_space(ai_dir, needed)

        # Download
        os.makedirs(staging_base, exist_ok=True)
        tar_path = os.path.join(staging_base, f"{bundle_id}-{arch}.tar.gz")

        emit_progress(2, f"Downloading {bundle.get('name', bundle_id)} bundle...")

        try:
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

    # -- Move site-packages --
    emit_progress(92, "Installing packages...")
    site_packages_dir = get_site_packages_dir(venv_path)
    staging_sp = os.path.join(staging_dir, "site-packages")

    if os.path.isdir(staging_sp) and site_packages_dir:
        move_tree(staging_sp, site_packages_dir)

    # -- Move models --
    emit_progress(95, "Installing models...")
    staging_models = os.path.join(staging_dir, "models")
    if os.path.isdir(staging_models):
        os.makedirs(models_dir, exist_ok=True)
        move_tree(staging_models, models_dir)

    # -- Apply fixups --
    emit_progress(97, "Finalizing...")
    apply_fixups(staging_dir, venv_path)

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
