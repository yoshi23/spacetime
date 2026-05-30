import { create } from 'zustand';
import type {
  Base,
  EdgeKind,
  ResponseLength,
  Settings,
  TextAnchor,
  Thought,
  ThoughtId,
  View,
} from '../core/types';
import {
  addEdge as addEdgeOp,
  addThought as addThoughtOp,
  branchFrom as branchFromOp,
  deleteThought as deleteThoughtOp,
  emptyBase,
  seedView,
  updateContent as updateContentOp,
} from '../core/graph';
import type { GraphDeps } from '../core/graph';
import { buildMessages } from '../core/messages';
import { defaultClock, defaultIdGen } from '../core/ids';
import { IndexedDBStore } from '../adapters/store';
import type { PersistedState, Store } from '../adapters/store';
import { AnthropicProvider } from '../adapters/anthropic';
import type { LLMProvider } from '../adapters/llm';

export type Position = { x: number; y: number };

// In-flight / failed state for an AI child. Transient — never persisted.
export interface AiStatus {
  loading: boolean;
  error?: string;
}

export interface SpaceTimeState {
  base: Base;
  views: View[];
  activeViewId: string;
  status: 'loading' | 'ready';
  settings: Settings;
  // Transient UI selection (the focused canvas node). Not persisted.
  selectedThoughtId: ThoughtId | null;
  // Transient per-AI-child request state. Not persisted.
  aiStatus: Record<ThoughtId, AiStatus>;

  hydrate: () => Promise<void>;
  addThought: (kind: Thought['kind'], position: Position) => ThoughtId;
  updateThoughtContent: (id: ThoughtId, content: string) => void;
  moveThought: (id: ThoughtId, position: Position) => void;
  addEdge: (source: ThoughtId, target: ThoughtId, kind: EdgeKind) => void;
  branchFrom: (parentId: ThoughtId, anchor?: TextAnchor) => ThoughtId | null;
  deleteThought: (id: ThoughtId) => void;
  setSelectedThought: (id: ThoughtId | null) => void;
  setResponseLength: (length: ResponseLength) => void;
  // Cmd+Enter: assemble messages from nodeId, ask Claude, attach an ai child.
  respondTo: (nodeId: ThoughtId) => Promise<ThoughtId | null>;
  // Canvas management. One View = one canvas = one conversation.
  setActiveView: (viewId: string) => void;
  createView: () => string;
}

const DEFAULT_VIEW_ID = 'v_canvas';
const BRANCH_OFFSET: Position = { x: 60, y: 120 };
// Where an AI reply lands relative to its source node.
const AI_OFFSET: Position = { x: 0, y: 160 };

const DEFAULT_SETTINGS: Settings = { responseLength: 'long' };

// Maps the per-workspace length toggle to concrete provider opts.
const RESPONSE_PRESETS: Record<ResponseLength, { maxTokens: number; system?: string }> = {
  short: {
    maxTokens: 256,
    system: 'Be terse and direct. Answer in as few words as possible without losing meaning. No preamble.',
  },
  long: { maxTokens: 2048 },
};

export interface StoreConfig {
  store?: Store;
  deps?: GraphDeps;
  saveDebounceMs?: number;
  // Lazily constructed on first respondTo so importing the store in tests
  // never builds the real SDK / reads the env key.
  createProvider?: () => LLMProvider;
}

function defaultView(): View {
  return { id: DEFAULT_VIEW_ID, name: 'Canvas', layout: {} };
}

// Seed used on first run / empty store: the default canvas with one root.
function seedState(deps: GraphDeps): Required<Pick<PersistedState, 'base' | 'views' | 'settings' | 'activeViewId'>> {
  const { base, root } = seedView(emptyBase(), DEFAULT_VIEW_ID, deps);
  const view: View = { id: DEFAULT_VIEW_ID, name: 'Canvas', layout: { [root.id]: { x: 0, y: 0 } } };
  return { base, views: [view], settings: DEFAULT_SETTINGS, activeViewId: DEFAULT_VIEW_ID };
}

// Migrate thoughts from older blobs: backfill a missing viewId (pre-multi-view)
// into the default view, and remap the retired `note` kind to `user`.
function migrateThoughts(base: Base, fallbackViewId: string): Base {
  let changed = false;
  const thoughts: Base['thoughts'] = {};
  for (const [id, t] of Object.entries(base.thoughts)) {
    const legacyKind = (t.kind as string) === 'note';
    if (t.viewId && !legacyKind) {
      thoughts[id] = t;
    } else {
      thoughts[id] = {
        ...t,
        viewId: t.viewId ?? fallbackViewId,
        kind: legacyKind ? 'user' : t.kind,
      };
      changed = true;
    }
  }
  return changed ? { ...base, thoughts } : base;
}

