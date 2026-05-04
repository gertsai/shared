/**
 * Outbound port for authorization checks.
 *
 * Two adapters are shipped:
 *   - allow-all-permission.gate.ts        (DEV ONLY — always grants)
 *   - openfga-permission.gate.ts          (delegates to @gertsai/auth-openfga)
 *
 * Use cases depend ONLY on this interface so swapping enforcement engines
 * (Cedar, OPA, custom RBAC) requires zero domain/application changes.
 */
export interface IPermissionGate {
  /**
   * Check whether `userId` may perform `action` on `resource`.
   *
   * @param userId   - Stable user identifier (UUID, email, or external id).
   * @param action   - Verb in the application vocabulary, e.g. 'ingest',
   *                   'search'. Adapters map this to their own model
   *                   (OpenFGA relations, IAM scopes, etc.).
   * @param resource - Resource identifier or `'*'` for collection-wide actions.
   * @returns `true` when access is granted.
   */
  can(userId: string, action: string, resource: string): Promise<boolean>;
}
