#!/usr/bin/env bash
set -e
set -euo pipefail
RUN_SCOPE="snapotter-ai-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
[[ "${RUN_SCOPE}" =~ ^snapotter-ai-[0-9]+-[0-9]+$ ]] || {
  echo "::error::Unsafe installed-AI run scope"
  exit 1
}
QA_PASSWORD="$(openssl rand -hex 24)"
echo "::add-mask::${QA_PASSWORD}"
echo "RUN_SCOPE=${RUN_SCOPE}" >> "${GITHUB_ENV}"
echo "QA_PASSWORD=${QA_PASSWORD}" >> "${GITHUB_ENV}"

docker network create \
  --label "io.snapotter.qa.scope=${RUN_SCOPE}" \
  "${RUN_SCOPE}-network"
for suffix in data workspace pgdata redisdata; do
  docker volume create \
    --label "io.snapotter.qa.scope=${RUN_SCOPE}" \
    "${RUN_SCOPE}-${suffix}"
done

docker run --detach \
  --name "${RUN_SCOPE}-postgres" \
  --label "io.snapotter.qa.scope=${RUN_SCOPE}" \
  --network "${RUN_SCOPE}-network" \
  --network-alias postgres \
  --env POSTGRES_USER=snapotter \
  --env "POSTGRES_PASSWORD=${QA_PASSWORD}" \
  --env POSTGRES_DB=snapotter \
  --volume "${RUN_SCOPE}-pgdata:/var/lib/postgresql/data" \
  postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193

docker run --detach \
  --name "${RUN_SCOPE}-redis" \
  --label "io.snapotter.qa.scope=${RUN_SCOPE}" \
  --network "${RUN_SCOPE}-network" \
  --network-alias redis \
  --volume "${RUN_SCOPE}-redisdata:/data" \
  redis:8-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005 \
  redis-server --maxmemory-policy noeviction --maxmemory 512mb \
    --appendonly yes --requirepass "${QA_PASSWORD}"

dependencies_ready=false
for _attempt in $(seq 1 90); do
  if docker exec "${RUN_SCOPE}-postgres" \
    pg_isready -U snapotter -d snapotter >/dev/null 2>&1 \
    && docker exec "${RUN_SCOPE}-redis" \
      redis-cli -a "${QA_PASSWORD}" --no-auth-warning ping 2>/dev/null \
      | grep -qx PONG; then
    dependencies_ready=true
    break
  fi
  sleep 2
done
[[ "${dependencies_ready}" == "true" ]] || {
  echo "::error::Production dependencies did not become ready"
  exit 1
}

docker run --detach \
  --name "${RUN_SCOPE}-app" \
  --label "io.snapotter.qa.scope=${RUN_SCOPE}" \
  --network "${RUN_SCOPE}-network" \
  --publish 127.0.0.1::1349 \
  --env AUTH_ENABLED=true \
  --env DEFAULT_USERNAME=admin \
  --env "DEFAULT_PASSWORD=${QA_PASSWORD}" \
  --env SKIP_MUST_CHANGE_PASSWORD=true \
  --env SNAPOTTER_GPU=0 \
  --env "DATABASE_URL=postgres://snapotter:${QA_PASSWORD}@postgres:5432/snapotter" \
  --env "REDIS_URL=redis://:${QA_PASSWORD}@redis:6379" \
  --env PROCESSING_TIMEOUT_S=0 \
  --env RATE_LIMIT_PER_MIN=1000 \
  --volume "${RUN_SCOPE}-data:/data" \
  --volume "${RUN_SCOPE}-workspace:/tmp/workspace" \
  "ghcr.io/snapotter-hq/snapotter@sha256:${IMAGE_DIGEST}"

mapfile -t port_bindings < <(docker port "${RUN_SCOPE}-app" 1349/tcp)
[[ ${#port_bindings[@]} -eq 1 \
  && "${port_bindings[0]}" =~ ^127\.0\.0\.1:([1-9][0-9]{0,4})$ ]] || {
    echo "::error::Production app did not publish one loopback-only dynamic port"
    exit 1
  }
QA_PORT="${BASH_REMATCH[1]}"
(( QA_PORT <= 65535 )) || {
  echo "::error::Docker returned an invalid published port"
  exit 1
}
echo "QA_BASE_URL=http://127.0.0.1:${QA_PORT}" >> "${GITHUB_ENV}"
