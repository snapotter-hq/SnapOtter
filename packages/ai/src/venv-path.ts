import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The one venv the AI sidecar runs from and bundle installs write into.
 * PYTHON_VENV_PATH wins (the Docker image always sets it). Without it, a
 * checkout's own .venv is used when present, otherwise /opt/venv, where native
 * and LXC installs keep their venv. The API route, feature-status, the bridge
 * and install_feature.py (via the installer env) all read this so they cannot
 * pick different Pythons.
 */
export function resolveAiVenvPath(): string {
  const configured = process.env.PYTHON_VENV_PATH;
  if (configured) return configured;
  const checkoutVenv = resolve(__dirname, "../../../.venv");
  return existsSync(checkoutVenv) ? checkoutVenv : "/opt/venv";
}
