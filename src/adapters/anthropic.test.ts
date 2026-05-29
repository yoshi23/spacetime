import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, DEFAULT_MODEL } from './anthropic';
import type { MessagesClient } from './anthropic';
import type { LLMMessage } from './llm';

// Fake client capturing the request body — no network, ever.
function fakeClient(text = 'hi there') {
  const create = vi.fn(async () => ({
    content: [
      { type: 'text', text },
      { type: 'tool_use' }, // ignored by the text extractor
    ],
  }));
  const client: MessagesClient = { messages: { create } };
  return { client, create };
}

const MESSAGES: LLMMessage[] = [
  { role: 'user', content: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'q2' },
];

describe('AnthropicProvider', () => {
  it('passes messages, maxTokens, system and the default model through', async () => {
    const { client, create } = fakeClient();
    const provider = new AnthropicProvider({ client });

    const out = await provider.complete(MESSAGES, { maxTokens: 256, system: 'be terse' });

    expect(out).toBe('hi there');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      system: 'be terse',
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
      ],
    });
  });

  it('omits system when not provided and respects a model override', async () => {
    const { client, create } = fakeClient();
    const provider = new AnthropicProvider({ client, model: 'claude-haiku-4-5-20251001' });

    await provider.complete([{ role: 'user', content: 'hi' }], { maxTokens: 2048 });

    const body = create.mock.calls[0][0];
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(2048);
    expect('system' in body).toBe(false);
  });

  it('concatenates only the text blocks of the response', async () => {
    const { client } = fakeClient('hello world');
    const provider = new AnthropicProvider({ client });
    expect(await provider.complete([{ role: 'user', content: 'x' }], { maxTokens: 10 })).toBe(
      'hello world',
    );
  });
});
