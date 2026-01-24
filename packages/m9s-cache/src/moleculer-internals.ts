import { createRequire } from 'node:module';
import type { CachePayload } from './types';

export type BrokerLike = {
  metrics: {
    register?: (metric: unknown) => void;
    increment: (name: string) => void;
    timer: (name: string) => () => void;
  };
  namespace?: string;
  getLogger: (name: string) => {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  Promise: typeof Promise;
};

export type MoleculerInternals = {
  BaseCacher: new (opts?: unknown) => {
    opts: Record<string, unknown>;
    broker: BrokerLike;
    metrics: BrokerLike['metrics'];
    logger: {
      debug: (...args: unknown[]) => void;
      info: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
    prefix: string;
    init: (broker: BrokerLike) => void;
    getCacheKey: (actionName: string, params: unknown, meta: unknown, keys?: string[]) => string;
  };
  Serializers: {
    resolve: (name?: unknown) => {
      init: (broker: BrokerLike) => void;
      serialize: (value: unknown) => CachePayload;
      deserialize: (value: CachePayload) => unknown;
    };
  };
  METRIC: Record<string, string>;
};

export function resolveMoleculerInternals(): MoleculerInternals {
  const require = createRequire(import.meta.url);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BaseCacher = require('moleculer/src/cachers/base');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Serializers = require('moleculer/src/serializers');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const metrics = require('moleculer/src/metrics');
    const METRIC = metrics.METRIC ?? metrics;
    return { BaseCacher, Serializers, METRIC };
  } catch {
    return {
      BaseCacher: BaseCacherShim,
      Serializers: SerializersShim,
      METRIC: METRIC_SHIM,
    };
  }
}

const METRIC_SHIM = {
  MOLECULER_CACHER_GET_TOTAL: 'moleculer.cacher.get.total',
  MOLECULER_CACHER_GET_TIME: 'moleculer.cacher.get.time',
  MOLECULER_CACHER_FOUND_TOTAL: 'moleculer.cacher.found.total',
  MOLECULER_CACHER_SET_TOTAL: 'moleculer.cacher.set.total',
  MOLECULER_CACHER_SET_TIME: 'moleculer.cacher.set.time',
  MOLECULER_CACHER_DEL_TOTAL: 'moleculer.cacher.del.total',
  MOLECULER_CACHER_DEL_TIME: 'moleculer.cacher.del.time',
  MOLECULER_CACHER_CLEAN_TOTAL: 'moleculer.cacher.clean.total',
  MOLECULER_CACHER_CLEAN_TIME: 'moleculer.cacher.clean.time',
  MOLECULER_CACHER_EXPIRED_TOTAL: 'moleculer.cacher.expired.total',
};

class SerializersShim {
  static resolve() {
    return new JsonSerializerShim();
  }
}

class JsonSerializerShim {
  init() {
    return undefined;
  }

  serialize(value: unknown): CachePayload {
    return Buffer.from(JSON.stringify(value));
  }

  deserialize(value: CachePayload): unknown {
    const text = Buffer.isBuffer(value) ? value.toString('utf-8') : String(value);
    return JSON.parse(text);
  }
}

class BaseCacherShim {
  opts: Record<string, unknown>;
  broker!: BrokerLike;
  metrics!: BrokerLike['metrics'];
  logger!: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  prefix = 'MOL-';

  constructor(opts?: Record<string, unknown>) {
    this.opts = { ttl: null, keygen: null, maxParamsLength: null, ...(opts ?? {}) };
  }

  init(broker: BrokerLike): void {
    this.broker = broker;
    this.metrics = broker.metrics;
    this.logger = broker.getLogger('cacher');
    const prefix = this.opts.prefix as string | undefined;
    if (prefix) {
      this.prefix = `${prefix}-`;
    } else if (broker.namespace) {
      this.prefix = `MOL-${broker.namespace}-`;
    }
  }

  getCacheKey(actionName: string, params: unknown, meta: unknown, keys?: string[]): string {
    const keygen = this.opts.keygen as
      | ((actionName: string, params: unknown, meta: unknown, keys?: string[]) => string)
      | null;
    if (typeof keygen === 'function') {
      return keygen.call(this, actionName, params, meta, keys);
    }
    return this.defaultKeygen(actionName, params, meta, keys);
  }

  defaultKeygen(actionName: string, params: unknown, meta: unknown, keys?: string[]): string {
    if (Array.isArray(keys) && keys.length) {
      const parts = keys.map((key) => {
        const value = this.getParamMetaValue(
          key,
          params as Record<string, unknown>,
          meta as Record<string, unknown>,
        );
        return value != null ? String(value) : 'null';
      });
      return `${actionName}:${parts.join('|')}`;
    }
    return `${actionName}:${this._generateKeyFromObject(params)}`;
  }

  getParamMetaValue(
    key: string,
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
  ): unknown {
    if (key.startsWith('#')) return meta?.[key.slice(1)];
    return params?.[key];
  }

  // eslint-disable-next-line class-methods-use-this
  _generateKeyFromObject(obj: unknown): string {
    if (Array.isArray(obj))
      return `[${obj.map((item) => this._generateKeyFromObject(item)).join('|')}]`;
    if (obj && typeof obj === 'object') {
      return (
        '{' +
        Object.entries(obj as Record<string, unknown>)
          .map(([k, v]) => `${k}:${this._generateKeyFromObject(v)}`)
          .join('|') +
        '}'
      );
    }
    if (obj != null) return String(obj);
    return 'null';
  }
}
