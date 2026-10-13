#!/bin/bash
H=/Users/sidd/Desktop/Personal/Projects/SnapOtter/.claude/scripts/fix-issue
W=/Users/sidd/Desktop/Personal/Projects/SnapOtter/fix-2424
$H/remote.sh run $W "issue #2424 e2e" -- "$(cat $H/with-e2e-infra.sh)
pnpm exec playwright install chromium >/dev/null 2>&1;
pnpm playwright test tests/e2e/meme-generator-layout.spec.ts --project=chromium"
