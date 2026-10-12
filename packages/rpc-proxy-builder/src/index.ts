// SPDX-License-Identifier: Apache-2.0
export { createRpcProxy, isRpcProxy } from './proxy.js';
export type { RpcTransport, RpcCallOptions, RpcProxy } from './proxy.js';
export {
  createTypedApi,
  invokeTransport,
  parseRestLiteral,
  RestError,
  restTransport,
} from './typed-api.js';
export type {
  ApiClient,
  ApiTransport,
  InvokeTransportOptions,
  RestTransportOptions,
  TypedApiOptions,
} from './typed-api.js';
