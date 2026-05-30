# Session 2 — The loop (usable MVP)

**Goal:** type a thought, press Cmd+Enter, get a real Claude response as a child node you can branch from. This is the MVP. After this session, dogfood it.

Read `CLAUDE.md` first. Architecture, seams, and the testing policy there govern this session.

## In scope

### Context assembly — `src/core`
- `buildContext(base, nodeId): LLMMessage[]` — pure function.
  - Walk `parent` edges from root → `nodeId`; produce the ordered ancestor path.
  - Map each thought to a message: `kind === 'ai'` → `assistant`; `user` and `note` → `user`.
  - **Merge consecutive same-role thoughts** into one message (join contents with `\n\n`). The Anthropic Messages API requires alternating roles starting with `user`; the result must satisfy that.
  - **Anchor injection:** if the edge leading into a node carries an `anchor`, prefix that node's contributed text with its quoted span, e.g. `Re: "{anchor.quote}"\n\n{content}`. This is the payoff of the anchor model — a branch from a specific line tells Claude which line.

### LLM adapter — `src/adapters`
- `AnthropicProvider` implements the existing `LLMProvider` interface.
  - Uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` (single-user local tool; acceptable for now).
  - API key from `import.meta.env.VITE_ANTHROPIC_API_KEY`. Read `.env`, never hardcode.
  - Default model: `claude-sonnet-4-6`.

### Wiring — `src/store` + `src/ui`
- Cmd+Enter on a focused node → `buildContext` → `provider.complete(messages, opts)` → create a new `ai` child thought with a `parent` edge to the source node, content = the response.
- Show a loading state on the pending child (or the source node) while the call is in flight.
- Errors (bad key, network, API error) surface inline on the node — no crash, no silent failure.
- **Short/long control:** a per-workspace toggle.
  - Short → low `max_tokens` + a system line favouring terse, direct answers.
  - Long → generous `max_tokens`, no brevity constraint.
  - Persist the choice as a setting (extend the store/`Store`; reflect in `complete` opts).

## Out of scope (do not build)
- Streaming responses (immediate fast-follow, not tonight).
- Slash commands, model picker UI (Sonnet default is fine), retry/backoff/rate-limit handling beyond surfacing the error.
- Any change to the node editor framework — keep the plain textarea.

## Acceptance criteria
1. `.env` holds `VITE_ANTHROPIC_API_KEY`; `.env` is gitignored; README notes the one-line setup.
2. `AnthropicProvider` implements `LLMProvider`, uses the env key, defaults to `claude-sonnet-4-6`.
3. `buildContext` returns a valid alternating-role message list starting with `user`, with consecutive same-role thoughts merged.
4. Anchored branches inject the quoted span into the contributed message.
5. Cmd+Enter creates an `ai` child with Claude's response; loading state shows while in flight; errors render inline without crashing.
6. Short/long toggle changes response length (verifiably different `max_tokens`) and persists across reload.
7. Core unit tests for `buildContext`: root / single / deep chain / branch point, role mapping, consecutive-role merge, anchor injection.
8. Provider test with **mocked network** asserting the messages and `maxTokens` passed through; no real API call in any test.
9. `tsc --noEmit` strict passes; `npm test` green; no React/idb imports in `src/core`.

## Notes
- The key must never be committed or logged. Confirm `.gitignore` covers `.env` before the first commit.
- All model access stays behind `LLMProvider` — the UI and store never import the SDK directly.
- If the API rejects the message shape, the bug is almost always in `buildContext` role-merging — test that first.
