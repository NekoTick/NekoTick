import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { redo, undo } from '@milkdown/kit/prose/history';
import { configureTheme } from '../../theme';
import { codePlugin } from '../code';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { videoPlugin } from '../video';
import {
  TEXT_SELECTION_OVERLAY_CLASS,
  textSelectionOverlayPlugin,
} from '../selection/textSelectionOverlayPlugin';
import {
  MAX_APPLIED_PREVIEW_DOM_ELEMENTS,
  TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE,
  TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE,
  TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE,
} from './previewStyleConstants';
import { colorMarksPlugin } from './colorMarks';
import {
  applyAlignmentPreview,
  applyBgColorPreview,
  applyBlockPreview,
  applyColorPickerIdlePreview,
  applyFormatPreview,
  applyTextColorPreview,
  clearFormatPreview,
  commitBgColorPreview,
  commitBlockPreview,
  commitFormatPreview,
  commitTextColorPreview,
  hasBlockPreview,
  hasFormatPreview,
} from './previewStyles';
import { renderAppliedPreviewDocument } from './appliedPreviewState';
import { EXTRA_BUTTONS, FORMAT_BUTTONS } from './toolbarConfig';
import { BLOCK_TYPES } from './utils';
import { collapseSelectionAfterToolbarApply } from './selectionCollapse';

function findTextRange(doc: any, text: string): { from: number; to: number } {
  let resolved: { from: number; to: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (resolved || !node.isText || typeof node.text !== 'string') return;
    const offset = node.text.indexOf(text);
    if (offset < 0) return;
    resolved = { from: pos + offset, to: pos + offset + text.length };
  });

  if (!resolved) {
    throw new Error(`Unable to find text: ${text}`);
  }

  return resolved;
}

async function createEditor(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      configureTheme(ctx);
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);

  colorMarksPlugin.forEach((plugin) => {
    editor.use(plugin);
  });

  await editor.create();
  return { editor, host, view: editor.ctx.get(editorViewCtx) };
}

async function createEditorWithHistory(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      configureTheme(ctx);
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(history);

  colorMarksPlugin.forEach((plugin) => {
    editor.use(plugin);
  });

  await editor.create();
  return { editor, host, view: editor.ctx.get(editorViewCtx) };
}

async function createEditorWithSelectionOverlay(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      configureTheme(ctx);
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(textSelectionOverlayPlugin);

  colorMarksPlugin.forEach((plugin) => {
    editor.use(plugin);
  });

  await editor.create();
  return { editor, host, view: editor.ctx.get(editorViewCtx) };
}

async function createEditorWithCodeNodeViews(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      configureTheme(ctx);
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);

  colorMarksPlugin.forEach((plugin) => {
    editor.use(plugin);
  });
  codePlugin.forEach((plugin) => {
    editor.use(plugin);
  });

  await editor.create();
  return { editor, host, view: editor.ctx.get(editorViewCtx) };
}

async function createEditorWithRenderedAtomNodeViews(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      configureTheme(ctx);
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);

  colorMarksPlugin.forEach((plugin) => {
    editor.use(plugin);
  });
  mathPlugin.forEach((plugin) => {
    editor.use(plugin);
  });
  mermaidPlugin.forEach((plugin) => {
    editor.use(plugin);
  });
  videoPlugin.forEach((plugin) => {
    editor.use(plugin);
  });

  await editor.create();
  return { editor, host, view: editor.ctx.get(editorViewCtx) };
}

function selectText(view: any, text: string) {
  const range = findTextRange(view.state.doc, text);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
}

