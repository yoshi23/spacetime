# SpaceTime — project context

SpaceTime is a desktop thinking workspace for brainstorming and studying with LLMs. It replaces linear chat with a spatial canvas: each thought is a node, LLM responses branch instead of scrolling, and **branching a node = forking the LLM context**. The goal is to promote the AI from a simulated interlocutor into an extended-mind tool (the chat interface simulates a conversation with another person/agent, I want to bring in AI into my own extended mind - a la Andy Clark).

## Architecture principle (do not violate)

One global knowledge **base** is the source of truth. Everything the user sees is a **projection** over it.

- **Base** — all `Thought`s + all `Edge`s. Global. Never scoped to a single document.
- **View** — a projection over the base. The **canvas** is a *live, editable* view. When I create a new one it's empty (but in the background the previous thoughts are accessible). The **document** (later) is a *materialized* (snapshotted) linear view of a sub-DAG.
- **Ports & adapters** — core logic is framework-agnostic TypeScript. Persistence and LLM access sit behind interfaces (`Store`, `LLMProvider`) so they can be swapped later (IndexedDB → Postgres; Anthropic → others; browser → Electron) without touching core or UI.

Consequence: **never couple core logic to React, React Flow, IndexedDB, or Electron APIs.** Views render the base; adapters serve the base; `src/core` stays pure.

## Stack (fixed for v1)

- Vite + React + TypeScript (strict)
- `@xyflow/react` — canvas
- `@dagrejs/dagre` — auto-layout (Session 3)
- `zustand` — state + the in-memory side of the store seam
- `idb-keyval` — IndexedDB persistence adapter
- `@anthropic-ai/sdk` — LLM adapter (Session 2)
- Web app for now. **NOT Electron yet** — wrap once v1 is stable.

## Data model

```ts
// src/core/types.ts
export type ThoughtId = string;
export type EdgeKind = 'parent' | 'branch' | 'link' | 'merge';

export interface Thought {
  id: ThoughtId;
  kind: 'user' | 'ai' | 'note';
  content: string;                 // markdown
  createdAt: number;
  updatedAt: number;
  meta?: { model?: string; command?: string; tokens?: number };
  // later: embedding?: number[]   ← retrieval / connect / patterns hang here
}

export interface Edge {
  id: string;
  source: ThoughtId;
  target: ThoughtId;
  kind: EdgeKind;                  // v1 uses 'parent' and 'branch' only
}

export interface View {
  id: string;
  name: string;
  layout: Record<ThoughtId, { x: number; y: number }>;  // position overrides
}

export interface Base {
  thoughts: Record<ThoughtId, Thought>;
  edges: Edge[];
}
```

## Seams (interfaces)

```ts
// src/adapters/store.ts
export interface Store {
  load(): Promise<{ base: Base; views: View[] } | null>;
  save(data: { base: Base; views: View[] }): Promise<void>;
}

// src/adapters/llm.ts — implemented in Session 2
export interface LLMMessage { role: 'user' | 'assistant'; content: string; }
export interface LLMProvider {
  complete(
    messages: LLMMessage[],
    opts: { maxTokens: number; system?: string }
  ): Promise<string>;
}
```

## Hard constraints — do NOT build in v1

These are deferred **by dependency, not timeline.** They need a populated base + retrieval infra that v1 does not have (cold start: the base is empty on day one).

- No Electron, no packaging.
- No background daemon, ripples, or suggestion engine.
- No embeddings, semantic search, similarity-based `/connect`, or pattern extraction.
- No flatness barometer / engagement detection.
- No CRDT or multi-device sync (single user, last-write-wins on a JSON blob).
- No Temporal or any backend service.
- No Postgres (IndexedDB only).
- No merge-with-synthesis.

If a task seems to need one of these, stop and flag it rather than building it.

## Conventions

- `src/core` — pure domain logic and types. **No React, no React Flow, no IndexedDB imports.**
- `src/adapters` — `Store` (IndexedDB) and `LLMProvider` (Anthropic) implementations.
- `src/store` — the zustand store wiring core + adapters.
- `src/ui` — React components, including the React Flow canvas and custom node.
- Functional React with hooks. No class components.
- Small, reviewable commits — one per acceptance criterion.
- No `any` in `src/core`.

## Build sequence

- **Session 1 (current):** skeleton + data model + canvas with create / edit / drag / persist. No AI.
- **Session 2:** the loop — `buildContext()` (ancestor walk → messages), `LLMProvider` (Anthropic, BYOK), Cmd+Enter → child AI node, branch, short/long response control. **← usable MVP; start dogfooding.**
- **Session 3:** navigation polish — dagre auto-layout, fit-to-view, keyboard traversal (parent/child/sibling), dark/monospace aesthetic.
- **Layer 2 (later):** slash-command registry (`/challenge`, `/answer`, `/question`, `/extend`), manual `/connect` (draw a `link` edge between two selected thoughts), `/neutralize` de-biasing transform, question/statement auto-routing.
- **Layer 3 (later):** document (materialized linear view), embeddings + retrieval, pattern extraction, background daemon + ripples, barometer.
