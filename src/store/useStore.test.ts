import { describe, expect, it } from 'vitest';
import { createSpaceTimeStore } from './useStore';
import type { GraphDeps } from '../core/graph';
import type { PersistedState, Store } from '../adapters/store';

// In-memory fake Store so we can exercise hydrate/save without IndexedDB.
class FakeStore implements Store {
  data: PersistedState | null = null;
  saves = 0;
  constructor(initial: PersistedState | null = null) {
    this.data = initial;
  }
  async load() {
    return this.data;
  }
  async save(data: PersistedState) {
    this.saves += 1;
    this.data = structuredClone(data);
  }
}

function makeDeps(): GraphDeps {
  let n = 0;
  return { idGen: () => `id${++n}`, clock: () => 1000 };
}

const NO_DEBOUNCE = { saveDebounceMs: 0 };

describe('hydrate', () => {
  it('seeds exactly one root user thought when the store is empty', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();

    const { base, views } = s.getState();
    const thoughts = Object.values(base.thoughts);
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].kind).toBe('user');
    expect(s.getState().status).toBe('ready');
    // a position exists for the seeded thought
    expect(views[0].layout[thoughts[0].id]).toBeDefined();
    // seed is persisted so a reload finds it
    expect(store.data).not.toBeNull();
  });

  it('restores persisted state instead of seeding', async () => {
    const existing: PersistedState = {
      base: {
        thoughts: { a: { id: 'a', kind: 'user', content: 'hi', createdAt: 1, updatedAt: 1 } },
        edges: [],
      },
      views: [{ id: 'v_canvas', name: 'Canvas', layout: { a: { x: 5, y: 6 } } }],
    };
    const store = new FakeStore(existing);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    expect(s.getState().base).toEqual(existing.base);
    expect(s.getState().views).toEqual(existing.views);
  });
});

describe('store actions persist through the Store', () => {
  it('a build of thoughts/edges/positions reloads deep-equal', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate(); // seeds id1 (root user)

    const a = s.getState().addThought('user', { x: 100, y: 100 });
    s.getState().updateThoughtContent(a, 'hello world');
    // anchored branch — the anchor must survive the round-trip
    const anchor = { start: 6, end: 11, quote: 'world' };
    const child = s.getState().branchFrom(a, anchor);
    s.getState().moveThought(child!, { x: 222, y: 333 });

    const snapshot: PersistedState = {
      base: s.getState().base,
      views: s.getState().views,
    };

    // Reload into a fresh store instance from the same backing data.
    const s2 = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s2.getState().hydrate();

    expect({ base: s2.getState().base, views: s2.getState().views }).toEqual(snapshot);
    expect(s2.getState().views[0].layout[child!]).toEqual({ x: 222, y: 333 });
    // the branch edge's anchor (offsets + quote) is preserved across reload
    const branchEdge = s2.getState().base.edges.find((e) => e.target === child);
    expect(branchEdge!.anchor).toEqual({ start: 6, end: 11, quote: 'world' });
  });

  it('deleteThought drops the thought, its edges, and its layout entry', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    const a = s.getState().addThought('user', { x: 1, y: 1 });
    const child = s.getState().branchFrom(a)!;
    s.getState().deleteThought(a);

    expect(s.getState().base.thoughts[a]).toBeUndefined();
    expect(s.getState().base.edges.some((e) => e.source === a || e.target === a)).toBe(false);
    expect(s.getState().views[0].layout[a]).toBeUndefined();
    // child thought still present (only the deleted node + incident edges go)
    expect(s.getState().base.thoughts[child]).toBeDefined();
  });
});
