# Manual repro notes

UI smoke tests are deferred to Session 3 per `CLAUDE.md` (React Flow needs
heavy DOM mocking under jsdom). Until then, interaction fixes are confirmed
by hand. Steps to reproduce / verify below.

## AC2 — double-click empty canvas creates an editable user thought

**Bug (fixed):** double-clicking empty canvas did nothing; only branching
created nodes. Root cause: React Flow's `zoomOnDoubleClick` (on by default)
attaches a d3-zoom `dblclick` listener to the pane that `stopPropagation`s,
so the event never reached our `.canvas` `onDoubleClick` handler. Fix:
`zoomOnDoubleClick={false}` on `<ReactFlow>` (`src/ui/Canvas.tsx`).

**Verify:**
1. `npm run dev`, open the app.
2. Double-click any empty area of the canvas (not on a node).
3. Expect: a new `USER` thought appears at the cursor, with a focusable
   textarea — typing into it persists.
4. Reload the page → the new thought and its position are still there.
5. Regression check: double-clicking no longer zooms the canvas (single-
   click-drag pan, scroll/controls zoom still work).
