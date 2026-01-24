import type { CacheTagConfig } from './types';

/**
 * Generate tag versions from cached content.
 */
export function generateTags(
  content: unknown,
  config: CacheTagConfig[] = [],
): Record<string, number> {
  if (!config.length) return {};

  const result: Record<string, number> = {};

  config.forEach((rule) => {
    if (!rule.idField) {
      throw new Error('Cache tag config missing idField');
    }

    let ids = getAllByPath(content, [...rule.path, rule.idField], true);
    if (!Array.isArray(ids) && (typeof ids === 'string' || typeof ids === 'number')) {
      ids = [ids];
    }

    let timestamps = rule.timestampField
      ? getAllByPath(content, [...rule.path, rule.timestampField], true)
      : [];
    if (!Array.isArray(timestamps) && typeof timestamps === 'string') {
      timestamps = [timestamps];
    }

    (ids as unknown[]).forEach((id, index) => {
      if (id == null) return;
      const tsValue = (timestamps as unknown[])[index];
      const numericTs = Number(tsValue);
      const version = Number.isFinite(numericTs) ? numericTs : Date.now();
      result[`${rule.name}:${id}`] = version;
    });
  });

  return result;
}

function getAllByPath(source: unknown, pathSrc: string[], flatten = false): unknown[] | unknown {
  let path = [...pathSrc];
  let target = source;

  if (path[0] === '*') {
    path.unshift('path');
    target = { path: target };
  }

  if (Array.isArray(path) && path.indexOf('*') > 0) {
    const index = path.indexOf('*');
    const prefix = path.slice(0, index);
    const suffix = path.slice(index + 1);
    const base = getByPath(target, prefix, []) as unknown[];
    const agg = flatten ? (arr: unknown) => arr : (arr: unknown) => [arr];

    return base.reduce((results: unknown[], item: unknown) => {
      return results.concat(agg(getAllByPath(item, suffix, flatten)) as unknown[]);
    }, []);
  }

  return getByPath(target, path);
}

function getByPath(source: unknown, path: string[], defaultValue?: unknown): unknown {
  if (!path.length) return source;
  let current = source as Record<string, unknown> | undefined | null;
  for (const segment of path) {
    if (current == null) return defaultValue;
    current = current[segment] as Record<string, unknown>;
  }
  return current ?? defaultValue;
}
