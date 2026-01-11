import type { ResponseCode, ResponseDataType } from '@orchdev/api-core';
import { Errors } from 'moleculer';
const { MoleculerError } = Errors;

export class RateLimitError extends MoleculerError {
  constructor(override readonly data: ResponseDataType<ResponseCode.TOO_MANY_REQUESTS> = {}) {
    super('Rate limit exceeded', 429, 'RateLimitError', data);
  }
}
