"""Bundled-model location resolution for sidecar scripts."""
import json
import os
import sys


def ensure_rembg_model_home() -> None:
    """Point rembg at the bundled models when U2NET_HOME is not already set.

    The Docker image bakes U2NET_HOME and the dispatcher setdefaults it (from
    DATA_DIR), but the per-request fallback on native installs has neither,
    and rembg then falls back to ~/.u2net: unwritable (or plain wrong) for
    service users and blind to the models the feature bundle installed
    (Sentry NODE-4W). The Node bridge always provides MODELS_PATH, so
    deriving the home here covers every bridge spawn path; all three
    derivations use setdefault and agree on the default layout.

    A missing MODELS_PATH means the ~/.u2net fallback is about to happen, so
    warn instead of degrading silently.
    """
    models_path = os.getenv("MODELS_PATH")
    if models_path:
        os.environ.setdefault("U2NET_HOME", os.path.join(models_path, "rembg"))
    elif "U2NET_HOME" not in os.environ:
        sys.stderr.write(
            json.dumps(
                {
                    "warning": "MODELS_PATH is not set; rembg will fall back to "
                    "~/.u2net and cannot see bundle-installed models"
                }
            )
            + "\n"
        )
        sys.stderr.flush()
