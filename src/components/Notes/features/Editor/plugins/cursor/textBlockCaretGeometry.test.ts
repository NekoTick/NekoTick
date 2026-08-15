import { describe, expect, it, vi } from 'vitest';
import {
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
});
