import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import type { TextAnchor, ThoughtId } from '../core/types';
import { MarkdownView, type SelectionAnchor } from './MarkdownView';

interface Segment {
  text: string;
  mark: boolean;
}

// Build the backdrop segments from content + the anchors that branch out of
// this thought. Graceful degradation (NO reconciliation): an anchor is only
// rendered when its stored offsets still slice out its quote verbatim. If the
// parent was edited so the quote no longer matches, the anchor is silently
// skipped — the branch edge still exists, the highlight just disappears.
export function anchorSegments(content: string, anchors: readonly TextAnchor[]): Segment[] {
  const valid = anchors
    .filter(
      (a) =>
        a.start >= 0 &&
        a.end <= content.length &&
        a.start < a.end &&
        content.slice(a.start, a.end) === a.quote,
    )
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const a of valid) {
    if (a.start < cursor) continue; // skip overlaps; first-wins
    if (a.start > cursor) segments.push({ text: content.slice(cursor, a.start), mark: false });
    segments.push({ text: content.slice(a.start, a.end), mark: true });
    cursor = a.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), mark: false });
  // textareas collapse a single trailing newline; pad the mirror to match.
  if (content.endsWith('\n')) segments.push({ text: ' ', mark: false });
  return segments;
}

// Store-connected editor body, free of React Flow so it can be unit-rendered.
// ThoughtNode wraps this with the node frame + connection handles.
export function ThoughtEditor({ id }: { id: ThoughtId }) {
  const thought = useStore((s) => s.base.thoughts[id]);
  const edges = useStore((s) => s.base.edges);
  const selectedThoughtId = useStore((s) => s.selectedThoughtId);
  const aiStatus = useStore((s) => s.aiStatus[id]);
  const updateThoughtContent = useStore((s) => s.updateThoughtContent);
  const branchFrom = useStore((s) => s.branchFrom);
  const deleteThought = useStore((s) => s.deleteThought);
  const respondTo = useStore((s) => s.respondTo);

  const content = thought?.content ?? '';

  // Highlight is selection-driven: when a child node is selected and this
  // thought is its branch origin (source), show where it came from — the
  // anchored span, or the whole thought for a whole-thought (anchorless)
  // branch. No selected child of ours → no highlight.
  const originEdge = useMemo(
    () =>
      selectedThoughtId
        ? edges.find((e) => e.source === id && e.target === selectedThoughtId)
        : undefined,
    [edges, id, selectedThoughtId],
  );

  const isAi = thought?.kind === 'ai';

  const segments = useMemo(() => {
    if (!originEdge) return anchorSegments(content, []);
    const anchor: TextAnchor =
      originEdge.anchor ?? { start: 0, end: content.length, quote: content };
    return anchorSegments(content, [anchor]);
  }, [content, originEdge]);

  // For ai (rendered) nodes, the origin highlight is a source-offset range.
  const highlightRange = useMemo(() => {
    if (!originEdge) return null;
    return originEdge.anchor
      ? { start: originEdge.anchor.start, end: originEdge.anchor.end }
      : { start: 0, end: content.length };
  }, [originEdge, content]);

  // Live text selection ({start,end} in source offsets, collapsed → null).
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  const onSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setSelection(start != null && end != null && start < end ? { start, end } : null);
  }, []);

  // Rendered ai node: selection already mapped to source offsets.
  const onSelectAnchor = useCallback((anchor: SelectionAnchor | null) => {
    setSelection(anchor ? { start: anchor.start, end: anchor.end } : null);
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateThoughtContent(id, e.target.value);
    },
    [id, updateThoughtContent],
  );

  const branchSelection = useCallback(() => {
    if (!selection) return;
    const quote = content.slice(selection.start, selection.end);
    branchFrom(id, { start: selection.start, end: selection.end, quote });
    setSelection(null);
  }, [selection, content, id, branchFrom]);

  // Cmd/Ctrl+Enter → ask Claude for a child response.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void respondTo(id);
      }
    },
    [id, respondTo],
  );

  if (!thought) return null;

  return (
    <>
      <div className="thought-node__chrome">
        {/* Kind is conveyed by the left accent bar; keep only a faint dot on ai. */}
        <span className={`thought-node__marker${thought.kind === 'ai' ? ' is-ai' : ''}`} aria-hidden="true" />
        <span className="thought-node__actions">
          <button
            type="button"
            className="thought-node__btn"
            title="Branch a child thought"
            aria-label="Branch a child thought"
            onClick={() => branchFrom(id)}
          >
            ⑂
          </button>
          <button
            type="button"
            className="thought-node__btn"
            title="Delete this thought"
            aria-label="Delete this thought"
            onClick={() => deleteThought(id)}
          >
            ✕
          </button>
        </span>
      </div>

      <div className="thought-node__editor">
        {isAi ? (
          // ai nodes are read-only markdown output (selection-branchable).
          <MarkdownView
            content={content}
            highlight={highlightRange}
            onSelectAnchor={onSelectAnchor}
          />
        ) : (
          <>
            {/* Backdrop mirror: same metrics as the textarea, transparent
                text, only <mark> backgrounds show through behind it. */}
            <div className="thought-node__backdrop" aria-hidden="true">
              {segments.map((seg, i) =>
                seg.mark ? (
                  <mark key={i} className="thought-node__mark">
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </div>
            <textarea
              className="thought-node__text nodrag"
              value={content}
              placeholder="Type a thought…"
              onChange={onChange}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
              // keep React Flow from hijacking text interactions
              onMouseDown={(e) => e.stopPropagation()}
            />
          </>
        )}
        {selection && (
          <button
            type="button"
            className="thought-node__branch-sel nodrag"
            title="Branch from selection"
            aria-label="Branch from selection"
            // preventDefault so clicking doesn't blur/collapse the selection
            onMouseDown={(e) => e.preventDefault()}
            onClick={branchSelection}
          >
            ⑂ from selection
          </button>
        )}
      </div>

      {aiStatus?.loading && (
        <div className="thought-node__status" role="status">
          <span className="thought-node__spinner" aria-hidden="true" />
          thinking…
        </div>
      )}
      {aiStatus?.error && (
        <div className="thought-node__error" role="alert">
          {aiStatus.error}
        </div>
      )}
    </>
  );
}
