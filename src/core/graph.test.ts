import { describe, expect, it } from 'vitest';
import type { GraphDeps } from './graph';
import {
  addEdge,
  addThought,
  branchFrom,
  deleteThought,
  emptyBase,
  seedView,
  thoughtsForView,
  updateContent,
} from './graph';

// Deterministic deps: sequential ids and a fixed clock.
function makeDeps(): GraphDeps {
  let n = 0;
  return {
    idGen: () => `id${++n}`,
    clock: () => 1000,
  };
}

const V = 'v'; // a view id for tests

describe('addThought', () => {
  it('adds a thought to an empty base', () => {
    const deps = makeDeps();
    const { base, thought } = addThought(emptyBase(), 'user', V, deps, 'hi');
    expect(thought).toEqual({
      id: 'id1',
      kind: 'user',
      content: 'hi',
      viewId: 'v',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(base.thoughts['id1']).toBe(thought);
    expect(Object.keys(base.thoughts)).toHaveLength(1);
  });

  it('does not mutate the input base', () => {
    const deps = makeDeps();
    const start = emptyBase();
    addThought(start, 'ai', V, deps);
    expect(Object.keys(start.thoughts)).toHaveLength(0);
  });
});

describe('updateContent', () => {
  it('updates content and bumps updatedAt', () => {
    let t = 1;
    const deps: GraphDeps = { idGen: () => 'id1', clock: () => t };
    const { base } = addThought(emptyBase(), 'user', V, deps);
    t = 2;
    const next = updateContent(base, 'id1', 'edited', deps.clock);
    expect(next.thoughts['id1'].content).toBe('edited');
    expect(next.thoughts['id1'].updatedAt).toBe(2);
    expect(next.thoughts['id1'].createdAt).toBe(1);
  });

  it('is a no-op for a missing thought', () => {
    const base = emptyBase();
    expect(updateContent(base, 'nope', 'x', () => 0)).toBe(base);
  });
});

describe('thoughtsForView', () => {
  it('returns only thoughts homed in the given view', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', 'va', deps).base; // id1 in va
    b = addThought(b, 'ai', 'vb', deps).base; // id2 in vb
    b = addThought(b, 'user', 'va', deps).base; // id3 in va

    expect(thoughtsForView(b, 'va').map((t) => t.id).sort()).toEqual(['id1', 'id3']);
    expect(thoughtsForView(b, 'vb').map((t) => t.id)).toEqual(['id2']);
    expect(thoughtsForView(b, 'vc')).toEqual([]);
  });
});

describe('seedView', () => {
  it('seeds a view with exactly one root user thought', () => {
    const deps = makeDeps();
    const { base, root } = seedView(emptyBase(), 'vx', deps);
    const inView = thoughtsForView(base, 'vx');
    expect(inView).toHaveLength(1);
    expect(inView[0]).toBe(root);
    expect(root.kind).toBe('user');
    expect(root.viewId).toBe('vx');
  });
});

describe('addEdge', () => {
  it('adds an edge between two existing thoughts', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', V, deps).base;
    b = addThought(b, 'ai', V, deps).base;
    const { base, edge } = addEdge(b, 'id1', 'id2', 'branch', deps);
    expect(edge).not.toBeNull();
    expect(base.edges).toHaveLength(1);
    expect(base.edges[0]).toMatchObject({ source: 'id1', target: 'id2', kind: 'branch' });
  });

  it('ignores duplicates with the same source+target+kind', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', V, deps).base;
    b = addThought(b, 'ai', V, deps).base;
    b = addEdge(b, 'id1', 'id2', 'branch', deps).base;
    const { base, edge } = addEdge(b, 'id1', 'id2', 'branch', deps);
    expect(edge).toBeNull();
    expect(base.edges).toHaveLength(1);
  });

  it('allows the same source+target with a different kind', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', V, deps).base;
    b = addThought(b, 'ai', V, deps).base;
    b = addEdge(b, 'id1', 'id2', 'branch', deps).base;
    const { base } = addEdge(b, 'id1', 'id2', 'link', deps);
    expect(base.edges).toHaveLength(2);
  });

  it('allows a cross-view edge (viewId is a soft label, not a partition)', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', 'va', deps).base; // id1
    b = addThought(b, 'ai', 'vb', deps).base; // id2 in a different view
    const { base, edge } = addEdge(b, 'id1', 'id2', 'link', deps);
    expect(edge).not.toBeNull();
    expect(base.edges).toHaveLength(1);
  });

  it('ignores edges that reference a missing thought', () => {
    const deps = makeDeps();
    const b = addThought(emptyBase(), 'user', V, deps).base;
    const { base, edge } = addEdge(b, 'id1', 'ghost', 'branch', deps);
    expect(edge).toBeNull();
    expect(base.edges).toHaveLength(0);
  });
});

