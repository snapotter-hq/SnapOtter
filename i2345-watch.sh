#!/bin/bash
while true; do
  if grep -q "SUITE_DONE" /Users/sidd/Desktop/Personal/Projects/SnapOtter/.git/fix-issue/runs/2345-20261013-230514.log; then
    echo "Suite finished."
    exit 0
  fi
  sleep 10
done
