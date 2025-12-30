import { vi } from 'vitest';
import type Moleculer from 'moleculer';

export const validParamsMock = { param1: 123, param2: 'test' };
export const validResponseMock = { var1: 123, var2: 'test' };
export const invalidParams = { param1: '123', param2: 'test' };

// @ts-ignore
export const validParamsContextMock: Moleculer.Context = {
  call: vi.fn(() => Promise.resolve(validResponseMock)),
  params: validParamsMock,
  meta: {},
};

// @ts-ignore
export const invalidParamsContextMock: Moleculer.Context = {
  call: vi.fn(() => Promise.resolve(validResponseMock)),
  params: invalidParams,
  meta: {},
};

// @ts-ignore
export const contextWithAuthMock: Moleculer.Context = {
  call: vi.fn(() => Promise.resolve(validResponseMock)),
  params: validParamsMock,
  meta: {
    user_uuid: 'test',
    user_type: 'test',
  },
};
