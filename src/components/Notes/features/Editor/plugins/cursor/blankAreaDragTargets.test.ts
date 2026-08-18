import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  clearCurrentEditorBlockPositionSnapshot,
  setCurrentEditorBlockPositionSnapshot,
  type EditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import {
  MAX_BLANK_AREA_TEXT_HIT_CHARS,
  isExternalTextLineGutterNativeSelectionTarget,
  isIgnoredBlankAreaDragBoxTarget,
  isPointInTrailingTextSelectionGutter,
  isPointInsideIgnoredBlankAreaDragBoxElement,
  resolveBlankAreaDragStartZone,
  resolvePointerEventTargetTextLineHit,
  resolveTextLinePointerHit,
} from './blankAreaDragTargets';

function rect(top: number, bottom: number, left = 100, right = 240): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
    toJSON: () => {},
  } as DOMRect;
}

function rectList(...rects: DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item(index: number) {
      return rects[index] ?? null;
    },
  }) as unknown as DOMRectList;
}

function createMouseDown(
  target: HTMLElement,
  init: Pick<MouseEventInit, 'clientX' | 'clientY'> = {},
) {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  });

  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });

  return event;
}

function createView() {
  const scrollRoot = document.createElement('div');
  scrollRoot.setAttribute('data-note-scroll-root', 'true');

  const editorWrapper = document.createElement('div');
  editorWrapper.className = 'milkdown-editor';
  editorWrapper.setAttribute('data-note-content-root', 'true');
  scrollRoot.append(editorWrapper);

  const editor = document.createElement('div');
  editorWrapper.append(editor);
  document.body.append(scrollRoot);

  return {
    view: { dom: editor } as unknown as EditorView,
    scrollRoot,
    editorWrapper,
    cleanup: () => scrollRoot.remove(),
  };
}

