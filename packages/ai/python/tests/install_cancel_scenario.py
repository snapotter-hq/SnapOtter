"""Drive install_feature.py's cancel path (issue #4763).

tests/unit/features/install-feature-cancel.test.ts spawns
`python3 install_cancel_scenario.py <installer.py> <scenario> <ai_dir>`, waits
for READY on stdout, and sends the signal the test names: SIGINT is the
server's cancel, SIGTERM its watchdog. Scenarios:
  - download: the download is in flight with resume sidecars and a staging tree
    on disk, and the venv writer lock is free.
  - venv-write: the same, but the installer holds the venv writer lock.
  - keep-local: remove_cancelled_install_files with an admin-supplied archive.

No pytest import in this module, on purpose: the CI runners have no pytest."""

import importlib.util
import json
import os
import signal
import sys
import time

BUNDLE = "demo"


def load_installer(path):
    spec = importlib.util.spec_from_file_location("install_feature_cancel_target", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def tar_path(installer, ai_dir):
    return os.path.join(ai_dir, "staging", f"{BUNDLE}-{installer.detect_arch()}.tar.gz")


def leave_partial_install(installer, ai_dir):
    archive = tar_path(installer, ai_dir)
    os.makedirs(os.path.dirname(archive), exist_ok=True)
    for path in (archive + ".partial", archive + ".meta"):
        with open(path, "w") as f:
            f.write("x")
    staging = os.path.join(ai_dir, f"staging-{BUNDLE}")
    os.makedirs(staging, exist_ok=True)
    with open(os.path.join(staging, "bundle.json"), "w") as f:
        f.write("{}")


def run_install(installer, ai_dir, hold_venv_lock):
    models_dir = os.path.join(ai_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    manifest_path = os.path.join(ai_dir, "manifest.json")
    arch = installer.detect_arch()
    with open(manifest_path, "w") as f:
        json.dump(
            {"bundles": {BUNDLE: {"archives": {arch: {"file": "demo.tar.gz", "sha256": "0"}}}}},
            f,
        )

    def stalled_download(*_args, **_kwargs):
        leave_partial_install(installer, ai_dir)
        if hold_venv_lock:
            installer._venv_lock_held[0] = True
        print("READY", flush=True)
        while True:
            time.sleep(0.05)

    installer.ensure_hf_hub = lambda _venv_path: None
    installer.download_and_verify = stalled_download
    sys.argv = [installer.__file__, BUNDLE, manifest_path, models_dir]
    signal.signal(signal.SIGINT, installer._on_cancel_signal)
    installer.main()


def main():
    installer = load_installer(sys.argv[1])
    scenario = sys.argv[2]
    ai_dir = sys.argv[3]
    if scenario == "keep-local":
        leave_partial_install(installer, ai_dir)
        archive = tar_path(installer, ai_dir)
        with open(archive, "w") as f:
            f.write("x")
        installer.remove_cancelled_install_files(ai_dir, BUNDLE, keep_path=archive)
        print(json.dumps({"kept": os.path.exists(archive)}))
        return
    run_install(installer, ai_dir, hold_venv_lock=scenario == "venv-write")


if __name__ == "__main__":
    main()
