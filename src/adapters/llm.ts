// LLMProvider seam — interface only in Session 1. The Anthropic
// implementation lands in Session 2. No network calls this session.

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  complete(
    messages: LLMMessage[],
    opts: { maxTokens: number; system?: string },
  ): Promise<string>;
}