describe('branchFrom', () => {
  it('creates a child user thought plus a branch edge', () => {
    const deps = makeDeps();
    const root = addThought(emptyBase(), 'user', V, deps).base; // id1
    const { base, child, edge } = branchFrom(root, 'id1', deps);
    expect(child).not.toBeNull();
    expect(child!.kind).toBe('user');
    expect(Object.keys(base.thoughts)).toHaveLength(2);
    expect(edge).toMatchObject({ source: 'id1', target: child!.id, kind: 'branch' });
    expect(base.edges).toHaveLength(1);
  });

  it('homes the child in the same view as its parent', () => {
    const deps = makeDeps();
    const root = addThought(emptyBase(), 'user', 'va', deps).base; // id1 in va
    const { child } = branchFrom(root, 'id1', deps);
    expect(child!.viewId).toBe('va');
  });

  it('is a no-op for a missing parent', () => {
    const deps = makeDeps();
    const { base, child, edge } = branchFrom(emptyBase(), 'nope', deps);
    expect(child).toBeNull();
    expect(edge).toBeNull();
    expect(Object.keys(base.thoughts)).toHaveLength(0);
  });

  it('stores an anchor (offsets + quote) on the branch edge when given one', () => {
    const deps = makeDeps();
    const root = addThought(emptyBase(), 'user', V, deps, 'hello world, how are you').base; // id1
    const anchor = { start: 6, end: 11, quote: 'world' };
    const { edge } = branchFrom(root, 'id1', deps, anchor);
    expect(edge!.kind).toBe('branch');
    expect(edge!.anchor).toEqual({ start: 6, end: 11, quote: 'world' });
  });

  it('omits anchor entirely for a whole-thought branch (the default)', () => {
    const deps = makeDeps();
    const root = addThought(emptyBase(), 'user', V, deps).base; // id1
    const { edge } = branchFrom(root, 'id1', deps);
    expect(edge!.anchor).toBeUndefined();
    expect('anchor' in edge!).toBe(false);
  });
});

describe('deleteThought', () => {
  it('removes the thought and all incident edges (no dangling edges)', () => {
    const deps = makeDeps();
    // root(id1) → a(id2 via branch), a → b(id3), and a link id1→id3
    let b = addThought(emptyBase(), 'user', V, deps).base;
    b = branchFrom(b, 'id1', deps).base; // child id2, edge id3
    b = branchFrom(b, 'id2', deps).base; // child id4, edge id5
    b = addEdge(b, 'id1', 'id4', 'link', deps).base;
    // delete the middle node id2
    const next = deleteThought(b, 'id2');
    expect(next.thoughts['id2']).toBeUndefined();
    expect(next.edges.every((e) => e.source !== 'id2' && e.target !== 'id2')).toBe(true);
    // the id1→id4 link is untouched
    expect(next.edges.some((e) => e.source === 'id1' && e.target === 'id4')).toBe(true);
  });

  it('handles single-node and empty bases', () => {
    const deps = makeDeps();
    const single = addThought(emptyBase(), 'user', V, deps).base;
    expect(deleteThought(single, 'id1').thoughts).toEqual({});
    const empty = emptyBase();
    expect(deleteThought(empty, 'whatever')).toBe(empty);
  });

  it('cascades deeply: deleting a hub clears every incident edge', () => {
    const deps = makeDeps();
    let b = addThought(emptyBase(), 'user', V, deps).base; // id1 hub
    // fan out 3 children
    b = branchFrom(b, 'id1', deps).base;
    b = branchFrom(b, 'id1', deps).base;
    b = branchFrom(b, 'id1', deps).base;
    expect(b.edges).toHaveLength(3);
    const next = deleteThought(b, 'id1');
    expect(next.edges).toHaveLength(0);
  });
});
