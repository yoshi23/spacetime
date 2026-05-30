import { describe, expect, it } from 'vitest';
import { estimateHeight, layoutTree, type LayoutEdge, type LayoutNode } from './layout';

const SIZE = { width: 200, height: 100 };

function node(id: string, extra: Partial<LayoutNode> = {}): LayoutNode {
  return { id, size: SIZE, ...extra };
}

// Do two laid-out node rectangles overlap?
function overlap(
  pos: Record<string, { x: number; y: number }>,
  a: string,
  b: string,
  size = SIZE,
): boolean {
  const ra = { x: pos[a].x, y: pos[a].y, w: size.width, h: size.height };
  const rb = { x: pos[b].x, y: pos[b].y, w: size.width, h: size.height };
  return ra.x < rb.x + rb.w && ra.x + ra.w > rb.x && ra.y < rb.y + rb.h && ra.y + ra.h > rb.y;
}

describe('layoutTree', () => {
  it('places children below their parent with no overlaps', () => {
    const nodes = [node('p'), node('c1'), node('c2')];
    const edges: LayoutEdge[] = [
      { source: 'p', target: 'c1' },
      { source: 'p', target: 'c2' },
    ];
    const pos = layoutTree(nodes, edges);

    // children are strictly below the parent
    expect(pos.c1.y).toBeGreaterThan(pos.p.y);
    expect(pos.c2.y).toBeGreaterThan(pos.p.y);
    // siblings are horizontally separated, parent and children don't overlap
    expect(overlap(pos, 'c1', 'c2')).toBe(false);
    expect(overlap(pos, 'p', 'c1')).toBe(false);
    expect(overlap(pos, 'p', 'c2')).toBe(false);
  });

  it('stacks a deep chain with no overlaps and increasing depth', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges: LayoutEdge[] = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    const pos = layoutTree(nodes, edges);
    expect(pos.b.y).toBeGreaterThan(pos.a.y);
    expect(pos.c.y).toBeGreaterThan(pos.b.y);
    expect(overlap(pos, 'a', 'b')).toBe(false);
    expect(overlap(pos, 'b', 'c')).toBe(false);
    expect(overlap(pos, 'a', 'c')).toBe(false);
  });

  it('keeps pinned nodes at their manual position', () => {
    const nodes = [
      node('p'),
      node('c1', { pinned: true, position: { x: 999, y: 999 } }),
      node('c2'),
    ];
    const edges: LayoutEdge[] = [
      { source: 'p', target: 'c1' },
      { source: 'p', target: 'c2' },
    ];
    const pos = layoutTree(nodes, edges);
    expect(pos.c1).toEqual({ x: 999, y: 999 });
  });

  it('handles a tall parent: child clears the parent height (no overlap)', () => {
    const tall = { width: 480, height: 900 };
    const nodes: LayoutNode[] = [
      { id: 'p', size: tall },
      { id: 'c', size: { width: 480, height: 120 } },
    ];
    const pos = layoutTree(nodes, [{ source: 'p', target: 'c' }]);
    // child top is below the parent's bottom edge
    expect(pos.c.y).toBeGreaterThanOrEqual(pos.p.y + tall.height);
  });

  it('anchor bias never causes overlap', () => {
    const tall = { width: 480, height: 600 };
    const nodes: LayoutNode[] = [
      { id: 'p', size: tall },
      { id: 'c', size: { width: 480, height: 120 } },
    ];
    // anchor near the top of the parent — biases the child upward (toward it)
    const pos = layoutTree(nodes, [{ source: 'p', target: 'c', anchorFraction: 0.1 }]);
    // still below the parent, never overlapping it
    expect(pos.c.y).toBeGreaterThanOrEqual(pos.p.y + tall.height);
  });
});

describe('estimateHeight', () => {
  it('grows with content and caps around 50 lines', () => {
    expect(estimateHeight('')).toBeLessThan(estimateHeight('a\n'.repeat(10)));
    const huge = estimateHeight('x\n'.repeat(500));
    expect(huge).toBeLessThanOrEqual(50 * 22 + 48);
  });
});
