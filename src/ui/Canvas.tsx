import { useCallback, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
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
import { Sidebar } from './Sidebar';

const nodeTypes: NodeTypes = { thought: ThoughtNode };

// Minimap dot color per thought kind (matches each node's accent border).
// Without this, nodes render in React Flow's near-white default and are
// invisible against the white minimap.
const KIND_COLOR: Record<string, string> = {
  user: '#aa3bff',
  ai: '#3b82f6',
};

function miniMapNodeColor(node: RFNode): string {
  const kind = (node.data as ThoughtNodeData | undefined)?.thought.kind;
  return (kind && KIND_COLOR[kind]) || '#9ca3af';
}

function Flow() {
  const base = useStore((s) => s.base);
  const views = useStore((s) => s.views);
  const activeViewId = useStore((s) => s.activeViewId);
  const addThought = useStore((s) => s.addThought);
  const moveThought = useStore((s) => s.moveThought);
  const setSelectedThought = useStore((s) => s.setSelectedThought);
  const responseLength = useStore((s) => s.settings.responseLength);
  const setResponseLength = useStore((s) => s.setResponseLength);
  const { screenToFlowPosition } = useReactFlow();

  const layout = useMemo(
    () => views.find((v) => v.id === activeViewId)?.layout ?? {},
    [views, activeViewId],
  );

  // Project only thoughts homed in the active canvas into React Flow nodes.
  const nodes = useMemo<RFNode[]>(
    () =>
      Object.values(base.thoughts)
        .filter((thought) => thought.viewId === activeViewId)
        .map((thought) => ({
          id: thought.id,
          type: 'thought',
          position: layout[thought.id] ?? { x: 0, y: 0 },
          data: { thought } satisfies ThoughtNodeData,
        })),
    [base.thoughts, layout, activeViewId],
  );

  // Render edges whose endpoints are both visible in this canvas. (Cross-view
  // edges still exist in the base — they're just not drawn here.)
  const edges = useMemo<RFEdge[]>(() => {
    const visible = new Set(
      Object.values(base.thoughts)
        .filter((t) => t.viewId === activeViewId)
        .map((t) => t.id),
    );
    return base.edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        // solid connector line
        style: { strokeWidth: 1.5, stroke: 'var(--border, #b8b8c0)' },
      }));
  }, [base.thoughts, base.edges, activeViewId]);

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

  // Track the selected node so a parent can highlight where a selected
  // child branched from.
  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: RFNode[] }) => {
      setSelectedThought(selected[0]?.id ?? null);
    },
    [setSelectedThought],
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
        onSelectionChange={onSelectionChange}
        fitView
        // React Flow's default zoom-on-double-click intercepts the dblclick
        // on the pane (d3-zoom stopPropagation), so it never reaches our
        // onDoubleClick handler. Disable it so double-click creates a node.
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right">
          <div className="length-toggle" role="group" aria-label="Response length">
            <button
              type="button"
              className={responseLength === 'short' ? 'is-active' : ''}
              aria-pressed={responseLength === 'short'}
              onClick={() => setResponseLength('short')}
            >
              Short
            </button>
            <button
              type="button"
              className={responseLength === 'long' ? 'is-active' : ''}
              aria-pressed={responseLength === 'long'}
              onClick={() => setResponseLength('long')}
            >
              Long
            </button>
          </div>
        </Panel>
        <Background />
        <Controls />
        <MiniMap pannable zoomable nodeColor={miniMapNodeColor} nodeStrokeWidth={3} />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <div className="workspace">
        <Sidebar />
        <Flow />
      </div>
    </ReactFlowProvider>
  );
}
