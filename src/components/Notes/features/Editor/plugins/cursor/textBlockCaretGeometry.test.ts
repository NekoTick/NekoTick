import { describe, expect, it, vi } from 'vitest';
import {
  resolveEmptyHeadingMarkerCaretRect,
  resolveTextBlockCaretLineHeight,
  resolveTextBlockElement,
} from './textBlockCaretGeometry';

describe('textBlockCaretGeometry', () => {
  it('uses the selected ProseMirror textblock line height', () => {
    const editor = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.style.lineHeight = '25px';
    editor.appendChild(paragraph);

    const view = {
      dom: editor,
      domAtPos: vi.fn(),
      nodeDOM: vi.fn(() => paragraph),
      state: {
        doc: {
          resolve: () => ({
            before: () => 0,
            depth: 1,
            node: () => ({ isTextblock: true }),
          }),
        },
      },
    };

    expect(resolveTextBlockElement(view as any, 1)).toBe(paragraph);
    expect(resolveTextBlockCaretLineHeight(view as any, 1)).toBe(25);
  });

  it('falls back to the DOM position when a node view cannot resolve the textblock', () => {
    const editor = document.createElement('div');
    const heading = document.createElement('h1');
    const text = document.createTextNode('Heading');
    heading.style.lineHeight = '44px';
    heading.appendChild(text);
    editor.appendChild(heading);

    const view = {
      dom: editor,
      domAtPos: vi.fn(() => ({ node: text, offset: 1 })),
      nodeDOM: vi.fn(),
      state: {
        doc: {
          resolve: () => {
            throw new Error('unavailable');
          },
        },
      },
    };

    expect(resolveTextBlockElement(view as any, 1)).toBe(heading);
    expect(resolveTextBlockCaretLineHeight(view as any, 1)).toBe(44);
  });

  it('places an empty heading caret at the marker right edge', () => {
    const editor = document.createElement('div');
    const heading = document.createElement('h1');
    const marker = document.createElement('span');
    marker.className = 'heading-markdown-marker-empty';
    marker.getBoundingClientRect = vi.fn(() => ({
      bottom: 42,
      right: 36,
      top: 18,
    } as DOMRect));
    heading.appendChild(marker);
    editor.appendChild(heading);

    const emptyParent = { content: { size: 0 } };
    const view = {
      dom: editor,
      nodeDOM: vi.fn(() => heading),
      state: {
        doc: {
          resolve: () => ({
            before: () => 0,
            depth: 1,
            node: () => ({ isTextblock: true }),
          }),
        },
        selection: {
          $from: { parent: emptyParent },
          empty: true,
          head: 1,
        },
      },
    };

    expect(resolveEmptyHeadingMarkerCaretRect(view as any, 1)).toEqual({
      bottom: 42,
      left: 36,
      top: 18,
    });
  });
});
