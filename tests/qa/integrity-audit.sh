#!/usr/bin/env bash
# Post-sweep integrity audit against the QA container.
#
# Answers four questions with numbers rather than impressions:
#   1. What did the jobs and audit_log tables end up holding, and does every
#      failed job map to a finding or a documented expected rejection?
#   2. Are any BullMQ queues holding depth, failures or stalled entries?
#   3. Is anything orphaned under uploads/ and outputs/ in the workspace?
#   4. Did scratch and temp get cleaned up?
#
# Usage: tests/qa/integrity-audit.sh [compose-project]
set -uo pipefail

PROJECT="${1:-snapotter-qa-f4c2bde9}"
APP="${PROJECT}-app"
PG="${PROJECT}-postgres"
REDIS="${PROJECT}-redis"

psql() { docker exec "$PG" psql -U snapotter -d snapotter -tAc "$1"; }
redis() { docker exec "$REDIS" redis-cli "$@"; }

echo "=== container identity ==="
docker inspect --format '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}' "$APP" 2>/dev/null \
  || docker inspect --format '{{.Config.Image}} {{.State.Status}}' "$APP"
docker inspect --format 'image-id {{.Image}}' "$APP"

echo
echo "=== jobs: status distribution ==="
psql "select status, count(*) from jobs group by status order by 2 desc"

echo
echo "=== jobs: status by pool ==="
psql "select coalesce(pool,'(null)') as pool, status, count(*) from jobs group by 1,2 order by 1,3 desc"

echo
echo "=== jobs: every failed job, with its error ==="
psql "select id, tool_id, coalesce(pool,'-'), attempts, coalesce(error::text,'(null)') from jobs where status = 'failed' order by created_at"

echo
echo "=== jobs: non-terminal rows older than 5 minutes (must be 0) ==="
psql "select count(*) from jobs where status in ('queued','processing') and created_at < now() - interval '5 minutes'"

echo
echo "=== jobs: currently non-terminal (transient work is fine) ==="
psql "select id, tool_id, status, now()-created_at as age from jobs where status in ('queued','processing') order by created_at"

echo
echo "=== audit_log: action distribution ==="
psql "select action, count(*) from audit_log group by action order by 2 desc limit 40"

echo
echo "=== audit_log: total and time span ==="
psql "select count(*), min(created_at), max(created_at) from audit_log"

echo
echo "=== BullMQ: key counts per pool ==="
for pool in image media ai docs system; do
  for state in wait active delayed failed completed paused; do
    key=$(redis --scan --pattern "*:snapotter:${pool}:${state}" 2>/dev/null | head -1)
    [ -z "$key" ] && key="bull:snapotter:${pool}:${state}"
    n=$(redis llen "$key" 2>/dev/null)
    [ "$n" = "0" ] || [ -z "$n" ] && n=$(redis zcard "$key" 2>/dev/null)
    [ -z "$n" ] && n=0
    printf "  %-8s %-10s %s\n" "$pool" "$state" "$n"
  done
done

echo
echo "=== BullMQ: all queue keys present ==="
redis --scan --pattern "bull:*" 2>/dev/null | sed 's/:[0-9a-f-]\{36\}$//' | sort | uniq -c | sort -rn | head -40

echo
echo "=== BullMQ: stalled sets (must all be 0) ==="
for pool in image media ai docs system; do
  for k in $(redis --scan --pattern "*${pool}*stalled*" 2>/dev/null); do
    printf "  %-50s %s\n" "$k" "$(redis scard "$k" 2>/dev/null)"
  done
done

echo
echo "=== workspace: uploads/ and outputs/ ==="
docker exec "$APP" sh -lc '
  W="${WORKSPACE_PATH:-/tmp/workspace}"
  echo "workspace root: $W"
  for d in uploads outputs; do
    if [ -d "$W/$d" ]; then
      printf "  %-9s dirs=%s files=%s bytes=%s\n" "$d" \
        "$(find "$W/$d" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")" \
        "$(find "$W/$d" -type f | wc -l | tr -d " ")" \
        "$(du -sb "$W/$d" 2>/dev/null | cut -f1)"
    else
      echo "  $d: absent"
    fi
  done
  echo "  oldest upload dirs:"; find "$W/uploads" -mindepth 1 -maxdepth 1 -type d -mmin +60 2>/dev/null | head -10
'

echo
echo "=== workspace: job-id directories with no jobs row (orphans) ==="
docker exec "$APP" sh -lc 'W="${WORKSPACE_PATH:-/tmp/workspace}"; for d in uploads outputs; do find "$W/$d" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sed "s/^/$d /"; done' \
  > /tmp/qa-workspace-dirs.txt
psql "select id from jobs" > /tmp/qa-job-ids.txt
awk '{print $2}' /tmp/qa-workspace-dirs.txt | sort -u > /tmp/qa-ws-ids.txt
sort -u /tmp/qa-job-ids.txt > /tmp/qa-db-ids.txt
echo "  workspace job dirs: $(wc -l < /tmp/qa-ws-ids.txt | tr -d ' ')"
echo "  jobs rows:          $(wc -l < /tmp/qa-db-ids.txt | tr -d ' ')"
echo "  dirs with no matching jobs row:"
comm -23 /tmp/qa-ws-ids.txt /tmp/qa-db-ids.txt | head -20
echo "  (count: $(comm -23 /tmp/qa-ws-ids.txt /tmp/qa-db-ids.txt | wc -l | tr -d ' '))"

echo
echo "=== scratch and temp ==="
docker exec "$APP" sh -lc '
  S="${SCRATCH_PATH:-/tmp/snapotter-scratch}"
  echo "scratch root: $S"
  [ -d "$S" ] && echo "  entries: $(find "$S" -mindepth 1 -maxdepth 1 | wc -l | tr -d " ")" || echo "  absent"
  echo "  /tmp entries: $(find /tmp -mindepth 1 -maxdepth 1 | wc -l | tr -d " ")"
  find /tmp -mindepth 1 -maxdepth 1 -name "*snapotter*" -o -mindepth 1 -maxdepth 1 -name "qa-*" 2>/dev/null | head -10
'

echo
echo "=== user_files and preferences ==="
psql "select count(*) from user_files"
psql "select count(*) from user_preferences"

echo
echo "=== container error log tail ==="
docker logs --since 2h "$APP" 2>&1 | grep -iE '"level":(50|60)|ERROR|FATAL|unhandled' | tail -25
echo "  (error-level log lines in the last 2h: $(docker logs --since 2h "$APP" 2>&1 | grep -ciE '"level":(50|60)|ERROR|FATAL'))"
