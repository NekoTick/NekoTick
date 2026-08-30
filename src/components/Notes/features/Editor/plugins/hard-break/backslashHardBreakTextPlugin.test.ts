import { afterEach, describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  backslashHardBreakTextPlugins,
  findBackslashHardBreakArrowLeftTarget,
  findBackslashHardBreakBlankClickTarget,
  transformBackslashHardBreaksToText,
} from './backslashHardBreakTextPlugin';

const editors: Array<ReturnType<typeof Editor.make>> = [];

interface TestMdastNode {
  children?: TestMdastNode[];
  data?: Record<string, unknown>;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  type: string;
  value?: string;
}

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark);

  for (const plugin of backslashHardBreakTextPlugins) {
    editor.use(plugin);
  }

  await editor.create();
  editors.push(editor);
  return editor;
}

function typeText(view: EditorView, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handler: (view: EditorView, from: number, to: number, text: string) => boolean) => {
      handled = handler(view, from, to, text) || handled;
      return handled;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  }
}

function pressEnter(view: EditorView, options?: { isComposing?: boolean }): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  if (options?.isComposing) {
    Object.defineProperty(event, 'isComposing', { value: true });
  }

  let handled = false;
  view.someProp('handleKeyDown', (handler: (view: EditorView, event: KeyboardEvent) => boolean) => {
    if (handled) return handled;
    handled = handler(view, event) || handled;
    return handled;
  });
  return handled;
}

afterEach(async () => {
  while (editors.length > 0) {
    const editor = editors.pop();
    await editor?.destroy();
  }
  document.body.innerHTML = '';
});

