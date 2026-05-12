import { getRandomId } from '../generators';

type Names = {
  first_name: string;
  last_name: string;
  nickname: string;
};

/**
 * Converts a full name string into an object with `first_name`, `last_name`, and `nickname`.
 *
 * @param name - The full name to convert.
 * @param nameLength - The length of the random part of the nickname if the name has only one part.
 * @returns An object with the converted name parts.
 *
 * @example
 * ```typescript
 * const names = convertName('John Doe');
 * // names is { first_name: 'John', last_name: 'Doe', nickname: 'john.doe' }
 *
 * const singleName = convertName('John');
 * // singleName is { first_name: 'John', last_name: '', nickname: 'john.xxxx' }
 * ```
 */
export function convertName(name: string, nameLength = 4): Names {
  const splitted = name.split(/\s/g);
  const [first_name = '', last_name = ''] = splitted;
  if (splitted.length < 2) {
    return <Names>{
      first_name,
      last_name,
      nickname: `${first_name.toLowerCase()}.${getRandomId(
        nameLength,
        'abcdefghijklmnopqrstuvwxyz',
        false,
      ).toLowerCase()}`,
    };
  } else {
    return <Names>{
      first_name,
      last_name,
      nickname: `${first_name.toLowerCase()}.${last_name.toLowerCase()}`,
    };
  }
}
