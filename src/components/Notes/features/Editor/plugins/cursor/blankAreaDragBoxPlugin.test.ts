import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { Editor, defaultValueCtx, editorViewCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { describe, expect, it, vi } from 'vitest';
import {
  blankAreaDragBoxPlugin,
  blankAreaDragBoxPluginKey,
  MAX_DOCUMENT_BLOCK_SELECTION_PASTE_CHARS,
  shouldClearBlockSelectionForTransaction,
} from './blankAreaDragBoxPlugin';
import { collectSelectableBlockRanges } from './blockUnitResolver';
import { CLEAR_BLOCKS_ACTION, dispatchBlockSelectionAction, getBlockSelectionPluginState } from './blockSelectionPluginState';
import { dispatchBlankAreaPlainClick } from './forcedLineEdgeCaret';
import { EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER } from './markdownBlankLineInteraction';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { listTabIndentPlugin } from '../task-list';
import { clipboardPlugin } from '../clipboard/clipboardPlugin';
import { insertImageNodeAtSelection } from '../image-upload/imageNodeInsertion';
import { useNotesStore } from '@/stores/useNotesStore';
import {
  normalizeSerializedMarkdownDocument,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { NOTE_TITLE_INPUT_DATA_ATTR } from '../../utils/titleInputDom';

function createMouseEvent(type: string, init: MouseEventInit = {}) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

function simulateKeydown(view: any, key: string, init: KeyboardEventInit = {}): { handled: boolean; event: KeyboardEvent } {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });

  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    handled = handleKeyDown(view, event) || handled;
  });

  return { handled, event };
}

function simulateKeydownUntilHandled(view: any, key: string, init: KeyboardEventInit = {}): { handled: boolean; event: KeyboardEvent } {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });

  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    if (handleKeyDown(view, event)) {
      handled = true;
      return true;
    }
    return undefined;
  });

  return { handled, event };
}

function dispatchDocumentKeydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
}

function dispatchKeydownFromElement(element: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  element.dispatchEvent(event);
  return event;
}

function dispatchDocumentClipboardEvent(type: 'copy' | 'cut' | 'paste', text = '') {
  const clipboardData = {
    setData: vi.fn(),
    types: text ? ['text/plain'] : [],
    getData: vi.fn((format: string) => (format === 'text/plain' ? text : '')),
  };
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
    configurable: true,
  });
  document.dispatchEvent(event);
  return { event, clipboardData };
}

function createClipboardEventWithTarget(type: 'copy' | 'cut', target: HTMLElement) {
  const clipboardData = {
    setData: vi.fn(),
  };
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
    configurable: true,
  });
  Object.defineProperty(event, 'target', {
    value: target,
    configurable: true,
  });
  return { event, clipboardData };
}

function simulateClipboardEvent(view: any, type: 'copy' | 'cut') {
  const clipboardData = {
    setData: vi.fn(),
  };
  const event = {
    clipboardData,
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    handled = handleDOMEvents[type]?.(view, event) || handled;
  });

  return { handled, event, clipboardData };
}

function simulateClipboardEventUntilHandled(view: any, type: 'copy' | 'cut') {
  const clipboardData = {
    setData: vi.fn(),
  };
  const event = {
    clipboardData,
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    if (handleDOMEvents[type]?.(view, event)) {
      handled = true;
      return true;
    }
    return undefined;
  });

  return { handled, event, clipboardData };
}

function simulateClipboardEventWithoutDataUntilHandled(view: any, type: 'copy' | 'cut') {
  const event = {
    clipboardData: null,
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    if (handleDOMEvents[type]?.(view, event)) {
      handled = true;
      return true;
    }
    return undefined;
  });

  return { handled, event };
}

function simulatePasteUntilHandled(view: any, text: string, html = '') {
  const event = {
    clipboardData: {
      types: [text ? 'text/plain' : '', html ? 'text/html' : ''].filter(Boolean),
      getData(type: string) {
        if (type === 'text/plain') return text;
        if (type === 'text/html') return html;
        return '';
      },
    },
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handlePaste', (handlePaste: any) => {
    if (handlePaste(view, event, null)) {
      handled = true;
      return true;
    }
    return undefined;
  });

  return { handled, event };
}

function typeText(view: any, input: string) {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;

    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, text) || handled;
    });

    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  }
}

function simulateDomEvent(view: any, type: string, event: Event) {
  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    handled = handleDOMEvents[type]?.(view, event) || handled;
  });
  return handled;
}

function findTextRange(doc: any, text: string): { from: number; to: number } {
  let resolved: { from: number; to: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (resolved) return false;
    if (!node.isText || node.text !== text) return;

    resolved = {
      from: pos,
      to: pos + text.length,
    };
    return false;
  });

  if (!resolved) {
    throw new Error(`Unable to resolve text range for "${text}"`);
  }

  return resolved;
}

function mockTrailingPlainClickGeometry(view: any, target: HTMLElement) {
  vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: 5, inside: 1 });
  vi.spyOn(view.dom, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 400,
    width: 800,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  } as DOMRect);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    left: 40,
    top: 20,
    right: 760,
    bottom: 44,
    width: 720,
    height: 24,
    x: 40,
    y: 20,
    toJSON: () => undefined,
  } as DOMRect);
  const listItem = target.closest('li');
  if (listItem instanceof HTMLElement) {
    vi.spyOn(listItem, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: 20,
      right: 760,
      bottom: 44,
      width: 720,
      height: 24,
      x: 40,
      y: 20,
      toJSON: () => undefined,
    } as DOMRect);
  }

  const rangeRects = [{
    left: 72,
    top: 22,
    right: 112,
    bottom: 42,
    width: 40,
    height: 20,
    x: 72,
    y: 22,
    toJSON: () => undefined,
  }] as DOMRect[];
  vi.spyOn(document, 'createRange').mockImplementation(() => ({
    selectNodeContents: vi.fn(),
    getClientRects: vi.fn().mockReturnValue(rangeRects),
    detach: vi.fn(),
  }) as any);
}

function startTrailingPlainClickWithEvent(view: any, target: HTMLElement) {
  const mouseDown = createMouseEvent('mousedown', {
    clientX: 220,
    clientY: 32,
  });
  Object.defineProperty(mouseDown, 'target', {
    configurable: true,
    value: target,
  });
  return {
    handled: simulateDomEvent(view, 'mousedown', mouseDown),
    event: mouseDown,
  };
}

function finishTrailingPlainClick() {
  window.dispatchEvent(createMouseEvent('mouseup', {
    clientX: 220,
    clientY: 32,
  }));
}

async function waitForPointerClickSettled() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function domRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => undefined,
  } as DOMRect;
}

function domRectList(...rects: DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item(index: number) {
      return rects[index] ?? null;
    },
  }) as unknown as DOMRectList;
}

