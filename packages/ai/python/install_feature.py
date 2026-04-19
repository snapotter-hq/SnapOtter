"""Install a feature bundle: pip packages + model downloads.

Invoked by the Node.js backend as a subprocess.

Usage:
    python3 install_feature.py <bundleId> <manifestPath> <modelsDir>

Progress is reported via JSON lines on stderr (parsed by the Node bridge).
Final result is a JSON object on stdout.
"""

import concurrent.futures
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone


# ── Helpers ──────────────────────────────────────────────────────────────


def emit_progress(percent: int, stage: str) -> None:
    """Emit a progress update via stderr JSON line."""
    sys.stderr.write(json.dumps({"progress": percent, "stage": stage}) + "\n")
    sys.stderr.flush()


def fail(message: str) -> None:
    """Print error to stderr and exit non-zero."""
    sys.stderr.write(json.dumps({"error": message}) + "\n")
    sys.stderr.flush()
    sys.exit(1)


def detect_arch() -> str:
    """Return 'arm64' or 'amd64' based on the host machine."""
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "arm64"
    return "amd64"


def check_disk_space(path: str, min_bytes: int = 100 * 1024 * 1024) -> None:
    """Exit with a clear error if free disk space is below min_bytes."""
    try:
        usage = shutil.disk_usage(path)
        if usage.free < min_bytes:
            free_mb = usage.free / (1024 * 1024)
            min_mb = min_bytes / (1024 * 1024)
            fail(
                f"Insufficient disk space: {free_mb:.0f} MB free, "
                f"need at least {min_mb:.0f} MB"
            )
    except OSError as e:
        # If we can't check, warn but continue
        sys.stderr.write(f"Warning: could not check disk space: {e}\n")
        sys.stderr.flush()


# ── pip install ──────────────────────────────────────────────────────────


def pip_install(package: str, extra_flags: list[str] | None = None) -> None:
    """Run pip install for a single package spec. Raises on failure."""
    cmd = [sys.executable, "-m", "pip", "install"]
    if extra_flags:
        cmd.extend(extra_flags)

    # Package spec may include inline flags like
    # "realesrgan==0.3.0 --extra-index-url https://..."
    parts = package.split()
    cmd.extend(parts)

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"pip install failed for '{package}': {result.stderr.strip()}"
        )


def install_packages(bundle: dict, arch: str) -> None:
    """Install pip packages for the bundle (common + arch-specific + post-install)."""
    packages_section = bundle.get("packages", {})
    common_pkgs = packages_section.get("common", [])
    arch_pkgs = packages_section.get(arch, [])
    all_pkgs = common_pkgs + arch_pkgs
    pip_flags = bundle.get("pipFlags", {})
    post_install = bundle.get("postInstall", [])

    total_pkgs = len(all_pkgs) + len(post_install)
    if total_pkgs == 0:
        return

    for i, pkg in enumerate(all_pkgs):
        progress = int((i / total_pkgs) * 50)
        pkg_name = pkg.split("==")[0].split(">=")[0].split("[")[0].strip()
        emit_progress(progress, f"Installing {pkg_name}...")

        # Check for package-specific pip flags
        extra = None
        for flag_key, flag_val in pip_flags.items():
            if flag_key in pkg:
                extra = flag_val.split() if isinstance(flag_val, str) else flag_val
                break
        pip_install(pkg, extra)

    # Post-install fixups (e.g., re-pin numpy after codeformer drags in a newer one)
    for j, pkg in enumerate(post_install):
        progress = int(((len(all_pkgs) + j) / total_pkgs) * 50)
        pkg_name = pkg.split("==")[0].split(">=")[0].strip()
        emit_progress(progress, f"Post-install: {pkg_name}...")
        pip_install(pkg)


