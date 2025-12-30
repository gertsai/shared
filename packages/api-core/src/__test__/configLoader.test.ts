import { expect, test } from 'vitest';

import { loadConfig } from '..';

test('Load config', () => {
  process.env['STRING'] = 'string';
  process.env['STRING_NULL'] = 'string_null';
  process.env['NUMBER'] = '200';
  process.env['BOOLEAN_TRUE'] = '1';
  process.env['BOOLEAN_FALSE'] = '';

  const config = loadConfig({
    STRING: 'value',
    STRING_NULL: null as string | null,
    NUMBER: 10,
    BOOLEAN_TRUE: false,
    BOOLEAN_FALSE: true,
    NOT_OVERRIDED: 'value',
  });

  expect(config.STRING).toBe('string');
  expect(config.STRING_NULL).toBe('string_null');
  expect(config.NUMBER).toBe(200);
  expect(config.BOOLEAN_TRUE).toBe(true);
  expect(config.BOOLEAN_FALSE).toBe(false);
  expect(config.NOT_OVERRIDED).toBe('value');
});
