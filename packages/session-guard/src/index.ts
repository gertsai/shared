// SPDX-License-Identifier: Apache-2.0
export {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  SessionDestroyedError,
  TenantScopeViolationError,
} from './errors.js';

export {
  hasOperatorType,
  isAuthenticated,
  isImpersonating,
  isInTenant,
} from './guards.js';

export {
  assertAuthenticated,
  assertHasDataAccessUuid,
  assertImpersonating,
  assertNotDestroyed,
  assertOperatorType,
  assertSessionInTenant,
} from './assertions.js';

export {
  checkAuthenticated,
  checkImpersonating,
  checkOperatorType,
  checkSessionInTenant,
} from './check.js';
export type { CheckResult } from './check.js';
