#!/usr/bin/env bash

# Container resource readings shared by the benchmark scripts.
#
# `docker stats` prints MemUsage with a unit ("512MiB / 6GiB", "1.68GiB / 6GiB").
# Stripping the unit and calling the number MB reports a 1.68 GiB container as
# 1.68 MB, which is exactly how a memory leak hides inside a green benchmark row.

# Memory used by a container, in MiB. Emits 0 when the reference is empty or
# `docker stats` produces nothing, so a caller can always treat it as a number.
docker_mem_mb() {
  local ref="$1"
  if [ -z "$ref" ]; then echo "0"; return; fi
  docker stats "$ref" --no-stream --format "{{.MemUsage}}" 2>/dev/null \
    | awk -F/ '{
        value = $1
        unit = "MiB"
        if (match(value, /[KMGT]i?B/)) unit = substr(value, RSTART, RLENGTH)
        gsub(/[^0-9.]/, "", value)
        if (value + 0 <= 0) { print 0; exit }
        factor = 1
        if (unit ~ /^G/) factor = 1024
        else if (unit ~ /^T/) factor = 1048576
        else if (unit ~ /^K/) factor = 1 / 1024
        else if (unit ~ /^B/) factor = 1 / 1048576
        printf "%.2f\n", value * factor
      }' \
    | { read -r reading || reading=""; echo "${reading:-0}"; }
}

# CPU percentage for a container as a bare number.
docker_cpu_pct() {
  local ref="$1"
  if [ -z "$ref" ]; then echo "0"; return; fi
  docker stats "$ref" --no-stream --format "{{.CPUPerc}}" 2>/dev/null | tr -d '%' \
    | { read -r reading || reading=""; echo "${reading:-0}"; }
}
