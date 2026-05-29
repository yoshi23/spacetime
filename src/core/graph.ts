import type { Base, Edge, EdgeKind, Thought, ThoughtId } from './types';
import type { Clock, IdGen } from './ids';

export interface GraphDeps {
  idGen: IdGen;
  clock: Clock;
}

export function emptyBase(): Base {
  return { thoughts: {}, edges: [] };
}

// Create a thought and return the next base plus the created thought.
export function addThought(
  base: Base,
  kind: Thought['kind'],
  deps: GraphDeps,
  content = '',
): { base: Base; thought: Thought } {
  const now = deps.clock();
  const thought: Thought = {
    id: deps.idGen(),
    kind,
    content,
    createdAt: now,
    updatedAt: now,
  };
  return {
    base: { ...base, thoughts: { ...base.thoughts, [thought.id]: thought } },
    thought,
  };
}

export function updateContent(
  base: Base,
  id: ThoughtId,
  content: string,
  clock: Clock,
): Base {
  const existing = base.thoughts[id];
  if (!existing) return base;
  const updated: Thought = { ...existing, content, updatedAt: clock() };
  return { ...base, thoughts: { ...base.thoughts, [id]: updated } };
}

// True when an edge with the same source, target and kind already exists.
function edgeExists(base: Base, source: ThoughtId, target: ThoughtId, kind: EdgeKind): boolean {
  return base.edges.some(
    (e) => e.source === source && e.target === target && e.kind === kind,
  );
}

// Add an edge, ignoring duplicates (same source+target+kind) and edges
// referencing missing thoughts.
export function addEdge(
  base: Base,
  source: ThoughtId,
  target: ThoughtId,
  kind: EdgeKind,
  deps: GraphDeps,
): { base: Base; edge: Edge | null } {
  if (!base.thoughts[source] || !base.thoughts[target]) return { base, edge: null };
  if (edgeExists(base, source, target, kind)) return { base, edge: null };
  const edge: Edge = { id: deps.idGen(), source, target, kind };
  return { base: { ...base, edges: [...base.edges, edge] }, edge };
}

// Branch off a parent: create a child `note` thought and a `branch` edge
// from parent → child.
export function branchFrom(
  base: Base,
  parentId: ThoughtId,
  deps: GraphDeps,
): { base: Base; child: Thought | null; edge: Edge | null } {
  if (!base.thoughts[parentId]) return { base, child: null, edge: null };
  const created = addThought(base, 'note', deps);
  const withEdge = addEdge(created.base, parentId, created.thought.id, 'branch', deps);
  return { base: withEdge.base, child: created.thought, edge: withEdge.edge };
}

// Delete a thought and cascade to every incident edge (as source or target).
export function deleteThought(base: Base, id: ThoughtId): Base {
  if (!base.thoughts[id]) return base;
  const thoughts = { ...base.thoughts };
  delete thoughts[id];
  const edges = base.edges.filter((e) => e.source !== id && e.target !== id);
  return { thoughts, edges };
}
