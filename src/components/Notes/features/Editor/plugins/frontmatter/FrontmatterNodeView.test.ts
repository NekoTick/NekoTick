import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { useUIStore } from '@/stores/uiSlice';
import { FrontmatterNodeView } from './FrontmatterNodeView';

function createMockNode(textContent = 'title: note'): ProseNode {
  return {
    type: { name: 'frontmatter' },
    nodeSize: textContent.length + 2,
    textContent,
  } as unknown as ProseNode;
}

function createMockView(selection = { from: 1, to: 1 }): EditorView {
  const tr = {
    doc: { nodeAt: vi.fn(() => null) },
    mapping: { map: (value: number) => value },
    setSelection: vi.fn(function setSelection() { return tr; }),
  };

  return {
    dom: document.createElement('div'),
    root: document,
    editable: true,
    state: {
      tr,
      selection,
      doc: { resolve: vi.fn(() => ({})) },
      schema: {
        text: vi.fn((value: string) => value),
        nodes: {
          paragraph: {
            create: vi.fn(() => ({})),
          },
        },
      },
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView;
}

function getCodeMirror(nodeView: FrontmatterNodeView) {
  return (nodeView as unknown as {
    cm: {
      dispatch: (spec: unknown) => void;
      state: {
        selection: { main: { anchor: number; head: number; empty: boolean } };
      };
    };
  }).cm;
}

function syncProseMirrorSelection(nodeView: FrontmatterNodeView) {
  (nodeView as unknown as { syncProseMirrorSelection: () => void }).syncProseMirrorSelection();
}

function handleFrontmatterUpdate(nodeView: FrontmatterNodeView, update: unknown) {
  (nodeView as unknown as { handleUpdate: (update: unknown) => void }).handleUpdate(update);
}

function handlePropertiesChange(nodeView: FrontmatterNodeView, rawText: string) {
  (nodeView as unknown as { handlePropertiesChange: (rawText: string) => void })
    .handlePropertiesChange(rawText);
}

function getPendingMeasureFrame(nodeView: FrontmatterNodeView) {
  return (nodeView as unknown as { pendingMeasureFrame: number | null }).pendingMeasureFrame;
}

function clearPendingMeasureFrame(nodeView: FrontmatterNodeView) {
  (nodeView as unknown as { pendingMeasureFrame: number | null }).pendingMeasureFrame = null;
}

describe('FrontmatterNodeView', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    useUIStore.setState({ languagePreference: 'en' });
  });

  it('adds the Typora frontmatter alias class to the node view root', () => {
    const nodeView = new FrontmatterNodeView(createMockNode('title: note'), createMockView(), () => 0);

    expect(nodeView.dom.classList.contains('frontmatter-block-container')).toBe(true);
    expect(nodeView.dom.classList.contains('md-meta-block')).toBe(true);

    nodeView.destroy();
  });

  it('uses the property list for valid YAML and source editing for invalid YAML', () => {
    const validNodeView = new FrontmatterNodeView(createMockNode('title: note'), createMockView(), () => 0);
    const invalidNodeView = new FrontmatterNodeView(
      createMockNode('vlaina_cover: "image.png" x=50'),
      createMockView(),
      () => 0,
    );

    expect(validNodeView.dom.querySelector<HTMLElement>('.frontmatter-block-editor')?.hidden).toBe(true);
    expect(invalidNodeView.dom.querySelector<HTMLElement>('.frontmatter-block-editor')?.hidden).toBe(false);

    validNodeView.destroy();
    invalidNodeView.destroy();
  });

  it('focuses the title end for blank clicks on the visual block', () => {
    const titleInput = document.createElement('textarea');
    titleInput.dataset.noteTitleInput = 'true';
    titleInput.value = 'Notes title';
    document.body.appendChild(titleInput);
    const nodeView = new FrontmatterNodeView(createMockNode('title: note'), createMockView(), () => 0);

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    nodeView.dom.dispatchEvent(event);

    expect(titleInput).toHaveFocus();
    expect(titleInput.selectionStart).toBe(titleInput.value.length);
    expect(titleInput.selectionEnd).toBe(titleInput.value.length);

    nodeView.destroy();
    titleInput.remove();
  });


  it('focuses the source editor when a source-mode block is selected', () => {
    const nodeView = new FrontmatterNodeView(
      createMockNode('vlaina_cover: "image.png" x=50'),
      createMockView(),
      () => 0,
    );
    const cm = getCodeMirror(nodeView) as unknown as { focus: ReturnType<typeof vi.fn> };
    const focusSpy = vi.spyOn(cm, 'focus');

    nodeView.selectNode();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    nodeView.destroy();
  });

  it('places the source cursor at the document end after leaving visual mode', async () => {
    const node = createMockNode('title: note\ntags:\n  - syntax');
    const end = node.textContent.length + 1;
    const view = createMockView({ from: 1, to: end });
    const collapsedSelection = { from: end, to: end };
    const createSelectionSpy = vi.spyOn(TextSelection, 'create')
      .mockReturnValue(collapsedSelection as never);
    vi.mocked(view.dispatch).mockImplementation(() => {
      view.state.selection = collapsedSelection as never;
    });
    const nodeView = new FrontmatterNodeView(node, view, () => 0);
    document.body.appendChild(nodeView.dom);
    const cm = getCodeMirror(nodeView);

    let modeButton: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      modeButton = nodeView.dom.querySelector<HTMLButtonElement>('.frontmatter-properties-mode');
      expect(modeButton).not.toBeNull();
    });
    modeButton!.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));

    await vi.waitFor(() => {
      expect(cm.hasFocus).toBe(true);
      expect(cm.state.selection.main.anchor).toBe(cm.state.doc.length);
      expect(cm.state.selection.main.head).toBe(cm.state.doc.length);
      expect(nodeView.dom.dataset.pmSelected).toBe('false');
    });
    expect(createSelectionSpy).toHaveBeenCalledWith(view.state.doc, end);
    expect(view.state.tr.setSelection).toHaveBeenCalledWith(collapsedSelection);
    expect(view.dispatch).toHaveBeenCalledWith(view.state.tr);

    nodeView.destroy();
    createSelectionSpy.mockRestore();
  });

  it('restores the source selection when it expands during window blur', async () => {
    const view = createMockView();
    const nodeView = new FrontmatterNodeView(
      createMockNode('invalid: ['),
      view,
      () => 0,
    );
    document.body.appendChild(nodeView.dom);
    const cm = getCodeMirror(nodeView);
    const end = cm.state.doc.length;
    cm.focus();
    cm.dispatch({ selection: { anchor: end, head: end } });
    vi.mocked(view.dispatch).mockClear();

    window.dispatchEvent(new FocusEvent('blur'));
    cm.dispatch({ selection: { anchor: 0, head: end } });

    await vi.waitFor(() => {
      expect(cm.state.selection.main.anchor).toBe(end);
      expect(cm.state.selection.main.head).toBe(end);
    });
    expect(view.dispatch).not.toHaveBeenCalled();

    window.dispatchEvent(new FocusEvent('focus'));
    nodeView.destroy();
  });

  it('writes property edits back into the ProseMirror frontmatter node', () => {
    const node = createMockNode('title: note');
    const view = createMockView();
    const tr = view.state.tr as unknown as {
      replaceWith: ReturnType<typeof vi.fn>;
    };
    tr.replaceWith = vi.fn(() => tr);
    const nodeView = new FrontmatterNodeView(node, view, () => 4);

    handlePropertiesChange(nodeView, 'title: updated');

    expect(view.state.schema.text).toHaveBeenCalledWith('title: updated');
    expect(tr.replaceWith).toHaveBeenCalledWith(5, 5 + node.textContent.length, 'title: updated');
    expect(view.dispatch).toHaveBeenCalledWith(tr);

    nodeView.destroy();
  });

  it('sets localized empty frontmatter placeholder copy', () => {
    useUIStore.setState({ languagePreference: 'zh-CN' });
    const nodeView = new FrontmatterNodeView(createMockNode(''), createMockView(), () => 0);

    expect(nodeView.dom.dataset.empty).toBe('true');
    expect(nodeView.dom.dataset.placeholder).toBe('输入 YAML Front Matter。');

    nodeView.destroy();
  });

  it('refreshes empty frontmatter placeholder copy after language changes', () => {
    const nodeView = new FrontmatterNodeView(createMockNode(''), createMockView(), () => 0);

    expect(nodeView.dom.dataset.placeholder).toBe('Input YAML front matter.');

    useUIStore.setState({ languagePreference: 'zh-CN' });

    expect(nodeView.dom.dataset.placeholder).toBe('输入 YAML Front Matter。');

    nodeView.destroy();
  });

  it('mirrors node selection to ProseMirror and Typora focus classes', () => {
    const nodeView = new FrontmatterNodeView(createMockNode('title: note'), createMockView(), () => 0);

    nodeView.selectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(true);
    expect(nodeView.dom.querySelector<HTMLElement>('.frontmatter-block-editor')?.hidden).toBe(true);

    nodeView.setSelection(0, 4);
    expect(nodeView.dom.querySelector<HTMLElement>('.frontmatter-block-editor')?.hidden).toBe(true);

    nodeView.deselectNode();
    expect(nodeView.dom.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(nodeView.dom.classList.contains('md-focus')).toBe(false);

    nodeView.destroy();
  });

  it('does not re-dispatch or schedule measurement for unchanged content', () => {
    const node = createMockNode('title: note');
    const nodeView = new FrontmatterNodeView(node, createMockView(), () => 0);
    const cm = getCodeMirror(nodeView);
    const dispatchSpy = vi.spyOn(cm, 'dispatch');
    clearPendingMeasureFrame(nodeView);

    nodeView.update(node);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(getPendingMeasureFrame(nodeView)).toBeNull();
    nodeView.destroy();
  });

  it('commits property deletions before the editor update returns', async () => {
    const initialNode = createMockNode('title: note\npriority: 2');
    const nextNode = {
      ...createMockNode('title: note'),
      type: initialNode.type,
    } as ProseNode;
    const nodeView = new FrontmatterNodeView(initialNode, createMockView(), () => 0);
    await vi.waitFor(() => {
      expect(nodeView.dom.querySelectorAll('.frontmatter-property-row')).toHaveLength(2);
    });

    nodeView.update(nextNode);

    expect(nodeView.dom.querySelectorAll('.frontmatter-property-row')).toHaveLength(1);
    nodeView.destroy();
  });

  it('mirrors an outer ProseMirror selection into the embedded editor', () => {
    const node = createMockNode('title: note');
    const view = createMockView({ from: 1, to: node.textContent.length + 1 });
    const nodeView = new FrontmatterNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);

    nodeView.update(node);

    expect(nodeView.dom.dataset.pmSelected).toBe('true');
    expect(cm.state.selection.main.anchor).toBe(0);
    expect(cm.state.selection.main.head).toBe(node.textContent.length);

    nodeView.destroy();
  });

  it('syncs outer selection changes after document selectionchange', async () => {
    const node = createMockNode('title: note');
    const selection = { from: 1, to: 1 };
    const view = createMockView(selection);
    const nodeView = new FrontmatterNodeView(node, view, () => 0);
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
    const node = createMockNode('title: note');
    const view = createMockView({ from: 1, to: node.textContent.length + 1 });
    const nodeView = new FrontmatterNodeView(node, view, () => 0);
    const cm = getCodeMirror(nodeView);

    nodeView.update(node);
    expect(nodeView.dom.dataset.pmSelected).toBe('true');
    expect(cm.state.selection.main.empty).toBe(false);

    view.state.selection = { from: node.textContent.length + 1, to: node.textContent.length + 1 } as never;
    syncProseMirrorSelection(nodeView);

    expect(nodeView.dom.dataset.pmSelected).toBe('false');
    expect(cm.state.selection.main.anchor).toBe(node.textContent.length);
    expect(cm.state.selection.main.head).toBe(node.textContent.length);
    expect(cm.state.selection.main.empty).toBe(true);

    nodeView.destroy();
  });

  it('forwards deletion from a mirrored outer selection even when CodeMirror is not focused', () => {
    vi.spyOn(TextSelection, 'create').mockReturnValue({ type: 'selection' } as never);
    const node = createMockNode('title: note');
    const view = createMockView({ from: 1, to: 6 });
    const tr = view.state.tr as unknown as {
      doc: unknown;
      mapping: { map: (value: number) => number };
      delete: ReturnType<typeof vi.fn>;
      setSelection: ReturnType<typeof vi.fn>;
    };
    tr.delete = vi.fn(() => tr);
    tr.setSelection = vi.fn(() => tr);
    tr.doc = {
      nodeAt: vi.fn(() => ({
        textContent: ': note',
      })),
    };
    tr.mapping = {
      map: (value: number) => value,
    };
    view.state.doc = {
      ...view.state.doc,
      nodeAt: vi.fn(() => node),
    } as never;
    const nodeView = new FrontmatterNodeView(node, view, () => 0);

    nodeView.update(node);
    handleFrontmatterUpdate(nodeView, {
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

    expect(tr.delete).toHaveBeenCalledWith(1, 6);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledWith(tr);

    nodeView.destroy();
  });

  it('lets block-level clipboard events, delete keys, and legacy shortcut keys reach ProseMirror while selected', () => {
    const node = createMockNode('title: note');
    const view = createMockView({ from: 1, to: node.textContent.length + 1 });
    const nodeView = new FrontmatterNodeView(node, view, () => 0);
    const insideTarget = nodeView.dom.querySelector('.frontmatter-block-editor') as HTMLElement;

    nodeView.dom.classList.add('editor-block-selected');

    const copy = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copy, 'target', { value: insideTarget });
    const cut = new Event('cut', { bubbles: true, cancelable: true });
    Object.defineProperty(cut, 'target', { value: insideTarget });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'target', { value: insideTarget });
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    Object.defineProperty(backspace, 'target', { value: insideTarget });
    const ctrlInsert = new KeyboardEvent('keydown', { key: 'Insert', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(ctrlInsert, 'target', { value: insideTarget });
    const shiftInsert = new KeyboardEvent('keydown', { key: 'Insert', shiftKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(shiftInsert, 'target', { value: insideTarget });
    const composingCopy = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    Object.defineProperty(composingCopy, 'target', { value: insideTarget });

    expect(nodeView.stopEvent(copy)).toBe(false);
    expect(nodeView.stopEvent(cut)).toBe(false);
    expect(nodeView.stopEvent(paste)).toBe(false);
    expect(nodeView.stopEvent(backspace)).toBe(false);
    expect(nodeView.stopEvent(ctrlInsert)).toBe(false);
    expect(nodeView.stopEvent(shiftInsert)).toBe(false);
    expect(nodeView.stopEvent(composingCopy)).toBe(true);

    nodeView.destroy();
  });
});
