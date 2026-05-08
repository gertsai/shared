import type { Readable } from 'stream';

import type {
  DebugMessage,
  Message,
  PubSub,
  Subscription,
  SubscriptionOptions,
} from '@google-cloud/pubsub';
import type { StatusError } from '@google-cloud/pubsub/build/src/message-stream';
import type { OrchestraSession, UserType } from '@gertsai/core';
import type { Job, Queue, JobsOptions, ConnectionOptions as BullMQConnectionType } from 'bullmq';
import type { ServiceSchema } from 'moleculer';
import type Moleculer from 'moleculer';

import type { ResponseCode } from '../apiResponse';
import type { ContextMeta, TypiaValidator } from '../common';
import type { TypiaParamsWithSchema } from '../common/typia-params';

// =============================================================================
// Service Context Extension
// =============================================================================

/**
 * Base interface for service context extensions.
 * Extend this interface to add custom properties to your service context.
 *
 * @example
 * ```typescript
 * interface GraphServiceContext extends ServiceContextBase {
 *   graphStore: CypherGraphStore;
 *   graphRAG: GraphRAG;
 *   ontologyCache: Map<string, any>;
 * }
 *
 * const controller = ApiController.resolveController<
 *   'v1',
 *   'graph',
 *   GraphServiceContext
 * >('v1', 'graph');
 * ```
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServiceContextBase {}

/**
 * Job status enum for BullMQ compatibility
 */
export type JobStatus =
  | 'completed'
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'failed'
  | 'paused'
  | 'prioritized'
  | 'waiting-children';

/**
 * Type to prevent extra properties in object
 */
// type Impossible<K extends keyof any> = {
//   [P in K]: never;
// };
// type NoExtraProperties<T, U extends T = T> = U &
//   Impossible<Exclude<keyof U, keyof T>>;

/**
 * BullMQ Worker lock configuration options
 * These settings control how BullMQ handles job locking and stalled job detection.
 * Important for long-running jobs like LLM operations.
 */
export type BullMQWorkerLockOptions = {
  /**
   * Duration of the lock for the job in milliseconds.
   * The lock prevents other workers from processing the same job.
   * @default 30000 (30 seconds)
   * @example 300000 // 5 minutes for LLM operations
   */
  lockDuration?: number;

  /**
   * Interval in milliseconds at which to check for stalled jobs.
   * A job is considered stalled if it's been locked longer than lockDuration
   * without being renewed.
   * @default 30000 (30 seconds)
   * @example 60000 // Check every minute
   */
  stalledInterval?: number;

  /**
   * How often the lock is renewed in milliseconds.
   * Should be less than lockDuration to prevent premature stalling.
   * @default lockDuration / 2
   * @example 30000 // Renew every 30 seconds
   */
  lockRenewTime?: number;

  /**
   * Maximum number of times a job can be recovered from stalled state.
   * After this limit, the job will be marked as failed.
   * @default 1
   * @example 3 // Mark failed after 3 stalls
   */
  maxStalledCount?: number;
};

/**
 * BullMQ Queue configuration options
 *
 * Connection supports:
 * - RedisOptions: { host, port, password, db, ... }
 * - ClusterOptions: { host, port, ... } for AWS MemoryDB/ElastiCache
 * - IORedis instance: new IORedis(...)
 * - IORedis.Cluster instance: new Cluster(...)
 */
export type BullMQConnectionOptions = {
  /**
   * Redis connection (BullMQ works ONLY with Redis via ioredis)
   * @see https://docs.bullmq.io/guide/connections
   */
  connection: BullMQConnectionType;
  /** Default job options */
  defaultJobOptions?: JobsOptions;
  /** Queue prefix */
  prefix?: string;
  /**
   * Worker lock configuration for handling long-running jobs.
   * Essential for LLM operations that may take several minutes.
   * @see https://docs.bullmq.io/guide/workers/stalled-jobs
   */
  workerLock?: BullMQWorkerLockOptions;
};

/**
 * Global ApiController options
 */
export type ApiControllerConfigOptions = {
  sessionFactory: (user_uuid: string, user_type: UserType) => OrchestraSession;
  queue?: BullMQConnectionOptions;
  pubSub?: PubSub;
  strictResponseValidation?: boolean;
};

