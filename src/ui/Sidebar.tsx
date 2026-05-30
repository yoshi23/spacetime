import { useState } from 'react';
import { useStore } from '../store/useStore';

// Collapsible left sidebar listing canvases (one View = one canvas), like a
// conversation list. Click to switch; "+ New canvas" creates one.
export function Sidebar() {
  const views = useStore((s) => s.views);
  const activeViewId = useStore((s) => s.activeViewId);
  const setActiveView = useStore((s) => s.setActiveView);
  const createView = useStore((s) => s.createView);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button
          type="button"
          className="sidebar__icon-btn"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          onClick={() => setCollapsed(false)}
        >
          »
        </button>
        <button
          type="button"
          className="sidebar__icon-btn"
          title="New canvas"
          aria-label="New canvas"
          onClick={() => createView()}
        >
          +
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <span className="sidebar__title">Canvases</span>
        <button
          type="button"
          className="sidebar__icon-btn"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          onClick={() => setCollapsed(true)}
        >
          «
        </button>
      </div>
      <button type="button" className="sidebar__new" onClick={() => createView()}>
        + New canvas
      </button>
      <nav className="sidebar__list" aria-label="Canvases">
        {views.map((v) => (
          <button
            type="button"
            key={v.id}
            className={`sidebar__item${v.id === activeViewId ? ' is-active' : ''}`}
            aria-current={v.id === activeViewId}
            onClick={() => setActiveView(v.id)}
          >
            {v.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