export function createSpaceTimeStore(config: StoreConfig = {}) {
  const store: Store = config.store ?? new IndexedDBStore();
  const deps: GraphDeps = config.deps ?? { idGen: defaultIdGen, clock: defaultClock };
  const debounceMs = config.saveDebounceMs ?? 500;
  const createProvider = config.createProvider ?? (() => new AnthropicProvider());

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let provider: LLMProvider | null = null;
  const getProvider = (): LLMProvider => (provider ??= createProvider());

  return create<SpaceTimeState>((set, get) => {
    // Debounced persistence of the full base+views+settings snapshot.
    function scheduleSave() {
      if (get().status !== 'ready') return;
      const flush = () => {
        const { base, views, settings, activeViewId } = get();
        void store.save({ base, views, settings, activeViewId });
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
      settings: DEFAULT_SETTINGS,
      selectedThoughtId: null,
      aiStatus: {},

      async hydrate() {
        const loaded = await store.load();
        if (!loaded) {
          const seeded = seedState(deps);
          set({ ...seeded, status: 'ready' });
          void store.save(seeded);
          return;
        }
        const views = loaded.views.length ? loaded.views : [defaultView()];
        const fallbackViewId = views[0]?.id ?? DEFAULT_VIEW_ID;
        const activeViewId =
          loaded.activeViewId && views.some((v) => v.id === loaded.activeViewId)
            ? loaded.activeViewId
            : fallbackViewId;
        set({
          base: migrateThoughts(loaded.base, fallbackViewId),
          views,
          activeViewId,
          settings: loaded.settings ?? DEFAULT_SETTINGS,
          status: 'ready',
        });
      },

      addThought(kind, position) {
        // New thoughts are homed in the active canvas.
        const { base, thought } = addThoughtOp(get().base, kind, get().activeViewId, deps);
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
        if (get().selectedThoughtId === id) set({ selectedThoughtId: null });
        if (get().aiStatus[id]) {
          const next = { ...get().aiStatus };
          delete next[id];
          set({ aiStatus: next });
        }
        commit(base, views);
      },

      setSelectedThought(id) {
        set({ selectedThoughtId: id });
      },

      setResponseLength(length) {
        set({ settings: { ...get().settings, responseLength: length } });
        scheduleSave();
      },

      setActiveView(viewId) {
        if (!get().views.some((v) => v.id === viewId)) return;
        set({ activeViewId: viewId, selectedThoughtId: null });
        scheduleSave();
      },

      createView() {
        const viewId = `v_${deps.idGen()}`;
        const { base, root } = seedView(get().base, viewId, deps);
        const view: View = {
          id: viewId,
          name: `Canvas ${get().views.length + 1}`,
          layout: { [root.id]: { x: 0, y: 0 } },
        };
        set({
          base,
          views: [...get().views, view],
          activeViewId: viewId,
          selectedThoughtId: null,
        });
        scheduleSave();
        return viewId;
      },

      async respondTo(nodeId) {
        const source = get().base.thoughts[nodeId];
        if (!source) return null;
        const messages = buildMessages(get().base, nodeId);
        if (messages.length === 0) return null;

        // Create the pending ai child (same canvas as its source) + parent edge.
        const created = addThoughtOp(get().base, 'ai', source.viewId, deps);
        const childId = created.thought.id;
        const withEdge = addEdgeOp(created.base, nodeId, childId, 'parent', deps);
        const parentPos = activeView().layout[nodeId] ?? { x: 0, y: 0 };
        const views = setLayout(childId, {
          x: parentPos.x + AI_OFFSET.x,
          y: parentPos.y + AI_OFFSET.y,
        });
        set({ aiStatus: { ...get().aiStatus, [childId]: { loading: true } } });
        commit(withEdge.base, views);

        const preset = RESPONSE_PRESETS[get().settings.responseLength];
        try {
          const text = await getProvider().complete(messages, preset);
          commit(updateContentOp(get().base, childId, text, deps.clock));
          const next = { ...get().aiStatus };
          delete next[childId];
          set({ aiStatus: next });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set({ aiStatus: { ...get().aiStatus, [childId]: { loading: false, error: message } } });
        }
        return childId;
      },
    };
  });
}

// App-wide singleton store (IndexedDB-backed, default deps).
export const useStore = createSpaceTimeStore();