/**
 * Known services registry for type-safe dependencies.
 * Extend this interface via declaration merging in your application.
 *
 * @example
 * ```typescript
 * // In your app (e.g., apps/pipeline/src/services/types.ts)
 * declare module '@gertsai/api-core' {
 *   interface KnownServices {
 *     'v1.queue': true;
 *     'v1.graph': true;
 *     'v1.ingest': true;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KnownServices {}

/**
 * Service name type - uses KnownServices if extended, otherwise falls back to string
 */
export type ServiceName = keyof KnownServices extends never ? string : keyof KnownServices;

/**
 * Service dependency definition for Moleculer
 * @see https://moleculer.services/docs/0.14/services.html#Dependencies
 */
export type ServiceDependency =
  | ServiceName // Type-safe service name (or string if KnownServices is empty)
  | {
      name: string;
      version?: string | number;
    };

/**
 * ApiController instance options
 */
export type ApiControllerOptions<V extends string, N extends string> = {
  name: N;
  version: V;
  /**
   * Service dependencies (Moleculer will wait for these services before starting)
   * @example ['v1.queue'] - wait for queue service
   * @example [{ name: 'queue', version: 'v1' }] - object form
   */
  dependencies?: ServiceDependency[];
  /**
   * REST base path for autoAliases in moleculer-web.
   * When set, Moleculer-web will use this as the base path instead of 'version.name'.
   * Use '/' if route.path already includes the full path (e.g., '/api/v1/queue').
   * @example '/' - actions will be at route.path directly (no version.name prefix)
   * @example '/jobs' - actions will be at route.path/jobs/...
   */
  restBasePath?: string;
};

/**
 *
 */
export type ActionHandlerResponse<D> = {
  data: D;
  raw?: boolean;
  code?: ResponseCode;
  message?: string;
  success?: boolean;
};

// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RegisteredActions {}

type ValueOf<T> = T[keyof T];

/**
 * Typed alias for ctx.call function
 */
export type ActionCallFunction = <
  // fix circular type reference
  Path extends T['path'],
  Types extends Extract<T, { path: Path }> extends ApiControllerRegisteredAction<
    Path,
    infer RestPath,
    infer AuthType,
    infer ParamsType,
    infer ResponseType,
    infer RestConfig,
    infer _ParamsValidator
  >
    ? {
        rest: RestConfig;
        restPath: RestPath;
        auth: AuthType;
        params: ParamsType;
        response: ResponseType;
      }
    : never,
  T extends ValueOf<RegisteredActions>,
>(
  path: Path,
  params: Types['params'],
  options?: Moleculer.CallingOptions,
) => Promise<Types['response']>;

// TODO: Duplicate ?
export type QueueActionCallFunction = <
  // fix circular type reference
  Path extends T['path'],
  Types extends Extract<T, { path: Path }> extends ApiControllerRegisteredAction<
    Path,
    infer RestPath,
    infer AuthType,
    infer ParamsType,
    infer ResponseType,
    infer RestConfig,
    infer _ParamsValidator
  >
    ? {
        rest: RestPath;
        restConfig: RestConfig;
        auth: AuthType;
        params: ParamsType;
        response: ResponseType;
      }
    : never,
  T extends ValueOf<RegisteredActions>,
>(
  path: Path,
  params: Types['params'],
  options?: Moleculer.CallingOptions,
) => Promise<Types['response']>;

export type FileMeta = {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
};

export type IncomingFile = {
  stream: Readable;
  meta: FileMeta;
};

export type ActionAuthType = 'required' | 'optional' | 'none';

export type CtxLoggerType = {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
};

/**
 * Action Handler Call Params
 *
 * @template AuthType - Authentication type ('required' | 'optional' | 'none')
 * @template ParamsType - Type of action parameters
 * @template ResponseType - Type of action response
 * @template ServiceContext - Custom service context type (default: ServiceContextBase)
 *
 * @example
 * ```typescript
 * // Define your service context
 * interface MyServiceContext extends ServiceContextBase {
 *   myStore: MyStore;
 *   myCache: Map<string, any>;
 * }
 *
 * // In action handler, access typed service context:
 * async handler(ctx) {
 *   const { myStore, myCache } = ctx.service;  // Fully typed!
 *   // ...
 * }
 * ```
 */
export type ActionHandlerCtx<
  AuthType extends ActionAuthType,
  ParamsType,
  ResponseType,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
  TMeta extends ContextMeta = ContextMeta,
