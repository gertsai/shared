/**
 * RFC-053: Domain Error Codes
 *
 * Re-exports all domain-specific error codes for unified access.
 *
 * @module @gerts/api-core/error/codes
 */

export { AuthErrorCodes } from './auth';
export type { AuthDomainCode } from './auth';

export { OIDCErrorCodes } from './oidc';
export type { OIDCErrorCode } from './oidc';

export { FilesErrorCodes } from './files';
export type { FilesErrorCode } from './files';

export { DatabaseErrorCodes, PRISMA_ERROR_MAP } from './database';
export type { DatabaseErrorCode } from './database';

export { ValidationErrorCodes } from './validation';
export type { ValidationErrorCode } from './validation';

/**
 * Union type of all domain error codes.
 */
import type { AuthDomainCode } from './auth';
import type { OIDCErrorCode } from './oidc';
import type { FilesErrorCode } from './files';
import type { DatabaseErrorCode } from './database';
import type { ValidationErrorCode } from './validation';

export type DomainErrorCode =
  | AuthDomainCode
  | OIDCErrorCode
  | FilesErrorCode
  | DatabaseErrorCode
  | ValidationErrorCode;
