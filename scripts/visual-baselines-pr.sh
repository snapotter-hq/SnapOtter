#!/usr/bin/env bash
# Hands the PNGs the update-visual-baselines workflow regenerates to a PR, and
# makes sure a failed push can never throw them away (#1506).
#
#   collect <staging-dir> <list-file>
#     Copies every new or modified baseline under tests/e2e/__screenshots__
#     into <staging-dir> with its repo-relative path, so the uploaded artifact
#     unzips straight into a checkout, and writes their paths NUL-separated to
#     <list-file>. Writes count=<n> to $GITHUB_OUTPUT.
#
#   push <list-file>
#     Commits the listed files on top of a freshly fetched tip of $BASE_BRANCH
#     (default main), never on top of the dispatched commit, then pushes
#     $BRANCH and opens a PR. The commit is built with plumbing against a
#     scratch index, so the working tree, and this script, are never touched.
#     Each attempt fetches the tip again, so the base moving between fetch
#     and push costs a retry, not the run. If every attempt fails, the step
#     ends red and names the artifact that holds the PNGs.
#
# Env for push: BRANCH (required), BASE_BRANCH, SOURCE_REF, SOURCE_SHA,
# REGENERATE_OUTCOME, UPDATE_SNAPSHOTS, ARTIFACT_NAME, UPLOAD_OUTCOME,
# RUN_URL, PUSH_ATTEMPTS, RETRY_DELAY.
set -euo pipefail

SCREENSHOTS="tests/e2e/__screenshots__"
TITLE="test(e2e): refresh linux visual baselines"

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  fi
}

list_lines() {
  tr '\0' '\n' < "$1"
}

collect() {
  local dest="$1" list="$2"
  mkdir -p "$dest"
  : > "$list"
  # No --exclude-standard: .gitignore has loose patterns (settings-*.png,
  # layout-*.png) that a new baseline name could match, and a skipped file
  # here is a lost one. -z keeps non-ASCII names unquoted. --modified also
  # reports deletions; --update-snapshots never deletes, so a listed path
  # that isn't on disk is reported and left out. --modified compares
  # contents, not timestamps, so a file rewritten with the same bytes isn't
  # listed (#1705: --update-snapshots=all must not churn untouched PNGs).
  local file raw
  raw="$(mktemp)"
  git ls-files -z --modified --others -- "$SCREENSHOTS" > "$raw"
  sort -zu -o "$raw" "$raw"
  while IFS= read -r -d '' file; do
    if [ ! -f "$file" ]; then
      echo "Not on disk, left out: $file"
      continue
    fi
    mkdir -p "$dest/$(dirname "$file")"
    cp "$file" "$dest/$file"
    printf '%s\0' "$file" >> "$list"
  done < "$raw"
  rm -f "$raw"
  local count
  count=$(tr -cd '\0' < "$list" | wc -c | tr -d ' ')
  echo "count=$count" >> "${GITHUB_OUTPUT:-/dev/null}"
  if [ "$count" = "0" ]; then
    echo "No baseline changes."
    summary "No baseline changes."
    return 0
  fi
  echo "$count new or modified baselines:"
  list_lines "$list"
  summary "### $count new or modified baselines" "" '```' "$(list_lines "$list")" '```'
}

restore_command() {
  echo "gh run download ${GITHUB_RUN_ID:-<run-id>} -n ${ARTIFACT_NAME:-<artifact>} -D ."
}

pr_body() {
  local list="$1"
  echo "Automated baseline refresh from the update-visual-baselines workflow${RUN_URL:+ ($RUN_URL)}."
  echo
  echo "Rendered from \`${SOURCE_REF:-unknown}\` at ${SOURCE_SHA}, committed on top of \`${BASE_BRANCH}\`."
  echo
  case "${UPDATE_SNAPSHOTS:-changed}" in
    all)
      echo "Mode \`all\`: each file listed here is new or came out with different bytes, including changes"
      echo "under the \`maxDiffPixelRatio\` budget that \`changed\` mode lets through. Expect a few files that"
      echo "differ only by render noise of a handful of pixels."
      ;;
    changed)
      echo "Mode \`changed\`: only new baselines and ones that failed their comparison were written, so one"
      echo "that's stale by less than the \`maxDiffPixelRatio\` budget stays as it was. Dispatch with"
      echo "\`update_snapshots: all\` to refresh those too."
      ;;
    *) echo "Mode \`${UPDATE_SNAPSHOTS}\`." ;;
  esac
  if [ "${SOURCE_REF:-}" != "$BASE_BRANCH" ]; then
    echo
    echo "These match \`${SOURCE_REF:-unknown}\`, not \`${BASE_BRANCH}\`, which is why this PR is a draft."
    echo "To apply them to that branch, run this from its checkout root:"
    echo
    echo '```'
    restore_command
    echo '```'
  fi
  if [ "${REGENERATE_OUTCOME:-success}" != "success" ]; then
    echo
    echo "The regenerate step ended \`${REGENERATE_OUTCOME}\`, so some baselines may be missing or rendered"
    echo "from a failing test. Read the run log before trusting this set."
  fi
  echo
  echo "Review the image diffs before merging."
  echo
  echo '```'
  list_lines "$list"
  echo '```'
}

