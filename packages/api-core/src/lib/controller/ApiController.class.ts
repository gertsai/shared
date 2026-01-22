/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { Message, Subscription, SubscriptionOptions } from '@google-cloud/pubsub';
import type { OrchestraSession } from '@gerts/core';
import { UserType, defaultSession } from '@gerts/core';
import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import color from 'colorts';
import _forIn from 'lodash.forin';
import type Moleculer from 'moleculer';
import type { BrokerOptions, LoggerInstance, ServiceSchema } from 'moleculer';
import { ServiceBroker } from 'moleculer';

import config from '../../config';
import { ResponseCode } from '../apiResponse';
import type { ContextMeta, TypiaValidator } from '../common';
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
  JobDataWithTraceContext,
  LifecycleHandler,
  LifecycleHandlerContext,
  QueueHandler,
  QueueHandlerCtx,
  QueueOptions,
  QueueProcessingStatus,
  QueueTraceContext,
  RestConfig,
  ServiceContextBase,
  ServiceNameToPath,
  SubscribeHandler,
  SubscribeOptions,
  SubscriberHandlerCtx,
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
 * Simple fallback logger for use before MoleculerJS Broker is available
 */
const createSimpleFallbackLogger = (
  serviceName: string,
  serviceVersion: string,
): LoggerInstance => ({
  fatal: (...args: any[]) => console.error(`[${serviceVersion}.${serviceName}] FATAL:`, ...args),
  error: (...args: any[]) => console.error(`[${serviceVersion}.${serviceName}] ERROR:`, ...args),
  warn: (...args: any[]) => console.warn(`[${serviceVersion}.${serviceName}] WARN:`, ...args),
  info: (...args: any[]) => console.info(`[${serviceVersion}.${serviceName}] INFO:`, ...args),
  debug: (...args: any[]) => console.debug(`[${serviceVersion}.${serviceName}] DEBUG:`, ...args),
  trace: (...args: any[]) => console.trace(`[${serviceVersion}.${serviceName}] TRACE:`, ...args),
});

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
> {
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
  >(version: V, name: N): ApiController<V, N, S> {
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
    ParamsValidator extends TypiaValidator<any>,
    ParamsType extends ParamsValidator extends TypiaValidator<infer T> ? T : never,
    ResponseValidator extends TypiaValidator<any>,
    ResponseType extends ResponseValidator extends TypiaValidator<infer T> ? T : never,
    Rest extends RestConfig<any, any> | undefined = undefined,
    // Pass ServiceContext from class to ActionHandler for proper type inference
    Handler extends ActionHandler<AuthType, ParamsType, ResponseType, ServiceContext> =
      ActionHandler<AuthType, ParamsType, ResponseType, ServiceContext>,
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
    Rest
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
      // @ts-expect-error
      rest,
      path,
      // Copy actionOptions to prevent modifying them
      options: { ...actionOptions },
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

          const requestIsValid = action.options.params(params);

          if (!requestIsValid.success) {
            throw new APIError(
              ResponseCode.BAD_REQUEST__INVALID_PARAMS,
              requestIsValid.errors,
            );
          }

          if (action.options.auth === 'required' || action.options.auth === 'optional') {
            if (action.options.auth === 'required' && !ctx.meta.user_uuid) {
              this.logger.error(
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

          // Extract trace context for auto-injection into jobs
          const traceContext: QueueTraceContext | undefined = ctx.tracing
            ? {
                traceId: ctx.requestID ?? undefined,
                parentId: ctx.parentID ?? undefined,
                sampled: ctx.tracing ?? undefined,
              }
            : undefined;

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
            this.logger.info('Action returning raw response', action.name);
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
                this.logger.error(
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

          this.logger.error('Unknown error occurred', err);

          throw new APIError(ResponseCode.INTERNAL_ERROR);
        } finally {
          this.logger.info('Action finished', action.name);
          session?.$destroy();
        }
      },
    };
  }

  _createQueueSchema(queue: ApiControllerRegisteredQueue<any, any>) {
    return {
      ...(queue.name && { name: queue.name }),
      ...(queue.on && { on: queue.on }),
      handlers: queue.handlers.map((handler) => {
        return {
          ...(handler.name && { name: handler.name }),
          ...(handler.concurrency && { concurrency: handler.concurrency }),
          // Store original handler for BullMQ Worker to call with proper context
          _originalHandler: handler.handler,
          handler: async function (this: Moleculer.Service, job: Job): Promise<unknown> {
            // Extract trace context from job data (propagated from parent request)
            // Uses JobDataWithTraceContext intersection type for type safety
            const jobData = (job.data || {}) as JobDataWithTraceContext;
            const traceContext: QueueTraceContext | undefined = jobData._traceContext;

            // Create span for queue job processing (links to parent trace)
            const tracer = this.broker.tracer;
            const span =
              traceContext?.sampled && tracer
                ? tracer.startSpan(`queue.${queue.name || 'unknown'}.${handler.name || job.name}`, {
                    parentID: traceContext.parentId,
                    traceID: traceContext.traceId,
                    sampled: traceContext.sampled,
                    tags: {
                      'queue.name': queue.name || 'unknown',
                      'queue.job.id': job.id,
                      'queue.job.name': job.name,
                      'queue.handler': handler.name || 'anonymous',
                    },
                  })
                : null;

            try {
              const result = await handler.handler.call(this, {
                job,
                /**
                 * Call function with trace context propagation.
                 * Automatically passes trace context in meta for downstream services.
                 *
                 * Note: @ts-ignore is used because QueueActionCallFunction has complex
                 * generics for registered actions, but here we need a simpler signature
                 * for cross-service calls. See types.ts:198-225 for the full type.
                 */
                // @ts-ignore - Simplified call signature for queue context
                call: (...args: [string, Record<string, unknown>, Record<string, unknown>?]) => {
                  const [action, params, opts = {}] = args;
                  // Propagate trace context via meta for downstream calls
                  const existingMeta = (opts as { meta?: Record<string, unknown> })?.meta ?? {};
                  const callOpts = traceContext
                    ? {
                        ...opts,
                        parentSpan: span || undefined,
                        meta: {
                          ...existingMeta,
                          $traceContext: traceContext,
                        },
                      }
                    : opts;
                  return this.broker
                    .call(action, params, callOpts)
                    .then((res: unknown) => (res as { data: unknown }).data);
                },
                logger: this.logger,
                traceContext,
              });

              // Mark span as successful
              span?.finish();
              return result;
            } catch (err: unknown) {
              // Mark span with error
              if (err instanceof Error) {
                span?.setError(err);
              }
              span?.finish();

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

              this.logger.error('Unknown error occurred', err);

              throw new APIError(ResponseCode.INTERNAL_ERROR);
            }
          },
        };
      }),
    };
  }

  _createSubscriberSchema(subscription: ApiControllerSubscribedTopics<any, any, any>) {
    return {
      ...(subscription.options.name && {
        subscriptionName: subscription.options.name,
      }),
      ...(subscription.options.on && { on: subscription.options.on }),
      handler: async function (
        this: Moleculer.Service,
        sub: Subscription,
        message: Message,
      ): Promise<SubscriberHandlerCtx> {
        try {
          return await subscription.options.handler.call(this, {
            subscription: sub,
            meta: {
              isEmulator: ApiController._config.pubSub?.isEmulator ?? false,
              topic_name: subscription.topicName,
              subscription_name: subscription.options.name,
            },
            message,
            addJob: this.addJob,
            getQueue: this.getQueue,
            // @ts-ignore
            call: (...args: [string, Record<string, any>]) =>
              this.broker.call(...args).then((res: any) => res.data),
            logger: this.logger,
          });
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

          this.logger.error('Unknown error occurred', err);

          throw new APIError(ResponseCode.INTERNAL_ERROR);
        }
      },
    };
  }

  /**
   * Generate MoleculerJS service schema and Queue workers
   * based on current controller and registered actions
   */
  generateServiceSchema(): CoreServiceSchema {
    // Save reference to controller for use in started/stopped methods
    const controller = this satisfies ApiController<ServiceVersion, ServiceName, ServiceContext>;

    return {
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
        ...(ApiController._config.queue && {
          /**
           * Get a queue by name (BullMQ)
           *
           * @param {String} name - Queue's name
           * @returns {Queue}
           */
          getQueue(name: string): Queue {
            const queues = this.$queues;
            if (!queues[name]) {
              queues[name] = new Queue(name, {
                connection: ApiController._config.queue!.connection,
                defaultJobOptions: ApiController._config.queue!.defaultJobOptions,
                prefix: ApiController._config.queue!.prefix,
              });
            }
            return queues[name];
          },
          /**
           * Add a job to the queue (BullMQ)
           *
           * @param {String} name - Queue name
           * @param {String} jobName - Job name
           * @param {Any} payload - Job data
           * @param {Any} opts - Job options
           * @returns {Promise<Job>}
           */
          async addJob(name: string, jobName: string, payload: any, opts: any): Promise<Job> {
            const queue = this.getQueue(name);
            return queue.add(jobName || '*', payload || {}, opts || {});
          },
        }),
        ...(ApiController._config.pubSub && {
          async getSubscription(
            subscriptionName: string,
            topicName: string,
          ): Promise<Subscription> {
            if (!ApiController._config.pubSub) {
              throw new APIError(ResponseCode.INTERNAL_ERROR);
            }
            const topic = ApiController._config.pubSub.topic(topicName);
            const [exists] = await topic.exists();

            if (!exists) {
              await ApiController._config.pubSub.createTopic(topicName);
              this.logger.info(
                `Topic created: `,
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                color(topicName).red.underline + '',
              );
            } else {
              this.logger.info(
                `Topic exists: `,
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                color(topicName).green.underline + '',
              );
            }

            let subscription = topic.subscription(subscriptionName);
            const [existsSubs] = await subscription.exists();

            if (!existsSubs) {
              [subscription] = await topic.createSubscription(subscriptionName, {
                enableMessageOrdering: true,
              });
              this.logger.info(
                `Subscription created: `,
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                color(subscriptionName).black.bgWhite + '',
              );
            } else {
              this.logger.info(
                `Subscription exists: `,
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                color(subscriptionName).black.bgWhite + ' ',
              );
            }

            const subscriptions = this.$subscriptions;
            if (!subscriptions[subscriptionName]) {
              subscriptions[subscriptionName] = subscription;
            }
            return subscriptions[subscriptionName];
          },
        }),
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
            this.logger?.error('❌ Error in started handler:', error);
            // Continue with other handlers even if one fails
          }
        }

        // BullMQ: Create workers for each registered queue handler
        // Skip if workersEnabled=false (API Gateway mode - only adds jobs, doesn't process)
        if (ApiController._config.queue && this.schema.queues) {
          const service = this;

          _forIn(this.schema.queues, (fn: any, queueName: string) => {
            // Ensure queue exists for addJob (always needed for job creation)
            this.getQueue(queueName);

            // Skip worker creation if workers are disabled (API Gateway mode)
            if (!ApiController._workersEnabled) {
              this.logger?.info(`⏭️  Skipping worker: ${queueName} (WORKERS_ENABLED=false)`);
              return;
            }

            // Skip worker if not in enabledWorkers list (selective worker mode)
            if (ApiController._enabledWorkers && !ApiController._enabledWorkers.has(queueName)) {
              this.logger?.info(`⏭️  Skipping worker: ${queueName} (not in WORKERS)`);
              return;
            }

            // Build handlers map for routing (use _originalHandler for proper context)
            const handlersMap = new Map<string, { handler: any; concurrency: number }>();
            let maxConcurrency = 1;
            fn.handlers.forEach((handlerConfig: any) => {
              const handlerName = handlerConfig.name || '*';
              const originalHandler = handlerConfig._originalHandler || handlerConfig.handler;
              const concurrency = handlerConfig.concurrency || 1;
              handlersMap.set(handlerName, { handler: originalHandler, concurrency });
              maxConcurrency = Math.max(maxConcurrency, concurrency);
            });

            // Get worker lock configuration with defaults optimized for LLM operations
            const workerLockConfig = ApiController._config.queue!.workerLock ?? {};
            const lockDuration = workerLockConfig.lockDuration ?? 300000; // 5 minutes default for LLM
            const stalledInterval = workerLockConfig.stalledInterval ?? 60000; // Check every minute
            const lockRenewTime = workerLockConfig.lockRenewTime ?? 30000; // Renew every 30 seconds
            const maxStalledCount = workerLockConfig.maxStalledCount ?? 3; // Mark failed after 3 stalls

            // Create ONE worker per queue with internal routing
            const worker = new Worker(
              queueName,
              async (job: Job) => {
                // Find handler for this job name (exact match or wildcard)
                let handlerConfig = handlersMap.get(job.name);
                if (!handlerConfig) {
                  handlerConfig = handlersMap.get('*');
                }

                if (!handlerConfig) {
                  throw new Error(`No handler found for job "${job.name}" in queue "${queueName}"`);
                }

                // Extract trace context for child job propagation (safely handle undefined data)
                const jobData = (job.data || {}) as { _traceContext?: QueueTraceContext };
                const traceContext = jobData._traceContext;

                // Call the handler with Orchestra-compatible context
                return handlerConfig.handler.call(service, {
                  job,
                  call: (...args: [string, Record<string, any>]) =>
                    service.broker.call(...args).then((res: any) => res?.data ?? res),
                  logger: service.logger,
                  traceContext,
                  // Queue methods for dispatching child jobs
                  getQueue: (name: string) => service.getQueue(name),
                  addJob: async (qName: string, jName: string, data: any, opts?: any) => {
                    // Auto-inject parent trace context for distributed tracing
                    const enrichedData = traceContext
                      ? { _traceContext: traceContext, ...data }
                      : data;
                    return service.addJob(qName, jName, enrichedData, opts);
                  },
                });
              },
              {
                connection: ApiController._config.queue!.connection,
                concurrency: maxConcurrency,
                prefix: ApiController._config.queue!.prefix,
                // Lock configuration for long-running LLM operations
                lockDuration,
                stalledInterval,
                lockRenewTime,
                maxStalledCount,
              },
            );

            // Attach event handlers to worker
            if (fn.on) {
              Object.entries(fn.on).forEach(([event, eventHandler]) => {
                // @ts-ignore - BullMQ worker events
                worker.on(event, (...args: any[]) => {
                  // @ts-ignore
                  eventHandler.call(service, ...args);
                });
              });
            }

            // Store worker for cleanup
            this.$workers[queueName] = worker;

            const handlerNames = Array.from(handlersMap.keys()).join(', ');
            this.logger?.info(
              `🚀 BullMQ Worker started: ${queueName} (handlers: ${handlerNames}, concurrency: ${maxConcurrency})`,
            );
          });
        }

        this.$subscriptions = {};
        if (ApiController._config.pubSub && this.schema.subscriptions) {
          _forIn(this.schema.subscriptions, async (fn: any, name: string) => {
            const subscription: Subscription = await this.getSubscription(
              fn.subscriptionName,
              name,
            );
            subscription.on('message', (message) => fn.handler.call(this, subscription, message));

            if (fn.on) {
              Object.entries(fn.on).forEach(([event, handler]) => {
                if (event !== 'message' && handler) {
                  //@ts-expect-error
                  subscription.on(event, (args) =>
                    //@ts-expect-error
                    handler.call(this, args),
                  );
                }
              });
            }
          });
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

        // BullMQ: Close all workers first
        if (this.$workers) {
          await Promise.all(
            Object.entries(this.$workers).map(async ([key, worker]) => {
              try {
                // Remove all event listeners to prevent memory leaks
                // @ts-ignore
                worker.removeAllListeners();
                // @ts-ignore
                await worker.close();
                this.logger?.info(`🛑 BullMQ Worker stopped: ${key}`);
              } catch (error) {
                this.logger?.error(`Error closing worker ${key}:`, error);
              }
              delete this.$workers[key];
            }),
          );
        }

        // BullMQ: Close all queues
        if (ApiController._config?.queue && this.$queues) {
          await Promise.all(
            Object.entries(this.$queues).map(async ([name, queue]) => {
              try {
                // @ts-ignore
                await queue.close();
              } catch (error) {
                this.logger?.error(`Error closing queue ${name}:`, error);
              }
              delete this.$queues[name];
            }),
          );
        }
        if (ApiController._config.pubSub && this.$subscriptions) {
          const subss = Object.entries(this.$subscriptions);
          await Promise.all(
            subss.map(([name, subscription]) => {
              if (ApiController._config.pubSub && subscription) {
                // console.log('subscription --->', subscription);
                // // @ts-expect-error
                // const [detached] = await subscription.detached();
                // console.log(
                //   `Subscription ${name} 'before' detached status: ${detached}`,
                // );
                //
                // if (!detached) {
                //   await ApiController._config?.pubSub.detachSubscription(name);
                //   console.log(`Subscription ${name} detach request was sent.`);
                //   // @ts-expect-error
                //   const [updatedDetached] = await subscription.detached();
                //   console.log(
                //     `Subscription ${name} 'after' detached status: ${updatedDetached}`,
                //   );
                // }

                delete this.$subscriptions[name];
              }
            }),
          );
        }
      },
    };
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
