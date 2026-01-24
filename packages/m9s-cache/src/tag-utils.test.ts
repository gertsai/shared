import { describe, expect, it } from 'vitest';
import { generateTags } from './tag-utils';

describe('generateTags', () => {
  it('generates tags for wildcard paths', () => {
    const content = {
      rows: [
        { id: 1, updatedAt: 10 },
        { id: 2, updatedAt: 20 },
      ],
    };

    const tags = generateTags(content, [
      {
        name: 'user',
        path: ['rows', '*'],
        idField: 'id',
        timestampField: 'updatedAt',
      },
    ]);

    expect(tags).toEqual({
      'user:1': 10,
      'user:2': 20,
    });
  });

  it('generates tags for root wildcard', () => {
    const content = [{ id: 'a' }, { id: 'b' }];

    const tags = generateTags(content, [
      {
        name: 'item',
        path: ['*'],
        idField: 'id',
      },
    ]);

    expect(tags).toEqual({
      'item:a': expect.any(Number),
      'item:b': expect.any(Number),
    });
  });
});
