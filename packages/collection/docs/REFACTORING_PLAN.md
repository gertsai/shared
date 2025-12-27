# 🔄 План рефакторинга @orchlab/collection

## Фаза 1: Создание базовой архитектуры

### 1.1 Создать общие интерфейсы

```typescript
// src/types/interfaces.ts
export interface ReadableCollection<K, V> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  size: number;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
}

export interface WritableCollection<K, V> {
  set(key: K, value: V): this;
  delete(key: K): boolean;
  clear(): void;
}

export interface ImmutableOps<K, V> {
  set(key: K, value: V): ImmutableCollection<K, V>;
  delete(key: K): ImmutableCollection<K, V>;
  clear(): ImmutableCollection<K, V>;
}
```

### 1.2 Базовая абстракция

```typescript
// src/core/BaseCollection.ts
export abstract class BaseCollection<K, V> implements ReadableCollection<K, V> {
  protected data: Map<K, V>;

  constructor(entries?: Iterable<[K, V]>) {
    this.data = new Map(entries);
  }

  get(key: K): V | undefined {
    return this.data.get(key);
  }
  has(key: K): boolean {
    return this.data.has(key);
  }
  get size(): number {
    return this.data.size;
  }
  // ... базовые методы
}
```

---

## Фаза 2: Разделение операций

### 2.1 Модуль поиска

```typescript
// src/operations/search.ts
export function find<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K) => boolean,
): V | undefined {
  for (const [key, value] of iterable) {
    if (predicate(value, key)) return value;
  }
  return undefined;
}

export function filter<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K) => boolean,
): Array<[K, V]> {
  const result: Array<[K, V]> = [];
  for (const [key, value] of iterable) {
    if (predicate(value, key)) {
      result.push([key, value]);
    }
  }
  return result;
}

// Композиция в классе:
class Collection<K, V> {
  find(predicate: (v: V, k: K) => boolean): V | undefined {
    return find(this.entries(), predicate);
  }
}
```

### 2.2 Модуль трансформаций

```typescript
// src/operations/transform.ts
export function map<K, V, R>(
  iterable: Iterable<[K, V]>,
  fn: (value: V, key: K) => R,
): Array<R> {
  const result: R[] = [];
  for (const [key, value] of iterable) {
    result.push(fn(value, key));
  }
  return result;
}

export function mapEntries<K, V, NK, NV>(
  iterable: Iterable<[K, V]>,
  fn: (key: K, value: V) => [NK, NV],
): Map<NK, NV> {
  const result = new Map<NK, NV>();
  for (const [key, value] of iterable) {
    const [newKey, newValue] = fn(key, value);
    result.set(newKey, newValue);
  }
  return result;
}
```

### 2.3 Модуль агрегаций

```typescript
// src/operations/aggregate.ts
export function reduce<K, V, R>(
  iterable: Iterable<[K, V]>,
  reducer: (acc: R, value: V, key: K) => R,
  initial: R,
): R {
  let acc = initial;
  for (const [key, value] of iterable) {
    acc = reducer(acc, value, key);
  }
  return acc;
}

export function groupBy<K, V, G>(
  iterable: Iterable<[K, V]>,
  keySelector: (value: V, key: K) => G,
): Map<G, Array<[K, V]>> {
  const groups = new Map<G, Array<[K, V]>>();
  for (const [key, value] of iterable) {
    const groupKey = keySelector(value, key);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push([key, value]);
  }
  return groups;
}
```

---

## Фаза 3: Рефакторинг классов коллекций

### 3.1 Новый MutableCollection

```typescript
// src/core/MutableCollection.ts
import * as search from '../operations/search';
import * as transform from '../operations/transform';

export class MutableCollection<K, V>
  extends BaseCollection<K, V>
  implements WritableCollection<K, V>
{
  set(key: K, value: V): this {
    this.data.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    return this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  // Композиция операций
  find(predicate: (v: V, k: K) => boolean): V | undefined {
    return search.find(this.data, predicate);
  }

  map<R>(fn: (v: V, k: K) => R): R[] {
    return transform.map(this.data, fn);
  }

  filter(predicate: (v: V, k: K) => boolean): MutableCollection<K, V> {
    const entries = search.filter(this.data, predicate);
    return new MutableCollection(entries);
  }
}
```

### 3.2 Новый ImmutableCollection (БЕЗ наследования!)

```typescript
// src/core/ImmutableCollection.ts
export class ImmutableCollection<K, V> implements ReadableCollection<K, V> {
  private readonly data: Map<K, V>;

  constructor(entries?: Iterable<[K, V]>) {
    this.data = new Map(entries);
    Object.freeze(this.data);
  }

  get(key: K): V | undefined {
    return this.data.get(key);
  }

  set(key: K, value: V): ImmutableCollection<K, V> {
    if (this.data.get(key) === value) return this;

    const newData = new Map(this.data);
    newData.set(key, value);
    return new ImmutableCollection(newData);
  }

  delete(key: K): ImmutableCollection<K, V> {
    if (!this.data.has(key)) return this;

    const newData = new Map(this.data);
    newData.delete(key);
    return new ImmutableCollection(newData);
  }

  // Батчинг через функциональный подход
  withMutations(fn: (draft: Map<K, V>) => void): ImmutableCollection<K, V> {
    const draft = new Map(this.data);
    fn(draft);
    return new ImmutableCollection(draft);
  }

  // Операции через композицию
  filter(predicate: (v: V, k: K) => boolean): ImmutableCollection<K, V> {
    const entries = search.filter(this.data, predicate);
    return entries.length === this.data.size
      ? this
      : new ImmutableCollection(entries);
  }
}
```

