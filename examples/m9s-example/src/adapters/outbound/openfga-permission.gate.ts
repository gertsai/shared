import type { IPermissionGate } from '../../domain/ports/IPermissionGate';

/**
 * OpenFgaPermissionGate — production-shaped adapter.
 *
 * Delegates to `@gertsai/auth-openfga`'s `checkPermission()`. The package
 * is loaded LAZILY because:
 *   1. It is an ESM-only package — eager `require` from CJS hosts is fine
 *      on Node 22 but slower at startup.
 *   2. We do not want a missing OpenFGA store URL to crash dev startup
 *      when callers are using {@link AllowAllPermissionGate} instead.
 *
 * Action -> relation mapping is intentionally tiny here. Real apps should
 * centralise this map, ideally generated from the OpenFGA model.
 */
export interface OpenFgaPermissionGateOptions {
  /**
   * OpenFGA resource type used for non-resource-scoped checks (e.g. `search`
   * with resource = '*'). Defaults to `'project'`.
   */
  readonly defaultResourceType?: string;
  /**
   * Map of application action (`ingest`, `search`, ...) to OpenFGA relation
   * name (`can_edit`, `can_view`, ...). Override per deployment.
   */
  readonly actionToRelation?: Readonly<Record<string, string>>;
  /**
   * Optional logger. Falls back to `console`.
   */
  readonly logger?: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

const DEFAULT_ACTION_RELATION: Readonly<Record<string, string>> = {
  ingest: 'can_edit',
  search: 'can_view',
};

export class OpenFgaPermissionGate implements IPermissionGate {
  private readonly defaultResourceType: string;
  private readonly actionToRelation: Readonly<Record<string, string>>;
  private readonly logger: NonNullable<OpenFgaPermissionGateOptions['logger']>;

  constructor(options: OpenFgaPermissionGateOptions = {}) {
    this.defaultResourceType = options.defaultResourceType ?? 'project';
    this.actionToRelation = options.actionToRelation ?? DEFAULT_ACTION_RELATION;
    this.logger = options.logger ?? console;
  }

  async can(userId: string, action: string, resource: string): Promise<boolean> {
    const relation = this.actionToRelation[action];
    if (!relation) {
      this.logger.warn(
        `[OpenFgaPermissionGate] No relation mapping for action='${action}'. Denying.`,
      );
      return false;
    }

    // OpenFGA cannot check a wildcard object — collapse '*' to the type itself
    // so callers retain a uniform IPermissionGate.can('search', '*') ergonomic.
    const resourceId = resource === '*' ? 'global' : resource;

    try {
      // Lazy import: requires a running OpenFGA instance configured via env
      // (FGA_API_URL, FGA_STORE_ID, FGA_API_TOKEN). In tests/dev without a
      // store, this throws — we catch and fail-closed below.
      const mod = await import('@gertsai/auth-openfga');
      const result = await mod.checkPermission({
        userId,
        relation,
        // Cast: `resourceType` is a typed enum in @gertsai/auth-openfga; this
        // adapter accepts caller-provided strings so we cross the boundary
        // here. Replace with a typed mapping in production wiring.
        resourceType: this.defaultResourceType as Parameters<typeof mod.checkPermission>[0]['resourceType'],
        resourceId,
      });
      return result.allowed;
    } catch (err) {
      // Fail-closed: any error contacting OpenFGA denies the request.
      // requires running OpenFGA instance (see @gertsai/auth-openfga README).
      this.logger.error(
        '[OpenFgaPermissionGate] checkPermission failed — denying request',
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }
}
