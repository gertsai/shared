import type { IPermissionGate } from '../domain/ports/IPermissionGate';

/**
 * AllowAllPermissionGate
 *
 * DEV-ONLY adapter. Every {@link IPermissionGate#can} call returns `true`.
 * Constructing this gate emits a single warning to make accidental
 * production usage extremely visible in logs.
 *
 * Use {@link OpenFgaPermissionGate} for any non-toy environment.
 */
export class AllowAllPermissionGate implements IPermissionGate {
  private warned = false;

  constructor(private readonly logger: { warn: (...args: unknown[]) => void } = console) {}

  async can(_userId: string, _action: string, _resource: string): Promise<boolean> {
    if (!this.warned) {
      this.logger.warn(
        '[AllowAllPermissionGate] Permission checks are DISABLED — every request is granted. ' +
          'This gate is for local development only. Wire OpenFgaPermissionGate before deploying.',
      );
      this.warned = true;
    }
    return true;
  }
}
