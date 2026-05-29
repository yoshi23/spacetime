import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ThoughtEditor } from './ThoughtEditor';
import type { Thought } from '../core/types';

export interface ThoughtNodeData {
  thought: Thought;
  [key: string]: unknown;
}

// Custom React Flow node: the node frame + connection handles wrapping the
// store-connected ThoughtEditor (which holds the editable text + branching).
function ThoughtNodeComponent({ id, data, selected }: NodeProps) {
  const thought = (data as ThoughtNodeData).thought;

  return (
    <div className={`thought-node thought-node--${thought.kind}${selected ? ' is-selected' : ''}`}>
      {/* Handles are edge anchors only. Hand-drawn connections are a
          Layer 2 feature (/connect → link edges); not connectable in v1. */}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <ThoughtEditor id={id} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const ThoughtNode = memo(ThoughtNodeComponent);
