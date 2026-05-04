#!/usr/bin/env bash
# Smoke test for m9s-example. Run after `pnpm run start` is up on :3000.
#
# Usage:
#   bash scripts/smoke.sh
#   PORT=4000 bash scripts/smoke.sh
set -euo pipefail

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}/api/v1"

echo "==> Ingesting d1"
curl -fsS -X POST "${BASE}/ingest/document" \
  -H 'content-type: application/json' \
  -d '{
    "docId": "d1",
    "text": "Hexagonal architecture isolates the core from infrastructure. Ports describe the seams. Adapters fulfil them.",
    "metadata": { "tags": ["arch", "ddd"], "author": "demo" }
  }' | jq .

echo
echo "==> Ingesting d2"
curl -fsS -X POST "${BASE}/ingest/document" \
  -H 'content-type: application/json' \
  -d '{
    "docId": "d2",
    "text": "Moleculer is a microservices framework for Node.js. It supports caching, tracing, and circuit breakers."
  }' | jq .

echo
echo "==> Search: hexagonal"
curl -fsS -X POST "${BASE}/search/query" \
  -H 'content-type: application/json' \
  -d '{ "query": "hexagonal", "topK": 3 }' | jq .

echo
echo "==> Search: moleculer caching"
curl -fsS -X POST "${BASE}/search/query" \
  -H 'content-type: application/json' \
  -d '{ "query": "moleculer caching" }' | jq .

echo
echo "==> Done."
