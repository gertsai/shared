/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { SubscriptionOptions } from '@google-cloud/pubsub';
import type { OrchestraSession } from '@gertsai/core';
import { UserType, defaultSession } from '@gertsai/core';
import {
  bootPubsubSubscriptions,
  createPubsubServiceMethods,
  createSubscriberSchemaFragment,
  stopPubsubSubscriptions,
} from '@gertsai/api-pubsub';
import {
  bootQueueWorkers,
  createQueueSchemaFragment,
  createQueueServiceMethods,
  stopQueueWorkers,
  stopQueues,
} from '@gertsai/api-queue';
import { createLogger, type Logger as GertsLogger } from '@gertsai/logger-factory';
import { buildTraceparent } from '@gertsai/otel/moleculer';
import color from 'colorts';
import type Moleculer from 'moleculer';
import type { BrokerOptions, LoggerInstance, ServiceSchema } from 'moleculer';
import { ServiceBroker } from 'moleculer';

import config from '../../config';
import type { MoleculerWorkflowSchema } from '../../moleculer/workflow/adapter';
import {
  REGISTER_WORKFLOW,
  type ApiControllerInternalHook,
} from '../../moleculer/workflow/setWorkflows';
import { ResponseCode } from '../apiResponse';
import type { ContextMeta, TypiaValidator } from '../common';
import {
  coerceQueryParams,
  smartCoerce,
  isTypiaParamsWithSchema,
  getValidator,
  type ActionParams,
  type TypiaParamsWithSchema,
} from '../common';
import { APIError } from '../error';

import type {
  ActionAuthType,
  ActionHandler,
  ActionOptions,
  ApiControllerActions,
  ApiControllerConfigOptions,
  ApiControllerOptions,
  ApiControllerQueues,
  ApiControllerRegisteredAction,
  ApiControllerRegisteredQueue,
  ApiControllerSubscribedTopics,
  ApiControllerSubscriptions,
  CoreServiceSchema,
  LifecycleHandler,
  LifecycleHandlerContext,
  QueueHandler,
  QueueOptions,
  QueueProcessingStatus,
  QueueTraceContext,
  RestConfig,
  ServiceContextBase,
  ServiceNameToPath,
  SubscribeHandler,
  SubscribeOptions,
} from './types';

/**
 * Helper function for better types check
 * @param data
 * @param code
 * @param message
 */
const respond = <C>(data: C, message?: string, code?: ResponseCode) => ({
  data,
  code,
  message,
});

/**
 * Simple fallback logger for use before MoleculerJS Broker is available.
 *
 * Wave 15.C (PRD-052 FR-003): delegates to `@gertsai/logger-factory.createLogger`
 * with a `LogContext` that records the service identity. The returned object
 * adapts the structured `Logger` API back to the variadic `LoggerInstance`
 * shape that Moleculer ships, so calling code stays unchanged. Default-on
 * redaction from `@gertsai/logger-factory` (per ADR-009 I-17) now protects
 * the fallback log path against accidental secret-leaks.
 */
const createSimpleFallbackLogger = (
  serviceName: string,
  serviceVersion: string,
): LoggerInstance => {
  const structured: GertsLogger = createLogger({
    baseContext: { service: `${serviceVersion}.${serviceName}` },
  });

  // The Moleculer `LoggerInstance` is variadic — first arg is the "message",
  // remaining args become structured context. Reduce them into a single
  // record so `redactDetails` can scrub keys recursively.
  const adapt =
    (level: keyof GertsLogger) =>
    (...args: any[]): void => {
      const [first, ...rest] = args;
      const msg = typeof first === 'string' ? first : '';
      const detailsPayload = typeof first === 'string' ? rest : args;
      const ctx =
        detailsPayload.length > 0
          ? { args: detailsPayload as readonly unknown[] }
          : undefined;
      // `level` is narrowed to a callable LogLevel method on the structured
      // logger; the indirection is to keep one factory for all 6 levels.
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      (structured[level] as any).call(structured, msg, ctx);
    };

  return {
    fatal: adapt('fatal'),
    error: adapt('error'),
    warn: adapt('warn'),
    info: adapt('info'),
    debug: adapt('debug'),
    trace: adapt('trace'),
  };
};

/**
 * ApiController - Main class for registering actions, queues, and subscriptions.
 *
 * @template ServiceVersion - Service version (e.g., 'v1')
 * @template ServiceName - Service name (e.g., 'graph')
 * @template ServiceContext - Custom service context type for typed access to service properties
 *
 * @example
 * ```typescript
 * // Define your service context
 * interface GraphServiceContext extends ServiceContextBase {
 *   graphStore: CypherGraphStore;
 *   graphRAG: GraphRAG;
 *   ontologyCache: Map<string, any>;
 * }
 *
 * // Create typed controller
 * const controller = ApiController.resolveController<
 *   'v1',
 *   'graph',
 *   GraphServiceContext
 * >('v1', 'graph');
 *
 * // Initialize in started handler
 * controller.addStartedHandler(async (ctx) => {
 *   ctx.service.graphStore = new CypherGraphStore({ ... });
 *   ctx.service.graphRAG = new GraphRAG({ ... });
 * });
 *
 * // Access typed service in actions
 * controller.register('query', {
 *   async handler(ctx) {
 *     const { graphStore, graphRAG } = ctx.service;  // Fully typed!
 *   }
 * });
 * ```
 */
