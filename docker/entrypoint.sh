#!/bin/sh
set -e

# Apply auth defaults at runtime so they are never baked into image layers.
# Users can override any of these via -e flags at docker run time.
export AUTH_ENABLED="${AUTH_ENABLED:-true}"
export DEFAULT_USERNAME="${DEFAULT_USERNAME:-admin}"
export DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-admin}"

# Fix ownership of mounted volumes so the non-root ashim user can write.
# This runs as root, fixes permissions, then drops to ashim via gosu.
if [ "$(id -u)" = "0" ]; then
  chown -R ashim:ashim /data /tmp/workspace 2>&1 || \
    echo "WARNING: Could not fix volume permissions. Use named volumes (not Windows bind mounts) to avoid this. See docs for details." >&2
  exec gosu ashim "$@"
fi

# Already running as ashim (e.g. Kubernetes runAsUser)
exec "$@"
