#!/usr/bin/env bash
# Syncs the version from semantic-release to all workspace package.json files
# and the APP_VERSION constant in shared/constants.ts.
#
# Usage: ./scripts/sync-version.sh <version>
# Example: ./scripts/sync-version.sh 1.2.3

set -euo pipefail

VERSION="${1:?Usage: sync-version.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# All workspace package.json files to sync
PACKAGES=(
  "apps/web/package.json"
  "apps/api/package.json"
  "apps/docs/package.json"
  "packages/shared/package.json"
  "packages/image-engine/package.json"
  "packages/ai/package.json"
)

for pkg in "${PACKAGES[@]}"; do
  FILE="$ROOT/$pkg"
  if [ -f "$FILE" ]; then
    # Use node to update JSON cleanly (preserves formatting better than sed)
    node -e "
      const fs = require('fs');
      const path = '$FILE';
      const raw = fs.readFileSync(path, 'utf8');
      const json = JSON.parse(raw);
      json.version = '$VERSION';
      fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    "
    echo "  Updated $pkg -> $VERSION"
  fi
done

# Update APP_VERSION in shared constants
CONSTANTS="$ROOT/packages/shared/src/constants.ts"
if [ -f "$CONSTANTS" ]; then
  sed -i.bak "s/export const APP_VERSION = \".*\"/export const APP_VERSION = \"$VERSION\"/" "$CONSTANTS"
  rm -f "$CONSTANTS.bak"
  echo "  Updated APP_VERSION -> $VERSION"
fi

echo "All versions synced to $VERSION"
