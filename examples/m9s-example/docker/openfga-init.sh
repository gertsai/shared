#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Bootstrap OpenFGA store + model + tuples (delegates to scripts/openfga-bootstrap.ts).
set -e
echo "Waiting for OpenFGA healthy..."
until wget -qO- http://localhost:8080/healthz | grep -q SERVING; do sleep 1; done
echo "Running openfga-bootstrap..."
cd /workspace
pnpm --filter @gertsai-examples/m9s-example exec ts-node --transpile-only scripts/openfga-bootstrap.ts
