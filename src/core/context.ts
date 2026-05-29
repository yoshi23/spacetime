import type { Base, Edge, TextAnchor, Thought, ThoughtId } from './types';
// Type-only import of the message contract — no runtime/React/idb coupling.
import type { LLMMessage } from '../adapters/llm';

// Edge kinds that form the context lineage. Branching forks the context
// (see CLAUDE.md), so a `branch` edge is just as much an ancestor link as a
// `parent` one — and it's where selection anchors live.
const LINEAGE_KINDS: ReadonlySet<Edge['kind']> = new Set(['parent', 'branch']);

function incomingLineageEdge(base: Base, nodeId: ThoughtId): Edge | undefined {
  return base.edges.find((e) => e.target === nodeId && LINEAGE_KINDS.has(e.kind));
}

type Role = LLMMessage['role'];

function roleOf(thought: Thought): Role {
  return thought.kind === 'ai' ? 'assistant' : 'user';
}

// A node's contributed text. An anchor on the edge leading into it prefixes
// the text with the quoted span, so a branch from a specific line tells Claude
// which line it's about.
function contribution(content: string, anchor: TextAnchor | undefined): string {
  return anchor ? `Re: "${anchor.quote}"\n\n${content}` : content;
}

/**
 * Assemble the ordered ancestor path root → nodeId into an Anthropic-shaped
 * message list: roles mapped (ai → assistant, user/note → user), consecutive
 * same-role thoughts merged (joined with "\n\n"), starting with `user` and
 * strictly alternating. Returns [] for an unknown node.
 */
export function buildContext(base: Base, nodeId: ThoughtId): LLMMessage[] {
  // Walk incoming lineage edges from nodeId up to the root.
  const chain: { thought: Thought; anchor: TextAnchor | undefined }[] = [];
  const seen = new Set<ThoughtId>();
  let current: ThoughtId | undefined = nodeId;
  while (current && base.thoughts[current] && !seen.has(current)) {
    seen.add(current);
    const edge = incomingLineageEdge(base, current);
    chain.push({ thought: base.thoughts[current], anchor: edge?.anchor });
    current = edge?.source;
  }
  chain.reverse(); // root → nodeId

  const messages: LLMMessage[] = [];
  for (const { thought, anchor } of chain) {
    const role = roleOf(thought);
    const text = contribution(thought.content, anchor);
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }
  return messages;
}