function attachNoteScrollRoot(view: any): HTMLElement {
  const scrollRoot = document.createElement('div');
  scrollRoot.setAttribute('data-note-scroll-root', 'true');
  const parent = view.dom.parentNode;
  if (parent) {
    parent.insertBefore(scrollRoot, view.dom);
  } else {
    document.body.appendChild(scrollRoot);
  }
  scrollRoot.appendChild(view.dom);
  return scrollRoot;
}

function findNodePosition(view: any, typeName: string, predicate: (node: any) => boolean = () => true): number {
  let found: number | null = null;
  view.state.doc.descendants((node: any, pos: number) => {
    if (found !== null) return false;
    if (node.type.name === typeName && predicate(node)) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) {
    throw new Error(`Expected ${typeName} node`);
  }
  return found;
}

async function createBlockSelectionEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(listTabIndentPlugin)
    .use(blankAreaDragBoxPlugin);

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
  if (!firstBlock) {
    throw new Error('Expected at least one selectable block');
  }
  dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

  return { editor, view };
}

async function createIntegratedBlockSelectionEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(clipboardPlugin)
    .use(blankAreaDragBoxPlugin);

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
  if (!firstBlock) {
    throw new Error('Expected at least one selectable block');
  }
  dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

  return { editor, view };
}

async function createListGapSelectionEditor() {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '');
    })
    .use(commonmark)
    .use(gfm)
    .use(blankAreaDragBoxPlugin)
    .use(listTabIndentPlugin);

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const { schema } = view.state;
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
    schema.nodes.ordered_list.create(null, [
      schema.nodes.list_item.create({ label: '1.', listType: 'ordered' }, [
        schema.nodes.paragraph.create(null, schema.text('1')),
      ]),
    ]),
    schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create({ label: '•', listType: 'bullet' }, [
        schema.nodes.paragraph.create(null, schema.text('\u2800')),
      ]),
    ]),
    schema.nodes.ordered_list.create({ order: 3 }, [
      schema.nodes.list_item.create({ label: '3.', listType: 'ordered' }, [
        schema.nodes.paragraph.create(null, schema.text('3')),
      ]),
    ]),
  ]));
  return { editor, view };
}

describe('shouldClearBlockSelectionForTransaction', () => {
  it('clears block selection when the editor moves to a text selection', () => {
    const selection = Object.create(TextSelection.prototype);

    expect(
      shouldClearBlockSelectionForTransaction(
        { selection, selectionSet: true } as never,
        { selectedBlocks: [{ from: 1, to: 5 }] }
      )
    ).toBe(true);
  });

  it('does not clear block selection for node selections or unrelated transactions', () => {
    const nodeSelection = Object.create(NodeSelection.prototype);
    const pluginState = { selectedBlocks: [{ from: 1, to: 5 }] };

    expect(
      shouldClearBlockSelectionForTransaction(
        { selection: nodeSelection, selectionSet: true } as never,
        pluginState
      )
    ).toBe(false);

    expect(
      shouldClearBlockSelectionForTransaction(
        { selection: Object.create(TextSelection.prototype), selectionSet: false } as never,
        pluginState
      )
    ).toBe(false);

    expect(
      shouldClearBlockSelectionForTransaction(
        { selection: Object.create(TextSelection.prototype), selectionSet: true } as never,
        { selectedBlocks: [] }
      )
    ).toBe(false);
  });
});

