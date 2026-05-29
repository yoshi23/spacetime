import { useCallback, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../store/useStore';
import { ThoughtNode } from './ThoughtNode';
import type { ThoughtNodeData } from './ThoughtNode';

const nodeTypes: NodeTypes = { thought: ThoughtNode };

function Flow() {
  const base = useStore((s) => s.base);
  const views = useStore((s) => s.views);
  const activeViewId = useStore((s) => s.activeViewId);
  const addThought = useStore((s) => s.addThought);
  const moveThought = useStore((s) => s.moveThought);
  const { screenToFlowPosition } = useReactFlow();

  const layout = useMemo(
    () => views.find((v) => v.id === activeViewId)?.layout ?? {},
    [views, activeViewId],
  );

  // Project the base + active view layout into React Flow nodes.
  const nodes = useMemo<RFNode[]>(
    () =>
      Object.values(base.thoughts).map((thought) => ({
        id: thought.id,
        type: 'thought',
        position: layout[thought.id] ?? { x: 0, y: 0 },
        data: { thought } satisfies ThoughtNodeData,
      })),
    [base.thoughts, layout],
  );

  const edges = useMemo<RFEdge[]>(
    () =>
      base.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        // solid connector line
        style: { strokeWidth: 1.5, stroke: 'var(--border, #b8b8c0)' },
      })),
    [base.edges],
  );

  // Drag → moveThought (positions live in the active view's layout).
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          moveThought(change.id, change.position);
        }
      }
    },
    [moveThought],
  );

  // Double-click empty canvas → create a user thought at that point.
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Ignore double-clicks that land on a node/control.
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__controls')) {
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addThought('user', position);
    },
    [addThought, screenToFlowPosition],
  );

  return (
    <div className="canvas" onDoubleClick={onDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
