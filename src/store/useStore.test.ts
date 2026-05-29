import { describe, expect, it } from 'vitest';
import { createSpaceTimeStore } from './useStore';
import type { GraphDeps } from '../core/graph';
import type { PersistedState, Store } from '../adapters/store';
import type { LLMMessage, LLMProvider } from '../adapters/llm';

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

// Fake LLM provider: records calls, no network.
class FakeProvider implements LLMProvider {
  calls: { messages: LLMMessage[]; opts: { maxTokens: number; system?: string } }[] = [];
  reply = 'the answer';
  fail: string | null = null;
  async complete(messages: LLMMessage[], opts: { maxTokens: number; system?: string }) {
    this.calls.push({ messages, opts });
    if (this.fail) throw new Error(this.fail);
    return this.reply;
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
        thoughts: {
          a: { id: 'a', kind: 'user', content: 'hi', viewId: 'v_canvas', createdAt: 1, updatedAt: 1 },
        },
        edges: [],
      },
      views: [{ id: 'v_canvas', name: 'Canvas', layout: { a: { x: 5, y: 6 } } }],
      activeViewId: 'v_canvas',
    };
    const store = new FakeStore(existing);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    expect(s.getState().base).toEqual(existing.base);
    expect(s.getState().views).toEqual(existing.views);
    expect(s.getState().activeViewId).toBe('v_canvas');
  });

  it('migrates a pre-multi-view blob: thoughts without viewId join v_canvas', async () => {
    // Old format: thought has no viewId, no activeViewId persisted.
    const old = {
      base: {
        thoughts: {
          a: { id: 'a', kind: 'user', content: 'legacy', createdAt: 1, updatedAt: 1 },
        },
        edges: [],
      },
      views: [{ id: 'v_canvas', name: 'Canvas', layout: { a: { x: 0, y: 0 } } }],
    } as unknown as PersistedState;
    const store = new FakeStore(old);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    expect(s.getState().base.thoughts['a'].viewId).toBe('v_canvas');
    expect(s.getState().activeViewId).toBe('v_canvas');
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
      activeViewId: s.getState().activeViewId,
    };

    // Reload into a fresh store instance from the same backing data.
    const s2 = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s2.getState().hydrate();

    expect({
      base: s2.getState().base,
      views: s2.getState().views,
      activeViewId: s2.getState().activeViewId,
    }).toEqual(snapshot);
    expect(s2.getState().views[0].layout[child!]).toEqual({ x: 222, y: 333 });
    // the branch edge's anchor (offsets + quote) is preserved across reload
    const branchEdge = s2.getState().base.edges.find((e) => e.target === child);
    expect(branchEdge!.anchor).toEqual({ start: 6, end: 11, quote: 'world' });
    // the seeded + added thoughts are homed in the active canvas
    expect(s2.getState().base.thoughts[child!].viewId).toBe(s2.getState().activeViewId);
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

describe('respondTo (the loop)', () => {
  async function readyStore(provider: FakeProvider) {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({
      store,
      deps: makeDeps(),
      ...NO_DEBOUNCE,
      createProvider: () => provider,
    });
    await s.getState().hydrate();
    const root = Object.keys(s.getState().base.thoughts)[0];
    s.getState().updateThoughtContent(root, 'what is 2+2?');
    return { s, root };
  }

  it('creates an ai child with a parent edge and fills it with the response', async () => {
    const provider = new FakeProvider();
    const { s, root } = await readyStore(provider);

    const childId = await s.getState().respondTo(root);
    expect(childId).not.toBeNull();

    const child = s.getState().base.thoughts[childId!];
    expect(child.kind).toBe('ai');
    expect(child.content).toBe('the answer');
    expect(
      s.getState().base.edges.some(
        (e) => e.source === root && e.target === childId && e.kind === 'parent',
      ),
    ).toBe(true);
    // status cleared on success
    expect(s.getState().aiStatus[childId!]).toBeUndefined();
    // the source node's content reached the provider as the last user message
    expect(provider.calls[0].messages.at(-1)).toEqual({ role: 'user', content: 'what is 2+2?' });
  });

  it('shows a loading state on the pending child while in flight', async () => {
    let resolve!: (v: string) => void;
    const provider = new FakeProvider();
    provider.complete = (messages, opts) => {
      provider.calls.push({ messages, opts });
      return new Promise<string>((r) => {
        resolve = r;
      });
    };
    const { s, root } = await readyStore(provider);

    const before = new Set(Object.keys(s.getState().base.thoughts));
    const pending = s.getState().respondTo(root);
    const childId = Object.keys(s.getState().base.thoughts).find((id) => !before.has(id))!;

    expect(s.getState().aiStatus[childId].loading).toBe(true);
    resolve('done');
    await pending;
    expect(s.getState().aiStatus[childId]).toBeUndefined();
    expect(s.getState().base.thoughts[childId].content).toBe('done');
  });

  it('surfaces errors inline without crashing; the child persists', async () => {
    const provider = new FakeProvider();
    provider.fail = 'invalid x-api-key';
    const { s, root } = await readyStore(provider);

    const childId = await s.getState().respondTo(root);
    expect(childId).not.toBeNull();
    expect(s.getState().aiStatus[childId!]).toEqual({ loading: false, error: 'invalid x-api-key' });
    // the ai child still exists (error renders on it; no crash, no silent drop)
    expect(s.getState().base.thoughts[childId!]?.kind).toBe('ai');
  });
});

describe('short/long response length', () => {
  it('sends different max_tokens for short vs long', async () => {
    const provider = new FakeProvider();
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({
      store,
      deps: makeDeps(),
      ...NO_DEBOUNCE,
      createProvider: () => provider,
    });
    await s.getState().hydrate();
    const root = Object.keys(s.getState().base.thoughts)[0];
    s.getState().updateThoughtContent(root, 'hi');

    s.getState().setResponseLength('short');
    await s.getState().respondTo(root);
    s.getState().setResponseLength('long');
    await s.getState().respondTo(root);

    const short = provider.calls[0].opts;
    const long = provider.calls[1].opts;
    expect(short.maxTokens).toBe(256);
    expect(short.system).toBeTruthy();
    expect(long.maxTokens).toBe(2048);
    expect(long.system).toBeUndefined();
    expect(long.maxTokens).toBeGreaterThan(short.maxTokens);
  });

  it('persists the choice across reload', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    s.getState().setResponseLength('short');

    const s2 = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s2.getState().hydrate();
    expect(s2.getState().settings.responseLength).toBe('short');
  });
});

