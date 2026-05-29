# Session 1 — Canvas skeleton + data model

**Goal:** a running web app with a spatial canvas backed by the base/view model, where I can create, edit, move, and persist thought nodes. **No AI this session.**

Read `CLAUDE.md` first. This brief is scoped to satisfy its Session 1 entry.

## In scope

- Project structure per `CLAUDE.md`: `src/core`, `src/adapters`, `src/store`, `src/ui`.
- `src/core/types.ts` — the data model exactly as specified in `CLAUDE.md`.
- `src/adapters/store.ts` — the `Store` interface + an `IndexedDBStore` implementation using `idb-keyval`.
- `src/adapters/llm.ts` — the `LLMProvider` interface only. **No implementation** (Session 2).
- `src/store` — a zustand store holding `{ base, views, activeViewId }`, with actions:
  - `addThought(kind, position)` → creates a `Thought`, places it in the active view's layout.
  - `updateThoughtContent(id, content)`.
  - `moveThought(id, position)` → writes into the active view's `layout`.
  - `addEdge(source, target, kind)`.
  - `branchFrom(parentId)` → creates a child `note` thought + a `branch` edge, positioned near the parent.
  - `deleteThought(id)` → removes the thought and its incident edges.
  - Autosave to the `Store` (debounced ~500ms). Hydrate from `Store` on startup; if empty, seed one root `user` thought.
- `src/ui` — a React Flow canvas:
  - Renders thoughts as a custom node component; renders `Edge`s as React Flow edges.
  - Double-click empty canvas → `addThought('user', position)`, focus it for editing.
  - Custom node = an editable textarea; edits call `updateThoughtContent`.
  - Dragging a node calls `moveThought`.
  - A "branch" affordance on the node (small button) calls `branchFrom`.
  - Include React Flow `Controls` and `MiniMap`; pan/zoom via defaults.

## Out of scope (do not build)

Anything AI or network. dagre auto-layout (manual drag only this session). Slash commands. Document view. Keyboard traversal beyond React Flow defaults. Styling beyond clean/legible.

## Acceptance criteria

1. `npm run dev` serves the app; the canvas fills the window.
2. Double-click empty space creates an editable node; typed content persists.
3. Nodes can be dragged; positions survive a page reload.
4. Branching from a node creates a connected child with a visible edge.
5. Full state (thoughts, edges, positions) persists to IndexedDB and restores on reload.
6. No React / React Flow / IndexedDB imports inside `src/core`. Persistence and LLM access only via the interfaces in `src/adapters`.
7. `tsc --noEmit` passes under strict mode; no `any` in `src/core`.

## Notes

- The custom node reads/writes through the zustand store — never directly to IndexedDB.
- Keep the Anthropic key out of everything this session; there is no network call yet.
- Before writing code, confirm the file layout and the zustand store shape, then proceed. Commit once per acceptance criterion.
