/**
 * m9s-example — main entry point.
 *
 * Boot sequence:
 *   1. Build broker config (composition/broker.ts)
 *   2. Register services + wire adapters (composition/services.ts)
 *   3. Start broker via ApiController.Start, attaching the API gateway
 *
 * Run with:
 *   pnpm --filter @gertsai-examples/m9s-example run build
 *   pnpm --filter @gertsai-examples/m9s-example run start
 *
 * Then try:
 *   curl -X POST http://localhost:3000/api/v1/ingest \
 *        -H 'content-type: application/json' \
 *        -d '{"docId":"d1","text":"Hexagonal architecture isolates the core."}'
 *
 *   curl -X POST http://localhost:3000/api/v1/search \
 *        -H 'content-type: application/json' \
 *        -d '{"query":"hexagonal"}'
 */
import { ApiController } from '@gertsai/api-core';

import { createBrokerConfig } from './composition/broker';
import { registerServices } from './composition/services';
import ApiService from './mol-services/api.service';

async function main(): Promise<void> {
  // 1. Wire the adapters and register inbound actions BEFORE starting the broker.
  registerServices();

  // 2. Build broker config (cacher, transporter, etc.).
  const brokerConfig = createBrokerConfig();

  // 3. Start the broker. ApiController.Start handles service-schema generation
  //    for every controller registered in registerServices().
  const replEnabled = process.argv.includes('--repl');
  const broker = await ApiController.Start({
    brokerConfig,
    services: [ApiService],
    repl: replEnabled,
  });

  broker.logger.info(
    `[m9s-example] broker ready, services: ${broker.services.map((s) => s.fullName ?? s.name).join(', ')}`,
  );

  // Graceful shutdown — important so ts-node-dev / nodemon restart cleanly
  // and so the in-memory cache cleanup timer is released.
  const shutdown = async (signal: string): Promise<void> => {
    broker.logger.info(`[m9s-example] received ${signal}, shutting down...`);
    try {
      await broker.stop();
      process.exit(0);
    } catch (err) {
      broker.logger.error('[m9s-example] error during shutdown', err);
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

// Only run when executed directly. Allows tests to import this file without
// triggering broker startup as a side effect.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[m9s-example] startup failed:', err);
    process.exit(1);
  });
}

export { main };
