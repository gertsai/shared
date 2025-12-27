import type { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { Response } from 'undici';

export interface ResponseLike
  extends Pick<Response, 'arrayBuffer' | 'bodyUsed' | 'headers' | 'json' | 'ok' | 'status' | 'statusText' | 'text'> {
  body: Readable | ReadableStream | null;
}
