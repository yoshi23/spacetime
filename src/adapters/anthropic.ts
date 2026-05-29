import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMProvider } from './llm';

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

// The slice of the SDK we depend on. Declaring it as an interface lets tests
// inject a fake client and assert the request shape without any network call.
export interface MessagesClient {
  messages: {
    create(body: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: { role: 'user' | 'assistant'; content: string }[];
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  client?: MessagesClient; // injectable for tests
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: MessagesClient;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey ?? import.meta.env.VITE_ANTHROPIC_API_KEY,
        // Single-user local tool; acceptable for now (see session-2 brief).
        dangerouslyAllowBrowser: true,
      });
  }

  async complete(
    messages: LLMMessage[],
    opts: { maxTokens: number; system?: string },
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    // Concatenate the text blocks of the response.
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
  }
}
