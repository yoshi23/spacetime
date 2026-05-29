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
