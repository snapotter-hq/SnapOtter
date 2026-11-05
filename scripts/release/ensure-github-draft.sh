#!/usr/bin/env bash
# The "Ensure exact GitHub draft" step of the release job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

# Resolve the release by numeric id, never by tag. GitHub's
# /releases/tags/{tag} endpoint returns 404 for a draft, and
# draftRelease is on, so a tag lookup here would 404 on the release
# semantic-release just created and take the whole job down with it.
# gh release view reads drafts, and /releases/{id} then returns the
# same REST shape a tag lookup would.
resolve_release_id() {
  gh release view "v${VERSION}" \
    --repo "${GITHUB_REPOSITORY}" \
    --json databaseId \
    --jq .databaseId 2>/dev/null
}

release_id="$(resolve_release_id || true)"
if [[ ! "${release_id}" =~ ^[0-9]+$ ]]; then
  gh release create "v${VERSION}" \
    --repo "${GITHUB_REPOSITORY}" \
    --draft \
    --verify-tag \
    --title "v${VERSION}" \
    --notes-file /tmp/release-notes.md
  release_id="$(resolve_release_id)"
fi
[[ "${release_id}" =~ ^[0-9]+$ ]] || {
  echo "::error::Could not resolve the GitHub release id for v${VERSION}"
  exit 1
}

release_endpoint="repos/${GITHUB_REPOSITORY}/releases/${release_id}"
gh api "${release_endpoint}" > /tmp/release.json
jq -e --arg tag "v${VERSION}" \
  '.draft == true and .tag_name == $tag' /tmp/release.json >/dev/null || {
  echo "::error::Expected release is missing, public, or bound to the wrong tag"
  exit 1
}

# Normalize both first-run and recovered drafts to the committed body.
gh release edit "v${VERSION}" \
  --repo "${GITHUB_REPOSITORY}" \
  --notes-file /tmp/release-notes.md
gh api "${release_endpoint}" > /tmp/release.json
node --input-type=module - /tmp/release.json /tmp/release-notes.md <<'NODE'
import { readFileSync } from "node:fs";

const [releasePath, notesPath] = process.argv.slice(2);
const release = JSON.parse(readFileSync(releasePath, "utf8"));
const expected = readFileSync(notesPath, "utf8");
if (release.draft !== true || release.body !== expected) {
  throw new Error("GitHub draft body differs from committed release notes");
}
NODE
