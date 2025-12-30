import type { ResponseCode, ResponseDataType } from './types';
import { responseMetadata } from './types';

export class OrchestraApiResponse<CODE extends ResponseCode> {
  constructor(
    public readonly code: CODE,
    // @ts-ignore
    public readonly data: ResponseDataType<CODE> = {},
    public readonly additionalMeta: Record<string, any> = {},
  ) {}

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