describe('views (canvases)', () => {
  it('createView adds a view, switches to it, and seeds exactly one root user thought', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate(); // default v_canvas + its root

    const viewId = s.getState().createView();
    expect(s.getState().activeViewId).toBe(viewId);
    expect(s.getState().views.some((v) => v.id === viewId)).toBe(true);

    const inNew = Object.values(s.getState().base.thoughts).filter((t) => t.viewId === viewId);
    expect(inNew).toHaveLength(1);
    expect(inNew[0].kind).toBe('user');
    // the new view's layout positions its root
    const view = s.getState().views.find((v) => v.id === viewId)!;
    expect(view.layout[inNew[0].id]).toBeDefined();
  });

  it('keeps each canvas thoughts separate (filter by view) while the base stays global', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    const v1 = s.getState().activeViewId;
    const a = s.getState().addThought('note', { x: 0, y: 0 }); // in v1

    const v2 = s.getState().createView(); // switches active to v2
    const b = s.getState().addThought('note', { x: 0, y: 0 }); // in v2

    const inV1 = Object.values(s.getState().base.thoughts).filter((t) => t.viewId === v1);
    const inV2 = Object.values(s.getState().base.thoughts).filter((t) => t.viewId === v2);
    expect(inV1.some((t) => t.id === a)).toBe(true);
    expect(inV1.some((t) => t.id === b)).toBe(false);
    expect(inV2.some((t) => t.id === b)).toBe(true);
    // base remains globally queryable: every thought is still in one base map
    expect(s.getState().base.thoughts[a]).toBeDefined();
    expect(s.getState().base.thoughts[b]).toBeDefined();
  });

  it('persists views + activeViewId across reload', async () => {
    const store = new FakeStore(null);
    const s = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s.getState().hydrate();
    const v2 = s.getState().createView();

    const s2 = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s2.getState().hydrate();
    expect(s2.getState().views.map((v) => v.id)).toContain(v2);
    expect(s2.getState().activeViewId).toBe(v2);

    // switching active view persists too
    s2.getState().setActiveView('v_canvas');
    const s3 = createSpaceTimeStore({ store, deps: makeDeps(), ...NO_DEBOUNCE });
    await s3.getState().hydrate();
    expect(s3.getState().activeViewId).toBe('v_canvas');
  });
});
