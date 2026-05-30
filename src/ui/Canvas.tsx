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
import { layoutTree, type LayoutEdge, type LayoutNode } from '../core/layout';

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
  const applyLayout = useStore((s) => s.applyLayout);
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

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

  // Tidy: collision-free dagre reflow of the active canvas using measured
  // node sizes. Pinned (manually-dragged) nodes stay put.
  const onTidy = useCallback(() => {
    const view = views.find((v) => v.id === activeViewId);
    const pinned = view?.pinned ?? {};
    const sizeById = new Map(
      getNodes().map((n) => [
        n.id,
        { width: n.measured?.width ?? 480, height: n.measured?.height ?? 120 },
      ]),
    );
    const visible = Object.values(base.thoughts).filter((t) => t.viewId === activeViewId);
    const visibleIds = new Set(visible.map((t) => t.id));

    const layoutNodes: LayoutNode[] = visible.map((t) => ({
      id: t.id,
      size: sizeById.get(t.id) ?? { width: 480, height: 120 },
      pinned: !!pinned[t.id],
      position: view?.layout[t.id],
    }));
    const layoutEdges: LayoutEdge[] = base.edges
      .filter(
        (e) =>
          (e.kind === 'parent' || e.kind === 'branch') &&
          visibleIds.has(e.source) &&
          visibleIds.has(e.target),
      )
      .map((e) => ({
        source: e.source,
        target: e.target,
        anchorFraction: e.anchor
          ? e.anchor.start / Math.max(1, base.thoughts[e.source]?.content.length ?? 1)
          : undefined,
      }));

    applyLayout(layoutTree(layoutNodes, layoutEdges));
    // Let the store-driven positions settle, then frame them.
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 0);
  }, [views, activeViewId, base.thoughts, base.edges, getNodes, applyLayout, fitView]);

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
        <Panel position="top-right" className="top-controls">
          <button type="button" className="tidy-btn" title="Tidy layout" onClick={onTidy}>
            ✦ Tidy
          </button>
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
