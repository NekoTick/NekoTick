import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeBlockNodeView } from './CodeBlockNodeView';

const renderMock = vi.fn();
const unmountMock = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: renderMock,
    unmount: unmountMock,
  })),
}));

function createMockNode(collapsed = false): ProseNode {
  return {
    attrs: { collapsed, language: 'ts', lineNumbers: true, wrap: false },
    type: { name: 'code_block' },
    nodeSize: 6,
    textContent: 'const a = 1;',
  } as unknown as ProseNode;
}

function createMockNodeWithText(textContent: string, collapsed = false): ProseNode {
  return {
    attrs: { collapsed, language: 'ts', lineNumbers: true, wrap: false },
    type: { name: 'code_block' },
    nodeSize: textContent.length + 2,
    textContent,
  } as unknown as ProseNode;
}

function createMockSelection(from: number, to: number) {
  return {
    from,
    to,
    empty: from === to,
    $from: {},
    $to: {},
    eq: vi.fn(() => false),
  };
}

function createMockView(): EditorView {
  const tr = {
    setSelection: vi.fn(() => tr),
    insertText: vi.fn(() => tr),
    replaceWith: vi.fn(() => tr),
    delete: vi.fn(() => tr),
  };

  return {
    dom: document.createElement('div'),
    root: document,
    editable: true,
    state: {
      tr,
      selection: createMockSelection(1, 1),
      doc: { resolve: vi.fn(() => ({})) },
      schema: {
        text: vi.fn((value: string) => value),
        nodes: {
          paragraph: {
            createChecked: vi.fn(() => ({})),
          },
        },
      },
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView;
}

function getCodeMirror(nodeView: CodeBlockNodeView) {
  return (nodeView as unknown as {
    cm: {
      dom: HTMLElement;
      dispatch: (spec: {
        selection?: { anchor: number; head: number };
        userEvent?: string;
      }) => void;
      focus: () => void;
      state: {
        doc: { toString: () => string };
        selection: { main: { anchor: number; head: number; empty: boolean; from: number; to: number } };
        sliceDoc: (from: number, to: number) => string;
      };
    };
  }).cm;
}

function getSelectedCodeMirrorText(cm: ReturnType<typeof getCodeMirror>) {
  const { main } = cm.state.selection;
  return cm.state.sliceDoc(main.from, main.to);
}

function setCodeMirrorSelectionArrowKey(
  nodeView: CodeBlockNodeView,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | null
) {
  (nodeView as unknown as {
    codeMirrorSelectionArrowKey: typeof key;
  }).codeMirrorSelectionArrowKey = key;
}

function syncProseMirrorSelection(nodeView: CodeBlockNodeView) {
  (nodeView as unknown as { syncProseMirrorSelection: () => void }).syncProseMirrorSelection();
}

function forwardCodeBlockViewUpdate(nodeView: CodeBlockNodeView, update: unknown) {
  (nodeView as unknown as { forwardUpdate: (update: unknown) => void }).forwardUpdate(update);
}

function setGlobalLineNumbers(showLineNumbers: boolean) {
  useUnifiedStore.setState((state) => ({
    data: {
      ...state.data,
      settings: {
        ...state.data.settings,
        markdown: {
          ...state.data.settings.markdown,
          codeBlock: {
            ...state.data.settings.markdown.codeBlock,
            showLineNumbers,
          },
        },
      },
    },
  }));
}

describe('CodeBlockNodeView', () => {
  beforeEach(() => {
    renderMock.mockClear();
    unmountMock.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setGlobalLineNumbers(false);
  });

  it('keeps header controls non-editable and does not expose a ProseMirror contentDOM', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    expect(nodeView.headerDOM.contentEditable).toBe('false');
    expect(nodeView.headerDOM.getAttribute('data-no-editor-drag-box')).toBe('true');
    expect(nodeView.dom.contentEditable).not.toBe('false');
    expect(nodeView.contentDOM).toBeUndefined();
  });

  it('adds Typora and Obsidian code block alias classes and language attributes', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    expect(nodeView.dom.classList.contains('code-block-container')).toBe(true);
    expect(nodeView.dom.classList.contains('code-block-chrome')).toBe(true);
    expect(nodeView.dom.classList.contains('md-fences')).toBe(true);
    expect(nodeView.dom.classList.contains('HyperMD-codeblock')).toBe(true);
    expect(nodeView.dom.classList.contains('HyperMD-codeblock-bg')).toBe(true);
    expect(nodeView.dom.classList.contains('cm-line')).toBe(true);
    expect(nodeView.dom.classList.contains('language-ts')).toBe(true);
    expect(nodeView.dom.dataset.language).toBe('ts');
    expect(nodeView.dom.getAttribute('lang')).toBe('ts');
    expect(nodeView.dom.querySelector('.code-block-editable.CodeMirror.cm-s-inner.cm-s-obsidian')).toBeInstanceOf(HTMLElement);

    nodeView.destroy();
  });

  it('syncs code block language aliases when the node language changes', () => {
    const node = createMockNode(false);
    const nodeView = new CodeBlockNodeView(node, createMockView(), () => 1);
    const nextNode = {
      ...node,
      attrs: { collapsed: false, language: 'python', lineNumbers: true, wrap: false },
    } as unknown as ProseNode;

    nodeView.update(nextNode);

    expect(nodeView.dom.classList.contains('language-ts')).toBe(false);
    expect(nodeView.dom.classList.contains('language-python')).toBe(true);
    expect(nodeView.dom.dataset.language).toBe('python');
    expect(nodeView.dom.getAttribute('lang')).toBe('python');

    nodeView.destroy();
  });

  it('keeps lazy collapsed code blocks hidden before CodeMirror initializes', () => {
    class TestIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);

    const nodeView = new CodeBlockNodeView(
      createMockNode(true),
      createMockView(),
      () => 1,
      { lazyCodeMirror: true },
    );
    const editor = nodeView.dom.querySelector<HTMLElement>('.code-block-editable');

    expect(nodeView.dom.dataset.collapsed).toBe('true');
    expect(editor?.style.display).toBe('none');
    expect(editor?.getAttribute('aria-hidden')).toBe('true');
    expect(getCodeMirror(nodeView)).toBeNull();

    nodeView.destroy();
  });

  it('renders lazy line number placeholders before CodeMirror initializes', () => {
    setGlobalLineNumbers(true);
    class TestIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);

    const nodeView = new CodeBlockNodeView(
      createMockNodeWithText('one\ntwo\nthree'),
      createMockView(),
      () => 1,
      { lazyCodeMirror: true },
    );

    expect(nodeView.dom.querySelector('.code-block-lazy-preview')?.textContent).toBe('one\ntwo\nthree');
    expect(nodeView.dom.querySelector('.code-block-lazy-line-numbers')?.textContent).toBe('1\n2\n3');
    expect(getCodeMirror(nodeView)).toBeNull();

    nodeView.destroy();
  });

  it('does not ignore selection mutation', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    const result = nodeView.ignoreMutation({
      type: 'selection',
      target: nodeView.dom,
    });

    expect(result).toBe(false);
  });

  it('ignores code editor DOM mutations', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const host = nodeView.dom.querySelector('.code-block-editable');
    const textNode = document.createTextNode('x');
    host?.appendChild(textNode);

    const result = nodeView.ignoreMutation({
      type: 'characterData',
      target: textNode,
    } as unknown as MutationRecord);

    expect(result).toBe(true);
  });

  it('ignores header/UI-only mutations', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    const result = nodeView.ignoreMutation({
      type: 'attributes',
      target: nodeView.headerDOM,
    } as unknown as MutationRecord);

    expect(result).toBe(true);
  });

  it('normalizes external CRLF content before syncing it into CodeMirror', () => {
    const nodeView = new CodeBlockNodeView(
      createMockNodeWithText('const a = 1;\nconst b = 2;'),
      createMockView(),
      () => 1
    );
    const cm = getCodeMirror(nodeView);

    cm.dispatch({
      selection: {
        anchor: 8,
        head: 8,
      },
    });

    nodeView.update(createMockNodeWithText('const a = 1;\r\nconst b = 2;'));

    expect(cm.state.doc.toString()).toBe('const a = 1;\nconst b = 2;');
    expect(cm.state.selection.main.anchor).toBe(8);
  });

  it('does not reconfigure CodeMirror for unchanged code block attributes', () => {
    const node = {
      ...createMockNodeWithText('const a = 1;'),
      attrs: { collapsed: false, language: '', lineNumbers: true, wrap: false },
    } as unknown as ProseNode;
    const nodeView = new CodeBlockNodeView(node, createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    const dispatchSpy = vi.spyOn(cm, 'dispatch');

    nodeView.update(node);

    expect(dispatchSpy).not.toHaveBeenCalled();
    nodeView.destroy();
  });

  it('returns false when asked to update with a different node type', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    expect(
      nodeView.update({
        ...createMockNode(false),
        type: { name: 'paragraph' },
      } as unknown as ProseNode)
    ).toBe(false);
  });

  it('stops events originating inside the node view and ignores outside events', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const insideTarget = nodeView.dom.querySelector('.code-block-editable') as HTMLElement;
    const outsideTarget = document.createElement('div');

    expect(nodeView.stopEvent({ target: insideTarget } as unknown as Event)).toBe(true);
    expect(nodeView.stopEvent({ target: outsideTarget } as unknown as Event)).toBe(false);
  });

  it('does not add transition classes to the block selection surface', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);

    expect(nodeView.dom.classList.contains('transition-all')).toBe(false);
  });

  it('lets block-level delete shortcuts reach ProseMirror while the code block is selected', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const insideTarget = nodeView.dom.querySelector('.code-block-editable') as HTMLElement;
    nodeView.dom.classList.add('editor-block-selected');

    const backspace = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(backspace, 'target', {
      value: insideTarget,
    });

    expect(nodeView.stopEvent(backspace)).toBe(false);
  });

  it('lets block-level clipboard events and legacy shortcut keys reach ProseMirror while the code block is selected', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const insideTarget = nodeView.dom.querySelector('.code-block-editable') as HTMLElement;
    nodeView.dom.classList.add('editor-block-selected');

    const copy = new Event('copy', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(copy, 'target', {
      value: insideTarget,
    });

    const cut = new Event('cut', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(cut, 'target', {
      value: insideTarget,
    });

    const paste = new Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(paste, 'target', {
      value: insideTarget,
    });

    const ctrlInsert = new KeyboardEvent('keydown', {
      key: 'insert',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(ctrlInsert, 'target', {
      value: insideTarget,
    });

    const shiftInsert = new KeyboardEvent('keydown', {
      key: 'Insert',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(shiftInsert, 'target', {
      value: insideTarget,
    });

    expect(nodeView.stopEvent(copy)).toBe(false);
    expect(nodeView.stopEvent(cut)).toBe(false);
    expect(nodeView.stopEvent(paste)).toBe(false);
    expect(nodeView.stopEvent(ctrlInsert)).toBe(false);
    expect(nodeView.stopEvent(shiftInsert)).toBe(false);
  });

  it('keeps composing keydown events inside a selected code block', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const insideTarget = nodeView.dom.querySelector('.code-block-editable') as HTMLElement;
    nodeView.dom.classList.add('editor-block-selected');

    const composingKey = new KeyboardEvent('keydown', {
      key: 'c',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    Object.defineProperty(composingKey, 'target', {
      value: insideTarget,
    });

    expect(nodeView.stopEvent(composingKey)).toBe(true);
  });

  it('focuses and decorates the code block when selected, then removes the decoration when deselected', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    const focusSpy = vi.spyOn(cm, 'focus');

    nodeView.selectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    nodeView.deselectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(false);
  });

  it('does not apply a CodeMirror selection when the block is collapsed', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(true), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    const dispatchSpy = vi.spyOn(cm, 'dispatch');

    nodeView.setSelection(2, 4);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('syncs ProseMirror selections into CodeMirror when the block is expanded', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    document.body.appendChild(nodeView.dom);

    nodeView.setSelection(2, 4);

    expect(cm.state.selection.main.anchor).toBe(2);
    expect(cm.state.selection.main.head).toBe(4);
    nodeView.destroy();
  });

  it('maps raw ProseMirror CRLF offsets into normalized CodeMirror selections', () => {
    const nodeView = new CodeBlockNodeView(
      createMockNodeWithText('a\r\nb\r\ncd'),
      createMockView(),
      () => 1
    );
    const cm = getCodeMirror(nodeView);
    document.body.appendChild(nodeView.dom);

    expect(() => nodeView.setSelection(8, 8)).not.toThrow();
    expect(cm.state.selection.main.anchor).toBe(6);
    expect(cm.state.selection.main.head).toBe(6);
    nodeView.destroy();
  });

  it('mirrors an outer ProseMirror selection into the embedded editor', () => {
    const node = createMockNodeWithText('const a = 1;');
    const view = createMockView();
    view.state.selection = createMockSelection(1, node.textContent.length + 1) as never;
    const nodeView = new CodeBlockNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);

    nodeView.update(node);

    expect(nodeView.dom.dataset.pmSelected).toBe('true');
    expect(cm.state.selection.main.anchor).toBe(0);
    expect(cm.state.selection.main.head).toBe(node.textContent.length);

    nodeView.destroy();
  });

  it('does not mark the whole code block selected while selecting text inside focused CodeMirror', () => {
    const node = createMockNodeWithText('const a = 1;');
    const view = createMockView();
    view.state.selection = createMockSelection(1, node.textContent.length + 1) as never;
    const nodeView = new CodeBlockNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);
    document.body.appendChild(nodeView.dom);

    cm.focus();
    syncProseMirrorSelection(nodeView);

    expect(nodeView.dom.dataset.pmSelected).toBe('false');

    nodeView.destroy();
  });

  it('syncs outer selection changes after document selectionchange', async () => {
    const node = createMockNodeWithText('const a = 1;');
    const view = createMockView();
    const selection = view.state.selection as { from: number; to: number };
    const nodeView = new CodeBlockNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);

    selection.from = 1;
    selection.to = node.textContent.length + 1;
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(nodeView.dom.dataset.pmSelected).toBe('true');
    expect(cm.state.selection.main.anchor).toBe(0);
    expect(cm.state.selection.main.head).toBe(node.textContent.length);

    nodeView.destroy();
  });

  it('clears mirrored CodeMirror selections when the outer selection collapses', () => {
    const node = createMockNodeWithText('const a = 1;');
    const view = createMockView();
    view.state.selection = createMockSelection(1, node.textContent.length + 1) as never;
    const nodeView = new CodeBlockNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);

    nodeView.update(node);
    expect(nodeView.dom.dataset.pmSelected).toBe('true');
    expect(cm.state.selection.main.empty).toBe(false);

    view.state.selection = createMockSelection(node.textContent.length + 1, node.textContent.length + 1) as never;
    syncProseMirrorSelection(nodeView);

    expect(nodeView.dom.dataset.pmSelected).toBe('false');
    expect(cm.state.selection.main.anchor).toBe(node.textContent.length);
    expect(cm.state.selection.main.head).toBe(node.textContent.length);
    expect(cm.state.selection.main.empty).toBe(true);

    nodeView.destroy();
  });

  it('normalizes pure newline selections down to the next non-empty code line', () => {
    const nodeView = new CodeBlockNodeView(createMockNodeWithText('one\n\n\ntwo'), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowDown');

    cm.dispatch({
      selection: {
        anchor: 3,
        head: 4,
      },
      userEvent: 'select',
    });

    expect(getSelectedCodeMirrorText(cm)).toBe('two');
    expect(cm.state.selection.main.anchor).toBe(6);
    expect(cm.state.selection.main.head).toBe(9);

    nodeView.destroy();
  });

  it('normalizes pure newline selections up to the previous non-empty code line', () => {
    const nodeView = new CodeBlockNodeView(createMockNodeWithText('one\n\n\ntwo'), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowUp');

    cm.dispatch({
      selection: {
        anchor: 6,
        head: 5,
      },
      userEvent: 'select',
    });

    expect(getSelectedCodeMirrorText(cm)).toBe('one');
    expect(cm.state.selection.main.anchor).toBe(3);
    expect(cm.state.selection.main.head).toBe(0);

    nodeView.destroy();
  });

  it('leaves horizontal pure newline selections to CodeMirror native behavior', () => {
    const nodeView = new CodeBlockNodeView(createMockNodeWithText('one\n\n\ntwo'), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);

    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowRight');

    cm.dispatch({
      selection: {
        anchor: 3,
        head: 4,
      },
      userEvent: 'select',
    });

    expect(getSelectedCodeMirrorText(cm)).toBe('\n');
    expect(cm.state.selection.main.anchor).toBe(3);
    expect(cm.state.selection.main.head).toBe(4);

    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowLeft');
    cm.dispatch({
      selection: {
        anchor: 6,
        head: 5,
      },
      userEvent: 'select',
    });

    expect(getSelectedCodeMirrorText(cm)).toBe('\n');
    expect(cm.state.selection.main.anchor).toBe(6);
    expect(cm.state.selection.main.head).toBe(5);

    nodeView.destroy();
  });

  it('extends repeated shifted line selections across blank lines', () => {
    const nodeView = new CodeBlockNodeView(createMockNodeWithText('one\n\n\ntwo'), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowDown');

    cm.dispatch({
      selection: {
        anchor: 0,
        head: 4,
      },
      userEvent: 'select',
    });
    expect(getSelectedCodeMirrorText(cm)).toBe('one');

    setCodeMirrorSelectionArrowKey(nodeView, 'ArrowDown');
    cm.dispatch({
      selection: {
        anchor: 0,
        head: 4,
      },
      userEvent: 'select',
    });

    expect(getSelectedCodeMirrorText(cm)).toBe('one\n\n\ntwo');
    expect(cm.state.selection.main.anchor).toBe(0);
    expect(cm.state.selection.main.head).toBe(9);

    nodeView.destroy();
  });

  it('forwards deletion from a mirrored outer selection even when CodeMirror is not focused', () => {
    vi.spyOn(TextSelection, 'create').mockReturnValue({ type: 'selection' } as never);
    const node = createMockNodeWithText('const a = 1;');
    const view = createMockView();
    const tr = view.state.tr as unknown as {
      doc: unknown;
      mapping: { map: (value: number) => number };
    };
    tr.doc = {
      nodeAt: vi.fn(() => ({
        textContent: ' a = 1;',
      })),
    };
    tr.mapping = {
      map: (value: number) => value,
    };
    view.state.doc = {
      ...view.state.doc,
      nodeAt: vi.fn(() => node),
    } as never;
    view.dom = document.createElement('div');
    view.state.selection = createMockSelection(1, 6) as never;
    const nodeView = new CodeBlockNodeView(node, view, () => 0);
    const dispatchEventSpy = vi.spyOn(view.dom, 'dispatchEvent');

    nodeView.update(node);
    forwardCodeBlockViewUpdate(nodeView, {
      docChanged: true,
      state: {
        selection: {
          main: { from: 0, to: 0 },
        },
      },
      changes: {
        iterChanges: (callback: (...args: unknown[]) => void) => {
          callback(0, 5, 0, 0, { length: 0, toString: () => '' });
        },
      },
    });

    expect(view.state.tr.delete).toHaveBeenCalledWith(1, 6);
    expect(view.state.tr.setSelection).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledWith(view.state.tr);
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'editor:block-user-input',
    }));

    nodeView.destroy();
  });

  it('keeps the embedded editor selection when window blur has no next focus target', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);

    cm.dispatch({
      selection: {
        anchor: 0,
        head: 5,
      },
    });

    cm.dom.dispatchEvent(new FocusEvent('blur'));

    expect(cm.state.selection.main.anchor).toBe(0);
    expect(cm.state.selection.main.head).toBe(5);
    expect(cm.state.selection.main.empty).toBe(false);

    nodeView.destroy();
  });

  it('collapses the embedded editor selection when focus moves to another element', () => {
    const nodeView = new CodeBlockNodeView(createMockNode(false), createMockView(), () => 1);
    const cm = getCodeMirror(nodeView);
    const nextFocusTarget = document.createElement('button');
    document.body.appendChild(nextFocusTarget);

    cm.dispatch({
      selection: {
        anchor: 0,
        head: 5,
      },
    });

    cm.dom.dispatchEvent(new FocusEvent('blur', { relatedTarget: nextFocusTarget }));

    expect(cm.state.selection.main.anchor).toBe(5);
    expect(cm.state.selection.main.head).toBe(5);
    expect(cm.state.selection.main.empty).toBe(true);

    nodeView.destroy();
  });
});
