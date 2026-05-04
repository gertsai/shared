/**
 * Built-in diagnostic entries for common infrastructure failures.
 *
 * Auto-registered on import (side-effect) — importing this module
 * populates DiagnosticRegistry with 12 patterns.
 */
import type { DiagnosticEntry } from './types';
import { DiagnosticRegistry } from './registry';

const BUILTINS: DiagnosticEntry[] = [
  // 1. PostgreSQL (Prisma-specific patterns to avoid false positives with generic ECONNREFUSED)
  {
    match:
      /Can't reach database server|P1001|PrismaClientInitializationError|FATAL:\s+password authentication|prisma.*ECONNREFUSED|postgresql.*ECONNREFUSED|connect ECONNREFUSED.*5432/i,
    services: '*',
    component: 'PostgreSQL',
    severity: 'critical',
    fix: ['docker compose up -d postgres'],
    envHint: 'Check DATABASE_URL in .env',
    guide: 'https://www.prisma.io/docs/guides/database/troubleshooting',
  },

  // 2. Redis (BullMQ)
  {
    match: [
      'Redis Client Error',
      'MaxRetriesPerRequestError',
      'connect ECONNREFUSED 127.0.0.1:6379',
      'ERR max number of clients reached',
      'NOAUTH',
    ],
    services: ['queue', 'scheduler', 'job-dispatcher'],
    component: 'Redis (BullMQ)',
    severity: 'critical',
    fix: ['docker compose up -d redis'],
    envHint: 'Check REDIS_URL in .env (default: redis://localhost:6379)',
    guide: 'apps/pipeline/docs/guides/PIPELINE-MOLECULER-USAGE-AI.md',
  },

  // 3. HashiCorp Vault (HSM)
  {
    match:
      /vault.*health.*fail|vault.*seal|vault.*ECONNREFUSED|vault.*unseal|hsm.*connect|vault.*token/i,
    services: ['files', 'oidc'],
    component: 'HashiCorp Vault (HSM)',
    severity: 'critical',
    fix: ['cd infra/vault && docker compose -f docker-compose.persistent.yml up -d'],
    envHint: 'Or set HSM_ENABLED=false in .env to disable encryption',
    guide: 'apps/pipeline/docs/guides/VAULT-HSM-OPERATIONS-GUIDE.md',
  },

  // 4. MinIO / S3
  {
    match: /minio.*ECONNREFUSED|NoSuchBucket|InvalidAccessKeyId|s3.*endpoint|minio.*connect/i,
    services: ['files'],
    component: 'MinIO / S3 Storage',
    severity: 'critical',
    fix: ['docker compose up -d minio'],
    envHint: 'Check S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY in .env',
    guide: 'apps/pipeline/docs/guides/VAULT-HSM-OPERATIONS-GUIDE.md',
  },

  // 5. Milvus
  {
    match: /milvus.*ECONNREFUSED|milvus.*connect|milvus.*timeout|grpc.*milvus/i,
    services: ['vector', 'graph'],
    component: 'Milvus (Vector DB)',
    severity: 'degraded',
    fix: ['docker compose up -d milvus'],
    envHint: 'Vector search will be unavailable. Service can run without it.',
  },

  // 6. FalkorDB
  {
    match: /falkordb.*ECONNREFUSED|falkordb.*connect|redis-graph|falkordb.*timeout/i,
    services: ['graph'],
    component: 'FalkorDB (Graph DB)',
    severity: 'critical',
    fix: ['docker compose up -d falkordb'],
    envHint: 'Check FALKORDB_URL in .env (default: redis://localhost:6381)',
  },

  // 7. OpenFGA
  {
    match: /openfga.*ECONNREFUSED|openfga.*connect|openfga.*timeout|fga.*store/i,
    services: ['admin', 'iam'],
    component: 'OpenFGA (Authorization)',
    severity: 'degraded',
    fix: ['docker compose up -d openfga'],
    envHint: 'Check OPENFGA_API_URL in .env. Role-based access will be degraded.',
    guide: 'packages/auth-openfga/README.md',
  },

  // 8. LiteLLM Proxy
  {
    match: /litellm.*ECONNREFUSED|litellm.*connect|litellm.*timeout|llm.*proxy.*fail/i,
    services: ['llm', 'chat'],
    component: 'LiteLLM Proxy',
    severity: 'degraded',
    fix: ['docker compose up -d litellm'],
    envHint: 'Check LITELLM_URL in .env. AI features will be unavailable.',
    guide: 'infra/litellm/README.md',
  },

  // 9. Encryption Backend
  {
    match: /encryption.*backend|encryption.*not.*configured|ENCRYPTION_BACKEND/i,
    services: ['oidc'],
    component: 'Encryption Backend',
    severity: 'critical',
    fix: ['Set ENCRYPTION_BACKEND=local in .env'],
    envHint: 'For dev, use ENCRYPTION_BACKEND=local (in-memory). Prod requires Vault.',
  },

  // 10. JWT Key Provider
  {
    match: /jwt.*key.*provider|oidc.*key.*provider|key.*provider.*not.*found|ephemeral.*key/i,
    services: ['oidc'],
    component: 'OIDC JWT Key Provider',
    severity: 'critical',
    fix: ['Set OIDC_KEY_PROVIDER=ephemeral in .env'],
    envHint: 'Ephemeral keys work for dev (lost on restart). Prod uses vault provider.',
    guide: 'packages/auth/src/jwt-keys/README.md',
  },

  // 11. Prisma Schema / Migrations (specific Prisma error codes and messages)
  {
    match:
      /PrismaClient(Known|Unknown)RequestError|PrismaClientInitializationError|P[2-4]\d{3}|does not exist in the current database|prisma.*migrate|The table .* does not exist/i,
    services: '*',
    component: 'Prisma Schema / Database Migrations',
    severity: 'critical',
    fix: [
      'pnpm --filter @gertsai/database exec prisma migrate dev',
      'pnpm --filter @gertsai/database exec prisma generate',
    ],
    envHint: 'Database schema may be out of sync. Run migrations first.',
  },

  // 12. Reranker
  {
    match: /reranker.*ECONNREFUSED|reranker.*connect|reranker.*fail|infinity.*rerank/i,
    services: ['vector'],
    component: 'Reranker (Infinity)',
    severity: 'optional',
    fix: ['docker compose up -d infinity'],
    envHint: 'Or set RERANKER_ENABLED=false in .env. Search works without reranking.',
    guide: 'infra/infinity/README.md',
  },
];

// Auto-register on import
DiagnosticRegistry.register(...BUILTINS);
