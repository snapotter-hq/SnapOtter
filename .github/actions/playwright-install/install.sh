#!/usr/bin/env bash
# Browser binaries come from Playwright's CDN (usually a cache hit); only
# install-deps talks to apt. Splitting them keeps a degraded apt mirror
# (#876) from wasting the browser download, and the bounded retry keeps a
# stalled mirror from eating the whole job budget.
set -euo pipefail

read -r -a browsers <<< "$BROWSERS"

pnpm playwright install "${browsers[@]}"

for attempt in 1 2; do
  if timeout -k 30 "${DEPS_TIMEOUT:-420}" pnpm playwright install-deps "${browsers[@]}"; then
    exit 0
  fi
  echo "::warning::playwright install-deps stalled or failed (attempt ${attempt}/2)"
  # timeout kills the pnpm tree, but the sudo apt-get underneath can survive
  # as an orphan and hold the dpkg lock into the retry.
  sudo pkill -9 -x apt-get 2>/dev/null || true
  sudo pkill -9 -x dpkg 2>/dev/null || true
  sleep 2
  sudo dpkg --configure -a || true
done
exit 1
