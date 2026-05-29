import { create } from 'zustand';
import type { Base, EdgeKind, TextAnchor, Thought, ThoughtId, View } from '../core/types';
import {
  addEdge as addEdgeOp,
  addThought as addThoughtOp,
  branchFrom as branchFromOp,
  deleteThought as deleteThoughtOp,
  emptyBase,
  updateContent as updateContentOp,
} from '../core/graph';
import type { GraphDeps } from '../core/graph';
import { defaultClock, defaultIdGen } from '../core/ids';
import { IndexedDBStore } from '../adapters/store';
import type { PersistedState, Store } from '../adapters/store';

export type Position = { x: number; y: number };

export interface SpaceTimeState {
  base: Base;
  views: View[];
  activeViewId: string;
  status: 'loading' | 'ready';

  hydrate: () => Promise<void>;
  addThought: (kind: Thought['kind'], position: Position) => ThoughtId;
  updateThoughtContent: (id: ThoughtId, content: string) => void;
  moveThought: (id: ThoughtId, position: Position) => void;
  addEdge: (source: ThoughtId, target: ThoughtId, kind: EdgeKind) => void;
  branchFrom: (parentId: ThoughtId, anchor?: TextAnchor) => ThoughtId | null;
  deleteThought: (id: ThoughtId) => void;
}

const DEFAULT_VIEW_ID = 'v_canvas';
const BRANCH_OFFSET: Position = { x: 60, y: 120 };

export interface StoreConfig {
  store?: Store;
  deps?: GraphDeps;
  saveDebounceMs?: number;
}

function defaultView(): View {
  return { id: DEFAULT_VIEW_ID, name: 'Canvas', layout: {} };
}

// Seed used on first run / empty store: a single root `user` thought.
function seedState(deps: GraphDeps): PersistedState {
  const { base, thought } = addThoughtOp(emptyBase(), 'user', deps);
  const view = defaultView();
  view.layout[thought.id] = { x: 0, y: 0 };
  return { base, views: [view] };
}

export function createSpaceTimeStore(config: StoreConfig = {}) {
  const store: Store = config.store ?? new IndexedDBStore();
  const deps: GraphDeps = config.deps ?? { idGen: defaultIdGen, clock: defaultClock };
  const debounceMs = config.saveDebounceMs ?? 500;

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  return create<SpaceTimeState>((set, get) => {
    // Debounced persistence of the full base+views snapshot.
    function scheduleSave() {
      if (get().status !== 'ready') return;
      const flush = () => {
        const { base, views } = get();
        void store.save({ base, views });
      };
      if (debounceMs <= 0) {
        flush();
        return;
      }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, debounceMs);
    }

    // Apply a new base, update the active view layout, then schedule a save.
    function commit(base: Base, views?: View[]) {
      set(views ? { base, views } : { base });
      scheduleSave();
    }

    function activeView(): View {
      const { views, activeViewId } = get();
      return views.find((v) => v.id === activeViewId) ?? views[0];
    }

    function setLayout(id: ThoughtId, position: Position): View[] {
      const { views, activeViewId } = get();
      return views.map((v) =>
        v.id === activeViewId
          ? { ...v, layout: { ...v.layout, [id]: position } }
          : v,
      );
    }

    return {
      base: emptyBase(),
      views: [defaultView()],
      activeViewId: DEFAULT_VIEW_ID,
      status: 'loading',

      async hydrate() {
        const loaded = await store.load();
        const state = loaded ?? seedState(deps);
        const activeViewId = state.views[0]?.id ?? DEFAULT_VIEW_ID;
        set({
          base: state.base,
          views: state.views.length ? state.views : [defaultView()],
          activeViewId,
          status: 'ready',
        });
        // Persist the freshly seeded state so a reload finds it.
        if (!loaded) void store.save({ base: get().base, views: get().views });
      },

      addThought(kind, position) {
        const { base, thought } = addThoughtOp(get().base, kind, deps);
        const views = setLayout(thought.id, position);
        commit(base, views);
        return thought.id;
      },

      updateThoughtContent(id, content) {
        commit(updateContentOp(get().base, id, content, deps.clock));
      },

      moveThought(id, position) {
        set({ views: setLayout(id, position) });
        scheduleSave();
      },

      addEdge(source, target, kind) {
        const { base } = addEdgeOp(get().base, source, target, kind, deps);
        commit(base);
      },

      branchFrom(parentId, anchor) {
        const { base, child } = branchFromOp(get().base, parentId, deps, anchor);
        if (!child) return null;
        const parentPos = activeView().layout[parentId] ?? { x: 0, y: 0 };
        const views = setLayout(child.id, {
          x: parentPos.x + BRANCH_OFFSET.x,
          y: parentPos.y + BRANCH_OFFSET.y,
        });
        commit(base, views);
        return child.id;
      },

      deleteThought(id) {
        const base = deleteThoughtOp(get().base, id);
        // Drop the position entry from every view's layout too.
        const views = get().views.map((v) => {
          if (!(id in v.layout)) return v;
          const layout = { ...v.layout };
          delete layout[id];
          return { ...v, layout };
        });
        commit(base, views);
      },
    };
  });
}

// App-wide singleton store (IndexedDB-backed, default deps).
export const useStore = createSpaceTimeStore();
