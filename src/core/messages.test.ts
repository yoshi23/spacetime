import { describe, expect, it } from 'vitest';
import type { Base, Edge, TextAnchor, Thought } from './types';
import { buildMessages } from './messages';

// --- builders -------------------------------------------------------------

function thought(id: string, kind: Thought['kind'], content: string): Thought {
  return { id, kind, content, viewId: 'v', createdAt: 0, updatedAt: 0 };
}

function lineage(
  source: string,
  target: string,
  kind: Edge['kind'] = 'parent',
  anchor?: TextAnchor,
): Edge {
  return { id: `${source}->${target}`, source, target, kind, ...(anchor ? { anchor } : {}) };
}

function base(thoughts: Thought[], edges: Edge[] = []): Base {
  return { thoughts: Object.fromEntries(thoughts.map((t) => [t.id, t])), edges };
}

// --- tests ----------------------------------------------------------------

describe('buildMessages', () => {
  it('returns [] for an unknown node', () => {
    expect(buildMessages(base([]), 'nope')).toEqual([]);
  });

  it('root / single node → one user message', () => {
    const b = base([thought('a', 'user', 'hello')]);
    expect(buildMessages(b, 'a')).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('deep chain alternates user/assistant/user…', () => {
    const b = base(
      [
        thought('a', 'user', 'q1'),
        thought('b', 'ai', 'a1'),
        thought('c', 'user', 'q2'),
        thought('d', 'ai', 'a2'),
      ],
      [lineage('a', 'b'), lineage('b', 'c'), lineage('c', 'd')],
    );
    expect(buildMessages(b, 'd')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ]);
  });

  it('merges consecutive same-role (user) thoughts', () => {
    // user 'a' → user 'b' (branch) → user question 'c'; all three are `user`
    // role and must collapse into a single message before the ai turn.
    const b = base(
      [
        thought('a', 'user', 'first'),
        thought('b', 'user', 'a note'),
        thought('c', 'user', 'second'),
        thought('d', 'ai', 'answer'),
      ],
      [lineage('a', 'b', 'branch'), lineage('b', 'c'), lineage('c', 'd')],
    );
    expect(buildMessages(b, 'd')).toEqual([
      { role: 'user', content: 'first\n\na note\n\nsecond' },
      { role: 'assistant', content: 'answer' },
    ]);
  });

  it('walks to a branch point and starts with user', () => {
    // a(user) → b(ai); branch from b → c(user). Context for c = a,b,c.
    const b = base(
      [
        thought('a', 'user', 'root q'),
        thought('b', 'ai', 'reply'),
        thought('c', 'user', 'my aside'),
      ],
      [lineage('a', 'b'), lineage('b', 'c', 'branch')],
    );
    const msgs = buildMessages(b, 'c');
    expect(msgs[0].role).toBe('user');
    expect(msgs).toEqual([
      { role: 'user', content: 'root q' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'my aside' },
    ]);
  });

  it('injects the anchor quote into the node it leads into', () => {
    const anchor: TextAnchor = { start: 6, end: 11, quote: 'world' };
    const b = base(
      [
        thought('a', 'user', 'hello world, how are you'),
        thought('b', 'user', 'tell me about this'),
      ],
      [lineage('a', 'b', 'branch', anchor)],
    );
    expect(buildMessages(b, 'b')).toEqual([
      {
        role: 'user',
        content: 'hello world, how are you\n\nRe: "world"\n\ntell me about this',
      },
    ]);
  });

  it('anchor injection survives the consecutive-role merge join', () => {
    const anchor: TextAnchor = { start: 0, end: 3, quote: 'cat' };
    const b = base(
      [
        thought('a', 'user', 'cats are great'),
        thought('b', 'ai', 'indeed'),
        thought('c', 'user', 'more on cats'),
      ],
      [lineage('a', 'b'), lineage('b', 'c', 'branch', anchor)],
    );
    expect(buildMessages(b, 'c')).toEqual([
      { role: 'user', content: 'cats are great' },
      { role: 'assistant', content: 'indeed' },
      { role: 'user', content: 'Re: "cat"\n\nmore on cats' },
    ]);
  });
});
