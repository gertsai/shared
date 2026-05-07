/**
 * Configure log levels from environment variables
 * LOGLEVEL_ANY_BOXES => *.BOXES
 * LOGLEVEL_ALL_BOXES => **.BOXES
 * LOGLEVEL_V1_BOXES => V1.BOXES
 * LOGLEVEL_V1_ALL => V1.**
 * LOGLEVEL_ALL => **
 */
const logLevelsPlaceholders = {
  ANY: '*',
  ALL: '@',
};

const logLevel: Record<string, string> = Object.entries(process.env)
  .filter(([key]) => key.startsWith('LOGLEVEL_'))
  .map(([key, value]) => {
    const keyParts = key.split('_') as (keyof typeof logLevelsPlaceholders)[];
    keyParts.shift();
    const finalKey = keyParts
      .map((part) => logLevelsPlaceholders[part] || part)
      .join('.');
    return [finalKey, value ?? ''];
  })
  .toSorted(([aKey], [bKey]) => {
    if ((aKey === '*' || aKey === '@') && bKey !== '*' && bKey !== '@') {
      return 1;
    }
    if ((bKey === '*' || bKey === '@') && aKey !== '*' && aKey !== '@') {
      return -1;
    }
    if (aKey < bKey) {
      return -1;
    }
    if (aKey > bKey) {
      return 1;
    }
    return 0;
  })
  .reduce(
    (obj, [key, value]) => ({
      ...obj,
      [key.replace(/@/g, '**')]: value,
    }),
    {},
  );

if (typeof logLevel['**'] === 'undefined') {
  logLevel['**'] = 'info';
}

export default logLevel;