export class ApiController<
  ServiceVersion extends string,
  ServiceName extends string,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
  TMeta extends Record<string, any> = ContextMeta,
> implements ApiControllerInternalHook {
  /**
   * Reference to the broker instance for accessing broker logger
   * @private
   */
  private static _broker: ServiceBroker | undefined;

  /**
   * Whether BullMQ workers should be created (API Gateway mode = false)
   * @private
   */
  private static _workersEnabled = true;

  /**
   * List of enabled worker queue names (if null, all workers are enabled when _workersEnabled=true)
   * @private
   */
  private static _enabledWorkers: Set<string> | null = null;

  /**
   * Start the broker and load the services
   * @param brokerConfig - The broker configuration
   * @param services - Additional services to load
   * @param repl - Whether to start the repl
   * @param enabledServices - Optional list of service names to load (e.g., ['v1.queue', 'v1.admin']).
   *                          If undefined, all registered services are loaded.
   * @returns The broker
   *
   * @example
   * ```typescript
   * // Load all services (default)
   * ApiController.Start({ brokerConfig, services: [ApiService] });
   *
   * // Load only specific services (for worker nodes)
   * ApiController.Start({
   *   brokerConfig,
   *   services: [ApiService],
   *   enabledServices: ['v1.queue', 'v1.llm', 'v1.graph'],
   * });
   *
   * // API Gateway mode: services without workers (jobs go to Redis, not processed locally)
   * ApiController.Start({
   *   brokerConfig,
   *   services: [ApiService],
   *   enabledServices: ['v1.admin', 'v1.files'],
   *   workersEnabled: false,
   * });
   *
   * // Worker mode: workers only (process jobs from Redis)
   * ApiController.Start({
   *   brokerConfig,
   *   services: [],  // No API service
   *   enabledServices: ['v1.queue', 'v1.llm', 'v1.graph'],
   *   workersEnabled: true,
   * });
   *
   * // Selective workers: only specific queue workers
   * ApiController.Start({
   *   brokerConfig,
   *   services: [ApiService],
   *   enabledServices: ['v1.queue'],
   *   enabledWorkers: ['gerts-jobs'],  // Only gerts-jobs, not iam-jobs
   * });
   * ```
   */
  public static Start({
    brokerConfig,
    services,
    repl = true,
    enabledServices,
    workersEnabled = true,
    enabledWorkers,
    replOptions,
  }: {
    brokerConfig: BrokerOptions;
    services: ServiceSchema[];
    repl?: boolean;
    /** Service names to load (e.g., 'v1.queue'). If undefined, all services are loaded. */
    enabledServices?: string[];
    /** Enable BullMQ workers. Set to false for API Gateway mode (jobs added but not processed). Default: true */
    workersEnabled?: boolean;
    /** Specific worker queue names to enable (e.g., ['gerts-jobs', 'iam-jobs']). If undefined, all workers are enabled. */
    enabledWorkers?: string[];
    /** Options passed to broker.repl (e.g., customCommands, delimiter) */
    replOptions?: Record<string, unknown>;
  }) {
    // Store workersEnabled for use in service started() handlers
    ApiController._workersEnabled = workersEnabled;
    ApiController._enabledWorkers = enabledWorkers?.length ? new Set(enabledWorkers) : null;
    const loadServices = (broker: ServiceBroker) => {
      const controllers = ApiController.controllers;
      const enabled = enabledServices?.length ? new Set(enabledServices) : null;

      for (const [fullName, controller] of Object.entries(controllers)) {
        // Skip services not in enabledServices (if specified)
        if (enabled && !enabled.has(fullName)) {
          broker.logger.info(`⏭️  Skipping service: ${fullName} (not in SERVICES)`);
          continue;
        }
        broker.createService(controller.generateServiceSchema());
      }

      services.forEach((service) => {
        broker.createService(service);
      });
    };

    const broker = new ServiceBroker(brokerConfig);

    // Save broker reference to access its logger
    ApiController._broker = broker;

    if (replOptions) {
      const opts = replOptions as { customCommands?: unknown; delimiter?: unknown };
      if (opts.customCommands) broker.options.replCommands = opts.customCommands as any;
      if (typeof opts.delimiter === 'string') broker.options.replDelimiter = opts.delimiter;
    }

    loadServices(broker);

    return broker.start().then(() => {
      if (repl) {
        broker.repl(replOptions as any);
      }

      return broker;
    });
  }

  private static _config: ApiControllerConfigOptions = {
    sessionFactory: (user_uuid: string, user_type: UserType) =>
      defaultSession(user_uuid, user_type, 'api', 'v0.0.0'),
  };

  static configure(options: ApiControllerConfigOptions) {
    this._config = { ...options };
  }

  /**
   * List of registered controllers
   * @private
   */
  private static _controllers: Record<string, ApiController<string, string>> = {};

  public static get controllers() {
    return this._controllers;
  }

  /**
   * Resolve globally registered controller by service name and version.
   *
   * @template V - Service version (e.g., 'v1')
   * @template N - Service name (e.g., 'graph')
   * @template S - Custom service context type (optional, defaults to ServiceContextBase)
   *
   * @param version - Service version
   * @param name - Service name
   * @returns ApiController instance with typed service context
   *
   * @example
   * ```typescript
   * // Without custom context (backward compatible)
   * const controller = ApiController.resolveController('v1', 'users');
   *
   * // With custom context for typed access
   * interface GraphServiceContext extends ServiceContextBase {
   *   graphStore: CypherGraphStore;
   *   graphRAG: GraphRAG;
   * }
   *
   * const controller = ApiController.resolveController<
   *   'v1',
   *   'graph',
   *   GraphServiceContext
   * >('v1', 'graph');
   * ```
   */
  static resolveController<
    V extends string,
    N extends string,
    S extends ServiceContextBase = ServiceContextBase,
    M extends Record<string, any> = ContextMeta,
  >(version: V, name: N): ApiController<V, N, S, M> {
    // @ts-ignore
    return (ApiController._controllers[`${version}.${name}`] ??= new ApiController({
      name,
      version,
    }));
  }

  /**
   * Get a system session for unauthenticated requests
   * @returns Session
   */
  static getSystemSession() {
    return ApiController._config.sessionFactory('system', UserType.BOT);
  }

  /**
   * Get a session for given user
   * @param user_uuid - User UUID
   * @param user_type - User type
   * @returns Session
   */
  static getSession(user_uuid: string, user_type: UserType) {
    return ApiController._config.sessionFactory(user_uuid, user_type);
  }

  /**
   * Controller options
   * @private
   */
  private _options: ApiControllerOptions<ServiceVersion, ServiceName>;

  /**
   * Logger instance (available after service starts)
   * @private
   */
  private _logger: LoggerInstance | undefined;

  /**d
   * List of registered actions
   * @private
   */
  private _registeredActions: ApiControllerActions = {};

  /**
   * List of registered queues
   * @private
   */
  private _registeredQueues: ApiControllerQueues = {};

  /**
   * List of subscribed topics
   * @private
   */
  private _subscribedTopics: ApiControllerSubscriptions = {};

  /**
   * List of started handlers
   * @private
   */
  private _startedHandlers: Array<LifecycleHandler<ServiceVersion, ServiceName, ServiceContext>> =
    [];

  /**
   * List of stopped handlers
   * @private
   */
  private _stoppedHandlers: Array<LifecycleHandler<ServiceVersion, ServiceName, ServiceContext>> =
    [];

  constructor(options: ApiControllerOptions<ServiceVersion, ServiceName>) {
    // Duplicate options to prevent ability of modifying passed object
    this._options = { ...options };
    // Logger will be set during service start or via broker
    this._logger = undefined;
  }

  /**
   * Set service dependencies.
   * Moleculer will wait for these services before calling started handler.
   *
   * @param dependencies - Array of service names or dependency objects
   *
   * @example
   * ```typescript
   * // Wait for queue service before starting
   * controller.setDependencies(['v1.queue']);
   *
   * // Object form with version
   * controller.setDependencies([{ name: 'queue', version: 'v1' }]);
   * ```
   */
  setDependencies(
    dependencies: NonNullable<ApiControllerOptions<ServiceVersion, ServiceName>['dependencies']>,
  ): void {
    this._options = { ...this._options, dependencies };
  }

  /**
   * Set REST base path for moleculer-web autoAliases.
   * When set, moleculer-web uses this as base path instead of 'version.name'.
   *
   * @param basePath - Base path for REST routes (use '/' to avoid path duplication)
   *
   * @example
   * ```typescript
   * // Route is '/api/v1/queue', service is 'v1.queue'
   * // Without restBasePath: autoAliases generates /api/v1/queue/v1/queue/...
   * // With restBasePath '/': autoAliases generates /api/v1/queue/...
   * controller.setRestBasePath('/');
   * ```
   */
  setRestBasePath(basePath: string): void {
    this._options = { ...this._options, restBasePath: basePath };
  }

  /**
   * Moleculer channels for reliable messaging via Redis Streams.
   * @private
   */
  private _channels: Record<string, unknown> = {};

  /**
   * Set channels for moleculer-channels middleware.
   * Enables at-least-once message delivery via Redis Streams.
   *
   * @param channels - Channel handlers object (same format as Moleculer service schema)
   *
   * @example
   * ```typescript
   * controller.setChannels({
   *   'queue.job.completed': {
   *     group: 'etl-workers',
   *     maxRetries: 3,
   *     deadLettering: { enabled: true, queueName: 'dlq.queue.job.completed' },
   *     context: true,
   *     async handler(ctx) {
   *       // Handle job completion
   *     },
   *   },
   * });
   * ```
   */
  setChannels(channels: Record<string, unknown>): void {
    this._channels = { ...this._channels, ...channels };
  }

  /**
   * Pending workflows, keyed by registration name.
   * Populated via the Symbol-keyed `[REGISTER_WORKFLOW]` hook (used by the
   * `setWorkflows()` helper), consumed by {@link _attachWorkflowsToServices}
   * at schema-build time so the `@moleculer/workflows` middleware can pick
   * them up during broker start.
   * @private
   */
  private _pendingWorkflows: Map<string, MoleculerWorkflowSchema> = new Map();

  /**
   * @internal Used by `setWorkflows()` helper. NOT a public API.
   *
   * Symbol-keyed (Sprint 3.0.1, F-1) so the property does not appear as a
   * callable string-keyed member on the emitted `.d.ts` (tsup with
   * `dts: true` exposes every `public` method regardless of `@internal`
   * JSDoc). External callers MUST go through `setWorkflows(controller, defs)`.
   */
  [REGISTER_WORKFLOW](name: string, schema: MoleculerWorkflowSchema): void {
    this._pendingWorkflows.set(name, schema);
  }

  /**
   * Attach pending workflows onto the synthesized Moleculer service schema.
   * No-op when no workflows were registered. Mutates `synthSchema` in place
   * to add a `workflows` block (mirrors `@moleculer/workflows` contract).
   *
   * Sprint 3.0.1 (F-10): `CoreServiceSchema` declares `workflows` as an
   * optional field, so the previous `as unknown as { workflows: ... }` cast
   * is no longer needed.
   * @private
   */
  private _attachWorkflowsToServices(synthSchema: CoreServiceSchema): void {
    if (this._pendingWorkflows.size === 0) return;
    const workflowsBlock: Record<string, MoleculerWorkflowSchema> = {};
    for (const [name, schema] of this._pendingWorkflows) {
      workflowsBlock[name] = schema;
    }
    synthSchema.workflows = workflowsBlock;
  }

  /**
   * Add a handler to be called when the service starts.
   * Use this to initialize your custom service context properties.
   *
   * @param handler - Function to be called on service start
   *
   * @example
   * ```typescript
   * controller.addStartedHandler(async (ctx) => {
   *   // Initialize your service context
   *   ctx.service.graphStore = new CypherGraphStore({ ... });
   *   ctx.service.ontologyCache = new Map();
   *   ctx.logger?.info('Service initialized');
   * });
   * ```
   */
  addStartedHandler(handler: LifecycleHandler<ServiceVersion, ServiceName, ServiceContext>): void {
    this._startedHandlers.push(handler);
  }

  /**
   * Add a handler to be called when the service stops.
   * Use this to cleanup your custom service context resources.
   *
   * @param handler - Function to be called on service stop
   *
   * @example
   * ```typescript
   * controller.addStoppedHandler(async (ctx) => {
   *   // Cleanup resources
   *   await ctx.service.graphStore?.close();
   *   ctx.service.ontologyCache?.clear();
   *   ctx.logger?.info('Service stopped');
   * });
   * ```
   */
  addStoppedHandler(handler: LifecycleHandler<ServiceVersion, ServiceName, ServiceContext>): void {
    this._stoppedHandlers.push(handler);
  }

  /**
   * Register an action
   * @param actionName
   * @param actionOptions
   */
  register<
    ActionName extends string,
    AuthType extends ActionAuthType,
    // Support both legacy TypiaValidator<T> and new TypiaParamsWithSchema<T>
    ParamsValidator extends ActionParams<any>,
    // Infer ParamsType from either format
    ParamsType extends ParamsValidator extends TypiaValidator<infer T>
      ? T
      : ParamsValidator extends TypiaParamsWithSchema<infer T>
        ? T
        : never,
    ResponseValidator extends TypiaValidator<any>,
    ResponseType extends ResponseValidator extends TypiaValidator<infer T> ? T : never,
    Rest extends RestConfig<any, any> | undefined = undefined,
    // Pass ServiceContext and TMeta from class to ActionHandler for proper type inference
    Handler extends ActionHandler<AuthType, ParamsType, ResponseType, ServiceContext, TMeta> =
      ActionHandler<AuthType, ParamsType, ResponseType, ServiceContext, TMeta>,
  >(
    actionName: ActionName,
    actionOptions: ActionOptions<
      AuthType,
      ParamsValidator,
      ParamsType,
      ResponseValidator,
      ResponseType,
      Rest,
      ServiceContext,
      TMeta,
      Handler
    >,
  ): ApiControllerRegisteredAction<
    `${ServiceVersion}.${ServiceName}.${ActionName}`,
    Rest extends undefined
      ? undefined
      : Rest extends RestConfig<infer Method, infer Path>
        ? Path extends ''
          ? `${Method} /${ServiceVersion}/${ServiceNameToPath<ServiceName>}`
          : `${Method} /${ServiceVersion}/${ServiceNameToPath<ServiceName>}/${Path}`
        : never,
    AuthType,
    ParamsType,
    ResponseType,
    Rest,
    ParamsValidator
  > {
    if (this._registeredActions[actionName]) {
      throw new Error(`Action '${actionName}' is already registered in this controller`);
    }

    const path = `${this._options.version}.${this._options.name}.${actionName}` as const;

    let rest = actionOptions.rest
      ? typeof actionOptions.rest === 'object'
        ? `${actionOptions.rest.method} /${this._options.version}/${this._options.name}${actionOptions.rest.path}`
        : actionOptions.rest.split(' ').join(` /${this._options.version}/${this._options.name}`)
      : undefined;

    if (rest?.endsWith('/') && rest.length > 0) {
      rest = rest.slice(0, -1);
    }

    return (this._registeredActions[actionName] = {
      name: actionName,
      // @ts-expect-error - rest type inference is complex
      rest,
      path,
      // Copy actionOptions to prevent modifying them
      // Type is validated at call site, safe to cast here
      options: { ...actionOptions } as any,
    });
  }

  /**
   * Register an queue
   * @param queueName
   * @param handlers
   * @param on
   */
  registerWorker<
    QueueName extends string,
    Name extends string,
    Concurrency extends number,
    Handler extends QueueHandler,
    QueueStatusType extends QueueProcessingStatus,
  >(
    queueName: QueueName,
    handlers: QueueOptions<Name, Concurrency, Handler> | QueueOptions<Name, Concurrency, Handler>[],
    on?: QueueStatusType,
  ): ApiControllerRegisteredQueue<QueueName, Concurrency, QueueStatusType> {
    const optionsArray = Array.isArray(handlers) ? handlers : [handlers];

    if (this._registeredQueues[queueName]) {
      this._registeredQueues[queueName].handlers.push(...optionsArray);
    } else {
      this._registeredQueues[queueName] = {
        name: queueName,
        // Copy queueOptions to prevent modifying them
        handlers: optionsArray.map((optionsArray) => ({ ...optionsArray })),
        on,
      };
    }
    return this._registeredQueues[queueName];
  }

  /**
   * Subscribe on topic
   * @param topicName
   * @param subscriptionOptions
   */
  subscribeOnTopic<
    TopicName extends string,
    SubscriptionName extends string,
    Options extends SubscriptionOptions,
    Handler extends SubscribeHandler,
    QueueStatusType extends QueueProcessingStatus,
  >(
    topicName: TopicName,
    subscriptionOptions?: SubscribeOptions<SubscriptionName, Options, Handler, QueueStatusType>,
  ): ApiControllerSubscribedTopics<TopicName, Options> {
    if (this._subscribedTopics[topicName]) {
      throw new Error(`Subscription on '${topicName}' is already registered in this controller`);
    }

    return (this._subscribedTopics[topicName] = {
      topicName: topicName,
      // Copy queueOptions to prevent modifying them
      // @ts-ignore
      options: { ...subscriptionOptions },
    });
  }

  /**
   * Create MoleculerJS service action schema
   * based on provided actionOptions
   * @param action - registered action
   */
  private _createActionSchema(action: ApiControllerRegisteredAction<any, any, any, any, any, any>) {
    return {
      rest: action.options.rest,
      // Pass auth and scopes for auth-moleculer middleware
      auth: action.options.auth,
      scopes: action.options.scopes,
      handler: async function (this: Moleculer.Service, ctx: Moleculer.Context<any, ContextMeta>) {
        let session: OrchestraSession | undefined;

        try {
          const params = ctx.meta.$params ? ctx.meta.$params : ctx.params;

          const file = ctx.meta.$params ? ctx.params : null;
          const fileMeta = ctx.meta.$params
            ? {
                // @ts-ignore
                fieldname: ctx.meta.fieldname,
                // @ts-ignore
                filename: ctx.meta.filename,
                // @ts-ignore
                mimetype: ctx.meta.mimetype,
                // @ts-ignore
                encoding: ctx.meta.encoding,
              }
            : {};

          if (ctx.meta.$multipart) {
            Object.assign(params, ctx.meta.$multipart);
          }

          // Coerce query params for endpoints that receive params via URL query string
          // (GET and DELETE — both use query strings, not request body)
          const restConfig = action.options.rest;
          const isQueryStringEndpoint =
            typeof restConfig === 'string'
              ? restConfig.startsWith('GET ') || restConfig.startsWith('DELETE ')
              : restConfig?.method === 'GET' || restConfig?.method === 'DELETE';

          if (isQueryStringEndpoint) {
            const actionParams = action.options.params;

            if (isTypiaParamsWithSchema(actionParams)) {
              // New format: use schema-based smart coercion
              smartCoerce(params as Record<string, unknown>, {
                numericFields: actionParams.numericFields,
                booleanFields: actionParams.booleanFields,
                arrayFields: actionParams.arrayFields,
              });
            } else {
              // Legacy format: use hard-coded list for backward compatibility
              coerceQueryParams(params as Record<string, unknown>);
            }
          }

          // Auto-inject tenantId from meta into params for REST calls.
          // OpenAPI generator omits tenantId from the public spec (clients never send it),
          // but Typia validators require it. Inject from meta so validation passes.
          const meta = ctx.meta as Record<string, unknown>;
          if (meta?.tenantId && !(params as Record<string, unknown>).tenantId) {
            (params as Record<string, unknown>).tenantId = meta.tenantId;
          }

          // Get validator (supports both legacy and new format)
          const validator = getValidator(action.options.params);
          const requestIsValid = validator(params);

          if (!requestIsValid.success) {
            throw new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, requestIsValid.errors);
          }

          if (action.options.auth === 'required' || action.options.auth === 'optional') {
            if (action.options.auth === 'required' && !ctx.meta.user_uuid) {
              this.logger?.error(
                'Cannot call an action with required authorization. No user found in meta',
                action,
              );

              throw new APIError(ResponseCode.NOT_AUTHORIZED);
            }

            if (ctx.meta.user_uuid && ctx.meta.user_type) {
              session = ApiController._config.sessionFactory(
                ctx.meta.user_uuid,
                ctx.meta.user_type,
              );
            }
          }

          // Extract trace context for auto-injection into jobs.
          // Wave 15.C (PRD-052 FR-004): delegated to
          // `@gertsai/otel/moleculer.buildTraceparent` — identical W3C
          // semantics (00-traceId-spanId-01 with non-zero enforcement),
          // now centrally maintained alongside `withMoleculerTracing`.
          const traceContext: QueueTraceContext | undefined = buildTraceparent({
            ...(ctx.requestID !== undefined && { requestID: ctx.requestID }),
            ...(ctx.id !== undefined && { id: ctx.id }),
            ...(ctx.parentID !== undefined && { parentID: ctx.parentID }),
            ...(ctx.tracing !== undefined && { tracing: ctx.tracing }),
          });

          const { code, message, data, raw } = await action.options.handler.call(this, {
            session,
            // Raw Moleculer context (for broker.call, meta, etc.)
            ctx,
            // Typed service with custom context
            service: this,
            params,
            // Wrap addJob to auto-inject trace context (user can override)
            addJob: (name: string, jobName: string, payload: any, opts: any) =>
              this.addJob(name, jobName, { _traceContext: traceContext, ...payload }, opts),
            getQueue: this.getQueue,
            files: file
              ? [
                  {
                    stream: file,
                    meta: fileMeta,
                  },
                ]
              : [],
            call: (...args: [string, Record<string, any>]) =>
              ctx.call(...args).then((res: any) => res.data),
            logger: this.logger,
            respond,
          });

          // Raw response mode: return data directly without Orchestra wrapping
          // Used for streaming responses (SSE, WebSockets) where data is a Readable stream
          if (raw === true) {
            this.logger?.info('Action returning raw response', action.name);
            return data;
          }

          if (config.RESPONSE_VALIDATION === true) {
            const responseIsValid = action.options.response(data);

            if (!responseIsValid.success) {
              if (
                action.options.strictResponseValidation === true ||
                ApiController._config.strictResponseValidation === true
              ) {
                throw new APIError(
                  ResponseCode.BAD_REQUEST__INVALID_RESPONSE,
                  responseIsValid.errors,
                );
              } else {
                this.logger?.error(
                  action.name,
                  // Log action metadata
                  'Response validation failed',
                  responseIsValid.errors,
                );
              }
            }
          }

          const finalCode = code ?? action.options.responseCode ?? ResponseCode.SUCCESS;

          return {
            success: true,
            code: finalCode,
            message: message ?? action.options.responseMessage,
            data,
          };
        } catch (err: unknown) {
          if (err instanceof APIError) {
            throw err;
          }

          // @ts-ignore
          if (err.__ORCHESTRA_ERROR__ === true) {
            // @ts-ignore
            throw APIError.fromJSON(err);
          }

          if (err instanceof Error) {
            throw APIError.fromError(err);
          }

          this.logger?.error('Unknown error occurred', err);

          throw new APIError(ResponseCode.INTERNAL_ERROR);
        } finally {
          this.logger?.info('Action finished', action.name);
          session?.$destroy();
        }
      },
    };
  }

  /**
   * Build the per-queue schema fragment attached under `schema.queues[<name>]`.
   *
   * Wave 15.B (PRD-051 / EVID-067 §15.B): delegates to
   * `@gertsai/api-queue.createQueueSchemaFragment`. The api-core-specific
   * APIError scrub semantics are preserved via the `errorTranslator`
   * adapter — identical behaviour to the pre-extraction inline implementation.
   */
  _createQueueSchema(queue: ApiControllerRegisteredQueue<any, any>) {
    return createQueueSchemaFragment(queue, {
      errorTranslator: (err: unknown): Error => {
        if (err instanceof APIError) return err;
        // @ts-ignore - duck-type check for Orchestra-flavoured cross-service errors
        if (err && (err as { __ORCHESTRA_ERROR__?: boolean }).__ORCHESTRA_ERROR__ === true) {
          // @ts-ignore
          return APIError.fromJSON(err);
        }
        if (err instanceof Error) return APIError.fromError(err);
        return new APIError(ResponseCode.INTERNAL_ERROR);
      },
    });
  }

  /**
   * Build the per-topic schema fragment attached under `schema.subscriptions[<topic>]`.
   *
   * Wave 15.C (PRD-052 / EVID-067 §15.C): delegates to
   * `@gertsai/api-pubsub.createSubscriberSchemaFragment`. The api-core-specific
   * `APIError` scrub semantics are preserved via the `errorTranslator`
   * adapter — identical behaviour to the pre-extraction inline implementation.
   */
  _createSubscriberSchema(subscription: ApiControllerSubscribedTopics<any, any, any>) {
    return createSubscriberSchemaFragment(subscription, {
      isEmulator: ApiController._config.pubSub?.isEmulator ?? false,
      errorTranslator: (err: unknown): Error => {
        if (err instanceof APIError) return err;
        // @ts-ignore - duck-type check for Orchestra-flavoured cross-service errors
        if (err && (err as { __ORCHESTRA_ERROR__?: boolean }).__ORCHESTRA_ERROR__ === true) {
          // @ts-ignore
          return APIError.fromJSON(err);
        }
        if (err instanceof Error) return APIError.fromError(err);
        return new APIError(ResponseCode.INTERNAL_ERROR);
      },
    });
  }

  /**
   * Generate MoleculerJS service schema and Queue workers
   * based on current controller and registered actions
   */
  generateServiceSchema(): CoreServiceSchema {
    // Save reference to controller for use in started/stopped methods
    const controller = this satisfies ApiController<ServiceVersion, ServiceName, ServiceContext>;

    const schema: CoreServiceSchema = {
      name: this._options.name,
      version: this._options.version,
      // Moleculer service dependencies (wait for these services before started handler)
      ...(this._options.dependencies?.length && {
        dependencies: this._options.dependencies,
      }),
      // REST base path for autoAliases (prevents v1.name duplication in routes)
      ...(this._options.restBasePath !== undefined && {
        settings: { rest: this._options.restBasePath },
      }),
      actions: Object.entries(this._registeredActions).reduce(
        (actions, [actionKey, action]) =>
          Object.assign(actions, {
            [actionKey]: this._createActionSchema(action),
          }),
        {},
      ),
      $queues: {},
      $workers: {},
      queues: Object.entries(this._registeredQueues).reduce(
        (queues, [queueName, queue]) =>
          Object.assign(queues, {
            [queueName]: this._createQueueSchema(queue),
          }),
        {},
      ),
      // Moleculer channels for reliable messaging (at-least-once via Redis Streams)
      ...(Object.keys(this._channels).length > 0 && {
        channels: this._channels,
      }),
      $subscriptions: {},
      subscriptions: Object.entries(this._subscribedTopics).reduce(
        (subscribes, [subscriptionName, subscription]) => {
          return Object.assign(subscribes, {
            [subscriptionName]: this._createSubscriberSchema(subscription),
          });
        },
        {},
      ),
      methods: {
        // BullMQ queue methods (getQueue + addJob) extracted to
        // `@gertsai/api-queue` in Wave 15.B. Spreads empty when `queue` is
        // unconfigured — matches the pre-extraction conditional behaviour.
        ...createQueueServiceMethods(ApiController._config.queue),
        // Pub/Sub method (getSubscription) extracted to `@gertsai/api-pubsub`
        // in Wave 15.C (PRD-052 / EVID-067 §15.C). Spreads empty when
        // `pubSub` is unconfigured. The `colorize` callbacks keep `colorts`
        // formatting inside api-core without leaking the dep downstream.
        ...createPubsubServiceMethods(
          ApiController._config.pubSub
            ? {
                pubSub: ApiController._config.pubSub,
                colorize: {
                  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                  topicCreated: (n: string) => color(n).red.underline + '',
                  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                  topicExists: (n: string) => color(n).green.underline + '',
                  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                  subscriptionCreated: (n: string) => color(n).black.bgWhite + '',
                  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                  subscriptionExists: (n: string) => color(n).black.bgWhite + ' ',
                },
              }
            : undefined,
        ),
      },
      async started() {
        this.$queues = {};
        this.$workers = {}; // BullMQ workers storage

        // Save logger reference to controller (highest priority logger)
        controller._logger = this.logger;

        // Execute user-defined started handlers
        for (const handler of controller._startedHandlers) {
          try {
            const context: LifecycleHandlerContext<ServiceVersion, ServiceName, ServiceContext> = {
              version: controller._options.version,
              name: controller._options.name,
              logger: this.logger,
              // Cast is safe: Partial<ServiceContext> means all properties are optional
              // They will be assigned during handler execution
              service: this as Moleculer.Service & Partial<ServiceContext>,
            };

            await handler(context);
          } catch (error) {
            // Startup diagnostics — show actionable ASCII-box with fix suggestions
            try {
              const { DiagnosticRegistry, registerBuiltinDiagnostics } = await import(
                '../diagnostics'
              );
              registerBuiltinDiagnostics();
              const svcName = `${controller._options.version}.${controller._options.name}`;
              const result = DiagnosticRegistry.diagnose(svcName, error);
              if (result.matched) {
                this.logger?.error(result.formattedBox);
              }
            } catch {
              // Diagnostics must never prevent the original error from propagating
            }
            this.logger?.error(
              '❌ Critical error in started handler — service will NOT start:',
              error,
            );
            throw error; // Fail fast — let Moleculer handle broken service (won't register in registry)
          }
        }

        // BullMQ: Create workers for each registered queue handler.
        // Wave 15.B (PRD-051 / EVID-067 §15.B): worker boot delegated to
        // `@gertsai/api-queue.bootQueueWorkers`. Selective worker-mode
        // semantics (workersEnabled / enabledWorkers) preserved verbatim —
        // see SPEC-018 for the API Gateway vs Worker Node deployment matrix.
        if (ApiController._config.queue && this.schema.queues) {
          bootQueueWorkers(this as any, {
            workersEnabled: ApiController._workersEnabled,
            enabledWorkers: ApiController._enabledWorkers,
            queueConfig: ApiController._config.queue,
          });
        }

        this.$subscriptions = {};
        // Pub/Sub: boot every registered topic subscription.
        // Wave 15.C (PRD-052 / EVID-067 §15.C): delegated to
        // `@gertsai/api-pubsub.bootPubsubSubscriptions`. Identical semantics —
        // resolve topic+subscription via `getSubscription`, attach `message`
        // and optional event handlers.
        if (ApiController._config.pubSub && this.schema.subscriptions) {
          bootPubsubSubscriptions(this as any);
        }

        // @ts-ignore
        return this.Promise.resolve();
      },
      async stopped() {
        // Execute user-defined stopped handlers
        for (const handler of controller._stoppedHandlers) {
          try {
            const context: LifecycleHandlerContext<ServiceVersion, ServiceName, ServiceContext> = {
              version: controller._options.version,
              name: controller._options.name,
              logger: this.logger,
              // Cast is safe: service has all properties from started handlers
              service: this as Moleculer.Service & Partial<ServiceContext>,
            };

            await handler(context);
          } catch (error) {
            this.logger?.error('❌ Error in stopped handler:', error);
            // Continue with other handlers even if one fails
          }
        }

        // BullMQ teardown — Wave 15.B (PRD-051 / EVID-067 §15.B): delegated
        // to `@gertsai/api-queue.{stopQueueWorkers, stopQueues}`. Identical
        // semantics — close workers first (to stop consuming jobs), then
        // close queue connections. Errors logged per-instance, never aborted.
        await stopQueueWorkers(this as any);
        if (ApiController._config?.queue) {
          await stopQueues(this as any);
        }
        // Pub/Sub teardown — Wave 15.C (PRD-052 / EVID-067 §15.C +
        // §Doctor Strange #5): delegated to
        // `@gertsai/api-pubsub.stopPubsubSubscriptions`. The ~17 lines of
        // commented-out `detachSubscription()` cleanup that lived here
        // pre-extraction were deleted — they referenced a Pub/Sub Lite API
        // that does not exist on the standard `PubSub` client. See the
        // `@gertsai/api-pubsub` README for the full rationale.
        if (ApiController._config.pubSub && this.$subscriptions) {
          await stopPubsubSubscriptions(this as any);
        }
      },
    };

    // RFC-001 amendment 2026-05-05: workflow attach (Option a)
    // Attach pending workflows alongside channels (synthesized schema, pre-broker.start).
    // Mirrors the existing channels attachment pattern; @moleculer/workflows middleware
    // will read schema.workflows during service registration.
    // Sprint 3.0.1 (F-10): no cast — `CoreServiceSchema` now declares `workflows`.
    this._attachWorkflowsToServices(schema);

    return schema;
  }

  /**
   * Get the best available logger based on current state
   * @private
   */
  private _getLogger(): LoggerInstance {
    // 1. Use service logger if available (highest priority - set in started())
    if (this._logger) {
      return this._logger;
    }

    // 2. Use broker logger if available (medium priority - set after broker creation)
    if (ApiController._broker?.logger) {
      return ApiController._broker.logger;
    }

    // 3. Use simple fallback logger (lowest priority - always available)
    return createSimpleFallbackLogger(this._options.name, this._options.version);
  }

  /**
   * Get logger instance
   * @returns Logger instance (best available logger based on current state)
   */
  get logger(): LoggerInstance {
    return this._getLogger();
  }
}