PUSHED=""

# Runs on every exit from push, including a git error under set -e mid-attempt,
# so a failed run always says where its PNGs went.
on_push_exit() {
  local code=$1
  [ "$code" = 0 ] && return 0
  [ -n "$PUSHED" ] && return 0
  if [ "${UPLOAD_OUTCOME:-success}" = "success" ]; then
    echo "::error::Could not push $BRANCH. The regenerated baselines are in the ${ARTIFACT_NAME:-run} artifact."
    summary "### Push failed, baselines kept as an artifact" "" \
      "\`$BRANCH\` was not pushed (the step log has GitHub's reason)." \
      "Every regenerated PNG is in the \`${ARTIFACT_NAME:-run}\` artifact. To apply them, run this from a checkout root:" "" \
      '```' "$(restore_command)" '```'
  else
    echo "::error::Could not push $BRANCH, and the artifact upload ended ${UPLOAD_OUTCOME}, so this run kept no copy of the baselines."
    summary "### Push failed and no artifact" "" \
      "\`$BRANCH\` was not pushed and the artifact upload ended \`${UPLOAD_OUTCOME}\`. Re-run the workflow."
  fi
}

push() {
  local list="$1"
  : "${BRANCH:?BRANCH is required}"
  BASE_BRANCH="${BASE_BRANCH:-main}"
  SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse HEAD)}"
  trap 'on_push_exit $?' EXIT
  local attempts="${PUSH_ATTEMPTS:-3}"
  local delay="${RETRY_DELAY:-10}"
  local index
  index="$(mktemp)"
  local tip="" attempt tree commit
  for attempt in $(seq 1 "$attempts"); do
    echo "Attempt $attempt/$attempts: committing onto the current $BASE_BRANCH tip"
    if git fetch --no-tags --depth=1 origin "$BASE_BRANCH"; then
      tip="$(git rev-parse FETCH_HEAD)"
      rm -f "$index"
      GIT_INDEX_FILE="$index" git read-tree "$tip"
      # --force: a baseline whose name matches a .gitignore pattern still ships.
      GIT_INDEX_FILE="$index" GIT_LITERAL_PATHSPECS=1 \
        git add --force --pathspec-from-file="$list" --pathspec-file-nul
      tree="$(GIT_INDEX_FILE="$index" git write-tree)"
      if [ "$tree" = "$(git rev-parse "$tip^{tree}")" ]; then
        rm -f "$index"
        echo "$BASE_BRANCH at $tip already has every one of these baselines. Nothing to push."
        summary "### Nothing to push" "" "\`$BASE_BRANCH\` at $tip already has every regenerated baseline."
        return 0
      fi
      commit="$(git commit-tree "$tree" -p "$tip" -m "$TITLE")"
      git diff --stat "$tip" "$commit"
      # --force: the branch is unique to this run attempt, and a push that
      # landed but reported an error must not turn every retry into a
      # non-fast-forward.
      if git push --force origin "$commit:refs/heads/$BRANCH"; then
        PUSHED=1
        break
      fi
    fi
    if [ "$attempt" -lt "$attempts" ]; then sleep $((delay * attempt)); fi
  done
  rm -f "$index"
  if [ -z "$PUSHED" ]; then
    echo "Push of $BRANCH failed $attempts times."
    exit 1
  fi

  local draft=()
  if [ "${REGENERATE_OUTCOME:-success}" != "success" ] || [ "${SOURCE_REF:-}" != "$BASE_BRANCH" ]; then
    draft=(--draft)
  fi
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
  collect) collect "${2:?collect needs a staging dir}" "${3:?collect needs a list file}" ;;
  push) push "${2:?push needs the list file}" ;;
  *)
    echo "usage: $0 collect <staging-dir> <list-file> | push <list-file>" >&2
    exit 2
    ;;
esac
