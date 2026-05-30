import dagre from '@dagrejs/dagre';
import type { ThoughtId } from './types';

// Pure auto-layout: sizes + lineage edges in, positions out. No React / no
// React Flow — dagre is a framework-agnostic graph layout lib.

export interface Size {
  width: number;
  height: number;
}

export interface LayoutNode {
  id: ThoughtId;
  size: Size;
  // Manually-placed nodes keep their position and are excluded from the
  // auto-arranged tree (their slot is still reserved so siblings space out).
  pinned?: boolean;
  position?: { x: number; y: number };
}

export interface LayoutEdge {
  source: ThoughtId;
  target: ThoughtId;
  // 0..1 — where in the parent's text the branch was anchored. Used only as a
  // soft vertical hint; collision-freedom always wins.
  anchorFraction?: number;
}

export interface LayoutOptions {
  rankSep?: number;
  nodeSep?: number;
  margin?: number;
}

export type Positions = Record<ThoughtId, { x: number; y: number }>;

const DEFAULTS = { rankSep: 90, nodeSep: 60, margin: 24 };
const ANCHOR_MIN_GAP = 28; // min vertical gap kept below a parent when biasing

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

// Soft hint: nudge an anchored child up toward its parent's anchored line,
// but only as far as it can go without overlapping the parent or any other
// node. Collision-free layout wins; the bias is best-effort.
function applyAnchorBias(
  pos: Positions,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  sizeById: Map<ThoughtId, Size>,
  nodeSep: number,
): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    if (e.anchorFraction == null) continue;
    const child = byId.get(e.target);
    if (!child || child.pinned) continue;
    const p = pos[e.source];
    const c = pos[e.target];
    const ps = sizeById.get(e.source);
    const cs = sizeById.get(e.target);
    if (!p || !c || !ps || !cs) continue;

    const anchorLine = p.y + e.anchorFraction * ps.height;
    const parentBottom = p.y + ps.height;
    // Stay below the parent; bias toward the anchor line if it sits lower.
    const desiredTop = Math.max(parentBottom + ANCHOR_MIN_GAP, anchorLine);
    if (desiredTop >= c.y) continue; // already at/below the hint — leave it

    const candidate = { x: c.x, y: desiredTop, w: cs.width, h: cs.height };
    const collides = nodes.some((other) => {
      if (other.id === e.target) return false;
      const op = pos[other.id];
      const os = sizeById.get(other.id);
      if (!op || !os) return false;
      return rectsOverlap(candidate, { x: op.x, y: op.y, w: os.width, h: os.height }, nodeSep / 2);
    });
    if (!collides) pos[e.target] = { x: candidate.x, y: candidate.y };
  }
}

/**
 * Lay out a tree top-down (parents above children, siblings spread
 * horizontally) with no overlaps, sizing each node by its measured box.
 * Pinned nodes keep their manual position. Returns top-left positions.
 */
export function layoutTree(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): Positions {
  const { rankSep, nodeSep, margin } = { ...DEFAULTS, ...options };
  const sizeById = new Map(nodes.map((n) => [n.id, n.size]));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: rankSep, nodesep: nodeSep, marginx: margin, marginy: margin });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.size.width, height: n.size.height });
  for (const e of edges) {
    if (sizeById.has(e.source) && sizeById.has(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const pos: Positions = {};
  for (const n of nodes) {
    if (n.pinned && n.position) {
      pos[n.id] = { ...n.position };
      continue;
    }
    const d = g.node(n.id) as { x: number; y: number } | undefined;
    // dagre reports center positions; convert to top-left.
    pos[n.id] = d
      ? { x: d.x - n.size.width / 2, y: d.y - n.size.height / 2 }
      : (n.position ?? { x: 0, y: 0 });
  }

  applyAnchorBias(pos, nodes, edges, sizeById, nodeSep);
  return pos;
}

// Rough height estimate from content, for sensible *initial* placement of a
// freshly created node (real layout uses measured sizes via layoutTree).
export function estimateHeight(content: string, opts?: { charsPerLine?: number }): number {
  const charsPerLine = opts?.charsPerLine ?? 64;
  const lines = content
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return Math.min(lines, 50) * 22 + 48; // line height ~22, + chrome/padding
}
