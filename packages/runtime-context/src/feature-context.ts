// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal logger shape consumed by {@link DefaultFeatureContext}. Structural
 * subset of `@gertsai/logger-factory`'s `Logger` interface — we only need
 * `warn` to surface a swallowed provider exception, and we deliberately
 * avoid a hard import so `@gertsai/runtime-context` stays peer-optional on
 * logger-factory (Tier-2 boundary preserved).
 *
 * Wave 12.D-fix per PRD-036 FR-020 / EVID-051 L-4.
 */
export interface FeatureContextLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Initialiser for {@link DefaultFeatureContext}. All fields are optional —
 * an empty init produces a context where every flag reports `false`.
 */
export interface FeatureContextInit {
  readonly enabled?: ReadonlySet<string>;
  readonly flagProvider?: (flag: string) => boolean;
  /**
   * Optional structural logger used to report flag-provider exceptions.
   * When set, exceptions thrown by {@link FeatureContextInit.flagProvider}
   * are caught and forwarded to `logger.warn(...)` before returning
   * `false`. When unset, exceptions are silently swallowed (preserves the
   * pre-Wave 12 default-deny behaviour per ADR-007 P2-3).
   *
   * Wave 12.D-fix per PRD-036 FR-020.
   */
  readonly logger?: FeatureContextLogger;
}

/**
 * Feature-flag aware accessor exposed via `RequestContext.features`.
 *
 * Implementations MUST default-deny: flag-provider exceptions surface as
 * `false` per ADR-007 security P2-3 (consumers should never assume an
 * unknown flag is enabled when its provider throws).
 */
export interface FeatureContext {
  isEnabled(flag: string): boolean;
  enabledFlags(): readonly string[];
}

/**
 * Default {@link FeatureContext} backed by an immutable `Set` for explicit
 * flags + an optional dynamic provider. The Set is consulted first; on a
 * miss the provider is called. Provider exceptions are caught and reported
 * as `false`; if a logger is configured the exception is logged at `warn`
 * level (Wave 12.D-fix per PRD-036 FR-020 — observability without breaking
 * default-deny).
 */
export class DefaultFeatureContext implements FeatureContext {
  private readonly _enabled: ReadonlySet<string>;
  private readonly _flagProvider?: (flag: string) => boolean;
  private readonly _logger?: FeatureContextLogger;

  constructor(init: FeatureContextInit) {
    this._enabled = init.enabled ?? new Set<string>();
    if (init.flagProvider !== undefined) {
      this._flagProvider = init.flagProvider;
    }
    if (init.logger !== undefined) {
      this._logger = init.logger;
    }
  }

  isEnabled(flag: string): boolean {
    if (this._enabled.has(flag)) return true;
    if (this._flagProvider === undefined) return false;
    try {
      return this._flagProvider(flag) === true;
    } catch (err) {
      // Wave 12.D-fix FR-020 — log + default-deny rather than fully silent.
      this._logger?.warn(
        '[runtime-context/feature] flag provider threw — returning false (default-deny). Flag: ' +
          flag,
        { error: err instanceof Error ? err.message : String(err) },
      );
      return false;
    }
  }

  enabledFlags(): readonly string[] {
    return Array.from(this._enabled);
  }
}
