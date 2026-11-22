#!/usr/bin/env bash
# Runs the test-unit service of docker/docker-compose.test.yml against its
# Postgres and Redis, exits with test-unit's code, and always tears the stack
# down. This is `pnpm test:docker`; the nightly Docker Container E2E job runs
# the same `up` (its later steps read the stack's logs, so it skips the down).
#
# Naming test-unit keeps compose from creating test-e2e at all. A whole-stack
# `up` left test-e2e in Created once test-unit failed (its depends_on can no
# longer be met), and compose then never returned (#5001). In-container e2e is
# #5087.

set -uo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker/docker-compose.test.yml"

docker compose -f "$COMPOSE_FILE" up --build --exit-code-from test-unit test-unit
status=$?
docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
exit "$status"
