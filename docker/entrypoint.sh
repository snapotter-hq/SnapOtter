#!/bin/sh
set -e

# Apply auth defaults at runtime so they are never baked into image layers.
# Users can override any of these via -e flags at docker run time.
export AUTH_ENABLED="${AUTH_ENABLED:-true}"
export DEFAULT_USERNAME="${DEFAULT_USERNAME:-admin}"
export DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-admin}"

# Clean up any interrupted bootstrap from a previous start
AI_VENV="/data/ai/venv"
AI_VENV_TMP="/data/ai/venv.bootstrapping"

if [ -d "$AI_VENV_TMP" ]; then
  echo "Cleaning up interrupted venv bootstrap..."
  rm -rf "$AI_VENV_TMP"
fi

# Bootstrap AI venv from base image on first run
if [ ! -d "$AI_VENV" ] && [ -d "/opt/venv" ]; then
  echo "Bootstrapping AI venv from base image..."
  mkdir -p /data/ai/models /data/ai/pip-cache
  cp -r /opt/venv "$AI_VENV_TMP"
  mv "$AI_VENV_TMP" "$AI_VENV"
  echo "AI venv ready at $AI_VENV"
fi

# Fix ownership of mounted volumes so the non-root snapotter user can write.
# This runs as root, fixes permissions, then drops to snapotter via gosu.
if [ "$(id -u)" = "0" ]; then
  # PUID/PGID support: remap the snapotter user/group to match host UID/GID.
  # This prevents permission conflicts when using bind mounts.
  PUID="${PUID:-$(id -u snapotter)}"
  PGID="${PGID:-$(id -g snapotter)}"

  if [ "$PUID" = "0" ] || [ "$PGID" = "0" ]; then
    echo "WARNING: PUID=0 or PGID=0 would run the app as root. Ignoring — using default snapotter UID/GID." >&2
    PUID=$(id -u snapotter)
    PGID=$(id -g snapotter)
  fi

  CUR_UID=$(id -u snapotter)
  CUR_GID=$(id -g snapotter)

  if [ "$CUR_UID" != "$PUID" ] || [ "$CUR_GID" != "$PGID" ]; then
    # Evict any conflicting user/group that holds the target UID/GID.
    # Delete user first (may cascade-delete its primary group).
    if [ "$CUR_UID" != "$PUID" ]; then
      EXISTING_USER=$(getent passwd "$PUID" 2>/dev/null | cut -d: -f1 || true)
      if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "snapotter" ]; then
        deluser "$EXISTING_USER" 2>/dev/null || userdel "$EXISTING_USER" 2>/dev/null || true
      fi
    fi
    if [ "$CUR_GID" != "$PGID" ]; then
      EXISTING_GROUP=$(getent group "$PGID" 2>/dev/null | cut -d: -f1 || true)
      if [ -n "$EXISTING_GROUP" ] && [ "$EXISTING_GROUP" != "snapotter" ]; then
        delgroup "$EXISTING_GROUP" 2>/dev/null || groupdel "$EXISTING_GROUP" 2>/dev/null || true
      fi
      groupmod -g "$PGID" snapotter 2>/dev/null || true
    fi
    if [ "$CUR_UID" != "$PUID" ]; then
      usermod -u "$PUID" snapotter 2>/dev/null || true
    fi
  fi

  # Chown writable directories (/data is the persistent volume, /tmp/workspace is ephemeral).
  # /app and /opt/venv are read-only at runtime — no chown needed.
  chown -R snapotter:snapotter /data /tmp/workspace 2>&1 || \
    echo "WARNING: Could not fix volume permissions. Use named volumes (not Windows bind mounts) to avoid this. See docs for details." >&2

  exec gosu snapotter "$@"
fi

# Already running as snapotter (e.g. Kubernetes runAsUser)
exec "$@"