describe('blankAreaDragBoxPlugin document routing', () => {
  it('keeps the stable block selection capability class for the plugin lifetime', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha');

    expect(view.dom.classList.contains('editor-block-selection-enabled')).toBe(true);
    await editor.destroy();
    expect(view.dom.classList.contains('editor-block-selection-enabled')).toBe(false);
  });

  it('claims inside-editor blank-area drags before view capture listeners can turn them into native text selection', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const viewCaptureListener = vi.fn((event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });

    try {
      attachNoteScrollRoot(view);
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockReturnValue([{
          left: 100,
          top: 40,
          right: 200,
          bottom: 60,
          width: 100,
          height: 20,
          x: 100,
          y: 40,
          toJSON: () => undefined,
        }] as DOMRect[]),
        detach: vi.fn(),
      }) as any);

      view.dom.addEventListener('mousedown', viewCaptureListener, true);
      const mouseDown = createMouseEvent('mousedown', {
        clientX: 320,
        clientY: 50,
      });

      view.dom.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(viewCaptureListener).not.toHaveBeenCalled();

      document.dispatchEvent(createMouseEvent('mousemove', {
        clientX: 280,
        clientY: 90,
        buttons: 1,
      }));
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(true);

      document.dispatchEvent(createMouseEvent('mouseup'));
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    } finally {
      view.dom.removeEventListener('mousedown', viewCaptureListener, true);
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('clears an active forced line-edge caret when document routing claims an inside-editor blank-area drag', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      attachNoteScrollRoot(view);
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockReturnValue([{
          left: 100,
          top: 40,
          right: 200,
          bottom: 60,
          width: 100,
          height: 20,
          x: 100,
          y: 40,
          toJSON: () => undefined,
        }] as DOMRect[]),
        detach: vi.fn(),
      }) as any);

      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      if (!firstBlock) {
        throw new Error('Expected a selectable block');
      }
      dispatchBlankAreaPlainClick(view, {
        blockFrom: firstBlock.from,
        targetPos: Math.max(firstBlock.from + 1, firstBlock.to - 1),
        bias: -1,
      }, 320, 50);
      expect(document.querySelector('.editor-forced-line-end-caret')).toBeInstanceOf(HTMLElement);
      await new Promise((resolve) => setTimeout(resolve, 0));

      view.dom.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        isComposing: true,
      }));
      expect(document.querySelector('.editor-forced-line-end-caret')).toBeInstanceOf(HTMLElement);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 320,
        clientY: 50,
      });

      view.dom.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(document.querySelector('.editor-forced-line-end-caret')).toBeNull();

      document.dispatchEvent(createMouseEvent('mouseup'));
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('drops stale forced caret geometry when inline content expands during dispatch', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      attachNoteScrollRoot(view);
      let measurementPass = 0;
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockImplementation(() => {
          measurementPass += 1;
          const right = measurementPass === 1 ? 200 : 400;
          return [domRect(100, 40, right, 60)];
        }),
        detach: vi.fn(),
      }) as any);

      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      if (!firstBlock) {
        throw new Error('Expected a selectable block');
      }
      dispatchBlankAreaPlainClick(view, {
        blockFrom: firstBlock.from,
        targetPos: Math.max(firstBlock.from + 1, firstBlock.to - 1),
        bias: -1,
      }, 320, 50);

      expect(measurementPass).toBeGreaterThanOrEqual(2);
      expect(document.querySelector('.editor-forced-line-end-caret')).toBeNull();
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('passes ordinary text clicks through after document routing inspects them', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const viewCaptureListener = vi.fn((event: MouseEvent) => {
      event.stopImmediatePropagation();
    });

    try {
      attachNoteScrollRoot(view);
      const firstParagraph = view.dom.querySelector('p');
      if (!(firstParagraph instanceof HTMLElement)) {
        throw new Error('Expected first paragraph');
      }
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockReturnValue([domRect(100, 40, 200, 60)]),
        detach: vi.fn(),
      }) as any);

      view.dom.addEventListener('mousedown', viewCaptureListener, true);
      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 50,
      });

      firstParagraph.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(viewCaptureListener).toHaveBeenCalledTimes(1);
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    } finally {
      view.dom.removeEventListener('mousedown', viewCaptureListener, true);
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('focuses the title instead of the editor body when an empty untitled draft receives a blank-area click', async () => {
    const { editor, view } = await createBlockSelectionEditor('#');

    try {
      const scrollRoot = attachNoteScrollRoot(view);
      const titleInput = document.createElement('textarea');
      titleInput.setAttribute(NOTE_TITLE_INPUT_DATA_ATTR, 'true');
      scrollRoot.insertBefore(titleInput, view.dom);
      useNotesStore.setState({
        currentNote: { path: 'draft:test', content: '#' },
        draftNotes: { 'draft:test': { parentPath: null, name: '' } },
        noteMetadata: { version: 2, notes: {} },
      });

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 320,
        clientY: 50,
      });

      view.dom.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(titleInput);
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    } finally {
      useNotesStore.setState(useNotesStore.getInitialState(), true);
      await editor.destroy();
    }
  });

  it('does not collapse a node selection when clicking the note title input', async () => {
    const { editor, view } = await createBlockSelectionEditor('![Demo](./demo.png)\n\nBody');
    const scrollRoot = attachNoteScrollRoot(view);
    const titleInput = document.createElement('textarea');
    titleInput.setAttribute(NOTE_TITLE_INPUT_DATA_ATTR, 'true');
    scrollRoot.insertBefore(titleInput, view.dom);

    try {
      const imagePos = findNodePosition(view, 'image');
      const startSelection = NodeSelection.create(view.state.doc, imagePos);
      view.dispatch(
        view.state.tr
          .setSelection(startSelection)
          .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      );

      titleInput.dispatchEvent(createMouseEvent('mousedown'));

      expect(view.state.selection).toBeInstanceOf(NodeSelection);
      expect(view.state.selection.from).toBe(startSelection.from);
      expect(view.state.selection.to).toBe(startSelection.to);
    } finally {
      await editor.destroy();
    }
  });

  it('ignores right-clicks outside the editor so sidebar context menus do not change block selection', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const sidebarRow = document.createElement('div');

    try {
      document.body.appendChild(sidebarRow);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);

      const mouseDown = createMouseEvent('mousedown', {
        button: 2,
        buttons: 2,
        clientX: 24,
        clientY: 24,
      });
      sidebarRow.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      sidebarRow.remove();
      await editor.destroy();
    }
  });

  it('does not create block selection when left-clicking the notes sidebar', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const sidebarRow = document.createElement('div');
    sidebarScrollRoot.appendChild(sidebarRow);

    try {
      document.body.appendChild(sidebarScrollRoot);
      dispatchBlockSelectionAction(view, CLEAR_BLOCKS_ACTION);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const mouseDown = createMouseEvent('mousedown', {
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      });
      sidebarRow.dispatchEvent(mouseDown);
      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 24,
        clientY: 24,
      }));
      await waitForPointerClickSettled();

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      sidebarScrollRoot.remove();
      await editor.destroy();
    }
  });

  it('does not move the editor caret when plain-clicking the file tree root sidebar blank area', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const sidebarBlankArea = document.createElement('div');
    sidebarBlankArea.setAttribute('data-notes-sidebar-blank-drag-root', 'true');
    sidebarBlankArea.setAttribute('data-notes-external-block-selection-root', 'true');
    sidebarBlankArea.setAttribute('data-file-tree-root-drop-target', 'true');
    sidebarScrollRoot.appendChild(sidebarBlankArea);

    try {
      document.body.appendChild(sidebarScrollRoot);
      const startSelection = TextSelection.create(view.state.doc, view.state.doc.content.size - 1);
      view.dispatch(view.state.tr.setSelection(startSelection));

      const mouseDown = createMouseEvent('mousedown', {
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      });
      sidebarBlankArea.dispatchEvent(mouseDown);
      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 24,
        clientY: 24,
      }));
      await waitForPointerClickSettled();

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
      expect(view.state.selection.from).toBe(startSelection.from);
      expect(view.state.selection.to).toBe(startSelection.to);
    } finally {
      sidebarScrollRoot.remove();
      await editor.destroy();
    }
  });

  it('keeps a recovered markdown blank-line selection stable when left-clicking the notes sidebar', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
    ].join('\n'));
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const sidebarRow = document.createElement('div');
    sidebarScrollRoot.appendChild(sidebarRow);

    try {
      document.body.appendChild(sidebarScrollRoot);
      const blankLinePos = findNodePosition(
        view,
        'html_block',
        (node) => node.attrs?.value === '<!--vlaina-markdown-blank-line-->',
      );
      view.dispatch(
        view.state.tr
          .setSelection(NodeSelection.create(view.state.doc, blankLinePos))
          .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      );
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);

      const mouseDown = createMouseEvent('mousedown', {
        button: 0,
        buttons: 1,
        clientX: 24,
        clientY: 24,
      });
      sidebarRow.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      sidebarScrollRoot.remove();
      await editor.destroy();
    }
  });

  it('keeps a recovered markdown blank-line selection stable when right-clicking the notes sidebar', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
    ].join('\n'));
    const sidebarScrollRoot = document.createElement('div');
    sidebarScrollRoot.setAttribute('data-notes-sidebar-scroll-root', 'true');
    const sidebarRow = document.createElement('div');
    sidebarScrollRoot.appendChild(sidebarRow);

    try {
      document.body.appendChild(sidebarScrollRoot);
      const blankLinePos = findNodePosition(
        view,
        'html_block',
        (node) => node.attrs?.value === '<!--vlaina-markdown-blank-line-->',
      );
      view.dispatch(
        view.state.tr
          .setSelection(NodeSelection.create(view.state.doc, blankLinePos))
          .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      );
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const mouseDown = createMouseEvent('mousedown', {
        button: 2,
        buttons: 2,
        clientX: 24,
        clientY: 24,
      });
      sidebarRow.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      sidebarScrollRoot.remove();
      await editor.destroy();
    }
  });
});

