#!/bin/sh
set -e

# Reseed /data/ai/venv from the image's baked /opt/venv (base packages only:
# numpy, Pillow, opencv). A raw venv copy is not relocatable -- console
# scripts and pyvenv.cfg keep the source path -- so rewrite_venv_paths (from
# entrypoint-lib.sh) patches those after the copy.
#
# Used from two places: entrypoint.sh calls this on first boot / when the
# base venv's stamp changed, and the "Reset AI Environment" admin route
# (apps/api/src/lib/feature-status.ts resetAiEnvironment()) calls this after
# wiping /data/ai/venv, so existing installs stuck with a stale/conflicting
# venv (uninstall alone only removes model weights, never the shared
# site-packages) have a real, working venv to reinstall bundles into
# afterward instead of an empty directory with no python3 binary.
. /usr/local/bin/entrypoint-lib.sh

AI_VENV="/data/ai/venv"
AI_VENV_TMP="/data/ai/venv.bootstrapping"

if [ ! -d "/opt/venv" ]; then
  echo "reseed-ai-venv: no base venv at /opt/venv to seed from" >&2
  exit 1
fi

if [ -d "$AI_VENV_TMP" ]; then
  rm -rf "$AI_VENV_TMP"
fi

mkdir -p /data/ai/models /data/ai/pip-cache
rm -rf "$AI_VENV"
cp -r /opt/venv "$AI_VENV_TMP"
mv "$AI_VENV_TMP" "$AI_VENV"
rewrite_venv_paths "$AI_VENV" "/opt/venv" "$AI_VENV"
echo "AI venv seeded at $AI_VENV"
