// SPDX-License-Identifier: Apache-2.0
import { createElement, useRef, useSyncExternalStore } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { Entity } from '@gertsai/entity';
import { reactReactiveAdapter } from '../adapter.js';
import { setUseSyncExternalStore, useEntity } from '../use-entity.js';

interface EntityData {
  name: string;
  count: number;
}

class ProfileEntity extends Entity<EntityData> {
  $defaultData(): EntityData {
    return { name: '', count: 0 };
  }
}

function createEntity(name: string): ProfileEntity {
  return new ProfileEntity({
    data: { name, count: 0 },
    reactive: reactReactiveAdapter,
  });
}

function EntityView({ entity }: { entity: ProfileEntity }) {
  const renders = useRef(0);
  renders.current += 1;
  if (renders.current > 50) {
    throw new Error('EntityView exceeded its render safety bound');
  }

  const data = useEntity(entity);
  return createElement('span', null, `${data.name}:${data.count}`);
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findByType('span').children.join('');
}

describe('useEntity', () => {
  const renderers: TestRenderer.ReactTestRenderer[] = [];

  afterEach(() => {
    try {
      for (const renderer of renderers) {
        act(() => renderer.unmount());
      }
    } finally {
      renderers.length = 0;
      setUseSyncExternalStore(undefined);
    }
  });

  it('mounts with a stable snapshot and renders entity mutations', () => {
    setUseSyncExternalStore(useSyncExternalStore);
    const entity = createEntity('Ada');
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(createElement(EntityView, { entity }));
      renderers.push(renderer);
    });
    expect(renderedText(renderer)).toBe('Ada:0');

    act(() => {
      entity.$patch({ count: 1 });
    });
    expect(renderedText(renderer)).toBe('Ada:1');
  });


  it('does not render stale data after switching entities', () => {
    setUseSyncExternalStore(useSyncExternalStore);
    const first = createEntity('First');
    const second = createEntity('Second');
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(createElement(EntityView, { entity: first }));
      renderers.push(renderer);
    });
    expect(renderedText(renderer)).toBe('First:0');

    act(() => {
      renderer.update(createElement(EntityView, { entity: second }));
    });
    expect(renderedText(renderer)).toBe('Second:0');

    act(() => {
      first.$patch({ name: 'Stale', count: 1 });
    });
    expect(renderedText(renderer)).toBe('Second:0');

    act(() => {
      second.$patch({ name: 'Second', count: 1 });
    });
    expect(renderedText(renderer)).toBe('Second:1');

  });
});