describe('blankAreaDragBoxPlugin clipboard shortcuts', () => {
  it('turns a clicked markdown blank line placeholder into an editable empty paragraph without moving the next block', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));
    let debugSpy: ReturnType<typeof vi.spyOn> | null = null;
    let rectSpy: ReturnType<typeof vi.spyOn> | null = null;

    try {
      (globalThis as typeof globalThis & { __debugMarkdownBlankLine?: boolean }).__debugMarkdownBlankLine = true;
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const blankLine = view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]');
      expect(blankLine).toBeInstanceOf(HTMLElement);
      const betaBlock = Array.from(view.dom.children).find((child) => child.textContent === 'Beta');
      expect(betaBlock).toBeInstanceOf(HTMLElement);
      rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
        if (this === blankLine) {
          return {
            x: 0,
            y: 24,
            top: 24,
            left: 0,
            right: 480,
            bottom: 48,
            width: 480,
            height: 24,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this === betaBlock) {
          return {
            x: 0,
            y: 48,
            top: 48,
            left: 0,
            right: 480,
            bottom: 72,
            width: 480,
            height: 24,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (
          this instanceof HTMLParagraphElement
          && this.textContent === '\u200B'
        ) {
          return {
            x: 0,
            y: 24,
            top: 24,
            left: 0,
            right: 480,
            bottom: 48,
            width: 480,
            height: 24,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 48,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: blankLine,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);

      expect(handled).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')).toBeNull();
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(view.state.selection.$from.parent.textContent).toBe('\u200B');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.$from.parentOffset).toBe(1);
      expect(view.dom.querySelector('p.editor-editable-markdown-blank-line')).toBeInstanceOf(HTMLParagraphElement);
      expect(debugSpy).toHaveBeenCalledWith(
        '[editor:markdown-blank-line]',
        'click converted placeholder to editable paragraph',
        expect.objectContaining({
          selectionType: 'TextSelection',
          blankLineHeightBefore: 24,
          blankLineHeightAfter: 24,
          nextTopBefore: 48,
          nextTopAfter: 48,
          nextTopDelta: 0,
        })
      );

      typeText(view, 'Inserted');

      expect(view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')).toBeNull();
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(view.state.selection.$from.parent.textContent).toBe('Inserted');
      expect(view.state.doc.textContent).not.toContain('\u200B');
    } finally {
      rectSpy?.mockRestore();
      debugSpy?.mockRestore();
      delete (globalThis as typeof globalThis & { __debugMarkdownBlankLine?: boolean }).__debugMarkdownBlankLine;
      await editor.destroy();
    }
  });

  it('leaves a markdown blank line unchanged when the next visible text line overflows into it', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));
    let measuredNode: Node | null = null;

    try {
      const blankLine = view.dom.querySelector(
        '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]',
      );
      const alphaBlock = Array.from(view.dom.children).find((child) => child.textContent === 'Alpha');
      const betaBlock = Array.from(view.dom.children).find((child) => child.textContent === 'Beta');
      expect(blankLine).toBeInstanceOf(HTMLElement);
      expect(alphaBlock).toBeInstanceOf(HTMLElement);
      expect(betaBlock).toBeInstanceOf(HTMLElement);

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
        if (this === view.dom) return domRect(0, 0, 480, 72);
        if (this === alphaBlock) return domRect(0, 0, 480, 24);
        if (this === blankLine) return domRect(0, 24, 480, 48);
        if (this === betaBlock) return domRect(0, 48, 480, 72);
        return domRect(0, 0, 0, 0);
      });
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents(node: Node) {
          measuredNode = node;
        },
        getClientRects() {
          if (measuredNode?.textContent === 'Alpha') {
            return domRectList(domRect(40, 2, 100, 20));
          }
          if (measuredNode?.textContent === 'Beta') {
            return domRectList(domRect(40, 30, 180, 44));
          }
          return domRectList();
        },
        detach: vi.fn(),
      }) as any);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 320,
        clientY: 44,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: blankLine,
      });

      expect(simulateDomEvent(view, 'mousedown', mouseDown)).toBe(true);
      expect(view.dom.querySelector(
        '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]',
      )).toBe(blankLine);
      expect(view.dom.querySelector('p.editor-editable-markdown-blank-line')).toBeNull();
      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 320,
        clientY: 44,
      }));
      await waitForPointerClickSettled();
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('keeps a clicked markdown blank line as a persisted markdown blank line when saved untouched', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));

    try {
      const blankLine = view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]');
      expect(blankLine).toBeInstanceOf(HTMLElement);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 48,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: blankLine,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);
      expect(handled).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);

      const serializer = editor.ctx.get(serializerCtx);
      const persisted = stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)));
      expect(persisted).toBe(['Alpha', '', 'Beta'].join('\n'));
    } finally {
      await editor.destroy();
    }
  });

  it('turns a pointer-events-none markdown blank line into an editable paragraph by click coordinates', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (
        this instanceof HTMLElement
        && this.matches('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')
      ) {
        return {
          x: 0,
          y: 24,
          top: 24,
          left: 0,
          right: 480,
          bottom: 48,
          width: 480,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 480,
        bottom: 24,
        width: 480,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    });

    try {
      const betaBlock = Array.from(view.dom.children).find((child) => child.textContent === 'Beta');
      expect(betaBlock).toBeInstanceOf(HTMLElement);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 36,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: betaBlock,
      });

      expect(simulateDomEvent(view, 'mousedown', mouseDown)).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')).toBeNull();
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent.textContent).toBe('\u200B');

      typeText(view, 'Inserted');

      expect(view.state.selection.$from.parent.textContent).toBe('Inserted');
      expect(view.state.doc.textContent).toContain('Alpha');
      expect(view.state.doc.textContent).toContain('Inserted');
      expect(view.state.doc.textContent).toContain('Beta');
    } finally {
      rectSpy.mockRestore();
      await editor.destroy();
    }
  });

  it('turns a same-scroll-root external blank-space click into the matching markdown blank line', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));
    const scrollRoot = attachNoteScrollRoot(view);
    const externalSurface = document.createElement('div');
    scrollRoot.insertBefore(externalSurface, view.dom);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this === view.dom) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 480,
          bottom: 72,
          width: 480,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (
        this instanceof HTMLElement
        && this.matches('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')
      ) {
        return {
          x: 0,
          y: 24,
          top: 24,
          left: 0,
          right: 0,
          bottom: 48,
          width: 0,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 480,
        bottom: 24,
        width: 480,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    });

    try {
      const mouseDown = createMouseEvent('mousedown', {
        clientX: 4,
        clientY: 36,
      });

      externalSurface.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')).toBeNull();
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent.textContent).toBe('\u200B');

      typeText(view, 'Inserted');

      expect(view.state.selection.$from.parent.textContent).toBe('Inserted');
      expect(view.state.doc.textContent).toContain('Alpha');
      expect(view.state.doc.textContent).toContain('Inserted');
      expect(view.state.doc.textContent).toContain('Beta');
    } finally {
      rectSpy.mockRestore();
      await editor.destroy();
    }
  });

  it('does not log markdown blank line click diagnostics unless debugging is enabled', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    try {
      const blankLine = view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]');
      expect(blankLine).toBeInstanceOf(HTMLElement);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 48,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: blankLine,
      });

      expect(simulateDomEvent(view, 'mousedown', mouseDown)).toBe(true);
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
      await editor.destroy();
    }
  });

  it('replaces an editable markdown blank line placeholder when text input arrives at a collapsed caret', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-markdown-blank-line-->',
      'Beta',
    ].join('\n'));

    try {
      const blankLine = view.dom.querySelector('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]');
      expect(blankLine).toBeInstanceOf(HTMLElement);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 48,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: blankLine,
      });

      expect(simulateDomEvent(view, 'mousedown', mouseDown)).toBe(true);
      const caretPos = view.state.selection.from;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caretPos)));

      typeText(view, 'X');

      expect(view.state.selection.$from.parent.textContent).toBe('X');
      expect(view.state.doc.textContent).not.toContain('\u200B');
    } finally {
      await editor.destroy();
    }
  });

  it('replaces a selected rendered HTML boundary blank line when text input arrives', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      'Alpha',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'Beta',
    ].join('\n'));

    try {
      const blankLinePos = findNodePosition(
        view,
        'html_block',
        (node) => node.attrs?.value === '<!--vlaina-rendered-html-boundary-blank-line-->',
      );
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blankLinePos)));

      typeText(view, 'X');

      expect(view.state.selection.$from.parent.textContent).toBe('X');
      expect(view.state.doc.textContent).toContain('Alpha');
      expect(view.state.doc.textContent).toContain('X');
      expect(view.state.doc.textContent).toContain('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('writes block Ctrl+C and Ctrl+X clipboard content synchronously', async () => {
    const writeText = vi.fn(() => new Promise<void>(() => undefined));
    const writeTextSync = vi.fn(() => true);
    const originalDesktopBridge = Object.getOwnPropertyDescriptor(window, 'vlainaDesktop');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(window, 'vlainaDesktop', {
      value: {
        platform: 'electron',
        clipboard: { writeTextSync },
      },
      configurable: true,
    });

    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const copyKeydown = simulateKeydown(view, 'c');
      expect(copyKeydown.handled).toBe(true);
      expect(copyKeydown.event.defaultPrevented).toBe(true);
      expect(writeTextSync).toHaveBeenCalledWith('Alpha');
      expect(writeText).not.toHaveBeenCalled();
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });
      const cutKeydown = simulateKeydown(view, 'x');
      expect(cutKeydown.handled).toBe(true);
      expect(cutKeydown.event.defaultPrevented).toBe(true);
      expect(writeTextSync).toHaveBeenLastCalledWith('Alpha');
      expect(writeText).not.toHaveBeenCalled();
      expect(view.state.doc.textContent).toBe('Beta');
    } finally {
      await editor.destroy();
      if (originalDesktopBridge) {
        Object.defineProperty(window, 'vlainaDesktop', originalDesktopBridge);
      } else {
        delete (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop;
      }
    }
  });

  it('leaves composing block-selection copy shortcuts to the input method', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const copy = simulateKeydown(view, 'c', { isComposing: true });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(copy.handled).toBe(false);
      expect(copy.event.defaultPrevented).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('leaves composing document delete shortcuts to the input method', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const deleteEvent = dispatchDocumentKeydown('Delete', { isComposing: true });

      expect(deleteEvent.defaultPrevented).toBe(false);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('does not route Ctrl+C through an async writer when a block selection shadows stale text', async () => {
    const writeText = vi.fn(() => new Promise<void>(() => undefined));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { from: betaFrom, to: betaTo } = findTextRange(view.state.doc, 'Beta');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));
      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

      const copy = simulateKeydownUntilHandled(view, 'c');

      expect(copy.handled).toBe(false);
      expect(copy.event.defaultPrevented).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps selected blocks when synchronous Ctrl+X clipboard writing fails', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

      const cut = simulateKeydownUntilHandled(view, 'x');

      expect(cut.handled).toBe(false);
      expect(cut.event.defaultPrevented).toBe(false);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('prioritizes block selection native copy and cut over a stale text selection in the integrated plugin order', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { from: betaFrom, to: betaTo } = findTextRange(view.state.doc, 'Beta');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));
      let [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

      const copy = simulateClipboardEventUntilHandled(view, 'copy');

      expect(copy.handled).toBe(true);
      expect(copy.event.preventDefault).toHaveBeenCalled();
      expect(copy.clipboardData.setData).toHaveBeenCalledTimes(1);
      expect(copy.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');

      firstBlock = collectSelectableBlockRanges(view.state.doc)[0];
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });
      const cut = simulateClipboardEventUntilHandled(view, 'cut');

      expect(cut.handled).toBe(true);
      expect(cut.event.preventDefault).toHaveBeenCalled();
      expect(cut.clipboardData.setData).toHaveBeenCalledTimes(1);
      expect(cut.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(view.state.doc.textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('replaces the visible block selection when pasting with a stale text selection in the integrated plugin order', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { from: betaFrom, to: betaTo } = findTextRange(view.state.doc, 'Beta');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));
      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

      const paste = simulatePasteUntilHandled(view, '# Gamma');

      expect(paste.handled).toBe(true);
      expect(paste.event.preventDefault).toHaveBeenCalled();
      expect(view.state.doc.textContent).toBe('GammaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('prepares the visible block selection before an html-only paste falls through to the native paste path', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { from: betaFrom, to: betaTo } = findTextRange(view.state.doc, 'Beta');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaFrom, betaTo)));
      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });

      const paste = simulatePasteUntilHandled(view, '', '<strong>Gamma</strong>');

      expect(paste.handled).toBe(false);
      expect(paste.event.preventDefault).not.toHaveBeenCalled();
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
      expect(view.state.selection.empty).toBe(true);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps replacement insertion on the markdown blank line after a selected list block', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('');

    try {
      const { schema } = view.state;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        schema.nodes.ordered_list.create(null, [
          schema.nodes.list_item.create({ label: '15.', listType: 'ordered' }, [
            schema.nodes.paragraph.create(null, schema.text('保留')),
          ]),
          schema.nodes.list_item.create({ label: '16.', listType: 'ordered' }, [
            schema.nodes.paragraph.create(null, schema.text('文字宽高比改为100%')),
          ]),
        ]),
        schema.nodes.html_block.create({ value: '<!--vlaina-markdown-blank-line-->' }),
        schema.nodes.paragraph.create(null, schema.text('我')),
      ]));
      const [, listBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [listBlock] });

      const paste = simulatePasteUntilHandled(view, '', '<strong>Gamma</strong>');

      expect(paste.handled).toBe(false);
      expect(view.state.doc.child(0).type.name).toBe('ordered_list');
      expect(view.state.doc.child(0).textContent).toBe('保留');
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
      expect(view.state.selection.$from.parentOffset).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length);
      expect(view.state.doc.child(2).textContent).toBe('我');
    } finally {
      await editor.destroy();
    }
  });

  it('replaces the visible block selection when inserting an image with a stale text selection', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('');

    try {
      const { schema } = view.state;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        schema.nodes.ordered_list.create(null, [
          schema.nodes.list_item.create({ label: '15.', listType: 'ordered' }, [
            schema.nodes.paragraph.create(null, schema.text('保留')),
          ]),
          schema.nodes.list_item.create({ label: '16.', listType: 'ordered' }, [
            schema.nodes.paragraph.create(null, schema.text('删除')),
          ]),
        ]),
        schema.nodes.html_block.create({ value: '<!--vlaina-markdown-blank-line-->' }),
        schema.nodes.paragraph.create(null, schema.text('我')),
      ]));
      const { from, to } = findTextRange(view.state.doc, '我');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      const [, selectedItem] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [selectedItem] });

      expect(insertImageNodeAtSelection(view, './assets/demo-image.png')).toBe(true);

      const doc = view.state.doc.toJSON();
      expect(doc.content[0]).toMatchObject({
        type: 'ordered_list',
      });
      expect(doc.content[1]).toMatchObject({
        type: 'paragraph',
      });
      expect(doc.content[1].content[0]).toMatchObject({
        type: 'image',
        attrs: {
          src: './assets/demo-image.png',
          alt: 'demo-image',
        },
      });
      expect(view.state.doc.child(0).textContent).toBe('保留');
      expect(view.state.doc.child(2).textContent).toBe('我');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('deletes selected blocks from document Delete and Backspace after drag selection has blurred the editor', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.blur();
      const deleteEvent = dispatchDocumentKeydown('Delete');

      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const [remainingBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [remainingBlock] });
      view.dom.blur();
      const backspaceEvent = dispatchDocumentKeydown('Backspace');

      expect(backspaceEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('deletes consecutive selected ordered list items from document Delete after drag selection has blurred the editor', async () => {
    const { editor, view } = await createBlockSelectionEditor(['1. 1', '2. 2', '3. 3'].join('\n'));

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      expect(blocks).toHaveLength(3);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[0], blocks[1]] });
      view.dom.blur();
      const deleteEvent = dispatchDocumentKeydown('Delete');

      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
      expect(view.state.doc.childCount).toBe(1);
      const list = view.state.doc.child(0);
      expect(list.type.name).toBe('ordered_list');
      expect(list.childCount).toBe(1);
      expect(list.child(0).textContent).toBe('3');
      expect(list.child(0).attrs.label).toBe('1.');
    } finally {
      await editor.destroy();
    }
  });

  it('deletes selected blocks when the physical Delete key has a non-standard key label', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.blur();
      const deleteEvent = dispatchDocumentKeydown('Unidentified', { code: 'Delete' });

      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('deletes selected blocks from document Delete when the editor root is still focused', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.focus();
      expect(document.activeElement).toBe(view.dom);

      const deleteEvent = dispatchDocumentKeydown('Delete');

      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('deletes consecutive selected ordered list items from editor Delete while the editor is focused', async () => {
    const { editor, view } = await createBlockSelectionEditor(['1. 1', '2. 2', '3. 3'].join('\n'));

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      expect(blocks).toHaveLength(3);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[0], blocks[1]] });
      const deleteEvent = simulateKeydownUntilHandled(view, 'Delete', { ctrlKey: false });

      expect(deleteEvent.handled).toBe(true);
      expect(deleteEvent.event.defaultPrevented).toBe(true);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
      expect(view.state.doc.childCount).toBe(1);
      const list = view.state.doc.child(0);
      expect(list.type.name).toBe('ordered_list');
      expect(list.childCount).toBe(1);
      expect(list.child(0).textContent).toBe('3');
      expect(list.child(0).attrs.label).toBe('1.');
    } finally {
      await editor.destroy();
    }
  });

  it('deletes selected blocks from document Delete when an editor chrome button has focus', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- Beta'].join('\n'));

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      expect(blocks).toHaveLength(2);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[0]] });

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'List chrome';
      view.dom.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);

      const deleteEvent = dispatchKeydownFromElement(button, 'Delete');

      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
      expect(view.state.doc.childCount).toBe(1);
      const list = view.state.doc.child(0);
      expect(list.type.name).toBe('bullet_list');
      expect(list.childCount).toBe(1);
      expect(list.child(0).textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('leaves selected blocks intact when a text input inside the editor has focus', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- Beta'].join('\n'));

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      expect(blocks).toHaveLength(2);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[0]] });

      const input = document.createElement('input');
      input.type = 'text';
      view.dom.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      dispatchKeydownFromElement(input, 'Delete');

      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
    } finally {
      await editor.destroy();
    }
  });

  it('does not hijack copy or cut from a text input inside the editor', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- Beta'].join('\n'));

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      expect(blocks).toHaveLength(2);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[0]] });

      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'input text';
      view.dom.appendChild(input);
      input.focus();

      const copy = createClipboardEventWithTarget('copy', input);
      expect(simulateDomEvent(view, 'copy', copy.event)).toBe(false);
      expect(copy.event.defaultPrevented).toBe(false);
      expect(copy.clipboardData.setData).not.toHaveBeenCalled();

      const cut = createClipboardEventWithTarget('cut', input);
      expect(simulateDomEvent(view, 'cut', cut.event)).toBe(false);
      expect(cut.event.defaultPrevented).toBe(false);
      expect(cut.clipboardData.setData).not.toHaveBeenCalled();
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
    } finally {
      await editor.destroy();
    }
  });

  it('handles native document copy and cut events after drag selection has blurred the editor', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.blur();
      const copy = dispatchDocumentClipboardEvent('copy');

      expect(copy.event.defaultPrevented).toBe(true);
      expect(copy.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });
      view.dom.blur();
      const cut = dispatchDocumentClipboardEvent('cut');

      expect(cut.event.defaultPrevented).toBe(true);
      expect(cut.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('replaces selected blocks from a document paste after drag selection has blurred the editor', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.blur();
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
      const paste = dispatchDocumentClipboardEvent('paste', 'Gamma');

      expect(paste.event.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('GammaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('blocks oversized document pastes after drag selection has blurred the editor', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');

    try {
      view.dom.blur();
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
      const paste = dispatchDocumentClipboardEvent(
        'paste',
        'x'.repeat(MAX_DOCUMENT_BLOCK_SELECTION_PASTE_CHARS + 1),
      );

      expect(paste.event.defaultPrevented).toBe(true);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('does not hijack document keys or clipboard events while another input is focused', async () => {
    const { editor, view } = await createIntegratedBlockSelectionEditor('Alpha\n\nBeta');
    const input = document.createElement('input');
    document.body.appendChild(input);

    try {
      input.focus();
      const deleteEvent = dispatchDocumentKeydown('Delete');
      const copy = dispatchDocumentClipboardEvent('copy');
      const paste = dispatchDocumentClipboardEvent('paste', 'Gamma');

      expect(deleteEvent.defaultPrevented).toBe(false);
      expect(copy.event.defaultPrevented).toBe(false);
      expect(copy.clipboardData.setData).not.toHaveBeenCalled();
      expect(paste.event.defaultPrevented).toBe(false);
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      input.remove();
      await editor.destroy();
    }
  });

  it('copies and cuts selected blocks from legacy system clipboard shortcuts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const copy = simulateKeydown(view, 'Insert');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(copy.handled).toBe(true);
      expect(copy.event.defaultPrevented).toBe(true);
      expect(writeText).toHaveBeenCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);

      const [firstBlock] = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [firstBlock] });
      const cut = simulateKeydown(view, 'Delete', { ctrlKey: false, shiftKey: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(cut.handled).toBe(true);
      expect(cut.event.defaultPrevented).toBe(true);
      expect(writeText).toHaveBeenLastCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('keeps selected blocks when legacy keyboard copy cannot write to the clipboard', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const copy = simulateKeydown(view, 'Insert');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(copy.handled).toBe(true);
      expect(copy.event.defaultPrevented).toBe(true);
      expect(writeText).toHaveBeenCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('does not delete selected blocks when async Shift+Delete completes after the document changes', async () => {
    let resolveWrite: () => void = () => {
      throw new Error('clipboard write promise was not created');
    };
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const cut = simulateKeydown(view, 'Delete', { ctrlKey: false, shiftKey: true });
      view.dispatch(view.state.tr.insertText('Prefix ', 1));
      resolveWrite();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cut.handled).toBe(true);
      expect(cut.event.defaultPrevented).toBe(true);
      expect(writeText).toHaveBeenCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('Prefix AlphaBeta');
    } finally {
      await editor.destroy();
    }
  });

  it('copies selected blocks during the native copy event', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { handled, event, clipboardData } = simulateClipboardEvent(view, 'copy');

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps selected blocks when a native copy fallback cannot write to the clipboard', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { handled, event } = simulateClipboardEventWithoutDataUntilHandled(view, 'copy');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });

  it('cuts selected blocks during the native cut event', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { handled, event, clipboardData } = simulateClipboardEvent(view, 'cut');

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Alpha');
      expect(view.state.doc.textContent).toBe('Beta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });

  it('does not delete selected blocks when a native cut fallback cannot write to the clipboard', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const { handled, event } = simulateClipboardEventWithoutDataUntilHandled(view, 'cut');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith('Alpha');
      expect(view.state.doc.textContent).toBe('AlphaBeta');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);
    } finally {
      await editor.destroy();
    }
  });
});

describe('blankAreaDragBoxPlugin list gap selection state', () => {
  it('clears a selected list gap block when typing converts the gap into a paragraph', async () => {
    const { editor, view } = await createListGapSelectionEditor();

    try {
      const blocks = collectSelectableBlockRanges(view.state.doc);
      dispatchBlockSelectionAction(view, { type: 'set-blocks', blocks: [blocks[1]] });
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(1);

      let placeholderEnd: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (placeholderEnd !== null || !node.isText || node.text !== '\u2800') return true;
        placeholderEnd = pos + node.nodeSize;
        return false;
      });
      expect(placeholderEnd).not.toBeNull();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, placeholderEnd!)));
      typeText(view, '2');

      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe('2');
      expect(getBlockSelectionPluginState(view.state).selectedBlocks).toHaveLength(0);
    } finally {
      await editor.destroy();
    }
  });
});

