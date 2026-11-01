#!/usr/bin/env bash
# Fails the release before semantic-release tags it when EXPECTED_VERSION is set
# and differs from the computed version. An unset or empty EXPECTED_VERSION
# skips the check.
#
# Usage: EXPECTED_VERSION=1.2.3 ./scripts/check-expected-version.sh <next-version>

set -euo pipefail

NEXT_VERSION="${1:?Usage: check-expected-version.sh <next-version>}"
EXPECTED="${EXPECTED_VERSION:-}"
EXPECTED="${EXPECTED#v}"

if [[ -z "$EXPECTED" ]]; then
  exit 0
fi

if [[ "$EXPECTED" != "$NEXT_VERSION" ]]; then
  echo "::error::semantic-release computed v${NEXT_VERSION}, but the expected version is v${EXPECTED}. Nothing was tagged." >&2
  exit 1
fi

echo "Next release v${NEXT_VERSION} matches the expected version."
