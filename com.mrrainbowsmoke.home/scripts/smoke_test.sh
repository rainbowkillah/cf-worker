#!/usr/bin/env bash
set -euo pipefail

# Simple smoke test for the root endpoint. Exits non-zero if status != 200.
URL="https://home-mrrainbowsmoke.64zgd764sm.workers.dev"

echo "Checking $URL ..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
echo "HTTP status: $HTTP_STATUS"

if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "Smoke test failed: expected 200, got $HTTP_STATUS"
  exit 2
fi

echo "Smoke test passed."