describe('backslashHardBreakTextPlugin', () => {
  it('creates a source-visible hard break from a typed trailing backslash', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    typeText(view, 'A\\');
    expect(pressEnter(view)).toBe(true);
    typeText(view, 'B');

    const paragraph = view.state.doc.firstChild;
    expect(view.state.doc.childCount).toBe(1);
    expect(paragraph?.child(0).text).toBe('A');
    expect(paragraph?.child(1).text).toBe('\\');
    expect(paragraph?.child(1).marks[0]?.type.name).toBe('backslash_hard_break_source_text');
    expect(paragraph?.child(2).type.name).toBe('hardbreak');
    expect(paragraph?.child(3).text).toBe('B');
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe('A\\\nB');
  });

  it('does not convert even trailing backslashes or composing Enter', async () => {
    const evenEditor = await createEditor('');
    const evenView = evenEditor.ctx.get(editorViewCtx) as EditorView;
    typeText(evenView, 'A\\\\');
    expect(pressEnter(evenView)).toBe(true);
    expect(evenView.state.doc.firstChild?.textContent).toBe('A\\\\');
    expect(evenView.state.doc.firstChild?.childCount).toBe(1);

    const composingEditor = await createEditor('');
    const composingView = composingEditor.ctx.get(editorViewCtx) as EditorView;
    typeText(composingView, 'A\\');
    pressEnter(composingView, { isComposing: true });
    expect(composingView.state.doc.firstChild?.textContent).toBe('A\\');
    expect(composingView.state.doc.firstChild?.childCount).toBe(1);
  });

  it('keeps a solitary line-start backslash as literal text', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    typeText(view, '\\');
    pressEnter(view);
    typeText(view, 'B');

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).textContent).toBe('\\');
    expect(view.state.doc.child(1).textContent).toBe('B');
  });

  it('turns the source hard-break backslash after a literal backslash into text', () => {
    const tree: TestMdastNode = {
      children: [{
        children: [
          { type: 'text', value: 'A\\' },
          {
            type: 'break',
            position: {
              start: { offset: 3 },
              end: { offset: 5 },
            },
          },
          { type: 'text', value: 'B' },
        ],
        type: 'paragraph',
      }],
      type: 'root',
    };

    transformBackslashHardBreaksToText(tree, { value: `A${'\\'.repeat(3)}\nB` });
    const paragraphChildren = tree.children?.[0]?.children ?? [];

    expect(paragraphChildren.map((node) => node.type)).toEqual([
      'text',
      'vlainaBackslashHardBreakSourceText',
      'break',
      'text',
    ]);
    expect(paragraphChildren[1]?.children?.[0]?.value).toBe('\\');
    expect(paragraphChildren[2]?.data?.vlainaBackslashHardBreakText).toBe(true);
  });

  it('also exposes a single source backslash hard break as cursor-addressable text', () => {
    const tree: TestMdastNode = {
      children: [{
        children: [
          { type: 'text', value: 'A' },
          {
            type: 'break',
            position: {
              start: { offset: 1 },
              end: { offset: 3 },
            },
          },
          { type: 'text', value: 'B' },
        ],
        type: 'paragraph',
      }],
      type: 'root',
    };

    transformBackslashHardBreaksToText(tree, { value: 'A\\\nB' });
    const paragraphChildren = tree.children?.[0]?.children ?? [];

    expect(paragraphChildren.map((node) => node.type)).toEqual([
      'text',
      'vlainaBackslashHardBreakSourceText',
      'break',
      'text',
    ]);
  });

  it('renders three source backslashes as two cursor-addressable text backslashes plus a hard break', async () => {
    const source = `A${'\\'.repeat(3)}\nB`;
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;

    expect(view.dom.querySelector('p')?.textContent).toBe(`A${'\\'.repeat(2)}B`);
    expect(paragraph?.child(0).isText).toBe(true);
    expect(paragraph?.child(0).text).toBe('A\\');
    expect(paragraph?.child(1).isText).toBe(true);
    expect(paragraph?.child(1).text).toBe('\\');
    expect(paragraph?.child(1).marks[0]?.type.name).toBe('backslash_hard_break_source_text');
    expect(paragraph?.child(2).type.name).toBe('hardbreak');

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trimEnd()).toBe(source);
  });

  it('keeps a source hard-break backslash after a markdown link outside the link mark', async () => {
    const source = '[Linked note](note.md)\\\nNext line';
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;
    const linkMarkType = view.state.schema.marks.link;

    expect(view.dom.querySelector('p')?.textContent).toBe('Linked note\\Next line');
    expect(paragraph?.child(0).isText).toBe(true);
    expect(paragraph?.child(0).text).toBe('Linked note');
    expect(paragraph?.child(0).marks.some((mark) => mark.type === linkMarkType)).toBe(true);
    expect(paragraph?.child(1).isText).toBe(true);
    expect(paragraph?.child(1).text).toBe('\\');
    expect(paragraph?.child(1).marks.some((mark) => mark.type === linkMarkType)).toBe(false);
    expect(paragraph?.child(1).marks[0]?.type.name).toBe('backslash_hard_break_source_text');
    expect(paragraph?.child(2).type.name).toBe('hardbreak');

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trimEnd()).toBe(source);
  });

  it('moves left from the hard break edge to the position between visible backslashes', async () => {
    const source = `。${'\\'.repeat(3)}\n下一行`;
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;
    const hardBreakEnd = 1
      + (paragraph?.child(0).nodeSize ?? 0)
      + (paragraph?.child(1).nodeSize ?? 0)
      + (paragraph?.child(2).nodeSize ?? 0);
    const betweenBackslashes = 1 + (paragraph?.child(0).nodeSize ?? 0);

    expect(paragraph?.child(0).text).toBe('。\\');
    expect(paragraph?.child(1).text).toBe('\\');
    expect(findBackslashHardBreakArrowLeftTarget(view.state.doc, hardBreakEnd)).toBe(betweenBackslashes);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hardBreakEnd)));
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    let handled = false;
    view.someProp('handleKeyDown', (handler: (view: EditorView, event: KeyboardEvent) => boolean) => {
      handled = handler(view, event) || handled;
    });

    expect(handled).toBe(true);
    expect(view.state.selection.from).toBe(betweenBackslashes);
  });

  it('leaves ArrowLeft to the IME while the editor composition is active', async () => {
    const source = `。${'\\'.repeat(3)}\n下一行`;
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;
    const hardBreakEnd = 1
      + (paragraph?.child(0).nodeSize ?? 0)
      + (paragraph?.child(1).nodeSize ?? 0)
      + (paragraph?.child(2).nodeSize ?? 0);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hardBreakEnd)));
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(view.composing).toBe(true);
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });

    view.dom.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(view.state.selection.from).toBe(hardBreakEnd);
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });

  it('does not override ArrowLeft once the cursor is between visible backslashes', async () => {
    const source = `。${'\\'.repeat(3)}\n下一行`;
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;
    const betweenBackslashes = 1 + (paragraph?.child(0).nodeSize ?? 0);

    expect(findBackslashHardBreakArrowLeftTarget(view.state.doc, betweenBackslashes)).toBeNull();

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betweenBackslashes)));
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    let handled = false;
    view.someProp('handleKeyDown', (handler: (view: EditorView, event: KeyboardEvent) => boolean) => {
      handled = handler(view, event) || handled;
    });

    expect(handled).toBe(false);
    expect(view.state.selection.from).toBe(betweenBackslashes);
  });

  it('maps a blank click after the visible hard-break backslash to the hard-break edge', async () => {
    const source = `。${'\\'.repeat(3)}\n下一行`;
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const paragraph = view.state.doc.firstChild;
    const hardBreakEdge = 1
      + (paragraph?.child(0).nodeSize ?? 0)
      + (paragraph?.child(1).nodeSize ?? 0);
    const mockView = {
      dom: view.dom,
      state: view.state,
      coordsAtPos: () => ({
        bottom: 24,
        left: 40,
        right: 40,
        top: 8,
      }),
      posAtDOM: view.posAtDOM.bind(view),
    } as unknown as EditorView;

    const event = new MouseEvent('mousedown', {
      button: 0,
      clientX: 80,
      clientY: 16,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom.querySelector('[data-vlaina-backslash-hard-break-source-text="true"]'),
    });

    expect(findBackslashHardBreakBlankClickTarget(mockView, event)).toBe(hardBreakEdge);
  });

  it('does not map another paragraph click to a nearby hard-break edge', async () => {
    const source = ['First line\\', 'continued', '', 'Second paragraph'].join('\n');
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const secondParagraph = view.dom.querySelectorAll('p')[1];
    expect(secondParagraph).toBeInstanceOf(HTMLElement);

    const mockView = {
      ...view,
      dom: view.dom,
      state: view.state,
      coordsAtPos: () => ({ bottom: 24, left: 40, right: 40, top: 8 }),
      posAtDOM: view.posAtDOM.bind(view),
    } as unknown as EditorView;
    const event = new MouseEvent('mousedown', {
      button: 0,
      clientX: 80,
      clientY: 16,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: secondParagraph,
    });

    expect(findBackslashHardBreakBlankClickTarget(mockView, event)).toBeNull();
  });
});