describe('blankAreaDragBoxPlugin text selection plain clicks', () => {
  it('does not treat note header chrome as unclaimed editor blank space', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const scrollRoot = attachNoteScrollRoot(view);
      const headerChrome = document.createElement('div');
      const headerChild = document.createElement('span');
      headerChrome.appendChild(headerChild);
      scrollRoot.insertBefore(headerChrome, view.dom);

      const { from, to } = findTextRange(view.state.doc, 'Alpha');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      expect(view.state.selection.empty).toBe(false);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 24,
      });
      headerChild.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(view.state.selection.from).toBe(from);
      expect(view.state.selection.to).toBe(to);

      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 120,
        clientY: 24,
      }));
      await waitForPointerClickSettled();

      expect(view.state.selection.from).toBe(from);
      expect(view.state.selection.to).toBe(to);
      expect(view.state.selection.empty).toBe(false);
    } finally {
      await editor.destroy();
    }
  });

  it('does not clear selection when a top chrome hit visually clicks through to the editor', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');

    try {
      const scrollRoot = attachNoteScrollRoot(view);
      const headerChrome = document.createElement('div');
      headerChrome.setAttribute('data-no-editor-drag-box', 'true');
      vi.spyOn(headerChrome, 'getClientRects').mockReturnValue(domRectList(domRect(80, 0, 720, 96)));
      scrollRoot.insertBefore(headerChrome, view.dom);

      const { from, to } = findTextRange(view.state.doc, 'Alpha');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      expect(view.state.selection.empty).toBe(false);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 24,
      });
      view.dom.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.selection.from).toBe(from);
      expect(view.state.selection.to).toBe(to);

      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 120,
        clientY: 24,
      }));
      await waitForPointerClickSettled();

      expect(view.state.selection.from).toBe(from);
      expect(view.state.selection.to).toBe(to);
      expect(view.state.selection.empty).toBe(false);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('claims left blank space in the note scroll root for block selection', async () => {
    const { editor, view } = await createBlockSelectionEditor('Alpha\n\nBeta');
    const originalCreateRange = document.createRange;

    try {
      const scrollRoot = attachNoteScrollRoot(view);
      const firstParagraph = view.dom.querySelector('p');
      expect(firstParagraph).toBeInstanceOf(HTMLElement);
      vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue(domRect(0, 0, 800, 600));
      vi.spyOn(view.dom, 'getBoundingClientRect').mockReturnValue(domRect(96, 0, 704, 220));
      vi.spyOn(firstParagraph as HTMLElement, 'getBoundingClientRect').mockReturnValue(domRect(112, 40, 212, 64));
      document.createRange = () => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockReturnValue([domRect(112, 42, 212, 62)]),
        detach: vi.fn(),
      }) as unknown as Range;

      const { from, to } = findTextRange(view.state.doc, 'Alpha');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      expect(view.state.selection.empty).toBe(false);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 60,
        clientY: 52,
      });
      scrollRoot.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.selection.empty).toBe(true);

      document.dispatchEvent(createMouseEvent('mouseup', {
        clientX: 60,
        clientY: 52,
      }));
      await waitForPointerClickSettled();

      expect(view.state.selection.empty).toBe(true);
    } finally {
      document.createRange = originalCreateRange;
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });
});

