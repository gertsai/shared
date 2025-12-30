import type { ResponseDataType } from '../apiResponse';
import { ResponseCode, responseMetadata } from '../apiResponse';

export class OrchestraError<
  CODE extends ResponseCode = ResponseCode,
> extends Error {
  /**
   * @param code - The error code reported
   * @param data - data for error
   * @param additionalMessage - additional message for error
   */
  public constructor(
    public code: CODE,
    public data?: ResponseDataType<CODE>,
    public additionalMessage?: string,
  ) {
    let message = responseMetadata[code].meta.message;

    if (additionalMessage) {
      message += ': ' + additionalMessage;
    }

    super(message);
  }

  /**
   * Create OrchestraError from Native Error
   * @param e - Native Error
   */
  public static fromError(e: Error) {
    const error = new OrchestraError(
      ResponseCode.INTERNAL_ERROR,
      undefined,
      e.message,
    );

    // Replace stack with original stack
    error.stack = e.stack;

    return error;
  }

  /**
   * Create error from JSON
   * @param e - JSON error
   */
  public static fromJSON(e: Record<string, any>) {
    const error = new OrchestraError(e.code, e.data, e.message);

    // Replace stack with original stack
    error.stack = e.stack;

    return error;
  }

  /**
   * Convert error to JSON
   */
  toJSON() {
    return JSON.stringify({
      ...responseMetadata[this.code].meta,
      message: this.message,
      stack: this.stack,
      __ORCHESTRA_ERROR__: true,
    });
  }
}
