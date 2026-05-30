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
  viewId: string;                  // home canvas — membership + provenance (soft label, see below)
  createdAt: number;
  updatedAt: number;
  meta?: { model?: string; command?: string; tokens?: number };
  // later: embedding?: number[]   ← retrieval / connect / patterns hang here
}

export interface TextAnchor {
  start: number;                   // char offset into parent (source) content
  end: number;
  quote: string;                   // snapshot of highlighted text — survives parent edits
}

export interface Edge {
  id: string;
  source: ThoughtId;
  target: ThoughtId;
  kind: EdgeKind;                  // v1 uses 'parent' and 'branch' only
  anchor?: TextAnchor;             // present when a branch came from a selection within the parent
}

export interface View {           // = a canvas = a brainstorm = a conversation
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

## Testing policy

Test by layer, not uniformly. Coverage value is highest in `src/core` (pure, cheap, bugs are silent) and lowest in `src/ui` (expensive, brittle, catches little). Match effort to that gradient.

- **Tooling:** Vitest for unit + integration. React Testing Library for the few UI tests. Not Jest — Vitest shares Vite config and is faster. Tests live next to the code as `*.test.ts(x)`.
- **`src/core` — thorough unit tests.** Every graph operation, with edge cases: `branchFrom`, `addEdge`, `deleteThought` (must cascade to incident edges), and later `buildContext` (ancestor walk: root, single node, deep chain, branch point). Pure in / pure out, no mocks. This is where the bulk of tests live.
- **`src/adapters` + `src/store` — targeted integration tests.** Store round-trip (build base → save → reload → assert deep-equal, including positions). Empty-store hydration seeds one root thought. Later: `LLMProvider` is called with correctly assembled messages (mock the network; never hit the real API in tests). A dozen meaningful tests, not hundreds.
- **`src/ui` — thin smoke layer, deferred to Session 3.** A couple of tests that the canvas renders and that create/branch fire the right store actions. Not pixel-level. Do not write extensive UI tests while interactions are still moving.
- **Don't test framework internals** (React Flow, zustand, idb-keyval). Test our logic, not theirs.
- `npm test` runs the full suite; it must pass before any commit that closes an acceptance criterion.

## Build sequence

- **Session 1 (current):** skeleton + data model + canvas with create / edit / drag / persist. No AI.
- **Session 2:** the loop — `buildContext()` (ancestor walk → messages), `LLMProvider` (Anthropic, BYOK), Cmd+Enter → child AI node, branch, short/long response control. **← usable MVP; start dogfooding.**
- **Session 3:** navigation polish — dagre auto-layout, fit-to-view, keyboard traversal (parent/child/sibling), dark/monospace aesthetic.
- **Layer 2 (later):** slash-command registry (`/challenge`, `/answer`, `/question`, `/extend`), manual `/connect` (draw a `link` edge between two selected thoughts), `/neutralize` de-biasing transform, question/statement auto-routing.
- **Layer 3 (later):** document (materialized linear view), embeddings + retrieval, pattern extraction, background daemon + ripples, barometer.

## Open model questions (do not resolve yet)

- **Thought-as-text vs thought-as-blocks.** A `Thought` is currently one markdown blob. The richer model (cf. the prior Conversation Tree app) is an ordered list of addressable blocks (paragraphs/lines), so any block is independently branchable, highlightable, and foldable. The `Edge.anchor` field is the bridge — it gives span-precise branching against the text model today without blocking a move to blocks later. Revisit when selection-branching UI and the document view are built (Layer 2). Do not refactor to blocks pre-emptively.

- **Context compaction (LLM context, not canvas).** `buildMessages()` sends the full root→node path. Branching is the first-line defense: each tangent lives on its own branch, so the path to any node stays short even when the whole base is large. When paths do get long, the strategy hierarchy is: (1) path-to-root only — current; (2) token-budgeted trimming — keep root + recent verbatim, compact the oldest middle nodes, no extra LLM calls; (3) summarized intermediate nodes — cached LLM summaries replacing stale middle nodes, real infra, only if trimming loses fidelity. Don't build until real paths approach the window; add a per-path token readout (Session 3) to know when that is.

## North star — why this beats chatbot memory

The long-term advantage is a **structural-first memory layer.** Chatbot memory is bolted onto a flat transcript: it must infer structure after the fact (chunk → embed → guess relationships → retrieve by similarity), reconstructing structure that was discarded at capture time. SpaceTime captures structure *as it is created* — anchors record which line spawned a thought, edges record branches/tangents/alternatives, lineages record trains of thought. So retrieval can be **structural first** (walk the graph) and **semantic second** (embeddings as refinement), rather than semantic-only over a flat log. Every preserved-structure decision (soft `viewId`, `anchor`, explicit `Edge`s, globally-queryable base) is an investment in this. The discipline that pays it off: keep capturing structure faithfully and keep the base globally queryable. Builds in Layer 3, once the base holds weeks of real thinking.
