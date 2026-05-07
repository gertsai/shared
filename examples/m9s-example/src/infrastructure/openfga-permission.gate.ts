// SPDX-License-Identifier: Apache-2.0
import type { IPermissionGate } from '../domain/ports/IPermissionGate';

// Type-only imports so this module can load even without `@gertsai/auth-openfga`
// initialized at startup. The runtime side imports the package lazily inside
// `can()`.
import type { FgaResourceType, FgaCheckRequest } from '@gertsai/auth-openfga';

/**
 * OpenFgaPermissionGate — production-shaped adapter (Sprint 3.11 E+).
 *
 * Delegates to `@gertsai/auth-openfga`'s `checkPermission()`. The package is
 * loaded LAZILY because:
 *   1. Eager import would crash dev startup when OpenFGA is unreachable —
 *      callers using {@link AllowAllPermissionGate} must still boot.
 *   2. Lazy load lets composition select the gate by env var without paying
 *      the OpenFGA SDK import cost in non-OpenFGA configurations.
 *
 * The action→relation map is intentionally tiny: m9s-example needs only
 * `ingest`/`search`. Real applications generate this from their authorization
 * model. Resource types here use the canonical `FgaResourceType` taxonomy
 * shipped by `@gertsai/auth-openfga` (per ADR-011 Amendment 2 §A2.2).
 *
 * Environment (read by composition root, passed through `options.client`):
 *   FGA_API_URL    — OpenFGA HTTP endpoint (default http://localhost:8080).
 *   FGA_STORE_ID   — store UUID populated by `scripts/openfga-bootstrap.ts`.
 *   FGA_API_TOKEN  — preshared bearer token (production only; SDK plumbing
 *                    pending — see KNOWN-ISSUES separate ADR for
 *                    `@gertsai/auth-openfga` API completion per RFC-002
 *                    §Cross-Package Contract Verification + ADR-011 I-2).
 *
 * Failure model (ADR-011 I-4 + §A2.4 fail-closed):
 *   Any throw — connection refused, missing tuple, malformed model — is
 *   logged with `cause` + masked resource id + returns `false`. NO rethrow,
 *   NO partial state. The gate stays stateless (I-14): each call queries
 *   OpenFGA fresh; caching belongs at the use-case layer with explicit
 *   invalidation.
 *
 * Process-wide singleton caveat (Sprint 3.11 Post-Build Track 2 §P1-2):
 *   `@gertsai/auth-openfga` exposes a process-wide `getFgaClient()` AND a
 *   process-wide `getPermissionCache()`. Once primed with the FIRST
 *   non-empty config, subsequent gate constructions with DIFFERENT
 *   `apiUrl`/`storeId` may NOT rebind — the cached client survives. Tests
 *   that assert error semantics MUST call:
 *     `mod.resetFgaClient(); mod.resetPermissionCache();`
 *   between scenarios. Production deployments that legitimately need
 *   multiple distinct OpenFGA stores in one process should NOT use this
 *   gate without modification — open a follow-up ADR.
 */

/**
 * Per-deployment overrides for the gate. Composition root supplies these from
 * `project.config`.
 */
export interface OpenFgaPermissionGateOptions {
  /**
   * OpenFGA resource type used for non-resource-scoped checks (e.g. `search`
   * with resource = `'*'`). Defaults to `'tenant'` — m9s-example performs
   * collection-wide reads under the caller's tenant scope.
   */
  readonly defaultResourceType?: FgaResourceType;
  /**
   * Map of application action (`ingest`, `search`, …) to OpenFGA relation
   * name (`can_edit`, `can_view`, …). Override per deployment.
   *
   * Defaults to `DEFAULT_ACTION_RELATION` which uses the canonical
   * `can_view`/`can_edit` permissions from `FGA_RELATIONS`.
   */
  readonly actionToRelation?: Readonly<Record<string, string>>;
  /**
   * Optional logger. Falls back to `console`.
   */
  readonly logger?: {
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  /**
   * Pre-resolved client config. When provided, the gate constructs an
   * isolated `GertsFgaClient` with these settings instead of relying on the
   * package singleton. Recommended for tests + multi-tenant deployments.
   */
  readonly client?: {
    /** OpenFGA HTTP endpoint, e.g. `http://localhost:8080`. */
    readonly apiUrl?: string;
    /** Store UUID — must already exist (provisioned by openfga-bootstrap.ts). */
    readonly storeId?: string;
    /**
     * Preshared bearer token for `Authorization: Bearer ...`.
     * Wave 6.2 (RFC-003 Edge 2): plumbed end-to-end through
     * `@gertsai/auth-openfga` to the OpenFGA SDK
     * `credentials: { method: ApiToken, config: { token } }`. The
     * Sprint 3.11 §P1-1 throw-on-apiToken defensive guard has been
     * removed; the token now reaches the SDK as intended.
     */
    readonly apiToken?: string;
  };
}

/**
 * Action verbs in m9s-example map to OpenFGA permission relations. The names
 * match `FGA_RELATIONS.CAN_VIEW` / `FGA_RELATIONS.CAN_EDIT` exactly so the
 * authorization model remains the single source of truth.
 */
const DEFAULT_ACTION_RELATION: Readonly<Record<string, string>> = {
  ingest: 'can_edit',
  search: 'can_view',
};

/**
 * Replace any non-`[a-zA-Z0-9_-]` segment of a resource id with a single
 * asterisk so log lines can't leak full identifiers when an attacker probes
 * with crafted resources. Keeps short prefixes for debuggability.
 */
function maskResourceId(resource: string): string {
  if (resource.length <= 4) return '***';
  return `${resource.slice(0, 4)}***`;
}

export class OpenFgaPermissionGate implements IPermissionGate {
  private readonly defaultResourceType: FgaResourceType;
  private readonly actionToRelation: Readonly<Record<string, string>>;
  private readonly logger: NonNullable<OpenFgaPermissionGateOptions['logger']>;
  private readonly clientConfig: OpenFgaPermissionGateOptions['client'];
  /**
   * Wave 6.3 Pre-Build ARCH-P1-1 — memoised cache scope.
   *
   * Lazily filled on the first `can()` call (`@gertsai/auth-openfga` is
   * lazy-imported so we cannot compute fingerprint in the constructor
   * without breaking the eager-failure discipline). Once computed, all
   * subsequent `can()` calls reuse the same string — avoids one
   * SHA-256 hash + canonical-JSON serialisation per request on the
   * hot path.
   *
   * `null` = never computed; `string` = computed and frozen.
   */
  private cacheScope: string | null = null;