def handle_nccl_conflict() -> None:
    """Re-install torch's NCCL dependency if both torch and paddlepaddle-gpu coexist.

    PaddlePaddle ships its own NCCL, which can conflict with the version
    that torch expects. Force-reinstalling torch's pinned nccl resolves this.
    """
    try:
        from importlib.metadata import PackageNotFoundError, requires

        # Only needed if both torch AND paddlepaddle-gpu are installed
        try:
            requires("torch")
        except PackageNotFoundError:
            return
        try:
            requires("paddlepaddle-gpu")
        except PackageNotFoundError:
            return

        # Find torch's NCCL requirement
        reqs = requires("torch") or []
        nccl_reqs = [r.split(";")[0].strip() for r in reqs if "nccl" in r.lower()]
        if nccl_reqs:
            emit_progress(48, "Fixing NCCL conflict...")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", nccl_reqs[0]],
                capture_output=True,
                text=True,
            )
    except Exception:
        # Non-fatal — if we can't fix it, the user may not even hit the conflict
        pass


# ── Model downloads ──────────────────────────────────────────────────────


def urlretrieve_with_retry(url: str, dest: str, max_retries: int = 3) -> None:
    """Download a URL to a local file with retry + exponential backoff."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "ashim-installer/1.0"}
            )
            with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
                shutil.copyfileobj(resp, f)
            return
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(10 * (2 ** attempt))
            else:
                raise RuntimeError(f"Failed to download {url}: {e}")


def download_url_model(model: dict, models_dir: str) -> None:
    """Download a model via direct URL with atomic rename."""
    rel_path = model["path"]
    url = model["url"]
    min_size = model.get("minSize", 0)
    final_path = os.path.join(models_dir, rel_path)
    tmp_path = final_path + ".downloading"

    # Idempotent: skip if already present and big enough
    if os.path.exists(final_path):
        if min_size <= 0 or os.path.getsize(final_path) >= min_size:
            return

    os.makedirs(os.path.dirname(final_path), exist_ok=True)

    # Clean up orphaned partial download
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    urlretrieve_with_retry(url, tmp_path)

    # Verify size
    actual_size = os.path.getsize(tmp_path)
    if min_size > 0 and actual_size < min_size:
        os.remove(tmp_path)
        raise RuntimeError(
            f"Model {model['id']} too small: {actual_size} bytes "
            f"(expected >= {min_size})"
        )

    # Atomic rename
    os.rename(tmp_path, final_path)


def download_rembg_session(model: dict, models_dir: str) -> None:
    """Download a rembg model by initializing a session."""
    args = model.get("args", [])
    if not args:
        raise RuntimeError(f"rembg_session model {model['id']} has no args")

    model_name = args[0]

    # Set U2NET_HOME so rembg stores models in our models_dir
    u2net_dir = os.path.join(models_dir, "rembg")
    os.makedirs(u2net_dir, exist_ok=True)
    os.environ["U2NET_HOME"] = u2net_dir

    from rembg import new_session
    new_session(model_name)


def download_hf_snapshot(model: dict, models_dir: str) -> None:
    """Download a model via huggingface_hub.snapshot_download."""
    args = model.get("args", [])
    if len(args) < 2:
        raise RuntimeError(
            f"hf_snapshot model {model['id']} needs [repo_id, local_subdir]"
        )

    repo_id = args[0]
    local_subdir = args[1]
    local_dir = os.path.join(models_dir, local_subdir)
    repo_type = model.get("repoType", "model")
    min_size = model.get("minSize", 0)
    target_file = model.get("file")

    os.makedirs(local_dir, exist_ok=True)

    # Idempotent: if target file exists and meets minSize, skip
    if target_file:
        final_file = os.path.join(local_dir, target_file)
        if os.path.exists(final_file):
            if min_size <= 0 or os.path.getsize(final_file) >= min_size:
                return

    from huggingface_hub import snapshot_download

    kwargs: dict = {"repo_id": repo_id, "local_dir": local_dir, "repo_type": repo_type}
    if target_file:
        kwargs["allow_patterns"] = [target_file]

    snapshot_download(**kwargs)

    # Verify file size if applicable
    if target_file and min_size > 0:
        final_file = os.path.join(local_dir, target_file)
        if os.path.exists(final_file):
            actual = os.path.getsize(final_file)
            if actual < min_size:
                raise RuntimeError(
                    f"Model {model['id']} file {target_file} too small: "
                    f"{actual} bytes (expected >= {min_size})"
                )
        else:
            raise RuntimeError(
                f"Model {model['id']} file {target_file} not found after download"
            )


def download_single_model(model: dict, models_dir: str) -> None:
    """Dispatch to the correct download function for a single model entry."""
    download_fn = model.get("downloadFn")
    if download_fn == "rembg_session":
        download_rembg_session(model, models_dir)
    elif download_fn == "hf_snapshot":
        download_hf_snapshot(model, models_dir)
    elif "url" in model and "path" in model:
        download_url_model(model, models_dir)
    else:
        raise RuntimeError(
            f"Model {model['id']} has no recognized download method"
        )


def download_models(models: list[dict], models_dir: str) -> list[str]:
    """Download all models in parallel. Returns list of failed model IDs."""
    if not models:
        return []

    failed: list[str] = []
    total = len(models)

    def _download(idx: int, model: dict) -> tuple[str, Exception | None]:
        model_id = model.get("id", f"model-{idx}")
        try:
            download_single_model(model, models_dir)
            return (model_id, None)
        except Exception as e:
            return (model_id, e)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_download, i, m): i
            for i, m in enumerate(models)
        }

        completed = 0
        for future in concurrent.futures.as_completed(futures):
            completed += 1
            progress = 50 + int((completed / total) * 50)

            model_id, error = future.result()
            if error:
                failed.append(model_id)
                sys.stderr.write(
                    f"Error downloading {model_id}: {error}\n"
                )
                sys.stderr.flush()
            else:
                emit_progress(progress, f"Downloaded {model_id}")

    return failed


# ── installed.json management ────────────────────────────────────────────


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


# ── Main ─────────────────────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) < 4:
        fail(
            f"Usage: {sys.argv[0]} <bundleId> <manifestPath> <modelsDir>\n"
            f"Got {len(sys.argv) - 1} argument(s)"
        )

    bundle_id = sys.argv[1]
    manifest_path = sys.argv[2]
    models_dir = sys.argv[3]

    # Derive AI dir (parent of models dir)
    ai_dir = os.path.dirname(models_dir)

    # ── Load manifest ────────────────────────────────────────────────────

    emit_progress(0, "Reading manifest...")

    try:
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"Cannot read manifest at {manifest_path}: {e}")

    bundles = manifest.get("bundles", {})
    if bundle_id not in bundles:
        fail(f"Bundle '{bundle_id}' not found in manifest")

    bundle = bundles[bundle_id]
    version = manifest.get("imageVersion", "0.0.0")

    # ── Detect architecture ──────────────────────────────────────────────

    arch = detect_arch()
    emit_progress(1, f"Architecture: {arch}")

    # ── Disk space pre-check ─────────────────────────────────────────────

    check_disk_space(models_dir)

    # ── Install pip packages ─────────────────────────────────────────────

    emit_progress(2, "Installing packages...")
    try:
        install_packages(bundle, arch)
    except RuntimeError as e:
        fail(str(e))

    emit_progress(50, "Packages installed")

    # ── NCCL conflict handling ───────────────────────────────────────────

    handle_nccl_conflict()

    # ── Download models ──────────────────────────────────────────────────

    models = bundle.get("models", [])
    model_ids = [m.get("id", f"model-{i}") for i, m in enumerate(models)]

    emit_progress(50, "Downloading models...")

    os.makedirs(models_dir, exist_ok=True)
    failed = download_models(models, models_dir)

    if failed:
        fail(
            f"Failed to download {len(failed)} model(s): {', '.join(failed)}"
        )

    # ── Write installed.json ─────────────────────────────────────────────

    emit_progress(98, "Finalizing...")

    installed = read_installed(ai_dir)
    installed["bundles"][bundle_id] = {
        "version": version,
        "installedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "models": model_ids,
    }
    write_installed_atomic(ai_dir, installed)

    # ── Report success ───────────────────────────────────────────────────

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
