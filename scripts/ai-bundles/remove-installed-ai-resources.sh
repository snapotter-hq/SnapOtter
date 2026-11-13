#!/usr/bin/env bash
set -e
set -u
cleanup_failed=0
if [[ "${RUN_SCOPE:-}" =~ ^snapotter-ai-[0-9]+-[0-9]+$ ]]; then
  if docker container inspect "${RUN_SCOPE}-app" >/dev/null 2>&1; then
    app_scope="$(
      docker container inspect \
        --format '{{ index .Config.Labels "io.snapotter.qa.scope" }}' \
        "${RUN_SCOPE}-app"
    )"
    if [[ "${app_scope}" == "${RUN_SCOPE}" ]]; then
      docker rm --force "${RUN_SCOPE}-app" || cleanup_failed=1
    else
      echo "::error::Refusing to remove app container without the exact run label"
      cleanup_failed=1
    fi
  fi
  for suffix in postgres redis; do
    name="${RUN_SCOPE}-${suffix}"
    if docker container inspect "${name}" >/dev/null 2>&1; then
      scope="$(
        docker container inspect \
          --format '{{ index .Config.Labels "io.snapotter.qa.scope" }}' \
          "${name}"
      )"
      if [[ "${scope}" == "${RUN_SCOPE}" ]]; then
        docker rm --force "${name}" || cleanup_failed=1
      else
        echo "::error::Refusing to remove ${name} without the exact run label"
        cleanup_failed=1
      fi
    fi
  done

  if docker volume inspect "${RUN_SCOPE}-data" >/dev/null 2>&1; then
    data_scope="$(
      docker volume inspect \
        --format '{{ index .Labels "io.snapotter.qa.scope" }}' \
        "${RUN_SCOPE}-data"
    )"
    if [[ "${data_scope}" == "${RUN_SCOPE}" ]]; then
      docker volume rm "${RUN_SCOPE}-data" || cleanup_failed=1
    else
      echo "::error::Refusing to remove data volume without the exact run label"
      cleanup_failed=1
    fi
  fi
  for suffix in workspace pgdata redisdata; do
    name="${RUN_SCOPE}-${suffix}"
    if docker volume inspect "${name}" >/dev/null 2>&1; then
      scope="$(
        docker volume inspect \
          --format '{{ index .Labels "io.snapotter.qa.scope" }}' \
          "${name}"
      )"
      if [[ "${scope}" == "${RUN_SCOPE}" ]]; then
        docker volume rm "${name}" || cleanup_failed=1
      else
        echo "::error::Refusing to remove ${name} without the exact run label"
        cleanup_failed=1
      fi
    fi
  done

  if docker network inspect "${RUN_SCOPE}-network" >/dev/null 2>&1; then
    network_scope="$(
      docker network inspect \
        --format '{{ index .Labels "io.snapotter.qa.scope" }}' \
        "${RUN_SCOPE}-network"
    )"
    if [[ "${network_scope}" == "${RUN_SCOPE}" ]]; then
      docker network rm "${RUN_SCOPE}-network" || cleanup_failed=1
    else
      echo "::error::Refusing to remove network without the exact run label"
      cleanup_failed=1
    fi
  fi
elif [[ -n "${RUN_SCOPE:-}" ]]; then
  echo "::error::Refusing cleanup for an unsafe run scope"
  cleanup_failed=1
fi
exit "${cleanup_failed}"
