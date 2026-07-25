import { describe, expect, test, vi } from 'vitest';
import { UserType } from '@gertsai/core';
import typia from 'typia';

import type { ActionOptions } from '..';
import { ApiController, APIError, ResponseCode } from '..';

import type { validParamsMock } from './__mocks__';
import {
  contextWithAuthMock,
  invalidParamsContextMock,
  moleculerServiceMock,
  sessionMock,
  validParamsContextMock,
  validResponseMock,
} from './__mocks__';

const paramsValidate = typia.createValidate<typeof validParamsMock>();
const responseValidate = typia.createValidate<typeof validResponseMock>();

describe('ApiController', () => {
  ApiController.configure({
    sessionFactory: () => sessionMock,
  });

  test('Correct session factory', () => {
    expect(ApiController['_config']?.sessionFactory('test', UserType.USER)).toBe(sessionMock);
  });

  test('Create controller', () => {
    const controller = new ApiController({
      version: 'v1',
      name: 'service_name',
    });

    expect(controller).toBeInstanceOf(ApiController);
    expect(controller['_options'].version).toBe('v1');
    expect(controller['_options'].name).toBe('service_name');
  });

  test('Resolve controller', () => {
    const controller = ApiController.resolveController('v1', 'service_name');

    expect(controller).toBeInstanceOf(ApiController);
    expect(ApiController['_controllers']['v1.service_name']).toBe(controller);
    expect(controller['_options'].version).toBe('v1');
    expect(controller['_options'].name).toBe('service_name');

    const controller2 = ApiController.resolveController('v1', 'service_name');

    expect(controller2).toBe(controller);
  });

  describe('ApiController/actions', () => {
    const controller = new ApiController({
      version: 'v1',
      name: 'service_name',
    });

    const validActionOptions: ActionOptions = {
      auth: 'none',
      rest: 'GET /:param1',
      params: paramsValidate,
      response: responseValidate,
      handler(ctx: any) {
        return ctx.respond({
          var1: ctx.params.param1,
          var2: ctx.params.param2,
        });
      },
    };

    const invalidActionOptions: ActionOptions = {
      auth: 'none',
      rest: 'GET /:param1',
      params: paramsValidate,
      response: responseValidate,
      strictResponseValidation: true,
      handler(ctx: any) {
        return ctx.respond({
          var1: 'test',
          var2: ctx.params.param2,
        });
      },
    };

    const validActionRegistered = controller.register('action', validActionOptions);

    const invalidActionRegistered = controller.register('action2', invalidActionOptions);

    const validActionGeneratedSchema = controller['_createActionSchema'](validActionRegistered);

    const invalidActionGeneratedSchema = controller['_createActionSchema'](invalidActionRegistered);

    test('Register an action', () => {
      expect(validActionRegistered.options).toStrictEqual(validActionOptions);
    });

    test('Re-registering action throws error', () => {
      expect(() => controller.register('action', validActionOptions)).toThrowError();
    });

    test('Action schema is valid', () => {
      expect(validActionGeneratedSchema).toMatchObject({
        rest: validActionOptions.rest,
        handler: expect.any(Function),
      });
    });

    test('Action params validated', async () => {
      // Should pass
      await expect(
        validActionGeneratedSchema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).resolves.toMatchObject({
        data: validResponseMock,
        code: ResponseCode.SUCCESS,
      });

      // Should throw error
      await expect(
        validActionGeneratedSchema.handler.call(moleculerServiceMock, invalidParamsContextMock),
      ).rejects.toThrow(APIError);
    });

    test('Validate response', async () => {
      await expect(
        invalidActionGeneratedSchema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrow(APIError);
    });

    test('Generate service schema', () => {
      expect(controller.generateServiceSchema()).toMatchObject({
        version: 'v1',
        name: 'service_name',
        actions: {
          action: {
            rest: validActionOptions.rest,
            handler: expect.any(Function),
          },
          action2: {
            rest: invalidActionOptions.rest,
            handler: expect.any(Function),
          },
        },
      });
    });
  });

  describe('ApiController/actions/auth', () => {
    const controller = new ApiController({
      version: 'v1',
      name: 'service_name',
    });

    test('Optional Auth Action', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler(ctx: any) {
            return ctx.respond({
              var1: ctx.params.param1,
              var2: ctx.params.param2,
            });
          },
        },
      });

      // Should pass
      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).resolves.toMatchObject({
        data: validResponseMock,
        code: ResponseCode.SUCCESS,
      });

      // Should pass
      await expect(
        schema.handler.call(moleculerServiceMock, contextWithAuthMock),
      ).resolves.toMatchObject({
        data: validResponseMock,
        code: ResponseCode.SUCCESS,
      });
    });

    test('Required Auth Action', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,

        options: {
          auth: 'required',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler(ctx: any) {
            return ctx.respond({
              var1: ctx.params.param1,
              var2: ctx.params.param2,
            });
          },
        },
      });

      // Should throw error
      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrow(APIError);

      // Should pass
      await expect(
        schema.handler.call(moleculerServiceMock, contextWithAuthMock),
      ).resolves.toMatchObject({
        data: validResponseMock,
        code: ResponseCode.SUCCESS,
      });
    });
  });

  describe('ApiController/actions/errors', () => {
    const controller = new ApiController({
      version: 'v1',
      name: 'service_name',
    });

    test('Object Error converted to APIError', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler() {
            throw JSON.parse(new APIError(ResponseCode.FORBIDDEN).toJSON());
          },
        },
      });

      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrowError(APIError);
    });

    test('Regular error converted to APIError', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler() {
            throw new Error('Something happened');
          },
        },
      });

      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrowError(APIError);
    });

    test('APIError is thrown', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler() {
            throw new APIError(ResponseCode.FORBIDDEN);
          },
        },
      });

      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrowError(APIError);
    });

    test('Unknown APIError is thrown', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        name: 'test',
        rest: null,
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler() {
            throw 'test';
          },
        },
      });

      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).rejects.toThrowError(APIError);
    });
  });

  describe('ApiController/actions/call', () => {
    const controller = new ApiController({
      version: 'v1',
      name: 'service_name',
    });

    test('Moleculer context called', async () => {
      const schema = controller['_createActionSchema']({
        path: 'test',
        rest: null,
        name: 'test',
        options: {
          auth: 'optional',
          rest: 'GET /:param1',
          params: paramsValidate,
          response: responseValidate,
          handler(ctx: any) {
            ctx.call('v1.test.test', { test: 'test' }, { meta: { test: 'test' } });

            return ctx.respond({
              var1: ctx.params.param1,
              var2: ctx.params.param2,
            });
          },
        },
      });

      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).resolves.toMatchObject({
        data: validResponseMock,
        code: '200/ok',
      });

      expect(validParamsContextMock.call).toHaveBeenCalledWith(
        'v1.test.test',
        { test: 'test' },
        { meta: { test: 'test' } },
      );
    });
  });

  describe('ApiController/actions/native-options (moleculer escape-hatch)', () => {
    test('native Moleculer options pass through to the emitted action schema', () => {
      const controller = new ApiController({ version: 'v1', name: 'native_pass' });
      const registered = controller.register('cached', {
        auth: 'none',
        rest: 'GET /:param1',
        params: paramsValidate,
        response: responseValidate,
        moleculer: {
          cache: { keys: ['param1'], ttl: 60 },
          visibility: 'private',
        },
        handler(ctx: any) {
          return ctx.respond({ var1: ctx.params.param1, var2: ctx.params.param2 });
        },
      });

      expect(controller['_createActionSchema'](registered)).toMatchObject({
        cache: { keys: ['param1'], ttl: 60 },
        visibility: 'private',
        rest: 'GET /:param1',
        handler: expect.any(Function),
      });
    });

    test('generateServiceSchema carries native options through', () => {
      const controller = new ApiController({ version: 'v1', name: 'native_schema' });
      controller.register('cached', {
        auth: 'none',
        rest: 'GET /:param1',
        params: paramsValidate,
        response: responseValidate,
        moleculer: { cache: true, visibility: 'private' },
        handler(ctx: any) {
          return ctx.respond({ var1: ctx.params.param1, var2: ctx.params.param2 });
        },
      });

      expect(controller.generateServiceSchema()).toMatchObject({
        actions: {
          cached: { cache: true, visibility: 'private', rest: 'GET /:param1' },
        },
      });
    });

    test('controller-owned fields win at runtime — moleculer cannot hijack handler/rest/params', async () => {
      const controller = new ApiController({ version: 'v1', name: 'native_guard' });
      const hijackHandler = vi.fn();
      const registered = controller.register('guarded', {
        auth: 'none',
        rest: 'GET /:param1',
        params: paramsValidate,
        response: responseValidate,
        // `as any` bypasses the compile-time `?: never` guard — the runtime filter
        // must still keep the controller's own fields and drop native params/name.
        moleculer: {
          handler: hijackHandler,
          rest: 'DELETE /hijacked',
          params: { evil: 'string' },
          name: 'hijacked',
        } as any,
        handler(ctx: any) {
          return ctx.respond({ var1: ctx.params.param1, var2: ctx.params.param2 });
        },
      });

      const schema = controller['_createActionSchema'](registered);

      // controller owns rest + handler; native params/name never leak
      expect(schema.rest).toBe('GET /:param1');
      expect(schema.handler).not.toBe(hijackHandler);
      expect(schema).not.toHaveProperty('params');
      expect(schema).not.toHaveProperty('name');

      // the real pipeline runs; the hijack handler never fires
      await expect(
        schema.handler.call(moleculerServiceMock, validParamsContextMock),
      ).resolves.toMatchObject({ data: validResponseMock, code: ResponseCode.SUCCESS });
      expect(hijackHandler).not.toHaveBeenCalled();
    });
  });
});
