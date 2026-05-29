# SpaceTime

A desktop thinking workspace for brainstorming and studying with LLMs. Instead of
linear chat, thoughts live on a spatial canvas: each thought is a node, LLM responses
branch instead of scrolling, and **branching a node forks the LLM context**.

See [`CLAUDE.md`](./CLAUDE.md) for architecture and [`docs/`](./docs) for the
per-session build briefs.

## Setup

```sh
npm install
cp .env.example .env          # then paste your Anthropic API key into .env
npm run dev
```

`VITE_ANTHROPIC_API_KEY` (from https://console.anthropic.com/) is read from `.env`,
which is gitignored — never commit a real key. Without it the canvas still works;
Cmd+Enter (Claude responses) needs the key.

## Scripts

- `npm run dev` — Vite dev server
- `npm test` — Vitest suite (core + adapters + store + a UI smoke layer)
- `npm run build` — typecheck + production build

## Stack

Vite · React + TypeScript (strict) · `@xyflow/react` (canvas) · `zustand` (state) ·
`idb-keyval` (persistence) · `@anthropic-ai/sdk` (LLM, BYOK).
