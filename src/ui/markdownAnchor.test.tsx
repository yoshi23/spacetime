// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { pointToSourceOffset, selectionToAnchor } from './markdownAnchor';
import { MarkdownView } from './MarkdownView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => {};

describe('rehypeSourceOffsets (via MarkdownView render)', () => {
  it('tags rendered text nodes with their SOURCE offset, surviving sanitize', () => {
    // "hello " is at offset 0; "world" (inside **…**) is at source offset 8.
    const { container } = render(
      <MarkdownView content="hello **world**" highlight={null} onSelectAnchor={noop} />,
    );
    const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-md-start]'));
    const byText = Object.fromEntries(spans.map((s) => [s.textContent, s.dataset.mdStart]));
    expect(byText['hello ']).toBe('0');
    expect(byText['world']).toBe('8'); // NOT 6 (rendered offset) — source offset
  });
});

describe('pointToSourceOffset', () => {
  it('maps an offset within a text node to source = data-md-start + offset', () => {
    const span = document.createElement('span');
    span.setAttribute('data-md-start', '8');
    const text = document.createTextNode('world');
    span.appendChild(text);
    document.body.appendChild(span);

    expect(pointToSourceOffset(text, 0)).toBe(8);
    expect(pointToSourceOffset(text, 2)).toBe(10);
  });
});

describe('selectionToAnchor (full mapping)', () => {
  it('returns source offsets + quote, not rendered offsets', () => {
    const { container } = render(
      <MarkdownView content="hello **world**" highlight={null} onSelectAnchor={noop} />,
    );
    const span = container.querySelector<HTMLElement>('[data-md-start="8"]')!;
    const textNode = span.firstChild as Text; // "world"

    // Stub a non-collapsed selection spanning the rendered word "world".
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({
        startContainer: textNode,
        startOffset: 0,
        endContainer: textNode,
        endOffset: 5,
      }),
    } as unknown as Selection);

    const anchor = selectionToAnchor(
      container.querySelector<HTMLElement>('.markdown')!,
      'hello **world**',
    );
    expect(anchor).toEqual({ start: 8, end: 13, quote: 'world' });
  });
});
