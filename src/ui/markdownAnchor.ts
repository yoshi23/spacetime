// Source-offset preservation for markdown-rendered ai nodes.
//
// A DOM selection over rendered markdown gives offsets into the *rendered*
// text, not the source markdown (e.g. "**world**" renders "world", shifting
// every offset). To keep anchored branching correct, a rehype plugin wraps
// each rendered text node in <span data-md-start="N">, where N is that text
// node's source offset (markdown AST positions). selectionToAnchor then maps
// DOM endpoints back to source offsets via those spans.
//
// Exact for plain text (headers, bold/italic, lists, blockquotes, code,
// links). Character entities / backslash escapes decode to fewer chars than
// their source, so a selection crossing one within a single text run can be
// off by that delta — the anchor stays self-consistent, just not byte-perfect.

// Minimal hast-ish node shapes (avoids a hard @types/hast dependency).
interface HastText {
  type: 'text';
  value: string;
  position?: { start?: { offset?: number } };
}
interface HastParent {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}
type HastNode = HastText | HastParent;

// rehype plugin: wrap every positioned text node in <span data-md-start>.
export function rehypeSourceOffsets() {
  return (tree: HastNode): void => {
    const walk = (node: HastNode): void => {
      const parent = node as HastParent;
      if (!parent.children) return;
      const next: HastNode[] = [];
      for (const child of parent.children) {
        const offset =
          child.type === 'text' ? (child as HastText).position?.start?.offset : undefined;
        if (child.type === 'text' && typeof offset === 'number') {
          next.push({
            type: 'element',
            tagName: 'span',
            properties: { dataMdStart: String(offset) },
            children: [child],
          });
        } else {
          walk(child);
          next.push(child);
        }
      }
      parent.children = next;
    };
    walk(tree);
  };
}

function enclosingSpan(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const span = el?.closest('[data-md-start]') ?? null;
  return span as HTMLElement | null;
}

function firstSpanStart(node: Node): number | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const span = (el?.matches?.('[data-md-start]') ? el : el?.querySelector('[data-md-start]')) as
    | HTMLElement
    | null
    | undefined;
  return span?.dataset.mdStart != null ? Number(span.dataset.mdStart) : null;
}

function lastSpanEnd(node: Node): number | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return null;
  const spans = el.matches?.('[data-md-start]')
    ? [el as HTMLElement]
    : Array.from(el.querySelectorAll<HTMLElement>('[data-md-start]'));
  const span = spans[spans.length - 1];
  if (!span?.dataset.mdStart) return null;
  return Number(span.dataset.mdStart) + (span.textContent?.length ?? 0);
}

// Map one DOM boundary point (node, offset) to a source markdown offset.
export function pointToSourceOffset(node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const span = enclosingSpan(node);
    if (span?.dataset.mdStart != null) return Number(span.dataset.mdStart) + offset;
    return null;
  }
  // Element boundary: the point sits between child nodes at `offset`.
  const kids = node.childNodes;
  if (offset < kids.length) {
    const start = firstSpanStart(kids[offset]);
    if (start != null) return start;
  }
  if (offset > 0) {
    const end = lastSpanEnd(kids[offset - 1]);
    if (end != null) return end;
  }
  return null;
}

// Map the current window selection (if inside `container`) to a source anchor.
export function selectionToAnchor(
  container: HTMLElement,
  source: string,
): { start: number; end: number; quote: string } | null {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }
  const a = pointToSourceOffset(range.startContainer, range.startOffset);
  const b = pointToSourceOffset(range.endContainer, range.endOffset);
  if (a == null || b == null) return null;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (start >= end || end > source.length) return null;
  return { start, end, quote: source.slice(start, end) };
}