> = {
  /**
   * :TODO - Figure out how to make it work properly here. Look in _createQueueSchema
   */
  call: ActionCallFunction;
  /**
   * Raw Moleculer context for advanced use cases (broker.call, meta, etc.)
   * For service properties, use `ctx.service` instead.
   */
  ctx: Moleculer.Context<ParamsType, TMeta>;
  // Define correct session type based on AuthType
  session: AuthType extends 'required'
    ? OrchestraSession // Session 100% exists when AuthType === 'required'
    : AuthType extends 'optional'
      ? OrchestraSession | undefined // Session may exist when AuthType === 'optional'
      : undefined; // Session cannot exist, if AuthType === 'none'
  files: IncomingFile[];
  params: ParamsType;
  logger: CtxLoggerType;
  /**
   * Typed service context with custom properties.
   * Access your initialized services here (graphStore, cache, etc.)
   *
   * @example
   * ```typescript
   * const { graphStore, ontologyCache } = ctx.service;
   * ```
   */
  service: Moleculer.Service & ServiceContext;
  addJob: (name: string, jobName?: string, payload?: any, opts?: any) => Promise<Job>;
  getQueue: (jobName: string) => Job;
  respond: (
    data: ResponseType,
    message?: string,
    code?: ResponseCode,
  ) => ActionHandlerResponse<ResponseType>;
};

export type ApiControllerActions = Record<
  string,
  ApiControllerRegisteredAction<any, any, any, any, any, any>
>;

export type ApiControllerRegisteredAction<
  Path extends string,
  RestPath extends string | undefined,
  AuthType extends ActionAuthType,
  ParamsType,
  ResponseType,
  Rest extends RestConfig<any, any> | undefined,
  // Support both legacy TypiaValidator<T> and new TypiaParamsWithSchema<T>
  ParamsValidator extends TypiaValidator<any> | TypiaParamsWithSchema<any> =
    TypiaValidator<ParamsType>,
> = {
  name: string;
  rest: RestPath;
  path: Path;
  // Use 'any' for ParamsType constraint since it's already validated at register() time
  options: ActionOptions<
    AuthType,
    ParamsValidator,
    any, // ParamsType constraint satisfied at register()
    TypiaValidator<ResponseType>,
    ResponseType,
    Rest
  >;
};

/**
 * Use in typia validator for action params
 */
export type EmptyParams = Record<string, never>;

export type RestMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

export interface RestSchema<
  Method extends RestMethod,
  Path extends string | undefined = undefined,
> {
  path: Path;
  method: Method;
  // fullPath?: string;
  // basePath?: string;
}

export type RestConfig<Method extends RestMethod, Path extends string> =
  | `${Method} /${Path}`
  | RestSchema<Method, Path>;

export type ServiceNameToPath<T extends string> = T extends `${infer S}.${infer P}`
  ? `${S}/${ServiceNameToPath<P>}`
  : T;

/**
 * Action options for registering an action
 *
 * @template AuthType - Authentication type
 * @template ParamsValidator - Typia validator for params
 * @template ParamsType - Inferred params type
 * @template ResponseValidator - Typia validator for response
 * @template ResponseType - Inferred response type
 * @template Rest - REST configuration
 * @template ServiceContext - Custom service context (default: ServiceContextBase)
 * @template Handler - Action handler type
 */
// Import type-safe generics from auth-openfga for internal use
import type {
  TypedOpenFgaCheck as _TypedOpenFgaCheck,
  StaticOpenFgaCheck as _StaticOpenFgaCheck,
  CheckableResourceType,
  RelationFor,
} from '@gertsai/auth-openfga';

// Re-export for consumers
export type {
  TypedOpenFgaCheck,
  StaticOpenFgaCheck,
  CheckableResourceType,
  RelationFor,
} from '@gertsai/auth-openfga';

export { createOpenFgaCheck } from '@gertsai/auth-openfga';

/**
 * Legacy OpenFGA check configuration (string-based).
 * @deprecated Use TypedOpenFgaCheck<ResourceType, ParamsType> for type safety.
 *
 * @example
 * ```typescript
 * // OLD (string-based, no autocomplete):
 * openFgaCheck: {
 *   relation: 'viewer',
 *   resourceType: 'project',
 *   resourceIdFromParams: 'id',
 * }
 *
 * // NEW (type-safe with autocomplete):
 * openFgaCheck: {
 *   resourceType: 'project',        // <- autocomplete
 *   relation: 'can_view',           // <- only project relations
 *   resourceIdFromParams: 'id',     // <- keys from ParamsType
 * }
 * ```
 */
