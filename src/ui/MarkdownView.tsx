import { useCallback, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { rehypeSourceOffsets, selectionToAnchor } from './markdownAnchor';

export interface SelectionAnchor {
  start: number;
  end: number;
  quote: string;
}

// Sanitize schema extended to keep the source-offset markers we add.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...((defaultSchema.attributes?.span as unknown[]) ?? []), 'dataMdStart', 'className'],
  },
};

const rehypePlugins = [rehypeSourceOffsets, [rehypeSanitize, schema]] as never;

// Read-only markdown render of an ai thought. Selecting text yields a
// SelectionAnchor in *source* offsets (see markdownAnchor.ts).
export function MarkdownView({
  content,
  highlight,
  onSelectAnchor,
}: {
  content: string;
  highlight: { start: number; end: number } | null;
  onSelectAnchor: (anchor: SelectionAnchor | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Origin highlight: mark spans whose source range intersects [start,end).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>('[data-md-start]').forEach((span) => {
      const start = Number(span.dataset.mdStart);
      const end = start + (span.textContent?.length ?? 0);
      const hit = highlight != null && start < highlight.end && end > highlight.start;
      span.classList.toggle('md-hl', hit);
    });
  }, [highlight, content]);

  const handleSelect = useCallback(() => {
    if (ref.current) onSelectAnchor(selectionToAnchor(ref.current, content));
  }, [content, onSelectAnchor]);

  return (
    <div
      ref={ref}
      className="markdown nodrag"
      onMouseUp={handleSelect}
      onKeyUp={handleSelect}
      // keep React Flow from hijacking the pointer; native text selection still works
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ReactMarkdown rehypePlugins={rehypePlugins}>{content}</ReactMarkdown>
    </div>
  );
}
