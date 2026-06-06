#!/bin/sh
set -e

# --- Docker secret file convention (_FILE suffix) ---
# For each supported var, if VAR_FILE is set, read the secret from that file
# path into VAR. This lets users mount Docker/Kubernetes secrets instead of
# passing credentials as plain-text environment variables.
#
# Supported: DEFAULT_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
#            OIDC_CLIENT_SECRET, COOKIE_SECRET, SNAPOTTER_LICENSE_KEY
resolve_file_env() {
  var="$1"
  file_var="${var}_FILE"
  eval current_val="\"\${${var}:-}\""
  eval file_path="\"\${${file_var}:-}\""

  if [ -z "$file_path" ]; then
    return
  fi

  if [ -n "$current_val" ]; then
    echo "WARNING: Both $var and $file_var are set. $file_var takes precedence." >&2
  fi

  if [ ! -f "$file_path" ] || [ ! -r "$file_path" ]; then
    echo "ERROR: $file_var points to '$file_path' but the file does not exist or is not readable." >&2
    exit 1
  fi

  # Command substitution strips trailing newlines (standard for secret files)
  export "$var"="$(cat "$file_path")"
  unset "$file_var"
}

resolve_file_env DEFAULT_PASSWORD
resolve_file_env S3_ACCESS_KEY_ID
resolve_file_env S3_SECRET_ACCESS_KEY
resolve_file_env OIDC_CLIENT_SECRET
resolve_file_env COOKIE_SECRET
resolve_file_env SNAPOTTER_LICENSE_KEY

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

print_banner() {
  RST='\033[0m'
  printf '\n'
  printf '  \033[1;36m🦦 SnapOtter%b\n' "$RST"
  printf '  \033[2m────────────────────────────────────────%b\n' "$RST"
  printf '\n'
  printf '  \033[32m➜%b  Open   \033[1;4mhttp://localhost:%s%b\n' "$RST" "${PORT:-1349}" "$RST"
  printf '  \033[33m➜%b  Login  \033[1m%s%b / \033[1m[CHANGE ON FIRST LOGIN]%b\n' "$RST" "${DEFAULT_USERNAME}" "$RST" "$RST"
  printf '  \033[36m➜%b  Docs   \033[2mhttps://docs.snapotter.com%b\n' "$RST" "$RST"
  printf '\n'
}

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

  # Ensure all writable subdirectories exist before chown
  mkdir -p /data/files /data/ai/models /data/ai/pip-cache /data/ai/venv /tmp/workspace

  # Chown writable directories (/data is the persistent volume, /tmp/workspace is ephemeral).
  # /app and /opt/venv are read-only at runtime -- no chown needed.
  chown -R snapotter:snapotter /data /tmp/workspace 2>&1 || \
    echo "WARNING: Could not fix volume permissions. Use named volumes (not Windows bind mounts) to avoid this. See docs for details." >&2

  print_banner
  exec gosu snapotter "$@"
fi

# Already running as snapotter (e.g. Kubernetes runAsUser)
print_banner
exec "$@"
