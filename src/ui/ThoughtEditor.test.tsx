// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThoughtEditor } from './ThoughtEditor';
import { useStore } from '../store/useStore';

afterEach(cleanup);

describe('ThoughtEditor selection branching (smoke)', () => {
  it('selecting text and triggering the branch creates an edge carrying the anchor', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'hello world, how are you');

    render(<ThoughtEditor id={id} />);
    const textarea = screen.getByPlaceholderText('Type a thought…') as HTMLTextAreaElement;

    // No affordance until something is selected.
    expect(screen.queryByRole('button', { name: 'Branch from selection' })).toBeNull();

    // Select "world" (offsets 6..11) and fire the select event.
    textarea.setSelectionRange(6, 11);
    fireEvent.select(textarea);

    fireEvent.click(screen.getByRole('button', { name: 'Branch from selection' }));

    const edge = useStore
      .getState()
      .base.edges.find((e) => e.source === id && e.kind === 'branch');
    expect(edge).toBeDefined();
    expect(edge!.anchor).toEqual({ start: 6, end: 11, quote: 'world' });
  });

  it('falls back to a whole-thought branch (no anchor) when nothing is selected', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'standalone thought');

    render(<ThoughtEditor id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch a child thought' }));

    const edge = useStore
      .getState()
      .base.edges.find((e) => e.source === id && e.kind === 'branch');
    expect(edge).toBeDefined();
    expect(edge!.anchor).toBeUndefined();
  });

  it('highlights the anchored span only while the child branch is selected', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'alpha beta gamma');
    const child = useStore.getState().branchFrom(id, { start: 6, end: 10, quote: 'beta' });

    render(<ThoughtEditor id={id} />);
    // No selection → no highlight.
    act(() => useStore.getState().setSelectedThought(null));
    expect(screen.queryByText('beta', { selector: 'mark' })).toBeNull();

    // Select the child → its origin span lights up in this parent.
    act(() => useStore.getState().setSelectedThought(child));
    expect(screen.getByText('beta', { selector: 'mark' })).toBeTruthy();
  });

  it('highlights the whole thought for a selected whole-thought (anchorless) branch', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'whole node text');
    const child = useStore.getState().branchFrom(id); // no anchor

    render(<ThoughtEditor id={id} />);
    act(() => useStore.getState().setSelectedThought(child));
    expect(screen.getByText('whole node text', { selector: 'mark' })).toBeTruthy();
  });

  it('degrades gracefully: highlight disappears when the parent edit breaks the quote', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'alpha beta gamma');
    const child = useStore.getState().branchFrom(id, { start: 6, end: 10, quote: 'beta' });

    render(<ThoughtEditor id={id} />);
    act(() => useStore.getState().setSelectedThought(child));
    expect(screen.getByText('beta', { selector: 'mark' })).toBeTruthy();

    // Edit the parent so offsets 6..10 no longer slice "beta" — no recompute.
    act(() => useStore.getState().updateThoughtContent(id, 'x'));
    // No crash, and no stale highlight rendered.
    expect(screen.queryByText('beta', { selector: 'mark' })).toBeNull();
    // The branch edge still persists in the base.
    expect(useStore.getState().base.edges.some((e) => e.source === id)).toBe(true);
  });
});
