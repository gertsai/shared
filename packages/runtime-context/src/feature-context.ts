// SPDX-License-Identifier: Apache-2.0

/**
 * Initialiser for {@link DefaultFeatureContext}. Both fields are optional —
 * an empty init produces a context where every flag reports `false`.
 */
export interface FeatureContextInit {
  readonly enabled?: ReadonlySet<string>;
  readonly flagProvider?: (flag: string) => boolean;
}

/**
 * Feature-flag aware accessor exposed via {@link RequestContext.features}.
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
 * as `false`.
 */
export class DefaultFeatureContext implements FeatureContext {
  private readonly _enabled: ReadonlySet<string>;
  private readonly _flagProvider?: (flag: string) => boolean;

  constructor(init: FeatureContextInit) {
    this._enabled = init.enabled ?? new Set<string>();
    if (init.flagProvider !== undefined) {
      this._flagProvider = init.flagProvider;
    }
  }

  isEnabled(flag: string): boolean {
    if (this._enabled.has(flag)) return true;
    if (this._flagProvider === undefined) return false;
    try {
      return this._flagProvider(flag) === true;
    } catch {
      return false;
    }
  }

  enabledFlags(): readonly string[] {
    return Array.from(this._enabled);
  }
}
