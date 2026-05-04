import type { ResponseCode, ResponseDataType } from './types';
import { responseMetadata } from './types';

/**
 * Orchestra API Response class.
 *
 * Wraps response data with metadata based on ResponseCode.
 * Used by API gateway to format responses consistently.
 *
 * @typeParam CODE - The response code type (extends ResponseCode)
 *
 * @example
 * ```typescript
 * // Success response
 * const success = new OrchestraApiResponse(ResponseCode.SUCCESS, { user: { id: 1 } });
 *
 * // Error response
 * const error = new OrchestraApiResponse(ResponseCode.NOT_FOUND, {}, { message: 'User not found' });
 * ```
 */
export class OrchestraApiResponse<CODE extends ResponseCode> {
  /**
   * Response data payload.
   *
   * For success responses: contains the actual data.
   * For error responses: may contain error details or empty object.
   *
   * Note: Type is `ResponseDataType<CODE>` for proper inference in consumers,
   * but constructor accepts `unknown` for flexibility with error responses.
   */
  public readonly data: ResponseDataType<CODE>;

  /**
   * Creates a new OrchestraApiResponse instance.
   *
   * @param code - The response code (determines success/error status and HTTP code)
   * @param data - Response data (default: empty object for error responses)
   * @param additionalMeta - Additional metadata to merge with response
   */
  constructor(
    public readonly code: CODE,
    data: unknown = {},
    public readonly additionalMeta: Record<string, unknown> = {},
  ) {
    // Store data with type assertion.
    // Safe because:
    // - For success codes: ResponseDataType is `any`, so {} satisfies it
    // - For error codes: ResponseDataType is `never`, but we intentionally allow
    //   passing error details as the actual runtime value
    // - Runtime validation is handled by responseMetadata validators
    this.data = data as ResponseDataType<CODE>;
  }

  get meta() {
    return {
      ...(responseMetadata[this.code]?.meta ?? {
        defaultMeta: true,
      }),
      ...this.additionalMeta,
    };
  }

  get info() {
    if (this.meta.success) {
      return {
        ...this.meta,
        data: this.data,
      };
    }
    return {
      ...this.meta,
      errors: Array.isArray(this.data) ? this.data : [this.data],
    };
  }

  toJSON() {
    return JSON.stringify(this.info);
  }
}
