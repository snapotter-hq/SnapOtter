#!/bin/bash
set -e

echo "=== Step 1: Stop existing container ==="
docker stop SnapOtter 2>/dev/null || true
docker rm SnapOtter 2>/dev/null || true

echo "=== Step 2: Start test container ==="
docker run -d \
  --name SnapOtter-test \
  -p 1349:1349 \
  -e AUTH_ENABLED=true \
  -e DEFAULT_USERNAME=admin \
  -e DEFAULT_PASSWORD=admin \
  -e LOG_LEVEL=debug \
  -e RATE_LIMIT_PER_MIN=50000 \
  -e SKIP_MUST_CHANGE_PASSWORD=true \
  snapotter:test-fixes

echo "=== Step 3: Wait for container to be healthy ==="
echo "Waiting for health check..."
for i in $(seq 1 60); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' SnapOtter-test 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "Container is healthy after ${i}0 seconds"
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "Container is unhealthy!"
    docker logs SnapOtter-test --tail 50
    exit 1
  fi
  echo "  Status: $STATUS (${i}0s elapsed)"
  sleep 10
done

echo "=== Step 4: Run Playwright tests ==="
npx playwright test --config playwright.docker.config.ts --reporter=list 2>&1

TEST_EXIT=$?

echo "=== Step 5: Check Docker logs for errors ==="
echo "--- Container logs (last 50 lines) ---"
docker logs SnapOtter-test --tail 50

echo "=== Step 6: Cleanup ==="
docker stop SnapOtter-test
docker rm SnapOtter-test

# Restart original container
echo "=== Restarting original SnapOtter container ==="
docker start SnapOtter 2>/dev/null || true

exit $TEST_EXIT
