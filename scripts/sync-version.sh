#!/usr/bin/env bash
# Syncs the version from semantic-release to all workspace package.json files
# and the APP_VERSION constant in shared/constants.ts.
#
# Usage: ./scripts/sync-version.sh <version>
# Example: ./scripts/sync-version.sh 1.2.3

set -euo pipefail

VERSION="${1:?Usage: sync-version.sh <version>}"
if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
  echo "Invalid semantic version: $VERSION" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# All workspace package.json files to sync
PACKAGES=(
  "apps/web/package.json"
  "apps/api/package.json"
  "apps/demo/package.json"
  "apps/docs/package.json"
  "apps/landing/package.json"
  "packages/shared/package.json"
  "packages/doc-engine/package.json"
  "packages/enterprise/package.json"
  "packages/image-engine/package.json"
  "packages/media-engine/package.json"
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

# Keep the release-specific commands in every published documentation locale
# aligned with the tag and immutable artifact names created by this release.
node "$ROOT/scripts/sync-published-docs-version.mjs" "$VERSION"

# Archive optional custom notes under their immutable release version before the
# semantic-release git plugin commits and tags them. This makes a tag-only retry
# able to reconstruct the exact draft body and published docs changelog.
node "$ROOT/scripts/manage-release-notes.mjs" archive "$VERSION" --root "$ROOT" >/dev/null
if [ -f "$ROOT/.release-notes/v$VERSION.md" ]; then
  PREVIOUS_TAG="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
  if [[ ! "$PREVIOUS_TAG" =~ ^v(.+)$ ]]; then
    echo "Cannot update the published changelog without a previous release tag" >&2
    exit 1
  fi
  node "$ROOT/scripts/manage-release-notes.mjs" sync-docs "$VERSION" "${PREVIOUS_TAG#v}" \
    --root "$ROOT" >/dev/null
fi

echo "All versions synced to $VERSION"
