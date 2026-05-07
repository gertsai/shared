import { inspect } from 'util';

import { LoggingBunyan } from '@google-cloud/logging-bunyan';
// @ts-expect-error - No types for this package
import HealthCheckMiddleware from '@r2d2bzh/moleculer-healthcheck-middleware';
import merge from 'lodash.merge';
import type { BrokerOptions } from 'moleculer';

import config from '../config';

import logLevel from './logLevel';

/**
 * Optional `@moleculer/workflows` middleware configuration accepted by
 * {@link createMoleculerConfig}. When set, the middleware is lazy-required and
 * pushed onto the broker `middlewares` array; when omitted, no peer-dep is
 * loaded so consumers that do not use workflows pay zero cost.
 */
export interface CreateMoleculerConfigWorkflowsOpts {
  /** Persistence backend for the workflow event log. */
  eventLogStore?: 'redis' | 'memory';
  /** Redis connection details (only used when `eventLogStore === 'redis'`). */
  redis?: { host: string; port?: number; db?: number };
  /** Passthrough for any additional `@moleculer/workflows` options. */
  [key: string]: unknown;
}

/**
 * Options bag for {@link createMoleculerConfig}. Currently only `workflows`
 * is exposed; the rest of the broker config is sourced from `config` env vars.
 */
export interface CreateMoleculerConfigOpts {
  workflows?: CreateMoleculerConfigWorkflowsOpts;
}

let _loggingBunyan: LoggingBunyan | undefined;
const getLoggingBunyan = (): LoggingBunyan => {
  if (!_loggingBunyan) {
    _loggingBunyan = new LoggingBunyan({});
  }
  return _loggingBunyan;
};

export const createGcpLoggerStream = (
  severity: Parameters<LoggingBunyan['stream']>[0] = config.LOGGER_GOOGLE__SEVERITY,
) => getLoggingBunyan().stream(severity);

export const createMoleculerConfig = (
  optionsOverride: BrokerOptions = {},
  opts: CreateMoleculerConfigOpts = {},
): BrokerOptions => {
  const middlewares: unknown[] = [
    config.HEALTHCHECK_ENABLED &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      HealthCheckMiddleware({
        port: config.HEALTHCHECK_PORT,
        readiness: {
          path: config.HEALTHCHECK_READY_PATH,
        },
        liveness: {
          path: config.HEALTHCHECK_LIVE_PATH,
        },
      }),
  ].filter(Boolean);

  if (opts.workflows) {
    // Lazy require so @moleculer/workflows peerDep is only required when feature is used
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wfModule = require('@moleculer/workflows') as {
      Middleware: (opts: unknown) => unknown;
    };
    middlewares.push(wfModule.Middleware(opts.workflows) as never);
  }

  return merge(
    {
      nodeID:
        config.MOLECULER_NODE_ID ??
        `${config.MOLECULER_NODE_NAME ?? 'example-service'}:${String(
          +new Date(),
        ).slice(-5)}`,
      namespace: config.MOLECULER_NAMESPACE || 'orchestra-dev',
      // Logger
      logger: [
        config.LOGGER_GOOGLE && {
          type: 'Bunyan',
          options: {
            colors: false,
            level: config.LOGGER_GOOGLE__SEVERITY,
            bunyan: {
              name: config.MOLECULER_NODE_NAME,
              streams: [
                // { stream: process.stdout, level: config.LOGGER_GOOGLE__SEVERITY },
                getLoggingBunyan().stream(config.LOGGER_GOOGLE__SEVERITY),
              ],
            },
          },
        },
        config.LOGGER_CONSOLE && {
          type: 'Console',
          options: {
            // Logging level
            level: config.LOGGER_CONSOLE__SEVERITY,
            // Using colors on the output
            colors: true,
            // Print module names with different colors (like docker-compose for containers)
            moduleColors: true,
            // Line formatter. It can be "json", "short", "simple", "full", a `Function` or a template string like "{timestamp} {level} {nodeID}/{mod}: {msg}"
            formatter: 'short',
            // Custom object printer. If not defined, it uses the `util.inspect` method.
            objectPrinter: (o: any) =>
              inspect(o, {
                colors: true,
                depth: +(config.LOG_DEPTH ?? 0) || 1,
              }),
            // Auto-padding the module name in order to messages begin at the same column.
            autoPadding: false,
          },
        },
      ].filter(Boolean),
      logLevel,
      // tracing: {
      //   enabled: true,
      //   exporter: 'Console',
      //   events: true,
      //   stackTrace: true,
      // },
      //
      registry: {
        strategy: 'RoundRobin',
        preferLocal: true,
      },
      validator: true,
      bulkhead: {
        enabled: false,
        concurrency: 10,
        maxQueueSize: 100,
      },
      metrics: false,
      circuitBreaker: {
        enabled: true,
        // maxFailures: 1,
        halfOpenTime: 10 * 1000,
        // failureOnTimeout: true,
        // failureOnReject: true,
      },
      requestTimeout: 20 * 1000,
      middlewares,
      transporter:
        config.TRANSPORT_TYPE === 'Local'
          ? null
          : {
              type: config.TRANSPORT_TYPE,
              options:
                config.TRANSPORT_TYPE === 'Redis'
                  ? config.REDIS_CLUSTER
                    ? {
                        sentinels: [
                          {
                            host: config.TRANSPORT_REDIS_HOST,
                            port: config.TRANSPORT_REDIS_PORT,
                          },
                        ],
                        name: config.TRANSPORT_REDIS_CLUSTER_NAME,
                      }
                    : {
                        host: config.TRANSPORT_REDIS_HOST,
                        port: config.TRANSPORT_REDIS_PORT,
                      }
                  : config.TRANSPORT_TYPE === 'Nats'
                    ? {
                        url: config.TRANSPORT_NATS_URL,
                        user: config.TRANSPORT_NATS_USERNAME,
                        pass: config.TRANSPORT_NATS_PASSWORD,
                      }
                    : null,
            },
      cacher: 'Memory',
    } as BrokerOptions,
    optionsOverride,
  );
};
