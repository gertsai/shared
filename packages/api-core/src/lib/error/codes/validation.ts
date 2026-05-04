/**
 * RFC-053: Validation Domain Error Codes
 *
 * Error codes specific to input validation and data integrity.
 *
 * @module @gertsai/api-core/error/codes/validation
 */

/**
 * Validation domain error codes.
 */
export const ValidationErrorCodes = {
  // ─────────────────────────────────────────────────────────────────────────
  // Field Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Required field is missing */
  MISSING_FIELD: 'VALIDATION_MISSING_FIELD',
  /** Field value is invalid */
  INVALID_FIELD: 'VALIDATION_INVALID_FIELD',
  /** Field type is incorrect */
  INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
  /** Unknown field provided */
  UNKNOWN_FIELD: 'VALIDATION_UNKNOWN_FIELD',

  // ─────────────────────────────────────────────────────────────────────────
  // Format Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Invalid email format */
  INVALID_EMAIL: 'VALIDATION_INVALID_EMAIL',
  /** Invalid URL format */
  INVALID_URL: 'VALIDATION_INVALID_URL',
  /** Invalid UUID format */
  INVALID_UUID: 'VALIDATION_INVALID_UUID',
  /** Invalid date format */
  INVALID_DATE: 'VALIDATION_INVALID_DATE',
  /** Invalid JSON format */
  INVALID_JSON: 'VALIDATION_INVALID_JSON',
  /** Invalid regex pattern */
  INVALID_PATTERN: 'VALIDATION_INVALID_PATTERN',

  // ─────────────────────────────────────────────────────────────────────────
  // Range Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Value is too short (min length) */
  TOO_SHORT: 'VALIDATION_TOO_SHORT',
  /** Value is too long (max length) */
  TOO_LONG: 'VALIDATION_TOO_LONG',
  /** Value is below minimum */
  BELOW_MINIMUM: 'VALIDATION_BELOW_MINIMUM',
  /** Value is above maximum */
  ABOVE_MAXIMUM: 'VALIDATION_ABOVE_MAXIMUM',
  /** Array has too few items */
  TOO_FEW_ITEMS: 'VALIDATION_TOO_FEW_ITEMS',
  /** Array has too many items */
  TOO_MANY_ITEMS: 'VALIDATION_TOO_MANY_ITEMS',

  // ─────────────────────────────────────────────────────────────────────────
  // Enum/Choice Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Value is not one of allowed options */
  INVALID_ENUM: 'VALIDATION_INVALID_ENUM',
  /** Mutually exclusive fields provided */
  MUTUALLY_EXCLUSIVE: 'VALIDATION_MUTUALLY_EXCLUSIVE',
  /** Required when another field is present */
  DEPENDENT_FIELD_REQUIRED: 'VALIDATION_DEPENDENT_FIELD_REQUIRED',

  // ─────────────────────────────────────────────────────────────────────────
  // Business Validation Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** General validation failed */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Custom validation rule failed */
  CUSTOM_VALIDATION: 'VALIDATION_CUSTOM',
  /** Duplicates found in array */
  DUPLICATE_VALUES: 'VALIDATION_DUPLICATE_VALUES',
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCodes)[keyof typeof ValidationErrorCodes];
