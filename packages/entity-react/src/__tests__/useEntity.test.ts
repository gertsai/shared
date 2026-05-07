// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactReactiveAdapter } from '../adapter.js';
import {
  __setUseSyncExternalStoreForTests,
  useEntity,
} from '../use-entity.js';

interface FakeEntityData {
  name: string;
  count: number;
}

class FakeEntity {
  public readonly $data: Readonly<FakeEntityData>;

  constructor(seed: FakeEntityData) {
    this.$data = reactReactiveAdapter.reactive(seed) as Readonly<FakeEntityData>;
  }

  $patch(partial: Partial<FakeEntityData>): void {
    Object.assign(this.$data, partial);
  }
}

describe('useEntity hook — useSyncExternalStore wiring', () => {
  afterEach(() => {
    __setUseSyncExternalStoreForTests(undefined);
  });

  it('subscribes via useSyncExternalStore and returns the snapshot data', () => {
    const entity = new FakeEntity({ name: 'Ada', count: 0 });

    let capturedSubscribe:
      | ((cb: () => void) => () => void)
      | undefined;
    let capturedSnapshot: (() => unknown) | undefined;

    const useSyncExternalStoreMock = vi.fn(
      (subscribeFn: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
        capturedSubscribe = subscribeFn;
        capturedSnapshot = getSnapshot;
        return getSnapshot();
      },
    );
    __setUseSyncExternalStoreForTests(useSyncExternalStoreMock);

    const result = useEntity(entity as unknown as Parameters<typeof useEntity>[0]);

    expect(useSyncExternalStoreMock).toHaveBeenCalledTimes(1);
    expect(capturedSubscribe).toBeTypeOf('function');
    expect(capturedSnapshot).toBeTypeOf('function');
    expect((result as FakeEntityData).name).toBe('Ada');

    const snap0 = capturedSnapshot?.() as { data: FakeEntityData; version: number };
    const v0 = snap0.version;
    entity.$patch({ count: 5 });
    const snap1 = capturedSnapshot?.() as { data: FakeEntityData; version: number };
    expect(snap1.version).toBeGreaterThan(v0);
    expect(snap1.data).toBe(snap0.data);
    expect(snap1.data.count).toBe(5);
  });

  it('subscribe registered through hook fires callback on mutation; unsubscribe stops further calls', () => {
    const entity = new FakeEntity({ name: 'Ada', count: 0 });

    let capturedSubscribe:
      | ((cb: () => void) => () => void)
      | undefined;

    const useSyncExternalStoreMock = vi.fn(
      (subscribeFn: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
        capturedSubscribe = subscribeFn;
        return getSnapshot();
      },
    );
    __setUseSyncExternalStoreForTests(useSyncExternalStoreMock);

    useEntity(entity as unknown as Parameters<typeof useEntity>[0]);

    const cb = vi.fn();
    const unsubscribe = capturedSubscribe!(cb);

    entity.$patch({ count: 1 });
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    entity.$patch({ count: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('mutation before subscribe — getSnapshot still returns latest data', () => {
    const entity = new FakeEntity({ name: 'X', count: 0 });

    let capturedSnapshot: (() => unknown) | undefined;

    const useSyncExternalStoreMock = vi.fn(
      (subscribeFn: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
        capturedSnapshot = getSnapshot;
        return getSnapshot();
      },
    );
    __setUseSyncExternalStoreForTests(useSyncExternalStoreMock);

    entity.$patch({ count: 7 });

    useEntity(entity as unknown as Parameters<typeof useEntity>[0]);
    const snap = capturedSnapshot?.() as { data: FakeEntityData; version: number };
    expect(snap.data.count).toBe(7);
  });
});
