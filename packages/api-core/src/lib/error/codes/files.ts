/**
 * RFC-053: Files Domain Error Codes
 *
 * Error codes specific to file storage and management operations.
 *
 * @module @gertsai/api-core/error/codes/files
 */

/**
 * Files domain error codes.
 */
export const FilesErrorCodes = {
  // ─────────────────────────────────────────────────────────────────────────
  // File Not Found Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** File not found */
  FILE_NOT_FOUND: 'FILES_NOT_FOUND',
  /** File version not found */
  VERSION_NOT_FOUND: 'FILES_VERSION_NOT_FOUND',
  /** Folder not found */
  FOLDER_NOT_FOUND: 'FILES_FOLDER_NOT_FOUND',

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Quota Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Storage quota exceeded for tenant */
  QUOTA_EXCEEDED: 'FILES_QUOTA_EXCEEDED',
  /** File size exceeds maximum allowed */
  FILE_TOO_LARGE: 'FILES_FILE_TOO_LARGE',
  /** Folder depth limit exceeded */
  MAX_DEPTH_EXCEEDED: 'FILES_MAX_DEPTH_EXCEEDED',

  // ─────────────────────────────────────────────────────────────────────────
  // Upload Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Upload failed */
  UPLOAD_FAILED: 'FILES_UPLOAD_FAILED',
  /** Upload interrupted (partial upload) */
  UPLOAD_INTERRUPTED: 'FILES_UPLOAD_INTERRUPTED',
  /** Multipart upload not found or expired */
  MULTIPART_NOT_FOUND: 'FILES_MULTIPART_NOT_FOUND',
  /** Invalid upload part */
  INVALID_PART: 'FILES_INVALID_PART',
  /** Missing upload parts */
  MISSING_PARTS: 'FILES_MISSING_PARTS',

  // ─────────────────────────────────────────────────────────────────────────
  // Content Type Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Unsupported file type */
  UNSUPPORTED_TYPE: 'FILES_UNSUPPORTED_TYPE',
  /** File content does not match declared type */
  TYPE_MISMATCH: 'FILES_TYPE_MISMATCH',
  /** File is potentially malicious */
  MALICIOUS_CONTENT: 'FILES_MALICIOUS_CONTENT',

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Backend Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Storage backend unavailable */
  STORAGE_UNAVAILABLE: 'FILES_STORAGE_UNAVAILABLE',
  /** Checksum verification failed */
  CHECKSUM_MISMATCH: 'FILES_CHECKSUM_MISMATCH',
  /** CAS (Content Addressable Storage) lookup failed */
  CAS_LOOKUP_FAILED: 'FILES_CAS_LOOKUP_FAILED',
  /** Encryption failed */
  ENCRYPTION_FAILED: 'FILES_ENCRYPTION_FAILED',
  /** Decryption failed */
  DECRYPTION_FAILED: 'FILES_DECRYPTION_FAILED',

  // ─────────────────────────────────────────────────────────────────────────
  // Permission Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** File is locked by another user */
  FILE_LOCKED: 'FILES_FILE_LOCKED',
  /** No permission to access file */
  ACCESS_DENIED: 'FILES_ACCESS_DENIED',
  /** File is read-only */
  READ_ONLY: 'FILES_READ_ONLY',

  // ─────────────────────────────────────────────────────────────────────────
  // Conflict Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** File already exists at this path */
  ALREADY_EXISTS: 'FILES_ALREADY_EXISTS',
  /** Concurrent modification detected */
  CONCURRENT_MODIFICATION: 'FILES_CONCURRENT_MODIFICATION',
  /** Cannot move folder into itself */
  CIRCULAR_REFERENCE: 'FILES_CIRCULAR_REFERENCE',
} as const;

export type FilesErrorCode = (typeof FilesErrorCodes)[keyof typeof FilesErrorCodes];
