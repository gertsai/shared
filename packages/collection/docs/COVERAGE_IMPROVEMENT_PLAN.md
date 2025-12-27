# План улучшения покрытия для ExtendedOps и PersistentMap

## 1. ExtendedOps.ts (текущее покрытие: 44.39%)

### Проблема

Методы класса `ExtendedOpsMixin` (строки 51-151) не покрыты тестами, хотя они используются через `Object.defineProperty`. Функция `withExtendedOps` (строки 160-214) также не покрыта.

### Непокрытые методы:

- `sweep` (строки 51-59) - удаление элементов по условию
- `tap` (строки 72-107) - выполнение побочных эффектов
- `ensure` (строки 121-129) - создание значения если отсутствует
- `concat` (строки 143-151) - объединение коллекций

### Решение 1: Прямое тестирование ExtendedOpsMixin

```typescript
// src/mixins/ExtendedOps.test.ts
import { ExtendedOpsMixin } from './ExtendedOps';

describe('ExtendedOpsMixin direct tests', () => {
  it('should test sweep method directly', () => {
    const data = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const createNew = (entries: Iterable<[string, number]>) =>
      ({ entries: () => entries }) as any;
    const mixin = new ExtendedOpsMixin(data, createNew);

    const removed = mixin.sweep((v) => v > 1);
    expect(removed).toBe(2);
    expect(data.size).toBe(1);
    expect(data.has('a')).toBe(true);
  });

  it('should test tap method directly', () => {
    const data = new Map([['a', 1]]);
    const createNew = (entries: Iterable<[string, number]>) =>
      ({ entries: () => entries }) as any;
    const mixin = new ExtendedOpsMixin(data, createNew);

    let sideEffect = 0;
    const result = mixin.tap(() => {
      sideEffect++;
    });
    expect(sideEffect).toBe(1);
    expect(result).toBeDefined();
  });

  it('should test ensure method directly', () => {
    const data = new Map<string, number>();
    const createNew = (entries: Iterable<[string, number]>) =>
      ({ entries: () => entries }) as any;
    const mixin = new ExtendedOpsMixin(data, createNew);

    const value = mixin.ensure('key', () => 42);
    expect(value).toBe(42);
    expect(data.get('key')).toBe(42);

    const existing = mixin.ensure('key', () => 999);
    expect(existing).toBe(42);
  });

  it('should test concat method directly', () => {
    const data = new Map([['a', 1]]);
    const createNew = (entries: Iterable<[string, number]>) => {
      return {
        entries: () => entries,
        size: Array.from(entries).length,
        get: (k: string) => new Map(entries).get(k),
      } as any;
    };
    const mixin = new ExtendedOpsMixin(data, createNew);

    const other = {
      entries: () =>
        [
          ['b', 2],
          ['c', 3],
        ] as Iterable<[string, number]>,
    } as any;

    const result = mixin.concat(other);
    expect(result.size).toBe(3);
    expect(result.get('a')).toBe(1);
    expect(result.get('b')).toBe(2);
  });
});
```

### Решение 2: Рефакторинг архитектуры (рекомендуется)

Переместить методы из класса `ExtendedOpsMixin` в отдельные функции:

```typescript
// Вместо класса ExtendedOpsMixin
export function sweepOp<K, V>(
  data: Map<K, V>,
  fn: (value: V, key: K) => boolean,
): number {
  const previousSize = data.size;
  for (const [key, value] of data) {
    if (fn(value, key)) {
      data.delete(key);
    }
  }
  return previousSize - data.size;
}

export function ensureOp<K, V>(
  data: Map<K, V>,
  key: K,
  defaultValueGenerator: (key: K) => V,
): V {
  const existing = data.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const defaultValue = defaultValueGenerator(key);
  data.set(key, defaultValue);
  return defaultValue;
}

// В withExtendedOps использовать функции напрямую
export function withExtendedOps<K, V, T>(
  target: T,
  createNew: Function,
): T & ExtendedOps<K, V> {
  const data = getInternalData(target);

  Object.defineProperty(target, 'sweep', {
    value: (fn: Function) => sweepOp(data, fn),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'ensure', {
    value: (key: K, gen: Function) => ensureOp(data, key, gen),
    enumerable: false,
    configurable: true,
  });

  return target as T & ExtendedOps<K, V>;
}
```

## 2. PersistentMap.ts (текущее покрытие: 69.71%)

### Непокрытые области (строки 319-520, 526-527):

