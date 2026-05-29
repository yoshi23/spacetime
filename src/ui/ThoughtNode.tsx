import { memo, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../store/useStore';
import type { Thought } from '../core/types';

export interface ThoughtNodeData {
  thought: Thought;
  [key: string]: unknown;
}

// Custom React Flow node: an editable textarea that reads/writes through
// the zustand store (never directly to IndexedDB).
function ThoughtNodeComponent({ id, data, selected }: NodeProps) {
  const thought = (data as ThoughtNodeData).thought;
  const updateThoughtContent = useStore((s) => s.updateThoughtContent);
  const branchFrom = useStore((s) => s.branchFrom);
  const deleteThought = useStore((s) => s.deleteThought);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateThoughtContent(id, e.target.value);
    },
    [id, updateThoughtContent],
  );

  return (
    <div className={`thought-node thought-node--${thought.kind}${selected ? ' is-selected' : ''}`}>
      {/* Handles are edge anchors only. Hand-drawn connections are a
          Layer 2 feature (/connect → link edges); not connectable in v1. */}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="thought-node__bar">
        <span className="thought-node__kind">{thought.kind}</span>
        <span className="thought-node__actions">
          <button
            type="button"
            className="thought-node__btn"
            title="Branch a child thought"
            // nodrag so clicking the button doesn't start a node drag
            onClick={() => branchFrom(id)}
          >
            ⑂
          </button>
          <button
            type="button"
            className="thought-node__btn"
            title="Delete this thought"
            onClick={() => deleteThought(id)}
          >
            ✕
          </button>
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className="thought-node__text nodrag"
        value={thought.content}
        placeholder="Type a thought…"
        onChange={onChange}
        // keep React Flow from hijacking text interactions
        onMouseDown={(e) => e.stopPropagation()}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const ThoughtNode = memo(ThoughtNodeComponent);
