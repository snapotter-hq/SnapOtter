#!/usr/bin/env bash
# Runs docker/docker-compose.test.yml's test-unit and then test-e2e against one
# Postgres and Redis, exits with the first failing suite's code, and always
# tears the stack down. This is `pnpm test:docker`. The nightly Docker
# Container E2E job runs test-unit alone (its later steps read the stack's
# logs, so it skips the down).
#
# Each step is its own compose call. A whole-stack `up` left test-e2e in
# Created once test-unit failed and never returned (#5001), and with
# --exit-code-from it stopped Postgres and Redis the moment test-unit exited,
# so test-e2e ran against nothing and its exit code was dropped (#5087).

set -uo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker/docker-compose.test.yml"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

run_suites() {
  compose build test-unit test-e2e || return
  compose up --detach --wait postgres redis || return
  compose run --rm test-unit || return
  compose run --rm test-e2e
}

run_suites
status=$?
compose down --volumes --remove-orphans
exit "$status"
