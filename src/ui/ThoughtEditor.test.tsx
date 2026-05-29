// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('renders a persistent highlight on an anchored span', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'alpha beta gamma');
    useStore.getState().branchFrom(id, { start: 6, end: 10, quote: 'beta' });

    render(<ThoughtEditor id={id} />);
    const mark = screen.getByText('beta', { selector: 'mark' });
    expect(mark).toBeTruthy();
  });

  it('degrades gracefully: highlight disappears when the parent edit breaks the quote', () => {
    const id = useStore.getState().addThought('user', { x: 0, y: 0 });
    useStore.getState().updateThoughtContent(id, 'alpha beta gamma');
    useStore.getState().branchFrom(id, { start: 6, end: 10, quote: 'beta' });
    // Edit the parent so offsets 6..10 no longer slice "beta" — no recompute.
    useStore.getState().updateThoughtContent(id, 'x');

    render(<ThoughtEditor id={id} />);
    // No crash, and no stale highlight rendered.
    expect(screen.queryByText('beta', { selector: 'mark' })).toBeNull();
    // The branch edge still persists in the base.
    expect(useStore.getState().base.edges.some((e) => e.source === id)).toBe(true);
  });
});