export type OpenFgaCheckConfig = {
  /** Relation to check (viewer, editor, admin, etc.) */
  relation: string;
  /** Resource type in OpenFGA model (project, team, tenant, etc.) */
  resourceType: string;
  /** Parameter name containing resource ID */
  resourceIdFromParams: string;
};

/**
 * ABAC requirements for action-level attribute checks.
 * Used by auth-moleculer middleware for fail-fast checks before OpenFGA.
 *
 * @example
 * ```typescript
 * abac: {
 *   blockSanctionedCountries: true,
 *   requireBusinessHours: true,
 *   requireClearance: 2, // CONFIDENTIAL
 * }
 * ```
 */
export type ABACRequirements = {
  /** Block requests from OFAC sanctioned countries */
  blockSanctionedCountries?: boolean;
  /** Require request during business hours (9-18 UTC) */
  requireBusinessHours?: boolean;
  /** Minimum clearance level required (0=public, 1=internal, 2=confidential, 3=secret) */
  requireClearance?: number;
  /** Require active resource status (not archived/suspended) */
  requireActiveResource?: boolean;
};

/**
 * Discriminated union for type-safe OpenFGA check.
 *
 * Creates a union where selecting `resourceType` automatically constrains
 * `relation` to only valid relations for that resource type.
 *
 * @template ParamsType - Action params type for resourceIdFromParams validation
 *
 * @example
 * ```typescript
 * // After typing resourceType: 'project', IDE shows only project relations
 * openFgaCheck: {
 *   resourceType: 'project',
 *   relation: 'can_view',  // <- autocomplete: 'viewer' | 'editor' | 'can_view' | ...
 *   resourceIdFromParams: 'id',
 * }
 * ```
 */
export type OpenFgaCheckDiscriminatedUnion<
  ParamsType extends Record<string, unknown> = Record<string, unknown>,
> = {
  [R in CheckableResourceType]: {
    /** Resource type - determines available relations */
    resourceType: R;
    /** Relation to check - only valid relations for this resourceType */
    relation: RelationFor<R>;
    /** Parameter name containing resource ID - must be key from ParamsType */
    resourceIdFromParams: Extract<keyof ParamsType, string>;
  };
}[CheckableResourceType];

/**
 * Action options for registering an action with full type safety.
 *
 * @template AuthType - Authentication type
 * @template ParamsValidator - Typia validator for params
 * @template ParamsType - Inferred params type (auto-derived from validator)
 * @template ResponseValidator - Typia validator for response
 * @template ResponseType - Inferred response type
 * @template Rest - REST configuration
 * @template ServiceContext - Custom service context (default: ServiceContextBase)
 * @template Handler - Action handler type
 *
 * @example
 * ```typescript
 * controller.register('projects.get', {
 *   auth: 'required',
 *   params: typia.createValidate<GetProjectParams>(),
 *   openFgaCheck: {
 *     resourceType: 'project',        // <- autocomplete: all resource types
 *     relation: 'can_view',           // <- autocomplete: only project relations!
 *     resourceIdFromParams: 'id',     // <- autocomplete: keys from GetProjectParams
 *   },
 *   handler: async ({ params, respond }) => { ... }
 * });
 * ```
 */
export type ActionOptions<
  AuthType extends ActionAuthType = any,
  // Support both legacy TypiaValidator<T> and new TypiaParamsWithSchema<T>
  ParamsValidator = TypiaValidator<any> | TypiaParamsWithSchema<any>,
  // Infer ParamsType with constraint like original
  ParamsType extends ParamsValidator extends TypiaValidator<infer T>
    ? T
    : ParamsValidator extends TypiaParamsWithSchema<infer T>
      ? T
      : never = any,
  ResponseValidator = TypiaValidator<any>,
  ResponseType extends ResponseValidator extends TypiaValidator<infer T> ? T : never = any,
  Rest extends RestConfig<any, any> | undefined = any,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
  TMeta extends ContextMeta = ContextMeta,
  Handler extends ActionHandler<AuthType, ParamsType, ResponseType, ServiceContext, TMeta> = any,