---

## Фаза 4: Улучшенный Seq

### 4.1 Универсальный Seq

```typescript
// src/lazy/Seq.ts
export class Seq<T> implements Iterable<T> {
  private operations: Array<(iterable: Iterable<T>) => Iterable<T>> = [];

  constructor(private source: Iterable<T>) {}

  // Универсальный метод для добавления операций
  private addOperation<R>(op: (iterable: Iterable<T>) => Iterable<R>): Seq<R> {
    const newSeq = new Seq<R>(this.source as any);
    newSeq.operations = [...this.operations, op as any];
    return newSeq;
  }

  // Операторы
  filter(predicate: (item: T) => boolean): Seq<T> {
    return this.addOperation(function* (iterable) {
      for (const item of iterable) {
        if (predicate(item)) yield item;
      }
    });
  }

  map<R>(fn: (item: T) => R): Seq<R> {
    return this.addOperation(function* (iterable) {
      for (const item of iterable) {
        yield fn(item);
      }
    });
  }

  flatMap<R>(fn: (item: T) => Iterable<R>): Seq<R> {
    return this.addOperation(function* (iterable) {
      for (const item of iterable) {
        yield* fn(item);
      }
    });
  }

  // Terminal операции
  toArray(): T[] {
    return Array.from(this);
  }

  toSet(): Set<T> {
    return new Set(this);
  }

  toMap<K, V>(keyFn: (item: T) => K, valueFn: (item: T) => V): Map<K, V> {
    const map = new Map<K, V>();
    for (const item of this) {
      map.set(keyFn(item), valueFn(item));
    }
    return map;
  }

  *[Symbol.iterator](): Iterator<T> {
    let iterable: Iterable<any> = this.source;
    for (const op of this.operations) {
      iterable = op(iterable);
    }
    yield* iterable;
  }
}

// Фабрика
export function seq<T>(source: Iterable<T>): Seq<T> {
  return new Seq(source);
}
```

---

## Фаза 5: Специализированные коллекции

### 5.1 BiMap (двунаправленная карта)

```typescript
// src/specialized/BiMap.ts
export class BiMap<K, V> {
  private keyToValue = new Map<K, V>();
  private valueToKey = new Map<V, K>();

  set(key: K, value: V): this {
    // Удаляем старые связи
    if (this.keyToValue.has(key)) {
      const oldValue = this.keyToValue.get(key)!;
      this.valueToKey.delete(oldValue);
    }
    if (this.valueToKey.has(value)) {
      const oldKey = this.valueToKey.get(value)!;
      this.keyToValue.delete(oldKey);
    }

    this.keyToValue.set(key, value);
    this.valueToKey.set(value, key);
    return this;
  }

  getByKey(key: K): V | undefined {
    return this.keyToValue.get(key);
  }

  getByValue(value: V): K | undefined {
    return this.valueToKey.get(value);
  }
}
```

### 5.2 MultiMap

```typescript
// src/specialized/MultiMap.ts
export class MultiMap<K, V> {
  private data = new Map<K, V[]>();

  add(key: K, value: V): this {
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    this.data.get(key)!.push(value);
    return this;
  }

  get(key: K): V[] {
    return this.data.get(key) || [];
  }

  delete(key: K, value?: V): boolean {
    if (!value) {
      return this.data.delete(key);
    }

    const values = this.data.get(key);
    if (!values) return false;

    const index = values.indexOf(value);
    if (index === -1) return false;

    values.splice(index, 1);
    if (values.length === 0) {
      this.data.delete(key);
    }
    return true;
  }
}
```

---

## 📅 График выполнения

| Неделя | Задачи                                    | Результат                 |
| ------ | ----------------------------------------- | ------------------------- |
| 1      | Создание интерфейсов и базовых абстракций | Основа архитектуры        |
| 2      | Вынос операций в модули                   | Модульная структура       |
| 3      | Рефакторинг MutableCollection             | Чистый мутабельный API    |
| 4      | Создание нового ImmutableCollection       | Настоящая иммутабельность |
| 5      | Улучшение Seq                             | Универсальный lazy API    |
| 6      | Добавление специализированных коллекций   | Расширенный функционал    |
| 7      | Тестирование и документация               | Production-ready          |

---

## ✅ Критерии успеха

1. **Модульность**: Каждый файл < 300 строк
2. **Тестируемость**: 95%+ покрытие
3. **Производительность**: Бенчмарки лучше lodash
4. **Типобезопасность**: Строгая типизация везде
5. **Документация**: Примеры для каждого метода
6. **Tree-shaking**: Возможность импорта отдельных операций