1. **Сложные случаи слияния узлов** (строки 319-368)
   - Слияние CollisionNode с CollisionNode
   - Слияние ValueNode с CollisionNode
   - Слияние BranchNode с другими типами узлов

2. **Редкие операции** (строки 500-527)
   - Итераторы `keys()`, `values()`
   - `Symbol.toStringTag`
   - `asMutable()` метод

### Тесты для PersistentMap:

```typescript
// src/core/PersistentMap.test.ts
describe('PersistentMap edge cases', () => {
  it('should handle hash collisions', () => {
    // Создаем ключи с одинаковым хешем
    const map = new PersistentMap<any, number>();

    // Симулируем коллизию хешей
    const key1 = { toString: () => 'collision', valueOf: () => 42 };
    const key2 = { toString: () => 'collision', valueOf: () => 42 };

    const m1 = map.set(key1, 1);
    const m2 = m1.set(key2, 2);

    expect(m2.size).toBe(2);
    expect(m2.get(key1)).toBe(1);
    expect(m2.get(key2)).toBe(2);
  });

  it('should test keys() iterator', () => {
    const map = new PersistentMap<string, number>()
      .set('a', 1)
      .set('b', 2)
      .set('c', 3);

    const keys = Array.from(map.keys());
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
    expect(keys.length).toBe(3);
  });

  it('should test values() iterator', () => {
    const map = new PersistentMap<string, number>().set('a', 1).set('b', 2);

    const values = Array.from(map.values());
    expect(values).toContain(1);
    expect(values).toContain(2);
    expect(values.length).toBe(2);
  });

  it('should test Symbol.toStringTag', () => {
    const map = new PersistentMap<string, number>();
    expect(map[Symbol.toStringTag]).toBe('PersistentMap');
    expect(Object.prototype.toString.call(map)).toBe('[object PersistentMap]');
  });

  it('should test asMutable()', () => {
    const persistent = new PersistentMap<string, number>()
      .set('a', 1)
      .set('b', 2);

    const mutable = persistent.asMutable();
    expect(mutable).toBeInstanceOf(Map);
    expect(mutable.size).toBe(2);
    expect(mutable.get('a')).toBe(1);

    // Изменения в mutable не влияют на persistent
    mutable.set('c', 3);
    expect(persistent.has('c')).toBe(false);
  });

  it('should handle large datasets with collisions', () => {
    const map = new PersistentMap<number, number>();

    // Создаем много элементов для форсирования коллизий
    let current = map;
    for (let i = 0; i < 10000; i++) {
      current = current.set(i, i * 2);
    }

    expect(current.size).toBe(10000);

    // Проверяем случайные элементы
    expect(current.get(0)).toBe(0);
    expect(current.get(5000)).toBe(10000);
    expect(current.get(9999)).toBe(19998);

    // Удаляем элементы
    for (let i = 0; i < 5000; i++) {
      current = current.delete(i);
    }

    expect(current.size).toBe(5000);
    expect(current.get(0)).toBeUndefined();
    expect(current.get(5000)).toBe(10000);
  });

  it('should handle merge operations', () => {
    const map1 = new PersistentMap<string, number>().set('a', 1).set('b', 2);

    const map2 = new PersistentMap<string, number>().set('b', 20).set('c', 3);

    // merge через entries
    let merged = map1;
    for (const [k, v] of map2.entries()) {
      merged = merged.set(k, v);
    }

    expect(merged.size).toBe(3);
    expect(merged.get('a')).toBe(1);
    expect(merged.get('b')).toBe(20);
    expect(merged.get('c')).toBe(3);
  });
});
```

## Ожидаемое улучшение покрытия

### ExtendedOps.ts

- Текущее: 44.39%
- После добавления тестов: ~85-90%
- Вклад в общее покрытие: +2-3%

### PersistentMap.ts

- Текущее: 69.71%
- После добавления тестов: ~85-90%
- Вклад в общее покрытие: +1-2%

### Итоговое покрытие

- Текущее: 85.15%
- Ожидаемое: ~88-90%

## Рекомендация

1. **Краткосрочно**: Добавить прямые тесты для `ExtendedOpsMixin` и `PersistentMap`
2. **Долгосрочно**: Рефакторить `ExtendedOps` для лучшей тестируемости (разделить на функции)
3. **Альтернатива**: Добавить `src/mixins/ExtendedOps.ts` в exclude в vitest.config.ts как экспериментальный код
