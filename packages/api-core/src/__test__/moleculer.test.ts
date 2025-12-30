import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ServiceBroker } from 'moleculer';
import typia from 'typia';

import pjson from '../../package.json';
import {
  ApiController,
  ResponseCode,
  createApiService,
  createMoleculerConfig,
} from '..';

const RESPONSE_MESSAGE = 'Some message' as const;

describe('Moleculer Service', () => {
  const broker = new ServiceBroker({
    ...createMoleculerConfig(),
    logger: null,
    transporter: null,
  });

  beforeAll(() => broker.start());
  afterAll(() => broker.stop());

  const controller = new ApiController({
    version: 'v1',
    name: 'test-service',
  });

  controller.register('getAction', {
    auth: 'none',
    rest: 'GET /action/:str',
    params: typia.createValidateEquals<{
      str: string;
    }>(),
    response: typia.createValidateEquals<{
      str: string;
    }>(),
    responseCode: ResponseCode.SUCCESS,
    responseMessage: RESPONSE_MESSAGE,
    handler({ params, respond }) {
      this.logger.info(params);
      return respond(params);
    },
  });

  controller.register('postAction', {
    auth: 'none',
    rest: 'POST /action',
    params: typia.createValidateEquals<{
      str: string;
      num: number;
    }>(),
    response: typia.createValidateEquals<{
      str: string;
      num: number;
    }>(),
    responseCode: ResponseCode.SUCCESS,
    responseMessage: RESPONSE_MESSAGE,
    handler({ params, respond }) {
      return respond(params);
    },
  });

  const service = broker.createService(controller.generateServiceSchema());

  test('Has registered action', () => {
    expect(service.actions['getAction']).toBeInstanceOf(Function);
    expect(service.actions['postAction']).toBeInstanceOf(Function);
  });

  test('Action is called', async () => {
    const params = {
      str: 'string',
    };

    const result = await broker.call('v1.test-service.getAction', params);

    expect(result).toMatchObject({
      success: true,
      code: ResponseCode.SUCCESS,
      message: RESPONSE_MESSAGE,
      data: params,
    });
  });

  describe('Api Gate', () => {
    const API_GATE_PORT = 2345;

    beforeAll(async () => {
      broker.createService(
        createApiService(
          {
            version: 'v1',
            name: 'api-test-service',
            settings: {
              host: 'localhost',
              port: API_GATE_PORT,
            },
            routes: [
              {
                path: '/',
                whitelist: ['v1.test-service.*'],
                autoAliases: true,
                authorization: true,
              },
            ],
            methods: {
              authorize() {
                return;
              },
            },
          },
          pjson,
        ),
      );

      return broker.start();
    });

    test('Call get endpoint', async () => {
      const result = await fetch(
        `http://0.0.0.0:${API_GATE_PORT}/v1/test-service/action/test`,
      );

      expect(result.ok).toBe(true);
      await expect(result.json()).resolves.toMatchObject({
        success: true,
        code: ResponseCode.SUCCESS,
        http_code: 200,
        data: {
          str: 'test',
        },
      });
    });

    test('Fail Call POST endpoint with wrong parameters', async () => {
      const result = await fetch(
        `http://0.0.0.0:${API_GATE_PORT}/v1/test-service/action`,
        { method: 'POST' },
      );

      expect(result.ok).toBe(false);

      await expect(result.json()).resolves.toMatchObject({
        success: false,
        code: ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        http_code: 400,
        errors: [
          {
            expected: 'string',
            path: '$input.str',
          },
          {
            expected: 'number',
            path: '$input.num',
          },
        ],
      });
    });

    test('Get not found error on undefined action', async () => {
      const result = await fetch(
        `http://0.0.0.0:${API_GATE_PORT}/v1/test-service/not-existing-action`,
      );

      expect(result.ok).toBe(false);

      await expect(result.json()).resolves.toMatchObject({
        success: false,
        code: ResponseCode.NOT_FOUND__ACTION_NOT_FOUND,
        http_code: 404,
        errors: [{}],
      });
    });
  });
});