describe('blankAreaDragTargets', () => {
  afterEach(() => {
    clearCurrentEditorBlockPositionSnapshot();
  });

  it('treats the small area after line text as text-selection space', () => {
    const lineRect = {
      left: 100,
      right: 240,
      top: 40,
      bottom: 60,
      width: 140,
      height: 20,
    };

    expect(isPointInTrailingTextSelectionGutter(lineRect, 250, 50)).toBe(true);
    expect(isPointInTrailingTextSelectionGutter(lineRect, 225, 50)).toBe(true);
    expect(isPointInTrailingTextSelectionGutter(lineRect, 210, 50)).toBe(false);
    expect(isPointInTrailingTextSelectionGutter(lineRect, 310, 50)).toBe(false);
    expect(isPointInTrailingTextSelectionGutter(lineRect, 250, 90)).toBe(false);

    const emptyLineCaretRect = {
      left: 100,
      right: 100,
      top: 40,
      bottom: 60,
      width: 0,
      height: 20,
    };
    expect(isPointInTrailingTextSelectionGutter(emptyLineCaretRect, 132, 50)).toBe(true);
    expect(isPointInTrailingTextSelectionGutter(emptyLineCaretRect, 150, 50)).toBe(false);
  });

  it('reuses text-line geometry for the same pointer event', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Alpha';
    view.dom.append(paragraph);
    const getClientRects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(
      rectList(rect(40, 60)),
    );
    const event = createMouseDown(paragraph, { clientX: 120, clientY: 50 });

    try {
      expect(resolvePointerEventTargetTextLineHit(view, event)).toEqual({ type: 'content' });
      expect(resolvePointerEventTargetTextLineHit(view, event)).toEqual({ type: 'content' });
      expect(getClientRects).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('ignores cover targets for document-level blank-area drag handling', () => {
    const coverRegion = document.createElement('div');
    coverRegion.setAttribute('data-note-cover-region', 'true');
    const coverChild = document.createElement('button');
    coverRegion.append(coverChild);
    document.body.append(coverRegion);

    try {
      expect(isIgnoredBlankAreaDragBoxTarget(coverRegion)).toBe(true);
      expect(isIgnoredBlankAreaDragBoxTarget(coverChild)).toBe(true);
    } finally {
      coverRegion.remove();
    }
  });

  it('ignores explicit non-editor chrome for document-level blank-area drag handling', () => {
    const chrome = document.createElement('div');
    chrome.setAttribute('data-no-editor-drag-box', 'true');
    const child = document.createElement('span');
    chrome.append(child);
    document.body.append(chrome);

    try {
      expect(isIgnoredBlankAreaDragBoxTarget(chrome)).toBe(true);
      expect(isIgnoredBlankAreaDragBoxTarget(child)).toBe(true);
    } finally {
      chrome.remove();
    }
  });

  it('ignores text node descendants of explicit non-editor chrome', () => {
    const chrome = document.createElement('div');
    chrome.setAttribute('data-no-editor-drag-box', 'true');
    const label = document.createTextNode('Logo');
    chrome.append(label);
    document.body.append(chrome);

    try {
      expect(isIgnoredBlankAreaDragBoxTarget(label)).toBe(true);
    } finally {
      chrome.remove();
    }
  });

  it('ignores expanded wiki-link source for blank-area drag handling', () => {
    const { view, cleanup } = createView();
    const source = document.createElement('span');
    source.className = 'wiki-link-expanded';
    source.setAttribute('data-wiki-link-expanded', 'true');
    source.textContent = '[[Target|alias]]';
    view.dom.append(source);
    vi.spyOn(source, 'getClientRects').mockReturnValue(rectList(rect(40, 60)));

    try {
      expect(isIgnoredBlankAreaDragBoxTarget(source.firstChild)).toBe(true);
      expect(isPointInsideIgnoredBlankAreaDragBoxElement(
        view,
        createMouseDown(view.dom, { clientX: 120, clientY: 50 }),
      )).toBe(true);
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('ignores pointer-through clicks whose coordinates are inside top editor chrome', () => {
    const { view, scrollRoot, cleanup } = createView();
    const headerChrome = document.createElement('div');
    headerChrome.setAttribute('data-no-editor-drag-box', 'true');
    vi.spyOn(headerChrome, 'getClientRects').mockReturnValue(rectList(rect(0, 96, 80, 720)));
    scrollRoot.insertBefore(headerChrome, scrollRoot.firstChild);

    try {
      expect(isPointInsideIgnoredBlankAreaDragBoxElement(
        view,
        createMouseDown(view.dom, { clientX: 120, clientY: 24 }),
      )).toBe(true);
      expect(isPointInsideIgnoredBlankAreaDragBoxElement(
        view,
        createMouseDown(view.dom, { clientX: 120, clientY: 128 }),
      )).toBe(false);
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('does not scan overlapping chrome for direct text block targets', () => {
    const { view, scrollRoot, cleanup } = createView();
    const paragraph = document.createElement('p');
    const text = document.createElement('span');
    paragraph.append(text);
    view.dom.append(paragraph);
    const headerChrome = document.createElement('div');
    headerChrome.setAttribute('data-no-editor-drag-box', 'true');
    const chromeRects = vi.spyOn(headerChrome, 'getClientRects');
    scrollRoot.insertBefore(headerChrome, scrollRoot.firstChild);

    try {
      expect(isPointInsideIgnoredBlankAreaDragBoxElement(
        view,
        createMouseDown(text, { clientX: 120, clientY: 24 }),
      )).toBe(false);
      expect(chromeRects).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('does not start block selection from note header chrome in the editor scroll root', () => {
    const { view, scrollRoot, editorWrapper, cleanup } = createView();
    const header = document.createElement('div');
    const headerChild = document.createElement('span');
    header.append(headerChild);
    scrollRoot.insertBefore(header, editorWrapper);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(headerChild, { clientX: 120, clientY: 24 }),
      )).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('skips text line hit measurement for oversized roots without reading aggregate text', () => {
    const root = document.createElement('p');
    root.append(document.createTextNode('a'.repeat(MAX_BLANK_AREA_TEXT_HIT_CHARS + 1)));
    const createRangeSpy = vi.spyOn(document, 'createRange');
    Object.defineProperty(root, 'textContent', {
      configurable: true,
      get() {
        throw new Error('aggregate textContent should not be read');
      },
    });

    expect(resolveTextLinePointerHit(root, 0, 0)).toEqual({ type: 'measurement-limit' });
    expect(createRangeSpy).not.toHaveBeenCalled();

    createRangeSpy.mockRestore();
  });

  it('does not start block selection from the editor root near a text line end', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    paragraph.getBoundingClientRect = () => ({
      left: 100,
      right: 240,
      top: 40,
      bottom: 60,
      width: 140,
      height: 20,
      x: 100,
      y: 40,
      toJSON: () => {},
    });
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(view.dom, { clientX: 250, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows the right blank area on the editor root to start block selection', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    paragraph.getBoundingClientRect = () => ({
      left: 100,
      right: 240,
      top: 40,
      bottom: 60,
      width: 140,
      height: 20,
      x: 100,
      y: 40,
      toJSON: () => {},
    });
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(view.dom, { clientX: 330, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows the left text gutter on the editor root to start block selection', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 90, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('does not start block selection from the editor wrapper near a text line end', () => {
    const { view, editorWrapper, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    paragraph.getBoundingClientRect = () => ({
      left: 100,
      right: 240,
      top: 40,
      bottom: 60,
      width: 140,
      height: 20,
      x: 100,
      y: 40,
      toJSON: () => {},
    });
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(editorWrapper, { clientX: 250, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows the left text gutter on the editor wrapper to start block selection', () => {
    const { view, editorWrapper, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(editorWrapper, { clientX: 90, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows editor content shell blank space to start block selection', () => {
    const { view, editorWrapper, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(editorWrapper, { clientX: 330, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows wide layout whitespace beside the editor content root to start block selection', () => {
    const { view, scrollRoot, editorWrapper, cleanup } = createView();
    const wideContentContainer = document.createElement('div');
    scrollRoot.insertBefore(wideContentContainer, editorWrapper);
    wideContentContainer.append(editorWrapper);

    const scrollRootRect = vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue(rect(0, 800, 0, 1600));
    const editorWrapperRect = vi.spyOn(editorWrapper, 'getBoundingClientRect').mockReturnValue(rect(120, 600, 350, 1250));

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(wideContentContainer, { clientX: 240, clientY: 180 }),
      )).toBe('outside-editor');
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(wideContentContainer, { clientX: 1360, clientY: 180 }),
      )).toBe('outside-editor');
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(wideContentContainer, { clientX: 240, clientY: 80 }),
      )).toBeNull();
    } finally {
      cleanup();
      scrollRootRect.mockRestore();
      editorWrapperRect.mockRestore();
    }
  });

  it('allows the editor scroll root itself to start blank-area selection', () => {
    const { view, scrollRoot, cleanup } = createView();

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(scrollRoot, { clientX: 120, clientY: 240 }),
      )).toBe('outside-editor');
    } finally {
      cleanup();
    }
  });

  it('identifies external text-line gutters for whitespace native-selection cleanup', () => {
    const { view, editorWrapper, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(isExternalTextLineGutterNativeSelectionTarget(
        view,
        createMouseDown(editorWrapper, { clientX: 250, clientY: 50 }),
      )).toBe(true);
      expect(isExternalTextLineGutterNativeSelectionTarget(
        view,
        createMouseDown(editorWrapper, { clientX: 90, clientY: 50 }),
      )).toBe(false);
      expect(isExternalTextLineGutterNativeSelectionTarget(
        view,
        createMouseDown(editorWrapper, { clientX: 150, clientY: 50 }),
      )).toBe(false);
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('refreshes an empty block-position snapshot before measuring an external text-line hit', () => {
    const { view, editorWrapper, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = `${'x'.repeat(MAX_BLANK_AREA_TEXT_HIT_CHARS + 1)}\nVisible line`;
    paragraph.getBoundingClientRect = () => rect(40, 60);
    view.dom.append(paragraph);

    const paragraphNode = { type: { name: 'paragraph' }, nodeSize: 12 };
    const doc = {
      childCount: 1,
      content: { size: 12 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    Object.assign(view, {
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return paragraph;
      },
    });
    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view,
      doc,
      editorRoot: view.dom,
      scrollRoot: view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement,
      scrollLeft: 0,
      scrollTop: 0,
      blocks: [],
      blockIndex: new Map(),
      headings: [],
    } as unknown as EditorBlockPositionSnapshot);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [rect(40, 60)],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(editorWrapper, { clientX: 250, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('does not start block selection when pressing on actual text inside a full-width block', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 150, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows right blank area inside a non-empty full-width text block to start block selection', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selectable text';
    view.dom.append(paragraph);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 330, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('does not start block selection from blank space inside structured table content', () => {
    const { view, cleanup } = createView();
    const table = document.createElement('table');
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Cell text';
    cell.append(paragraph);
    row.append(cell);
    table.append(row);
    view.dom.append(table);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 180,
        top: 40,
        bottom: 60,
        width: 80,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 330, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('does not start block selection from blank space inside code block content', () => {
    const { view, cleanup } = createView();
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'const value = 1;';
    pre.append(code);
    view.dom.append(pre);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 220,
        top: 40,
        bottom: 60,
        width: 120,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(code, { clientX: 330, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      cleanup();
    }
  });

  it('allows horizontal blank space inside the editor root to start blank-area selection', () => {
    const { view, cleanup } = createView();

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(view.dom))).toBe('outside-editor');
    } finally {
      cleanup();
    }
  });

  it('allows frontmatter side gutters to start blank-area selection', () => {
    const { view, cleanup } = createView();
    const frontmatter = document.createElement('div');
    frontmatter.className = 'frontmatter-block-container';
    const source = document.createElement('div');
    source.textContent = 'title: note';
    frontmatter.append(source);
    view.dom.append(frontmatter);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(frontmatter, { clientX: 20, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      cleanup();
    }
  });

  it('prefers block selection over native text gutters inside frontmatter', () => {
    const { view, cleanup } = createView();
    const frontmatter = document.createElement('div');
    frontmatter.className = 'frontmatter-block-container';
    frontmatter.textContent = 'title: note';
    view.dom.append(frontmatter);
    const getClientRects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(
      rectList(rect(40, 60, 100, 240)),
    );

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(frontmatter, { clientX: 250, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      getClientRects.mockRestore();
      cleanup();
    }
  });

  it('lets empty full-width text blocks use native caret placement', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    view.dom.append(paragraph);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(paragraph))).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('lets editable zero-width blank line paragraphs use native caret placement', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.textContent = '\u200B';
    view.dom.append(paragraph);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(paragraph))).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('routes only the trailing text gutter of editable markdown blank lines to text selection', () => {
    const { view, cleanup } = createView();
    const paragraph = document.createElement('p');
    paragraph.className = 'editor-editable-markdown-blank-line';
    paragraph.textContent = '\u200B';
    view.dom.append(paragraph);
    const rangeRects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(
      rectList(rect(40, 60, 100, 100)),
    );

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 132, clientY: 50 }),
      )).toBeNull();
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(paragraph, { clientX: 200, clientY: 50 }),
      )).toBe('outside-editor');
    } finally {
      rangeRects.mockRestore();
      cleanup();
    }
  });

  it('routes editor blank line placeholder blocks through blank-area click handling', () => {
    for (const value of [
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
    ]) {
      const { view, cleanup } = createView();
      const blankLine = document.createElement('div');
      blankLine.setAttribute('data-type', 'html-block');
      blankLine.setAttribute('data-value', value);
      view.dom.append(blankLine);

      try {
        expect(resolveBlankAreaDragStartZone(view, createMouseDown(blankLine))).toBe('outside-editor');
      } finally {
        cleanup();
      }
    }
  });

  it('does not start block selection from the notes sidebar scroll root', () => {
    const { view, cleanup } = createView();
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    document.body.append(sidebarScrollRoot);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(sidebarScrollRoot))).toBeNull();
    } finally {
      sidebarScrollRoot.remove();
      cleanup();
    }
  });

  it('does not start block selection from the empty-workspace notes sidebar blank area', () => {
    const { view, cleanup } = createView();
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const blankArea = document.createElement('div');
    blankArea.setAttribute('data-notes-sidebar-blank-drag-root', 'true');
    sidebarScrollRoot.append(blankArea);
    document.body.append(sidebarScrollRoot);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(blankArea))).toBeNull();
    } finally {
      sidebarScrollRoot.remove();
      cleanup();
    }
  });

  it('allows the file tree root sidebar blank area to start drag-only block selection', () => {
    const { view, cleanup } = createView();
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const blankArea = document.createElement('div');
    blankArea.setAttribute('data-notes-sidebar-blank-drag-root', 'true');
    blankArea.setAttribute('data-notes-external-block-selection-root', 'true');
    blankArea.setAttribute('data-file-tree-root-drop-target', 'true');
    sidebarScrollRoot.append(blankArea);
    document.body.append(sidebarScrollRoot);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(blankArea))).toBe('external-sidebar-blank');
    } finally {
      sidebarScrollRoot.remove();
      cleanup();
    }
  });

  it('ignores interactive controls inside the file tree root sidebar blank area', () => {
    const { view, cleanup } = createView();
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const blankArea = document.createElement('div');
    blankArea.setAttribute('data-notes-sidebar-blank-drag-root', 'true');
    blankArea.setAttribute('data-notes-external-block-selection-root', 'true');
    blankArea.setAttribute('data-file-tree-root-drop-target', 'true');
    const button = document.createElement('button');
    blankArea.append(button);
    sidebarScrollRoot.append(blankArea);
    document.body.append(sidebarScrollRoot);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(button))).toBeNull();
    } finally {
      sidebarScrollRoot.remove();
      cleanup();
    }
  });

  it('allows marked docked chat blank surfaces to start drag-only block selection', () => {
    const { view, cleanup } = createView();
    const chatPanel = document.createElement('div');
    chatPanel.setAttribute('data-notes-chat-panel', 'true');
    chatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    document.body.append(chatPanel);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(chatPanel))).toBe('external-sidebar-blank');
    } finally {
      chatPanel.remove();
      cleanup();
    }
  });

  it('allows marked floating chat blank surfaces to start drag-only block selection', () => {
    const { view, cleanup } = createView();
    const floatingChatPanel = document.createElement('div');
    floatingChatPanel.setAttribute('data-notes-chat-floating', 'true');
    floatingChatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    document.body.append(floatingChatPanel);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(floatingChatPanel))).toBe('external-sidebar-blank');
    } finally {
      floatingChatPanel.remove();
      cleanup();
    }
  });

  it('does not start block selection from chat input regions inside a marked external blank root', () => {
    const { view, cleanup } = createView();
    const chatPanel = document.createElement('div');
    chatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    const inputRegion = document.createElement('div');
    inputRegion.setAttribute('data-notes-external-block-selection-excluded', 'true');
    chatPanel.append(inputRegion);
    document.body.append(chatPanel);

    try {
      expect(resolveBlankAreaDragStartZone(view, createMouseDown(inputRegion))).toBeNull();
    } finally {
      chatPanel.remove();
      cleanup();
    }
  });

  it('does not start block selection from chat message content inside a marked external blank root', () => {
    const { view, cleanup } = createView();
    const chatPanel = document.createElement('div');
    chatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    const messageSurface = document.createElement('div');
    messageSurface.setAttribute('data-chat-selection-surface', 'true');
    messageSurface.textContent = 'Chat message text';
    chatPanel.append(messageSurface);
    document.body.append(chatPanel);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(messageSurface, { clientX: 150, clientY: 50 }),
      )).toBeNull();
    } finally {
      document.createRange = originalCreateRange;
      chatPanel.remove();
      cleanup();
    }
  });

  it('allows blank space inside chat message containers to start drag-only block selection', () => {
    const { view, cleanup } = createView();
    const chatPanel = document.createElement('div');
    chatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    const messageSurface = document.createElement('div');
    messageSurface.setAttribute('data-chat-selection-surface', 'true');
    messageSurface.textContent = 'Chat message text';
    chatPanel.append(messageSurface);
    document.body.append(chatPanel);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(messageSurface, { clientX: 330, clientY: 50 }),
      )).toBe('external-sidebar-blank');
    } finally {
      document.createRange = originalCreateRange;
      chatPanel.remove();
      cleanup();
    }
  });

  it('allows chat message trailing text gutters to start drag-only block selection', () => {
    const { view, cleanup } = createView();
    const chatPanel = document.createElement('div');
    chatPanel.setAttribute('data-notes-external-block-selection-root', 'true');
    const messageSurface = document.createElement('div');
    messageSurface.setAttribute('data-chat-selection-surface', 'true');
    messageSurface.textContent = 'Chat message text';
    chatPanel.append(messageSurface);
    document.body.append(chatPanel);

    const originalCreateRange = document.createRange;
    document.createRange = () => ({
      selectNodeContents: () => {},
      getClientRects: () => [{
        left: 100,
        right: 240,
        top: 40,
        bottom: 60,
        width: 140,
        height: 20,
      }],
      detach: () => {},
    } as unknown as Range);

    try {
      expect(resolveBlankAreaDragStartZone(
        view,
        createMouseDown(messageSurface, { clientX: 250, clientY: 50 }),
      )).toBe('external-sidebar-blank');
    } finally {
      document.createRange = originalCreateRange;
      chatPanel.remove();
      cleanup();
    }
  });
});