function normalizePreviewComparisonHtml(element: Element | null | undefined): string {
  if (!element) {
    return '';
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.ProseMirror-trailingBreak').forEach((node) => node.remove());
  clone.removeAttribute('contenteditable');
  clone.removeAttribute('aria-hidden');
  clone.removeAttribute('data-toolbar-preview-hidden');
  clone.classList.remove(
    'toolbar-applied-preview-overlay',
    'ProseMirror-focused',
    'ProseMirror-hideselection'
  );
  clone.querySelectorAll('[contenteditable], [aria-hidden], [data-toolbar-preview-hidden]').forEach((node) => {
    node.removeAttribute('contenteditable');
    node.removeAttribute('aria-hidden');
    node.removeAttribute('data-toolbar-preview-hidden');
  });

  return clone.innerHTML
    .replace(/\sdata-allow-mismatch="[^"]*"/g, '')
    .replace(/\sdata-node-view-root="[^"]*"/g, '')
    .replace(/\sdata-node-view-content="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createPreviewGuardView(options: {
  docSize: number;
  domElementCount?: number;
}): any {
  const host = document.createElement('div');
  const dom = document.createElement('div');
  dom.className = 'ProseMirror';
  for (let index = 0; index < (options.domElementCount ?? 0); index += 1) {
    dom.appendChild(document.createElement('span'));
  }
  host.appendChild(dom);
  document.body.appendChild(host);

  return {
    dom,
    state: {
      doc: {
        content: { size: options.docSize },
        eq: vi.fn(() => false),
      },
    },
    dispatch: vi.fn(),
  };
}

function createOversizedPreviewView(): any {
  return createPreviewGuardView({ docSize: 1024 * 1024 + 1 });
}

function createOversizedPreviewViewWithSelection(): any {
  const view = createOversizedPreviewView();
  const doc = view.state.doc;
  const tr: any = {
    setMeta: vi.fn(() => tr),
  };

  doc.eq = vi.fn((other) => other === doc);
  view.state.selection = { empty: false, from: 1, to: 7 };
  view.state.tr = tr;

  return {
    tr,
    view,
  };
}

function createOversizedAlignmentPreviewView(options: {
  listItem?: boolean;
  originalAlign?: 'center' | 'right' | null;
} = {}): any {
  const host = document.createElement('div');
  const dom = document.createElement('div');
  dom.className = 'ProseMirror';
  const block = document.createElement('p');
  const selectionOverlay = document.createElement('span');
  selectionOverlay.className = TEXT_SELECTION_OVERLAY_CLASS;
  selectionOverlay.textContent = 'target';
  block.append(selectionOverlay);
  if (options.originalAlign) {
    block.setAttribute('data-text-align', options.originalAlign);
    block.style.textAlign = options.originalAlign;
  }
  const listItem = options.listItem ? document.createElement('li') : null;
  if (listItem) {
    listItem.className = options.originalAlign === 'center'
      ? 'existing-list-class editor-list-item-align-center'
      : options.originalAlign === 'right'
        ? 'existing-list-class editor-list-item-align-right'
        : 'existing-list-class';
    listItem.append(block);
    dom.append(listItem);
  } else {
    dom.append(block);
  }
  host.append(dom);
  document.body.append(host);

  const doc: any = {
    content: { size: 1024 * 1024 + 1 },
    eq: vi.fn((other) => other === doc),
    nodesBetween: vi.fn((_from, _to, callback) => {
      callback(
        { type: { name: 'paragraph' } },
        1,
        options.listItem ? { type: { name: 'list_item' } } : undefined,
      );
    }),
  };
  const tr: any = { setMeta: vi.fn(() => tr) };
  const domObserver = {
    start: vi.fn(),
    stop: vi.fn(),
  };
  const view: any = {
    domObserver,
    dom,
    state: {
      doc,
      selection: { empty: false, from: 1, to: 7 },
      tr,
    },
    nodeDOM: vi.fn(() => block),
    dispatch: vi.fn(),
  };

  return { block, doc, dom, domObserver, host, listItem, tr, view };
}

function forceAppliedPreviewDomLimit(view: any): () => void {
  const ballast = document.createElement('div');
  const domObserver = view.domObserver as { start?: () => void; stop?: () => void } | undefined;
  domObserver?.stop?.();
  for (let index = 0; index <= MAX_APPLIED_PREVIEW_DOM_ELEMENTS; index += 1) {
    ballast.append(document.createElement('span'));
  }
  view.dom.append(ballast);
  domObserver?.start?.();

  return () => {
    domObserver?.stop?.();
    ballast.remove();
    domObserver?.start?.();
  };
}

describe('previewStyles', () => {
  it('covers every toolbar format button and block dropdown item with the applied preview path', () => {
    expect(FORMAT_BUTTONS.map((button) => button.action).filter((action) => !hasFormatPreview(action))).toEqual([]);
    expect(hasFormatPreview('link')).toBe(true);
    expect(BLOCK_TYPES.map((item) => item.type).filter((blockType) => !hasBlockPreview(blockType))).toEqual([]);
  });

  it('keeps every toolbar content-effect entry tied to the applied preview surface', () => {
    const formatEffects = FORMAT_BUTTONS.map((button) => button.action);
    const submenuEffects = ['block', 'alignment', 'color'];
    const extraEffects = EXTRA_BUTTONS
      .map((button) => button.action)
      .filter((action) => action === 'link' || action === 'color');

    expect(formatEffects.filter((action) => !hasFormatPreview(action))).toEqual([]);
    expect(extraEffects.filter((action) => action === 'link' && !hasFormatPreview(action))).toEqual([]);
    expect(submenuEffects).toEqual(['block', 'alignment', 'color']);
    expect(BLOCK_TYPES.every((item) => hasBlockPreview(item.type))).toBe(true);
  });

  it('renders block previews from an applied shadow document without mutating the editor state', async () => {
    const { editor, host, view } = await createEditor(['> before', '>', '> selected', '>', '> after'].join('\n'));
    const originalDoc = view.state.doc;
    selectText(view, 'selected');

    applyBlockPreview(view, 'taskList');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(view.dom.style.display).toBe('none');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.hasAttribute('contenteditable')).toBe(false);
    expect(view.state.doc).toBe(originalDoc);
    expect((overlay as HTMLElement | null)?.style.position).toBe('');
    expect(overlay?.nextElementSibling).toBe(view.dom);
    expect(overlay?.querySelector('ul')).toBeInstanceOf(HTMLElement);
    expect(overlay?.querySelectorAll('blockquote').length).toBeGreaterThanOrEqual(1);

    clearFormatPreview(view);

    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.style.display).toBe('');
    expect(view.state.doc).toBe(originalDoc);

    await editor.destroy();
    host.remove();
  });

  it('renders real local block previews when the editor DOM exceeds the cloning limit', async () => {
    const cases: Array<{
      blockType: typeof BLOCK_TYPES[number]['type'];
      selector: string | null;
    }> = [
      { blockType: 'paragraph', selector: null },
      { blockType: 'heading1', selector: 'h1' },
      { blockType: 'heading2', selector: 'h2' },
      { blockType: 'heading3', selector: 'h3' },
      { blockType: 'heading4', selector: 'h4' },
      { blockType: 'heading5', selector: 'h5' },
      { blockType: 'heading6', selector: 'h6' },
      { blockType: 'blockquote', selector: 'blockquote' },
      { blockType: 'bulletList', selector: 'ul' },
      { blockType: 'orderedList', selector: 'ol' },
      { blockType: 'taskList', selector: 'li[data-item-type="task"]' },
      { blockType: 'codeBlock', selector: '.code-block-container' },
    ];

    for (const testCase of cases) {
      const { editor, host, view } = await createEditor('plain target text');
      const originalDoc = view.state.doc;
      selectText(view, 'target');
      const removeBallast = forceAppliedPreviewDomLimit(view);

      applyBlockPreview(view, testCase.blockType);

      const previewNodeSelector = `[${TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE}="true"]`;
      const previewNodes = Array.from(view.dom.querySelectorAll<HTMLElement>(previewNodeSelector));
      expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
      expect(view.dom.getAttribute(TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE)).toBe(testCase.blockType);
      if (testCase.selector === null) {
        expect(previewNodes).toHaveLength(0);
        expect(view.dom.querySelector('p')?.textContent).toContain('target');
      } else {
        expect(previewNodes.find(
          (node) => node.matches(testCase.selector!) || node.querySelector(testCase.selector!),
        )).toBeInstanceOf(HTMLElement);
        expect(previewNodes.map((node) => node.textContent ?? '').join('')).toContain('target');
      }
      expect(view.state.doc).toBe(originalDoc);

      clearFormatPreview(view);

      expect(view.dom.hasAttribute(TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE)).toBe(false);
      expect(view.dom.querySelector(previewNodeSelector)).toBeNull();
      expect(view.dom.querySelector('p')?.textContent).toContain('plain target text');
      expect(view.state.doc).toBe(originalDoc);
      removeBallast();
      await editor.destroy();
      host.remove();
    }
  });

  it('commits a local large-editor block preview through the normal document transaction', async () => {
    const { editor, host, view } = await createEditorWithHistory('plain target text');
    selectText(view, 'target');
    const removeBallast = forceAppliedPreviewDomLimit(view);

    applyBlockPreview(view, 'heading2');
    expect(view.dom.querySelector(`[${TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE}="true"]`)).toBeInstanceOf(HTMLElement);

    expect(commitBlockPreview(view, 'heading2')).toBe(true);
    clearFormatPreview(view);

    expect(view.dom.hasAttribute(TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE)).toBe(false);
    expect(view.dom.querySelector(`[${TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE}="true"]`)).toBeNull();
    expect(view.dom.querySelector('h2')?.textContent).toContain('plain target text');
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.dom.querySelector('p')?.textContent).toContain('plain target text');

    removeBallast();
    await editor.destroy();
    host.remove();
  });

  it('previews converting a heading back to a paragraph in a large editor', async () => {
    const { editor, host, view } = await createEditor('# heading target text');
    const originalDoc = view.state.doc;
    selectText(view, 'target');
    const removeBallast = forceAppliedPreviewDomLimit(view);

    applyBlockPreview(view, 'paragraph');

    const previewNode = view.dom.querySelector<HTMLElement>(
      `p[${TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE}="true"]`,
    );
    expect(previewNode?.textContent).toContain('heading target text');
    expect(view.dom.querySelector('h1')).toBeNull();
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);

    expect(view.dom.querySelector('h1')?.textContent).toContain('heading target text');
    expect(view.state.doc).toBe(originalDoc);
    removeBallast();
    await editor.destroy();
    host.remove();
  });

  it('renders the applied preview in flow instead of as a geometry overlay', async () => {
    const { editor, host, view } = await createEditor(['intro', '', 'target'].join('\n'));
    view.dom.setAttribute('translate', 'no');
    view.dom.setAttribute('spellcheck', 'false');
    view.dom.style.whiteSpace = 'pre-wrap';
    view.dom.style.lineHeight = '31px';
    view.dom.style.fontSize = '17px';
    selectText(view, 'target');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.hasAttribute('contenteditable')).toBe(false);
    expect(overlay?.getAttribute('translate')).toBe('no');
    expect(overlay?.getAttribute('spellcheck')).toBe('false');
    expect(overlay?.style.whiteSpace).toBe('pre-wrap');
    expect(overlay?.style.lineHeight).toBe('31px');
    expect(overlay?.style.fontSize).toBe('17px');
    expect(overlay?.style.position).toBe('');
    expect(overlay?.style.minHeight).toBe('');
    expect(overlay?.nextElementSibling).toBe(view.dom);
    expect(view.dom.style.display).toBe('none');

    clearFormatPreview(view);
    expect(view.dom.style.display).toBe('');
    await editor.destroy();
    host.remove();
  });

  it('restores an existing inline editor display value after clearing the flow preview', async () => {
    const { editor, host, view } = await createEditor('position me');
    view.dom.style.display = 'block';
    selectText(view, 'position');

    applyFormatPreview(view, 'bold');

    expect(view.dom.style.display).toBe('none');

    clearFormatPreview(view);
    expect(view.dom.style.display).toBe('block');
    await editor.destroy();
    host.remove();
  });

  it('previews a multi-paragraph code block selection as the real applied document', async () => {
    const { editor, host, view } = await createEditor(['first paragraph', '', 'second paragraph'].join('\n'));
    const originalDoc = view.state.doc;
    const from = findTextRange(view.state.doc, 'first paragraph').from;
    const to = findTextRange(view.state.doc, 'second paragraph').to;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

    applyBlockPreview(view, 'codeBlock');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    const codeBlock = overlay?.querySelector('.code-block-container');
    expect(codeBlock).toBeInstanceOf(HTMLElement);
    expect(codeBlock?.querySelector('.cm-content')).toBeInstanceOf(HTMLElement);
    expect(codeBlock?.textContent).toContain('first paragraph');
    expect(codeBlock?.textContent).toContain('second paragraph');
    expect(overlay?.querySelectorAll('pre, .code-block-container')).toHaveLength(1);
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('renders inline mark previews by applying the real mark command to a shadow document', async () => {
    const { editor, host, view } = await createEditor('format me');
    const originalDoc = view.state.doc;
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay?.querySelector('strong')?.textContent).toBe('format');
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('restores overlay selection styling after clearing an applied hover preview', async () => {
    const { editor, host, view } = await createEditorWithSelectionOverlay('format me');
    try {
      selectText(view, 'format');
      view.dispatch(
        view.state.tr
          .setMeta('editorTextSelectionPointerNative', true)
          .setMeta('addToHistory', false)
      );

      expect(view.dom.classList.contains('editor-pointer-native-selection')).toBe(true);
      expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);

      applyFormatPreview(view, 'bold');
      expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeInstanceOf(HTMLElement);
      expect(view.dom.style.display).toBe('none');

      clearFormatPreview(view);

      expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
      expect(view.dom.style.display).toBe('');
      expect(view.dom.classList.contains('editor-pointer-native-selection')).toBe(false);
      expect(Array.from(
        view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)
      ).map((element) => element.textContent ?? '').join('')).toBe('format');
    } finally {
      await editor.destroy();
      host.remove();
    }
  });

  it('skips applied preview rendering for oversized documents', () => {
    const view = createOversizedPreviewView();

    applyFormatPreview(view, 'bold');
    applyColorPickerIdlePreview(view);

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.style.display).toBe('');
  });

  it('uses a lightweight color selection preview for oversized documents', () => {
    const view = createOversizedPreviewView();

    applyTextColorPreview(view, '#866ec6');

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('text');
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-text-color')).toBe('#866ec6');
    expect(view.dom.style.display).toBe('');

    clearFormatPreview(view);

    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(false);
    expect(view.dom.hasAttribute('data-toolbar-color-preview')).toBe(false);
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-text-color')).toBe('');

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-bg-color')).toBe('#fca9bd');

    clearFormatPreview(view);
  });

  it('uses a lightweight center alignment preview for oversized documents', () => {
    const { block, doc, dom, domObserver, host, view } = createOversizedAlignmentPreviewView();

    applyAlignmentPreview(view, 'center');

    expect(dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(dom.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(dom.getAttribute(TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE)).toBe('center');
    expect(block.getAttribute('data-text-align')).toBe('center');
    expect(block.style.textAlign).toBe('center');
    expect(view.state.doc).toBe(doc);
    expect(domObserver.stop).toHaveBeenCalledTimes(1);
    expect(domObserver.start).toHaveBeenCalledTimes(1);

    clearFormatPreview(view);

    expect(dom.classList.contains('toolbar-selection-hidden-preview')).toBe(false);
    expect(dom.hasAttribute(TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE)).toBe(false);
    expect(block.hasAttribute('data-text-align')).toBe(false);
    expect(block.hasAttribute('style')).toBe(false);
    expect(block.style.textAlign).toBe('');
    expect(view.state.doc).toBe(doc);
    expect(domObserver.stop).toHaveBeenCalledTimes(2);
    expect(domObserver.start).toHaveBeenCalledTimes(2);
    host.remove();
  });

  it('switches oversized alignment previews and restores list item classes', () => {
    const { block, dom, host, listItem, view } = createOversizedAlignmentPreviewView({
      listItem: true,
      originalAlign: 'center',
    });
    const originalBlockStyle = block.style.cssText;
    const originalListClassName = listItem?.className;

    applyAlignmentPreview(view, 'center');
    expect(block.style.textAlign).toBe('center');
    expect(listItem?.classList.contains('editor-list-item-align-center')).toBe(true);

    applyAlignmentPreview(view, 'right');
    expect(dom.getAttribute(TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE)).toBe('right');
    expect(block.style.textAlign).toBe('right');
    expect(listItem?.classList.contains('editor-list-item-align-center')).toBe(false);
    expect(listItem?.classList.contains('editor-list-item-align-right')).toBe(true);

    clearFormatPreview(view);

    expect(block.style.cssText).toBe(originalBlockStyle);
    expect(listItem?.className).toBe(originalListClassName);
    host.remove();
  });

  it('masks only the selected range during lightweight text color previews over background marks', () => {
    const view = createOversizedPreviewView();
    const overlay = document.createElement('span');
    const bgMark = document.createElement('mark');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    bgMark.dataset.bgColor = '#fca9bd';
    bgMark.style.setProperty('background-color', '#fca9bd', 'important');
    bgMark.append(overlay);
    view.dom.append(bgMark);
    const originalOverlayStyle = overlay.style.cssText;
    const originalBgMarkStyle = bgMark.style.cssText;

    applyTextColorPreview(view, '#866ec6');

    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('text');
    expect(view.dom.getAttribute('data-toolbar-color-preview-removes-counterpart')).toBe('true');
    expect(bgMark.style.cssText).toBe(originalBgMarkStyle);

    clearFormatPreview(view);

    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(overlay.style.cssText).toBe(originalOverlayStyle);
    expect(bgMark.style.cssText).toBe(originalBgMarkStyle);
  });

  it('does not add a fallback surface behind plain text color previews', () => {
    const view = createOversizedPreviewView();
    const overlay = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    view.dom.append(overlay);

    applyTextColorPreview(view, '#866ec6');

    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('text');
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(overlay.style.getPropertyValue('background-color')).toBe('');
    expect(overlay.style.getPropertyValue('box-shadow')).toBe('');

    clearFormatPreview(view);
  });

  it('keeps unselected background marks intact during lightweight text color previews', () => {
    const view = createOversizedPreviewView();
    const selectedOverlay = document.createElement('mark');
    selectedOverlay.className = 'editor-text-selection-overlay';
    selectedOverlay.dataset.bgColor = '#fca9bd';
    selectedOverlay.style.setProperty('background-color', '#fca9bd', 'important');
    selectedOverlay.textContent = 'selected';
    const unselectedMark = document.createElement('mark');
    unselectedMark.dataset.bgColor = '#fca9bd';
    unselectedMark.style.setProperty('background-color', '#fca9bd', 'important');
    unselectedMark.textContent = 'unselected';
    view.dom.append(selectedOverlay, unselectedMark);
    const originalUnselectedStyle = unselectedMark.style.cssText;

    applyTextColorPreview(view, '#866ec6');

    expect(selectedOverlay.style.getPropertyValue('background-color')).not.toBe('transparent');
    expect(selectedOverlay.style.getPropertyValue('box-shadow')).not.toBe('none');
    expect(unselectedMark.style.cssText).toBe(originalUnselectedStyle);

    clearFormatPreview(view);
  });

  it('masks the preview background when a selected background mark is also the selection overlay', () => {
    const view = createOversizedPreviewView();
    const bgOverlay = document.createElement('mark');
    bgOverlay.className = 'editor-text-selection-overlay';
    bgOverlay.dataset.bgColor = '#fca9bd';
    bgOverlay.style.setProperty('background-color', '#fca9bd', 'important');
    bgOverlay.textContent = 'target';
    view.dom.append(bgOverlay);
    const originalBgOverlayStyle = bgOverlay.style.cssText;

    applyTextColorPreview(view, '#866ec6');

    expect(bgOverlay.style.getPropertyValue('background-color')).not.toBe('transparent');
    expect(bgOverlay.style.getPropertyValue('box-shadow')).not.toBe('none');

    clearFormatPreview(view);

    expect(bgOverlay.style.cssText).toBe(originalBgOverlayStyle);
  });

  it('temporarily hides existing text color marks during lightweight background previews', () => {
    const view = createOversizedPreviewView();
    const overlay = document.createElement('span');
    const textMark = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    textMark.dataset.textColor = '#866ec6';
    textMark.style.setProperty('color', '#866ec6', 'important');
    textMark.style.setProperty('-webkit-text-fill-color', '#866ec6', 'important');
    textMark.textContent = 'target';
    overlay.append(textMark);
    view.dom.append(overlay);
    const originalOverlayStyle = overlay.style.cssText;
    const originalTextMarkStyle = textMark.style.cssText;

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.getAttribute('data-toolbar-color-preview-removes-counterpart')).toBe('true');
    expect(overlay.style.getPropertyValue('color'))
      .toBe('var(--vlaina-sidebar-notes-text, var(--vlaina-text-primary, currentColor))');
    expect(textMark.style.getPropertyValue('color'))
      .toBe('var(--vlaina-sidebar-notes-text, var(--vlaina-text-primary, currentColor))');
    expect(textMark.style.getPropertyValue('-webkit-text-fill-color'))
      .toBe('var(--vlaina-sidebar-notes-text, var(--vlaina-text-primary, currentColor))');

    clearFormatPreview(view);

    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(overlay.style.cssText).toBe(originalOverlayStyle);
    expect(textMark.style.cssText).toBe(originalTextMarkStyle);
  });

  it('uses shared background mark geometry during lightweight background previews', () => {
    const view = createOversizedPreviewView();
    const bgMark = document.createElement('mark');
    const overlay = document.createElement('span');
    bgMark.dataset.bgColor = '#fde68a';
    bgMark.style.setProperty('--vlaina-bg-color-mark-bg', '#fde68a');
    bgMark.style.setProperty('background-color', 'var(--vlaina-bg-color-mark-bg)', 'important');
    bgMark.style.setProperty('padding', 'var(--vlaina-editor-inline-background-padding, var(--vlaina-space-0))');
    bgMark.style.setProperty('box-shadow', 'var(--vlaina-editor-inline-background-shadow, none)');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    bgMark.append(overlay);
    view.dom.append(bgMark);
    const originalBgMarkStyle = bgMark.style.cssText;
    const originalOverlayStyle = overlay.style.cssText;

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(overlay.style.getPropertyValue('background-color')).toBe('transparent');
    expect(overlay.style.getPropertyValue('box-shadow')).toBe('none');
    expect(overlay.style.getPropertyValue('padding')).toBe('var(--vlaina-editor-inline-background-padding, var(--vlaina-space-0))');
    expect(bgMark.style.getPropertyValue('--vlaina-bg-color-mark-bg')).toBe('#fca9bd');
    expect(bgMark.style.getPropertyValue('background-color')).toBe('var(--vlaina-bg-color-mark-bg)');
    expect(bgMark.style.getPropertyValue('padding')).toContain('var(--vlaina-editor-inline-background-padding');
    expect(bgMark.style.getPropertyValue('box-shadow')).toBe('var(--vlaina-editor-inline-background-shadow, none)');

    clearFormatPreview(view);

    expect(overlay.style.cssText).toBe(originalOverlayStyle);
    expect(bgMark.style.cssText).toBe(originalBgMarkStyle);
  });

  it('does not redispatch selection overlays when a lightweight color preview can reuse existing overlay nodes', () => {
    const { tr, view } = createOversizedPreviewViewWithSelection();
    const overlay = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    view.dom.append(overlay);

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dispatch).not.toHaveBeenCalled();
    expect(tr.setMeta).not.toHaveBeenCalled();
    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-bg-color')).toBe('#fca9bd');

    clearFormatPreview(view);
  });

  it('reuses matching lightweight background previews without rebuilding selection decorations', () => {
    const { tr, view } = createOversizedPreviewViewWithSelection();
    const overlay = document.createElement('span');
    const textMark = document.createElement('span');
    view.dom.classList.add('editor-pointer-native-selection');
    overlay.className = 'editor-text-selection-overlay';
    textMark.dataset.textColor = '#866ec6';
    textMark.style.setProperty('color', '#866ec6', 'important');
    textMark.textContent = 'target';
    overlay.append(textMark);
    view.dom.append(overlay);

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(tr.setMeta).toHaveBeenCalledWith('editorTextSelectionPointerNative', false);
    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-bg-color')).toBe('#fca9bd');
    const firstOverlayStyle = overlay.style.cssText;
    const firstTextMarkStyle = textMark.style.cssText;

    view.dispatch.mockClear();
    tr.setMeta.mockClear();

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dispatch).not.toHaveBeenCalled();
    expect(tr.setMeta).not.toHaveBeenCalled();
    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('bg');
    expect(view.dom.style.getPropertyValue('--vlaina-toolbar-preview-bg-color')).toBe('#fca9bd');
    expect(overlay.style.cssText).toBe(firstOverlayStyle);
    expect(textMark.style.cssText).toBe(firstTextMarkStyle);

    view.state.selection = { empty: false, from: 2, to: 7 };

    applyBgColorPreview(view, '#fca9bd');

    expect(view.dispatch).toHaveBeenCalledTimes(1);

    clearFormatPreview(view);
  });

  it('keeps counterpart colors intact for lightweight default color previews', () => {
    const view = createOversizedPreviewView();
    const overlay = document.createElement('span');
    const bgMark = document.createElement('mark');
    overlay.className = 'editor-text-selection-overlay';
    bgMark.dataset.bgColor = '#fca9bd';
    bgMark.style.setProperty('background-color', '#fca9bd', 'important');
    overlay.append(bgMark);
    view.dom.append(overlay);
    const originalOverlayStyle = overlay.style.cssText;
    const originalBgMarkStyle = bgMark.style.cssText;

    applyTextColorPreview(view, null);

    expect(view.dom.getAttribute('data-toolbar-color-preview')).toBe('text');
    expect(view.dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(overlay.style.cssText).toBe(originalOverlayStyle);
    expect(bgMark.style.cssText).toBe(originalBgMarkStyle);

    clearFormatPreview(view);
  });

  it('switches pointer-native selections back to overlay decorations for lightweight color previews', () => {
    const host = document.createElement('div');
    const dom = document.createElement('div');
    const tr: any = {
      setMeta: vi.fn(() => tr),
    };
    const view: any = {
      dispatch: vi.fn(() => {
        const overlay = document.createElement('span');
        overlay.className = 'editor-text-selection-overlay';
        overlay.textContent = 'target';
        dom.append(overlay);
      }),
      dom,
      state: {
        doc: {
          content: { size: 1024 * 1024 + 1 },
          eq: vi.fn(() => false),
        },
        selection: { empty: false },
        tr,
      },
    };
    dom.className = 'ProseMirror editor-pointer-native-selection';
    host.append(dom);
    document.body.append(host);

    applyTextColorPreview(view, '#866ec6');

    expect(tr.setMeta).toHaveBeenCalledWith('editorTextSelectionPointerNative', false);
    expect(tr.setMeta).toHaveBeenCalledWith('addToHistory', false);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(dom.style.getPropertyValue('--vlaina-toolbar-preview-text-color')).toBe('#866ec6');
    expect(dom.hasAttribute('data-toolbar-color-preview-removes-counterpart')).toBe(false);
    expect(dom.querySelector<HTMLElement>('.editor-text-selection-overlay')?.style.backgroundColor).toBe('');

    clearFormatPreview(view);
    host.remove();
  });

  it('skips applied preview rendering for DOM-heavy documents even when text size is small', () => {
    const view = createPreviewGuardView({
      docSize: 1024,
      domElementCount: 2_501,
    });

    applyFormatPreview(view, 'bold');
    applyColorPickerIdlePreview(view);

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.style.display).toBe('');
  });

  it('falls back to selection overlays for format previews in oversized documents', () => {
    const { view } = createOversizedPreviewViewWithSelection();
    const overlay = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    view.dom.append(overlay);

    applyFormatPreview(view, 'bold');

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(view.dom.getAttribute('data-toolbar-format-preview')).toBe('bold');
    expect(view.dom.getAttribute('data-toolbar-format-preview-mode')).toBe('apply');

    clearFormatPreview(view);

    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(false);
    expect(view.dom.hasAttribute('data-toolbar-format-preview')).toBe(false);
    expect(view.dom.hasAttribute('data-toolbar-format-preview-mode')).toBe(false);
  });

  it('previews removing active formats through the oversized-document fallback', () => {
    const { view } = createOversizedPreviewViewWithSelection();
    const overlay = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    view.dom.append(overlay);

    applyFormatPreview(view, 'italic', true);

    expect(view.dom.getAttribute('data-toolbar-format-preview')).toBe('italic');
    expect(view.dom.getAttribute('data-toolbar-format-preview-mode')).toBe('remove');

    clearFormatPreview(view);
  });

  it('previews removing active links through the oversized-document fallback', () => {
    const { view } = createOversizedPreviewViewWithSelection();
    const overlay = document.createElement('span');
    overlay.className = 'editor-text-selection-overlay';
    overlay.textContent = 'target';
    view.dom.append(overlay);

    applyFormatPreview(view, 'link', true);

    expect(view.dom.parentElement?.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(view.dom.getAttribute('data-toolbar-format-preview')).toBe('link');
    expect(view.dom.getAttribute('data-toolbar-format-preview-mode')).toBe('remove');

    clearFormatPreview(view);
  });

  it('mirrors source list layout in applied preview documents', async () => {
    const { editor, host, view } = await createEditor('seed');
    const SchemaCtor = view.state.schema.constructor as any;
    const EditorStateCtor = view.state.constructor as any;
    const schema = new SchemaCtor({
      nodes: {
        doc: { content: 'bullet_list' },
        bullet_list: {
          content: 'list_item+',
          toDOM: () => ['ul', 0],
        },
        list_item: {
          content: 'paragraph bullet_list?',
          toDOM: () => ['li', 0],
        },
        paragraph: {
          content: 'text*',
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
    });
    const state = EditorStateCtor.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('bullet_list', null, [
          schema.node('list_item', null, [
            schema.node('paragraph', null, [schema.text('parent')]),
            schema.node('bullet_list', null, [
              schema.node('list_item', null, [
                schema.node('paragraph', null, [schema.text('child')]),
              ]),
            ]),
          ]),
        ]),
      ]),
    });
    const sourceDom = document.createElement('div');
    sourceDom.className = 'ProseMirror';
    sourceDom.innerHTML = '<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>';
    const sourceListItem = sourceDom.querySelector<HTMLElement>('li');
    const sourceNestedList = sourceDom.querySelector<HTMLElement>('li > ul');
    if (!sourceListItem || !sourceNestedList) {
      throw new Error('Expected nested list DOM');
    }

    sourceListItem.style.lineHeight = '32px';
    sourceListItem.style.marginTop = '11px';
    sourceNestedList.classList.add('editor-collapsed-content');

    const previewDom = renderAppliedPreviewDocument(state, sourceDom, document);
    const previewListItem = previewDom.querySelector<HTMLElement>('li');
    const previewNestedList = previewDom.querySelector<HTMLElement>('li > ul');
    expect(previewListItem?.style.lineHeight).toBe('32px');
    expect(previewListItem?.style.marginTop).toBe('11px');
    expect(previewNestedList?.classList.contains('editor-collapsed-content')).toBe(true);

    await editor.destroy();
    host.remove();
  });

  it('preserves rendered image block node views in applied preview documents', async () => {
    const { editor, host, view } = await createEditor('seed');
    const SchemaCtor = view.state.schema.constructor as any;
    const EditorStateCtor = view.state.constructor as any;
    const schema = new SchemaCtor({
      nodes: {
        doc: { content: 'paragraph' },
        paragraph: {
          content: 'image',
          toDOM: () => ['p', 0],
        },
        image: {
          inline: true,
          group: 'inline',
          atom: true,
          attrs: { src: { default: '' }, alt: { default: '' } },
          toDOM: (node: any) => ['img', { src: node.attrs.src, alt: node.attrs.alt }],
        },
        text: { group: 'inline' },
      },
    });
    const state = EditorStateCtor.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.node('image', { src: 'image.png', alt: 'preview' }),
        ]),
      ]),
    });
    const sourceDom = document.createElement('div');
    sourceDom.className = 'ProseMirror';
    sourceDom.innerHTML = '<p><div class="image-block-container"><img src="resolved-image.png" alt="preview"><button>Resize</button></div></p>';

    const previewDom = renderAppliedPreviewDocument(state, sourceDom, document);
    const previewImageBlock = previewDom.querySelector<HTMLElement>('.image-block-container');
    expect(previewImageBlock).toBeInstanceOf(HTMLElement);
    expect(previewImageBlock?.querySelector('button')).toBeInstanceOf(HTMLButtonElement);
    expect(previewImageBlock?.querySelector('button')?.hasAttribute('tabindex')).toBe(false);
    expect(previewDom.querySelector('p > img')).toBeNull();

    await editor.destroy();
    host.remove();
  });

  it('preserves rendered frontmatter node views in applied preview documents', async () => {
    const { editor, host, view } = await createEditor('seed');
    const SchemaCtor = view.state.schema.constructor as any;
    const EditorStateCtor = view.state.constructor as any;
    const schema = new SchemaCtor({
      nodes: {
        doc: { content: 'frontmatter' },
        frontmatter: {
          content: 'text*',
          toDOM: () => ['div', { 'data-type': 'frontmatter', class: 'frontmatter-block-container' }, 0],
        },
        text: { group: 'inline' },
      },
    });
    const state = EditorStateCtor.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('frontmatter', null, [schema.text('title: Test')]),
      ]),
    });
    const sourceDom = document.createElement('div');
    sourceDom.className = 'ProseMirror';
    sourceDom.innerHTML = '<div data-type="frontmatter" class="frontmatter-block-container"><div class="frontmatter-block-editor"><div class="cm-editor" tabindex="0">title: Test</div></div></div>';

    const previewDom = renderAppliedPreviewDocument(state, sourceDom, document);
    const previewFrontmatter = previewDom.querySelector<HTMLElement>('.frontmatter-block-container');
    expect(previewFrontmatter).toBeInstanceOf(HTMLElement);
    expect(previewFrontmatter?.querySelector('.cm-editor')).toBeInstanceOf(HTMLElement);
    expect(previewFrontmatter?.querySelector('.cm-editor')?.hasAttribute('tabindex')).toBe(false);

    await editor.destroy();
    host.remove();
  });

  it('commits an active applied preview with one final document update', async () => {
    const { editor, host, view } = await createEditor('format me');
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');
    const userInputListener = vi.fn();
    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(view.state.doc.rangeHasMark(
      findTextRange(view.state.doc, 'format').from,
      findTextRange(view.state.doc, 'format').to,
      view.state.schema.marks.strong
    )).toBe(false);

    expect(commitFormatPreview(view, 'bold', false)).toBe(true);

    expect(userInputListener).toHaveBeenCalledTimes(1);
    const range = findTextRange(view.state.doc, 'format');
    expect(view.state.doc.rangeHasMark(range.from, range.to, view.state.schema.marks.strong)).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeInstanceOf(HTMLElement);

    clearFormatPreview(view);

    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.style.display).toBe('');

    await editor.destroy();
    host.remove();
  });

  it('keeps committed format previews undoable and redoable after collapsing the selection', async () => {
    const { editor, host, view } = await createEditorWithHistory('format me');
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');
    expect(commitFormatPreview(view, 'bold', false)).toBe(true);
    clearFormatPreview(view);
    collapseSelectionAfterToolbarApply(view);

    const range = findTextRange(view.state.doc, 'format');
    expect(view.state.doc.rangeHasMark(range.from, range.to, view.state.schema.marks.strong)).toBe(true);
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.rangeHasMark(range.from, range.to, view.state.schema.marks.strong)).toBe(false);
    expect(redo(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.rangeHasMark(range.from, range.to, view.state.schema.marks.strong)).toBe(true);

    await editor.destroy();
    host.remove();
  });

  it('keeps block preview markup equivalent to the committed editor markup', async () => {
    const cases: Array<{ markdown: string; selected: string; blockType: typeof BLOCK_TYPES[number]['type'] }> = [
      { markdown: 'plain target', selected: 'target', blockType: 'heading1' },
      { markdown: 'plain target', selected: 'target', blockType: 'blockquote' },
      { markdown: 'plain target', selected: 'target', blockType: 'bulletList' },
      { markdown: 'plain target', selected: 'target', blockType: 'orderedList' },
      { markdown: 'plain target', selected: 'target', blockType: 'taskList' },
    ];

    for (const testCase of cases) {
      const { editor, host, view } = await createEditor(testCase.markdown);
      selectText(view, testCase.selected);

      applyBlockPreview(view, testCase.blockType);

      const overlay = host.querySelector('.toolbar-applied-preview-overlay');
      const previewHtml = normalizePreviewComparisonHtml(overlay);

      expect(commitBlockPreview(view, testCase.blockType)).toBe(true);
      clearFormatPreview(view);

      expect(normalizePreviewComparisonHtml(view.dom)).toBe(previewHtml);

      await editor.destroy();
      host.remove();
    }
  });

  it('builds replacement previews from the restored editor instead of the hidden previous preview state', async () => {
    const { editor, host, view } = await createEditor('target text');
    view.dom.style.lineHeight = '33px';
    selectText(view, 'target');

    applyFormatPreview(view, 'bold');
    expect(view.dom.style.display).toBe('none');

    applyFormatPreview(view, 'italic');

    const overlay = host.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.style.display).toBe('');
    expect(overlay?.style.lineHeight).toBe('33px');
    expect(view.dom.style.display).toBe('none');

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('reuses the current applied preview when hovering the same action repeatedly', async () => {
    const { editor, host, view } = await createEditor('target text');
    selectText(view, 'target');

    applyFormatPreview(view, 'bold');
    const firstOverlay = host.querySelector('.toolbar-applied-preview-overlay');

    applyFormatPreview(view, 'bold');

    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBe(firstOverlay);
    expect(host.querySelectorAll('.toolbar-applied-preview-overlay')).toHaveLength(1);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('keeps root typography stable while rendering applied previews', async () => {
    const { editor, host, view } = await createEditor('target text');
    view.dom.style.fontSize = '18px';
    view.dom.style.lineHeight = '32px';
    view.dom.style.letterSpacing = '0px';
    selectText(view, 'target');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector<HTMLElement>('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.style.fontSize).toBe('18px');
    expect(overlay?.style.lineHeight).toBe('32px');
    expect(overlay?.style.letterSpacing).toBe('0px');

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('renders active link previews by applying the real unlink command to a shadow document', async () => {
    const { editor, host, view } = await createEditor('[linked text](https://example.com)');
    const originalDoc = view.state.doc;
    selectText(view, 'linked text');

    applyFormatPreview(view, 'link', true);

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.querySelector('a')).toBeNull();
    expect(overlay?.textContent).toContain('linked text');
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('does not render an inactive link preview because adding a link requires user input', async () => {
    const { editor, host, view } = await createEditor('plain text');
    const originalDoc = view.state.doc;
    selectText(view, 'plain text');

    applyFormatPreview(view, 'link', false);

    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.state.doc).toBe(originalDoc);

    await editor.destroy();
    host.remove();
  });

  it('renders color and background previews from the same command path used by apply', async () => {
    const { editor, host, view } = await createEditor('color me');
    const originalDoc = view.state.doc;
    selectText(view, 'color');

    applyTextColorPreview(view, '#ef4444');
    let overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay?.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(overlay?.querySelector('[style*="#ef4444"], [style*="239, 68, 68"]')).toBeInstanceOf(HTMLElement);
    expect(view.state.doc).toBe(originalDoc);

    applyBgColorPreview(view, '#fde68a');
    overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay?.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    const bgPreviewMark = overlay?.querySelector<HTMLElement>('[style*="#fde68a"], [style*="253, 230, 138"]');
    expect(bgPreviewMark).toBeInstanceOf(HTMLElement);
    expect(bgPreviewMark?.style.cssText).toContain('--vlaina-bg-color-mark-bg: #fde68a');
    expect(bgPreviewMark?.style.cssText).not.toContain('padding: var(--vlaina-space-05em) 0');
    expect(bgPreviewMark?.style.cssText).not.toContain('box-shadow: var(--vlaina-space-015em)');
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('hides the selected text while previewing a color that does not change the document', async () => {
    const { editor, host, view } = await createEditor('color me');
    const originalDoc = view.state.doc;
    selectText(view, 'color');

    applyTextColorPreview(view, null);

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.classList.contains('toolbar-selection-hidden-preview')).toBe(true);
    expect(view.dom.style.display).toBe('none');
    expect(view.state.doc).toBe(originalDoc);
    expect(commitTextColorPreview(view, null)).toBe(false);
    expect(host.querySelector('.toolbar-applied-preview-overlay')).toBeNull();
    expect(view.dom.style.display).toBe('');

    await editor.destroy();
    host.remove();
  });

  it('keeps existing code block node views visible while previewing colors', async () => {
    const { editor, host, view } = await createEditorWithCodeNodeViews([
      'color me',
      '',
      '```ts',
      'const answer = 42;',
      '```',
    ].join('\n'));
    selectText(view, 'color');

    const sourceCodeBlock = view.dom.querySelector('.code-block-container');
    expect(sourceCodeBlock).toBeInstanceOf(HTMLElement);

    applyTextColorPreview(view, '#3b82f6');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    const previewCodeBlock = overlay?.querySelector('.code-block-container');
    expect(previewCodeBlock).toBeInstanceOf(HTMLElement);
    expect(previewCodeBlock?.textContent).toContain('const answer = 42;');
    expect(overlay?.querySelector('pre.code-block-wrapper')).toBeNull();
    expect(previewCodeBlock?.querySelector('[contenteditable]')).toBeNull();
    expect(previewCodeBlock?.querySelector('[tabindex]')).toBeNull();

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('reuses existing math render nodes while previewing unrelated toolbar changes', async () => {
    const { editor, host, view } = await createEditorWithRenderedAtomNodeViews([
      '$$',
      'x^2 + y^2',
      '$$',
      '',
      'format me',
    ].join('\n'));
    const sourceMath = view.dom.querySelector<HTMLElement>('[data-type="math-block"]');
    expect(sourceMath).toBeInstanceOf(HTMLElement);
    sourceMath?.setAttribute('data-preserve-probe', 'math');
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    const previewMath = overlay?.querySelector<HTMLElement>('[data-type="math-block"]');
    expect(previewMath).toBeInstanceOf(HTMLElement);
    expect(previewMath?.getAttribute('data-preserve-probe')).toBe('math');
    expect(previewMath?.querySelector('.katex')).toBeInstanceOf(HTMLElement);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('reuses existing mermaid render nodes while previewing unrelated toolbar changes', async () => {
    const { editor, host, view } = await createEditorWithRenderedAtomNodeViews('format me');
    const mermaidNode = view.state.schema.nodes.mermaid?.create({
      code: ['graph TD', '  A --> B'].join('\n'),
    });
    expect(mermaidNode).toBeTruthy();
    view.dispatch(view.state.tr.insert(0, mermaidNode!));

    const sourceMermaid = view.dom.querySelector<HTMLElement>('[data-type="mermaid"]');
    expect(sourceMermaid).toBeInstanceOf(HTMLElement);
    sourceMermaid?.setAttribute('data-preserve-probe', 'mermaid');
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    const previewMermaid = overlay?.querySelector<HTMLElement>('[data-type="mermaid"]');
    expect(previewMermaid).toBeInstanceOf(HTMLElement);
    expect(previewMermaid?.getAttribute('data-preserve-probe')).toBe('mermaid');
    expect(previewMermaid?.textContent).not.toContain('Loading diagram');

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('reuses existing video render nodes while previewing unrelated toolbar changes', async () => {
    const { editor, host, view } = await createEditorWithRenderedAtomNodeViews('format me');
    const videoNode = view.state.schema.nodes.video?.create({
      src: 'https://example.com/video.mp4',
      title: 'Demo video',
      width: 640,
      height: 360,
    });
    expect(videoNode).toBeTruthy();
    view.dispatch(view.state.tr.insert(0, videoNode!));

    const sourceVideo = view.dom.querySelector<HTMLElement>('[data-type="video"]');
    expect(sourceVideo).toBeInstanceOf(HTMLElement);
    sourceVideo?.setAttribute('data-preserve-probe', 'video');
    const sourceVideoElement = document.createElement('video');
    sourceVideoElement.src = 'https://example.com/video.mp4';
    sourceVideo?.appendChild(sourceVideoElement);
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    const previewVideo = overlay?.querySelector<HTMLElement>('[data-type="video"]');
    expect(previewVideo).toBeInstanceOf(HTMLElement);
    expect(previewVideo?.getAttribute('data-preserve-probe')).toBe('video');
    expect(previewVideo?.querySelector('video')).toBeInstanceOf(HTMLVideoElement);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('keeps cloned iframe videos inert during toolbar previews', async () => {
    const { editor, host, view } = await createEditorWithRenderedAtomNodeViews('format me');
    const videoNode = view.state.schema.nodes.video?.create({
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Demo iframe video',
      width: 640,
      height: 360,
    });
    expect(videoNode).toBeTruthy();
    view.dispatch(view.state.tr.insert(0, videoNode!));

    const sourceVideo = view.dom.querySelector<HTMLElement>('[data-type="video"]');
    expect(sourceVideo).toBeInstanceOf(HTMLElement);
    const sourceIframe = document.createElement('iframe');
    sourceIframe.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    sourceVideo?.appendChild(sourceIframe);
    expect(sourceIframe?.getAttribute('src')).toBeTruthy();
    selectText(view, 'format');

    applyFormatPreview(view, 'bold');

    const previewIframes = Array.from(host.querySelectorAll<HTMLIFrameElement>('.toolbar-applied-preview-overlay [data-type="video"] iframe'));
    expect(previewIframes).toHaveLength(2);
    previewIframes.forEach((previewIframe) => {
      expect(previewIframe.getAttribute('src')).toBeNull();
    });
    expect(previewIframes.map((previewIframe) => previewIframe.dataset.previewSrc)).toEqual([
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
      sourceIframe?.getAttribute('src'),
    ]);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('commits a background color preview without keeping the selected range highlighted', async () => {
    const { editor, host, view } = await createEditor('color me');
    selectText(view, 'color');

    applyBgColorPreview(view, '#fde68a');

    expect(commitBgColorPreview(view, '#fde68a')).toBe(true);
    expect(view.state.selection.empty).toBe(true);

    const bgMark = view.dom.querySelector<HTMLElement>('[style*="#fde68a"], [style*="253, 230, 138"]');
    expect(bgMark).toBeInstanceOf(HTMLElement);
    expect(bgMark?.style.cssText).toContain('--vlaina-bg-color-mark-bg: #fde68a');
    expect(bgMark?.style.cssText).not.toContain('padding: var(--vlaina-space-05em) 0');
    expect(bgMark?.style.cssText).not.toContain('box-shadow: var(--vlaina-space-015em)');

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });

  it('renders alignment previews by applying the real alignment command to a shadow document', async () => {
    const { editor, host, view } = await createEditor('align me');
    const originalDoc = view.state.doc;
    selectText(view, 'align');

    applyAlignmentPreview(view, 'center');

    const overlay = host.querySelector('.toolbar-applied-preview-overlay');
    expect(overlay?.querySelector('[style*="text-align: center"], [align="center"]')).toBeInstanceOf(HTMLElement);
    expect(view.state.doc).toBe(originalDoc);

    clearFormatPreview(view);
    await editor.destroy();
    host.remove();
  });
});
