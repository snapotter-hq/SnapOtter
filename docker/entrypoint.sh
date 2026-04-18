#!/bin/sh
set -e

# Apply auth defaults at runtime so they are never baked into image layers.
# Users can override any of these via -e flags at docker run time.
export AUTH_ENABLED="${AUTH_ENABLED:-true}"
export DEFAULT_USERNAME="${DEFAULT_USERNAME:-admin}"
export DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-admin}"

# Download ML models on first container start when BAKE_MODELS=false (default).
# When BAKE_MODELS=true was used at build time, /opt/models/.complete already
# exists and this block is skipped. Models are written to the /opt/models
# persistent volume so they survive restarts without re-downloading.
_download_models() {
  if [ ! -f /opt/models/.complete ]; then
    echo "=== First run: downloading ML models to /opt/models (~6 GB, may take several minutes) ==="
    CUDA_VISIBLE_DEVICES="" /opt/venv/bin/python3 /opt/ashim/download_models.py
    touch /opt/models/.complete
    echo "=== Model download complete ==="
  fi
}

# Fix ownership of mounted volumes so the non-root ashim user can write.
# This runs as root, fixes permissions, then drops to ashim via gosu.
if [ "$(id -u)" = "0" ]; then
  chown -R ashim:ashim /data /tmp/workspace /opt/models 2>&1 || \
    echo "WARNING: Could not fix volume permissions. Use named volumes (not Windows bind mounts) to avoid this. See docs for details." >&2
  gosu ashim sh -c '
    if [ ! -f /opt/models/.complete ]; then
      echo "=== First run: downloading ML models to /opt/models (~6 GB, may take several minutes) ==="
      CUDA_VISIBLE_DEVICES="" /opt/venv/bin/python3 /opt/ashim/download_models.py
      touch /opt/models/.complete
      echo "=== Model download complete ==="
    fi
  '
  exec gosu ashim "$@"
fi

# Already running as ashim (e.g. Kubernetes runAsUser)
_download_models
exec "$@"