  constructor(options: OpenFgaPermissionGateOptions = {}) {
    this.defaultResourceType = options.defaultResourceType ?? 'tenant';
    this.actionToRelation = options.actionToRelation ?? DEFAULT_ACTION_RELATION;
    this.logger = options.logger ?? console;
    this.clientConfig = options.client;

    // Wave 6.2 (RFC-003 Edge 2): the Sprint 3.11 §P1-1 throw-on-apiToken
    // defensive guard has been removed — `@gertsai/auth-openfga` now
    // forwards the bearer to the SDK via
    // `credentials: { method: ApiToken, config: { token } }`. Tokens
    // supplied here flow end-to-end. KNOWN-ISSUES §FGA_API_TOKEN-plumbing
    // is now RESOLVED.
  }

  async can(userId: string, action: string, resource: string): Promise<boolean> {
    const relation = this.actionToRelation[action];
    if (!relation) {
      this.logger.warn(
        `[OpenFgaPermissionGate] No relation mapping for action='${action}'. Denying.`,
      );
      return false;
    }

    // Decode resource into (type, id). m9s-example callers pass either:
    //   `'*'`                        — collection-wide; collapse to defaultResourceType.
    //   `'<type>:<id>'`              — explicit, e.g. `'document:abc'`.
    //   `'<id>'` (no colon)          — legacy short form; treated as defaultResourceType.
    const { resourceType, resourceId } = decodeResource(resource, this.defaultResourceType);

    try {
      // Lazy import: requires a running OpenFGA instance. In tests/dev without
      // a store this throws and the catch below fails-closed.
      const mod = await import('@gertsai/auth-openfga');

      // Wave 6.3 (RFC-004 Edge 2): each gate instance with a distinct
      // `apiUrl`/`storeId`/`apiToken` automatically gets its own SDK
      // client AND its own permission cache via fingerprint scope. The
      // Sprint 3.11 §P1-2 multi-store JSDoc warning is no longer
      // applicable to gates with explicit configs — different configs
      // resolve to different fingerprints, so the upstream cache Map
      // returns distinct cached entries.
      const gateConfig =
        this.clientConfig?.apiUrl !== undefined ||
        this.clientConfig?.storeId !== undefined ||
        this.clientConfig?.apiToken !== undefined
          ? {
              apiUrl: this.clientConfig?.apiUrl,
              storeId: this.clientConfig?.storeId,
              apiToken: this.clientConfig?.apiToken,
            }
          : undefined;

      // Wave 6.3 (RFC-004 Edge 2): resolve the per-fingerprint client
      // instance and pass it explicitly to `checkPermission` so the
      // SDK call uses THIS gate's config (storeId, apiToken, ...)
      // instead of the upstream default singleton.
      const scopedClient = gateConfig !== undefined ? mod.getFgaClient(gateConfig) : undefined;

      const checkRequest: FgaCheckRequest = {
        userId,
        relation,
        resourceType,
        resourceId,
      };
      // cacheScope ties the permission cache to this gate's config
      // fingerprint, so two gates with different storeIds (or tokens)
      // see fully independent cached results. ARCH-P1-1 memoises the
      // SHA-256 + canonical-JSON cost — first `can()` computes,
      // subsequent calls reuse.
      if (this.cacheScope === null) {
        this.cacheScope = mod.fingerprint(gateConfig);
      }
      const result = await mod.checkPermission(checkRequest, {
        client: scopedClient,
        cacheScope: this.cacheScope,
      });
      return result.allowed;
    } catch (err) {
      // Fail-closed (ADR-011 I-4 + Amendment 2 §A2.4): never rethrow, log
      // cause + masked resource so error tracking can correlate without
      // leaking identifiers into logs.
      this.logger.error('[OpenFgaPermissionGate] checkPermission failed — denying request', {
        cause: err instanceof Error ? err.message : err,
        operatorUuid: userId,
        action,
        resource: maskResourceId(resource),
      });
      return false;
    }
  }
}

/**
 * Pure helper — exported for tests. Decodes the wire-level `resource` string
 * passed by use cases into a `(type, id)` pair the OpenFGA SDK accepts.
 */
export function decodeResource(
  resource: string,
  defaultResourceType: FgaResourceType,
): { resourceType: FgaResourceType; resourceId: string } {
  if (resource === '*' || resource === '') {
    return { resourceType: defaultResourceType, resourceId: 'global' };
  }
  const colonIdx = resource.indexOf(':');
  if (colonIdx > 0) {
    const head = resource.slice(0, colonIdx);
    const tail = resource.slice(colonIdx + 1);
    // Trust the caller — `FgaResourceType` is a string union; any unrecognised
    // type is rejected by OpenFGA at check-time and surfaces via the catch
    // path in `can()`. We avoid hard-casting to `'as'` to keep type clarity.
    return { resourceType: head as FgaResourceType, resourceId: tail };
  }
  return { resourceType: defaultResourceType, resourceId: resource };
}
