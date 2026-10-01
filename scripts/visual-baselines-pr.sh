#!/usr/bin/env bash
# Hands the PNGs the update-visual-baselines workflow regenerates to a PR, and
# makes sure a failed push can never throw them away (#1506).
#
#   collect <staging-dir>
#     Copies every new or modified baseline under tests/e2e/__screenshots__
#     into <staging-dir> (repo-relative paths kept, so the uploaded artifact
#     unzips straight into a checkout) and lists them in
#     <staging-dir>/changed-baselines.txt. Writes count=<n> to $GITHUB_OUTPUT.
#
#   push <list-file>
#     Commits the listed files on top of the CURRENT tip of $BASE_BRANCH
#     (default main), never on top of the dispatched commit, then pushes
#     $BRANCH and opens a PR. GitHub refuses a GITHUB_TOKEN push whose branch
#     differs from main under .github/workflows/, which is what happened when
#     main changed a workflow mid-run (or when the run was dispatched on a
#     branch that edits one). A branch that is main's tip plus PNGs never
#     differs there. The commit is built with plumbing against a scratch
#     index, so the working tree, and this script, are never touched. Each
#     attempt refetches the tip, so main moving again between fetch and push
#     costs a retry, not the run.
#
# Env for push: BRANCH (required), BASE_BRANCH, SOURCE_REF, SOURCE_SHA,
# REGENERATE_OUTCOME, ARTIFACT_NAME, RUN_URL, PUSH_ATTEMPTS, RETRY_DELAY.
set -euo pipefail

SCREENSHOTS="tests/e2e/__screenshots__"
TITLE="test(e2e): refresh linux visual baselines"

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  fi
}

collect() {
  local dest="$1"
  local list="$dest/changed-baselines.txt"
  mkdir -p "$dest"
  : > "$list"
  # --modified also reports deletions; --update-snapshots never deletes, and
  # a deleted file has nothing to upload, so only files on disk are kept.
  git ls-files --modified --others --exclude-standard -- "$SCREENSHOTS" | sort -u |
    while IFS= read -r file; do
      [ -f "$file" ] || continue
      mkdir -p "$dest/$(dirname "$file")"
      cp "$file" "$dest/$file"
      printf '%s\n' "$file" >> "$list"
    done
  local count
  count=$(wc -l < "$list" | tr -d ' ')
  echo "count=$count" >> "${GITHUB_OUTPUT:-/dev/null}"
  if [ "$count" = "0" ]; then
    echo "No baseline changes."
    summary "No baseline changes."
    return 0
  fi
  echo "$count new or modified baselines:"
  cat "$list"
  summary "### $count new or modified baselines" "" '```' "$(cat "$list")" '```'
}

pr_body() {
  local list="$1"
  echo "Automated baseline refresh from the update-visual-baselines workflow${RUN_URL:+ ($RUN_URL)}."
  echo
  echo "Rendered from \`${SOURCE_REF:-unknown}\` at ${SOURCE_SHA}, committed on top of \`${BASE_BRANCH}\`."
  echo "If that ref isn't \`${BASE_BRANCH}\`, cherry-pick this commit onto it rather than merging here."
  if [ "${REGENERATE_OUTCOME:-success}" != "success" ]; then
    echo
    echo "The regenerate step ended \`${REGENERATE_OUTCOME}\`, so some baselines may be missing or rendered"
    echo "from a failing test. Read the run log before trusting this set."
  fi
  echo
  echo "Review the image diffs before merging."
  echo
  echo '```'
  cat "$list"
  echo '```'
}

push() {
  local list="$1"
  : "${BRANCH:?BRANCH is required}"
  BASE_BRANCH="${BASE_BRANCH:-main}"
  SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse HEAD)}"
  local attempts="${PUSH_ATTEMPTS:-3}"
  local delay="${RETRY_DELAY:-10}"
  local index
  index="$(mktemp)"
  local pushed="" tip="" attempt
  for attempt in $(seq 1 "$attempts"); do
    echo "Attempt $attempt/$attempts: committing onto the current $BASE_BRANCH tip"
    if git fetch --no-tags --depth=1 origin "$BASE_BRANCH"; then
      tip="$(git rev-parse FETCH_HEAD)"
      rm -f "$index"
      GIT_INDEX_FILE="$index" git read-tree "$tip"
      GIT_INDEX_FILE="$index" GIT_LITERAL_PATHSPECS=1 git add --pathspec-from-file="$list"
      local tree commit
      tree="$(GIT_INDEX_FILE="$index" git write-tree)"
      if [ "$tree" = "$(git rev-parse "$tip^{tree}")" ]; then
        rm -f "$index"
        echo "$BASE_BRANCH at $tip already has every one of these baselines. Nothing to push."
        summary "### Nothing to push" "" "\`$BASE_BRANCH\` at $tip already has every regenerated baseline."
        return 0
      fi
      commit="$(git commit-tree "$tree" -p "$tip" -m "$TITLE")"
      git diff --stat "$tip" "$commit"
      # --force: the branch is unique to this run, and a push that landed but
      # reported an error must not turn every retry into a non-fast-forward.
      if git push --force origin "$commit:refs/heads/$BRANCH"; then
        pushed=1
        break
      fi
    fi
    if [ "$attempt" -lt "$attempts" ]; then sleep $((delay * attempt)); fi
  done
  rm -f "$index"

  if [ -z "$pushed" ]; then
    echo "::error::Push of $BRANCH failed $attempts times. The regenerated baselines are in the ${ARTIFACT_NAME:-run} artifact."
    summary "### Push failed, baselines kept as an artifact" "" \
      "\`git push\` of \`$BRANCH\` failed $attempts times (see the step log for GitHub's reason)." \
      "Every regenerated PNG is in the \`${ARTIFACT_NAME:-run}\` artifact. To apply them, run this from a checkout root:" "" \
      '```' "gh run download ${GITHUB_RUN_ID:-<run-id>} -n ${ARTIFACT_NAME:-<artifact>} -D ." '```'
    return 1
  fi

  local draft=()
  if [ "${REGENERATE_OUTCOME:-success}" != "success" ]; then draft=(--draft); fi
  local url
  if ! url="$(gh pr create ${draft[@]+"${draft[@]}"} --title "$TITLE" --body "$(pr_body "$list")" \
    --base "$BASE_BRANCH" --head "$BRANCH")"; then
    echo "::error::Pushed $BRANCH but could not open its PR."
    summary "### PR not opened" "" "Pushed \`$BRANCH\` onto \`$BASE_BRANCH\` at $tip, but \`gh pr create\` failed. Open it by hand."
    return 1
  fi
  echo "$url"
  summary "### Opened $url" "" "Committed onto \`$BASE_BRANCH\` at $tip."
}

case "${1:-}" in
  collect) collect "${2:?collect needs a staging dir}" ;;
  push) push "${2:?push needs the list file}" ;;
  *)
    echo "usage: $0 collect <staging-dir> | push <list-file>" >&2
    exit 2
    ;;
esac