describe('blankAreaDragBoxPlugin trailing plain clicks', () => {
  it('handles list item trailing clicks before native pointer selection can choose a stale DOM position', async () => {
    const { editor, view } = await createBlockSelectionEditor('- Alpha\n- Beta');

    try {
      const firstParagraph = view.dom.querySelector('li p');
      expect(firstParagraph).toBeInstanceOf(HTMLElement);

      mockTrailingPlainClickGeometry(view, firstParagraph as HTMLElement);

      const { handled, event } = startTrailingPlainClickWithEvent(view, firstParagraph as HTMLElement);
      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);

      finishTrailingPlainClick();
      await waitForPointerClickSettled();

      expect(view.state.selection.from).toBe(8);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('restores the first paragraph end when a pasted list item gap resolves to the next paragraph', async () => {
    const { editor, view } = await createBlockSelectionEditor([
      '- pasted log ending index.css',
      '',
      '  8:08 next pasted log line',
    ].join('\n'));

    try {
      const paragraphs = view.dom.querySelectorAll('li p');
      expect(paragraphs).toHaveLength(2);
      const firstParagraph = paragraphs[0];
      expect(firstParagraph).toBeInstanceOf(HTMLElement);

      mockTrailingPlainClickGeometry(view, firstParagraph as HTMLElement);
      const { handled, event } = startTrailingPlainClickWithEvent(view, firstParagraph as HTMLElement);
      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);

      finishTrailingPlainClick();
      const firstParagraphEnd = findTextRange(view.state.doc, 'pasted log ending index.css').to;
      const nextParagraphStart = findTextRange(view.state.doc, '8:08 next pasted log line').from;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextParagraphStart)));
      await waitForPointerClickSettled();

      expect(view.state.selection.from).toBe(firstParagraphEnd);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('handles regular paragraph trailing clicks after tag-like inline content', async () => {
    const { editor, view } = await createBlockSelectionEditor('1 #s是 s');

    try {
      const paragraph = view.dom.querySelector('p');
      expect(paragraph).toBeInstanceOf(HTMLElement);

      mockTrailingPlainClickGeometry(view, paragraph as HTMLElement);

      const { handled, event } = startTrailingPlainClickWithEvent(view, paragraph as HTMLElement);
      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);

      finishTrailingPlainClick();
      await waitForPointerClickSettled();

      expect(view.state.selection.from).toBe(8);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('places the caret at the start of a list gap placeholder paragraph on pointer down', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- \u2800', '- Beta'].join('\n'));

    try {
      const placeholderParagraph = Array.from(view.dom.querySelectorAll('li p'))
        .find((paragraph) => paragraph.textContent === '\u2800');
      expect(placeholderParagraph).toBeInstanceOf(HTMLElement);

      const paragraphStart = findNodePosition(
        view,
        'paragraph',
        (node) => node.textContent === '\u2800'
      );
      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: paragraphStart + 2, inside: paragraphStart });

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 80,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: placeholderParagraph,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);

      expect(handled).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(paragraphStart + 1);
      expect(view.state.selection.$from.parentOffset).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('places the caret at the start of a list gap placeholder when the list container is the event target', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- \u2800', '- Beta'].join('\n'));

    try {
      const list = view.dom.querySelector('ul');
      expect(list).toBeInstanceOf(HTMLElement);

      const paragraphStart = findNodePosition(
        view,
        'paragraph',
        (node) => node.textContent === '\u2800'
      );
      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: paragraphStart - 1, inside: 1 });

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 398,
        clientY: 520,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: list,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);

      expect(handled).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(paragraphStart + 1);
      expect(view.state.selection.$from.parentOffset).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('places the caret at the start of a list gap placeholder when coordinates resolve to the paragraph boundary', async () => {
    const { editor, view } = await createBlockSelectionEditor(['- Alpha', '- \u2800', '- Beta'].join('\n'));

    try {
      const list = view.dom.querySelector('ul');
      expect(list).toBeInstanceOf(HTMLElement);

      const paragraphStart = findNodePosition(
        view,
        'paragraph',
        (node) => node.textContent === '\u2800'
      );
      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: paragraphStart, inside: 1 });

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 385,
        clientY: 544,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: list,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);

      expect(handled).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(paragraphStart + 1);
      expect(view.state.selection.$from.parentOffset).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });

  it('places the caret in a tail blank line when clicking below the last ordered list item', async () => {
    const { editor, view } = await createBlockSelectionEditor('1. 1');

    try {
      const list = view.dom.querySelector('ol');
      const item = view.dom.querySelector('li');
      const paragraph = view.dom.querySelector('li p');
      expect(list).toBeInstanceOf(HTMLElement);
      expect(item).toBeInstanceOf(HTMLElement);
      expect(paragraph).toBeInstanceOf(HTMLElement);

      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: 5, inside: 1 });
      vi.spyOn(view.dom, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 180,
        width: 800,
        height: 180,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      } as DOMRect);
      vi.spyOn(list as HTMLElement, 'getBoundingClientRect').mockReturnValue({
        left: 40,
        top: 20,
        right: 760,
        bottom: 100,
        width: 720,
        height: 80,
        x: 40,
        y: 20,
        toJSON: () => undefined,
      } as DOMRect);
      vi.spyOn(item as HTMLElement, 'getBoundingClientRect').mockReturnValue({
        left: 40,
        top: 20,
        right: 760,
        bottom: 44,
        width: 720,
        height: 24,
        x: 40,
        y: 20,
        toJSON: () => undefined,
      } as DOMRect);
      vi.spyOn(paragraph as HTMLElement, 'getBoundingClientRect').mockReturnValue({
        left: 72,
        top: 20,
        right: 760,
        bottom: 44,
        width: 688,
        height: 24,
        x: 72,
        y: 20,
        toJSON: () => undefined,
      } as DOMRect);
      vi.spyOn(document, 'createRange').mockImplementation(() => ({
        selectNodeContents: vi.fn(),
        getClientRects: vi.fn().mockReturnValue([{
          left: 72,
          top: 22,
          right: 82,
          bottom: 42,
          width: 10,
          height: 20,
          x: 72,
          y: 22,
          toJSON: () => undefined,
        }] as DOMRect[]),
        detach: vi.fn(),
      }) as any);

      const mouseDown = createMouseEvent('mousedown', {
        clientX: 120,
        clientY: 76,
      });
      Object.defineProperty(mouseDown, 'target', {
        configurable: true,
        value: list,
      });

      const handled = simulateDomEvent(view, 'mousedown', mouseDown);

      expect(handled).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
      expect(view.state.doc.lastChild?.content.size).toBe(0);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(view.state.selection.$from.parentOffset).toBe(0);
      expect(view.state.selection.$from.parent.textContent).toBe('');
    } finally {
      vi.restoreAllMocks();
      await editor.destroy();
    }
  });
});
