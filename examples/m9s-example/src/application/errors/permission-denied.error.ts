// SPDX-License-Identifier: Apache-2.0
/**
 * Permission denied error — shared across application use cases (ingest, search).
 * Thrown by IPermissionGate adapters and propagated through use cases.
 *
 * Inbound adapters are responsible for translating this into an HTTP 403
 * (or transport-equivalent rejection).
 */
export class PermissionDeniedError extends Error {
  public readonly userId: string;
  public readonly action: string;
  public readonly resource: string;

  constructor(userId: string, action: string, resource: string) {
    super(`User '${userId}' is not allowed to '${action}' on '${resource}'`);
    this.name = 'PermissionDeniedError';
    this.userId = userId;
    this.action = action;
    this.resource = resource;
  }
}
