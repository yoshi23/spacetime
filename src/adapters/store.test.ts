import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDBStore } from './store';
import type { PersistedState } from './store';
import type { Base, View } from '../core/types';

function fixture(): PersistedState {
  const base: Base = {
    thoughts: {
      a: { id: 'a', kind: 'user', content: 'root', viewId: 'v1', createdAt: 1, updatedAt: 1 },
      b: { id: 'b', kind: 'ai', content: 'child', viewId: 'v1', createdAt: 2, updatedAt: 3 },
    },
    edges: [{ id: 'e1', source: 'a', target: 'b', kind: 'branch' }],
  };
  const views: View[] = [
    {
      id: 'v1',
      name: 'Canvas',
      layout: { a: { x: 10, y: 20 }, b: { x: 130, y: 90 } },
    },
  ];
  return { base, views };
}

describe('IndexedDBStore', () => {
  it('returns null when nothing has been saved', async () => {
    const store = new IndexedDBStore('spacetime/test/empty');
    expect(await store.load()).toBeNull();
  });

  it('round-trips base + views (positions included) deep-equal', async () => {
    const store = new IndexedDBStore('spacetime/test/roundtrip');
    const original = fixture();
    await store.save(original);
    const restored = await store.load();
    expect(restored).toEqual(original);
    // positions specifically survive
    expect(restored!.views[0].layout).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 130, y: 90 },
    });
  });
});
