#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Pull nomic-embed-text model on first start (idempotent — Ollama caches).
set -e
echo "Waiting for Ollama healthy..."
until wget -qO- http://localhost:11434/api/tags > /dev/null 2>&1; do sleep 1; done
echo "Pulling nomic-embed-text..."
curl -s http://localhost:11434/api/pull -d '{"name":"nomic-embed-text"}' > /dev/null
echo "Model ready."