> = {
  auth: AuthType;
  /**
   * Required scopes for this action (RFC-050 IAM).
   * Checked by apiKeyMiddleware when auth is 'required'.
   * @example ['admin.users:read', 'admin.users:write']
   */
  scopes?: string[];
  /**
   * OpenFGA permission check configuration (RFC-055 ABAC).
   * When set, middleware verifies ReBAC permission before executing action.
   *
   * **Type-safe discriminated union:**
   * - `resourceType`: autocomplete shows all valid resource types
   * - `relation`: after selecting resourceType, shows only valid relations for it
   * - `resourceIdFromParams`: constrained to keys from ParamsType
   *
   * @see OpenFgaCheckDiscriminatedUnion
   */
  openFgaCheck?: ParamsType extends Record<string, unknown>
    ? OpenFgaCheckDiscriminatedUnion<ParamsType>
    : OpenFgaCheckConfig;
  /**
   * ABAC requirements for attribute-based checks (RFC-055).
   * Fail-fast checks performed before OpenFGA call.
   * @see ABACRequirements
   */
  abac?: ABACRequirements;
  /**
   * Resource sensitivity level (0-3) for clearance checks.
   * 0=public, 1=internal, 2=confidential, 3=secret
   */
  resourceSensitivity?: number;
  rest?: Rest | undefined;
  params: ParamsValidator;
  response: ResponseValidator;
  responseCode?: ResponseCode;
  strictResponseValidation?: boolean;
  responseMessage?: string;
  handler: Handler;
};

/**
 * Action Handler Call Params
 * @description Hello desc
 * @param id - Unique identification
 * @param name - Name of worker
 */
// Давай покроем дженериками
/**
 * Trace context for distributed tracing through queues.
 * W3C Trace Context compatible format.
 */
export type QueueTraceContext = {
  /** Trace ID (32 hex chars) */
  traceId?: string;
  /** Parent span ID (16 hex chars) */
  parentId?: string;
  /** Whether trace is sampled */
  sampled?: boolean;
  /** W3C traceparent header if available */
  traceparent?: string;
};

/**
 * Job data with optional trace context for distributed tracing.
 * Use this to type job data that includes trace propagation.
 *
 * @example
 * ```typescript
 * type MyJobData = { tenantId?: string; documentId: string };
 * const job: Job<JobDataWithTraceContext<MyJobData>> = ...;
 * const traceContext = job.data._traceContext;
 * ```
 */
export type JobDataWithTraceContext<T = Record<string, unknown>> = T & {
  _traceContext?: QueueTraceContext;
};

/**
 * Utility type for traced job data in queue handlers.
 * Shorthand for adding _traceContext to any job data type.
 */
export type TracedJobData<T> = T & { _traceContext?: QueueTraceContext };

export type QueueHandlerCtx<T extends Job = Job> = {
  call: QueueActionCallFunction;
  job: T;
  logger: CtxLoggerType;
  meta?: {
    user_uuid: string;
    user_type: string;
  };
  /**
   * Trace context propagated from parent request.
   * Use this to link queue job spans to the original request trace.
   */
  traceContext?: QueueTraceContext;
  /**
   * Get a queue by name to add child jobs.
   * Use this to dispatch follow-up jobs from within a queue handler.
   */
  getQueue: (name: string) => Queue;
  /**
   * Add a job to a queue with trace context auto-injection.
   */
  addJob: <TData>(
    queueName: string,
    jobName: string,
    data: TData,
    options?: JobsOptions,
  ) => Promise<Job<TData>>;
};

/**
 * Queue handler
 */
export type QueueHandler<T extends Job = Job> = (params: QueueHandlerCtx<T>) => any;

/**
 * Queue Status Handlers
 */
