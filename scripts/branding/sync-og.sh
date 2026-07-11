#!/usr/bin/env bash
# Propagate the canonical social card to the app OG-image locations.
# Run after regenerating branding/social-preview.png.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/branding/social-preview.png"
cp "$src" "$root/apps/landing/public/og-image.png"
cp "$src" "$root/apps/web/public/og-image.png"
cp "$src" "$root/apps/docs/public/og-image.png"
echo "synced social-preview.png -> apps/{landing,web,docs}/public/og-image.png"