export type QueueProcessingStatus = {
  /**
   * A Job is waiting to be processed as soon as a worker is idling.
   * @param id - Job id string
   */
  waiting?: (this: Moleculer.Service, jobId: string) => void;

  /**
   * A job has been marked as stalled. This is useful for debugging job workers that crash or pause the event loop.
   * @param jobId
   */
  stalled?: (this: Moleculer.Service, job: Job) => void;

  /**
   * A job has started. You can use `jobPromise.cancel()`` to abort it.
   * @param job - Job object
   * @param data - Job data object
   * @param status - Job status
   */
  active?: (this: Moleculer.Service, job: Job, data: any, status: JobStatus) => void;

  /**
   * A job successfully completed with a `result`.
   * @param job
   * @param result - result job
   * @param status - status job
   */
  completed?: (this: Moleculer.Service, job: Job, result: any, status: JobStatus) => void;

  /**
   * Will listen globally, to instances of this queue...
   * @param job - Job object
   * @param progress - Progress value
   */
  globalСompleted?: (job: Job, progress: number) => any;

  /**
   * A job failed with reason `error`!
   * @param job - Job object
   * @param error - Error object
   */
  failed?: (this: Moleculer.Service, job: Job, error: Error) => void;

  /**
   * Delayoed job
   * @param job - Job object
   */
  delayed?: (this: Moleculer.Service, job: Job) => void;

  /**
   * The queue has been paused.
   * @param job - Job object
   */
  paused?: (this: Moleculer.Service, job: Job) => void;

  /**
   * An error occured.
   * @param error - Error object
   */
  error?: (this: Moleculer.Service, error: Error) => any;

  /**
   * A job successfully removed.
   * @param job - Job object
   */
  removed?: (this: Moleculer.Service, job: Job) => any;

  /**
   * Emitted every time the queue has processed all the waiting jobs (even if there can be some delayed jobs not yet processed)
   */
  drained?: (this: Moleculer.Service) => any;

  /**
   * Old jobs have been cleaned from the queue. `jobs` is an array of cleaned jobs, and `type` is the type of jobs cleaned.
   */
  cleaned?: (this: Moleculer.Service) => any;

  /**
   * A job's progress was updated!
   * @param job - Job object
   * @param progress - Progress value
   */
  progress?: (this: Moleculer.Service, job: Job, progress: number) => any;

  /**
   * whereas global events only pass the job ID:
   * @param job - Job object
   * @param progress - Progress value
   */
  globalProgress?: (this: Moleculer.Service, job: Job, progress: number) => any;

  /**
   * The queue has been resumed.
   * @param job - Job object
   */
  resumed?: (this: Moleculer.Service, job: Job) => any;

  /**
   * A job failed to extend lock. This will be useful to debug redis connection issues and jobs getting restarted because workers are not able to extend locks.
   * @param job - Job object
   */
  lockExtensionFailed?: (this: Moleculer.Service, job: Job, error: Error) => any;
};

/**
 * The type of queue registration in the API controller
 */
export type ApiControllerRegisteredQueue<
  Name extends string,
  Concurrency extends number,
  QueueStatusType extends QueueProcessingStatus = any,
  T extends Job = Job,
> = {
  name: Name;
  handlers: QueueOptions<Name, Concurrency, QueueHandler<T>, T>[];
  /**
   * Event handlers
   */
  on?: QueueStatusType;
};

/**
 * Registered queues in the controller
 */
export type ApiControllerQueues = Record<string, ApiControllerRegisteredQueue<any, any>>;

/**
 * Parameters to transfer to the queue
 */
export type QueueOptions<
  QueueName extends string,
  Concurrency extends number,
  Handler extends QueueHandler<T> = any,
  T extends Job = Job,
> = {
  name: QueueName;
  concurrency: Concurrency;
  handler: Handler;
};

export type QueueJob = {
  queue: Queue;
  name: string;
  opts: {
    delay: number;
    attempts: number;
    timestamp: number;
    backoff: undefined | any;
  };
  data: any;
  _progress: number;
  delay: number;
  timestamp: number;
  stacktrace: any[];
  returnvalue: any | null;
  attemptsMade: number;
  toKey: any[];
  id: string | number;
  processedOn: number;
  failedReason: any | undefined;
};

/**
 * Action handler function type
 *
 * @template AuthType - Authentication type
 * @template ParamsType - Type of action parameters
 * @template ResponseType - Type of action response
 * @template ServiceContext - Custom service context type
 */
export type ActionHandler<
  AuthType extends ActionAuthType,
  ParamsType,
  ResponseType,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
  TMeta extends ContextMeta = ContextMeta,
> = (
  this: Moleculer.Service & ServiceContext,
  params: ActionHandlerCtx<AuthType, ParamsType, ResponseType, ServiceContext, TMeta>,
) => ActionHandlerResponse<ResponseType> | Promise<ActionHandlerResponse<ResponseType>>;

export interface CoreServiceSchema extends ServiceSchema {
  queues?: ApiControllerQueues;
  $queues: Record<string, Queue>;
  $workers: Record<string, import('bullmq').Worker>;
  /**
   * Workflows block consumed by the `@moleculer/workflows` middleware at
   * broker start. Moleculer's stock `ServiceSchema` does not declare this
   * field — the middleware extends the schema at runtime — so we surface it
   * here as an optional structural field, which lets `ApiController` attach
   * workflows without casting (Sprint 3.0.1, F-10).
   */
  workflows?: Record<string, import('../../moleculer/workflow/adapter').MoleculerWorkflowSchema>;
}

export enum ProcessingEvents {
  ERROR = 'error',
  CLOSE = 'close',
  DEBUG = 'debug',
  NEW_LISTENER = 'newListener',
  REMOVE_LISTENER = 'removeListener',
}

/**
 * Subscription handlers
 */
export type SubscriptionProcessingEvents = {
  error?: (error: StatusError) => void;
  close?: () => void;
  debug?: (msg: DebugMessage) => void;
  newListener?: (event: string | symbol, listener: any) => void;
  removeListener?: (event: string | symbol, listener: any) => void;
};

/**
 * Action Handler Call Params
 * @description Hello desc
 * @param id - Unique identification
 * @param name - Name of worker
 */
export type SubscriberHandlerCtx = {
  call: QueueActionCallFunction;
  message: Message;
  subscription: Subscription;
  logger: CtxLoggerType;
  addJob: (name: string, jobName?: string, payload?: any, opts?: any) => Promise<Job>;
  getQueue: (jobName: string) => Job;
  meta: {
    isEmulator: boolean;
    topic_name: string;
    subscription_name: string;
  };
};

/**
 * Subscribe handler
 */
export type SubscribeHandler = (this: Moleculer.Service, params: SubscriberHandlerCtx) => any;

/**
 * Parameters to transfer to the subscription
 */
export type SubscribeOptions<
  SubscriptionName extends string,
  Options extends SubscriptionOptions,
  Handler extends SubscribeHandler = any,
  SubscriptionEvent extends SubscriptionProcessingEvents = any,
> = {
  name: SubscriptionName;
  options: Options;
  handler: Handler;
  on?: SubscriptionEvent;
};

/**
 * The type of queue registration in the API controller
 */
export type ApiControllerSubscribedTopics<
  TopicName extends string,
  Options extends SubscriptionOptions,
  SubscriptionEvent extends SubscriptionProcessingEvents = any,
> = {
  topicName: TopicName;
  options: SubscribeOptions<TopicName, Options, SubscribeHandler>;
  /**
   * Event handlers
   */
  on?: SubscriptionEvent;
};

/**
 * Registered subscribed on topics in the controller
 */
export type ApiControllerSubscriptions = Record<string, ApiControllerSubscribedTopics<any, any>>;

/**
 * Lifecycle handler context for started/stopped events
 *
 * @template ServiceVersion - Service version string
 * @template ServiceName - Service name string
 * @template ServiceContext - Custom service context type (default: ServiceContextBase)
 *
 * @example
 * ```typescript
 * controller.addStartedHandler(async (ctx) => {
 *   // Initialize your service context
 *   ctx.service.graphStore = new CypherGraphStore({ ... });
 *   ctx.service.ontologyCache = new Map();
 * });
 * ```
 */
export type LifecycleHandlerContext<
  ServiceVersion extends string,
  ServiceName extends string,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
> = {
  /**
   * Controller version
   */
  version: ServiceVersion;
  /**
   * Controller name
   */
  name: ServiceName;
  /**
   * Logger instance
   */
  logger?: Moleculer.LoggerInstance;
  /**
   * Service instance with partial context for initialization.
   * Properties are Partial because they are being ADDED during started handler.
   * In action handlers, use `ctx.service` which has the full typed context.
   *
   * @example
   * ```typescript
   * controller.addStartedHandler(async (ctx) => {
   *   // Assign properties (Partial allows this)
   *   ctx.service.graphStore = new CypherGraphStore({ ... });
   *   ctx.service.cache = new Map();
   * });
   * ```
   */
  service: Moleculer.Service & Partial<ServiceContext>;
};

/**
 * Lifecycle handler function type
 *
 * @template ServiceVersion - Service version string
 * @template ServiceName - Service name string
 * @template ServiceContext - Custom service context type (default: ServiceContextBase)
 */
export type LifecycleHandler<
  ServiceVersion extends string = string,
  ServiceName extends string = string,
  ServiceContext extends ServiceContextBase = ServiceContextBase,
> = (
  context: LifecycleHandlerContext<ServiceVersion, ServiceName, ServiceContext>,
) => Promise<void> | void;
