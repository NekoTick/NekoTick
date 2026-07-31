import { describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
} from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { calloutPlugin } from '../callout';
import { codeBlockSchema } from '../code/codeBlockSchema';
import { containerBoundaryShiftSelectionPlugin } from './containerBoundaryShiftSelectionPlugin';

function createEditor(markdown = '') {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(codeBlockSchema)
    .use(calloutPlugin)
    .use(containerBoundaryShiftSelectionPlugin);
}

function replaceDocument(view: EditorView, nodes: ProseNode[]): void {
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nodes));
}

function findTopLevelNodePos(view: EditorView, typeName: string, occurrence = 0): number {
  let matchIndex = 0;
  let foundPos: number | null = null;

  view.state.doc.forEach((node, offset) => {
    if (foundPos !== null || node.type.name !== typeName) return;
    if (matchIndex === occurrence) {
      foundPos = offset;
      return;
    }
    matchIndex += 1;
  });

  if (foundPos === null) {
    throw new Error(`Expected ${typeName} node`);
  }

  return foundPos;
}

function findTextStart(view: EditorView, text: string): number {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null || !node.isText || node.text !== text) return undefined;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Expected text: ${text}`);
  return found;
}

function pressKey(
  view: EditorView,
  key: string,
  options?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options?.ctrlKey,
    metaKey: options?.metaKey,
    shiftKey: options?.shiftKey,
  });

  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    if (handled) return handled;
    handled = handleKeyDown(view, event) || handled;
    return handled;
  });

  return event;
}

describe('containerBoundaryShiftSelectionPlugin', () => {
  it('keeps the first Shift+ArrowUp within the paragraph below a callout, then lets the next one extend', async () => {
    const editor = createEditor();
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    replaceDocument(view, [
      schema.nodes.callout.create(null, [
        schema.nodes.paragraph.create(null, schema.text('inside')),
      ]),
      schema.nodes.paragraph.create(null, schema.text('outside')),
    ]);

    const paragraphPos = findTopLevelNodePos(view, 'paragraph');
    const paragraph = view.state.doc.child(1);
    const paragraphStart = paragraphPos + 1;
    const paragraphEnd = paragraphStart + paragraph.content.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphEnd)));

    const endOfTextblock = vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);
    const firstEvent = pressKey(view, 'ArrowUp', { shiftKey: true });

    expect(firstEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.from).toBe(paragraphStart);
    expect(view.state.selection.to).toBe(paragraphEnd);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('outside');

    const secondEvent = pressKey(view, 'ArrowUp', { shiftKey: true });

    expect(secondEvent.defaultPrevented).toBe(false);
    expect(view.state.selection.from).toBe(paragraphStart);
    expect(view.state.selection.to).toBe(paragraphEnd);

    endOfTextblock.mockRestore();
    await editor.destroy();
  });

  it('applies the same first-step boundary guard before a following list', async () => {
    const editor = createEditor();
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph.create(null, schema.text('outside'));
    const list = schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create(null, [
        schema.nodes.paragraph.create(null, schema.text('inside')),
      ]),
    ]);
    replaceDocument(view, [paragraph, list]);

    const paragraphStart = 1;
    const paragraphEnd = paragraphStart + paragraph.content.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphStart)));

    const endOfTextblock = vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);
    const firstEvent = pressKey(view, 'ArrowDown', { shiftKey: true });

    expect(firstEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.from).toBe(paragraphStart);
    expect(view.state.selection.to).toBe(paragraphEnd);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('outside');

    const secondEvent = pressKey(view, 'ArrowDown', { shiftKey: true });

    expect(secondEvent.defaultPrevented).toBe(false);
    expect(view.state.selection.from).toBe(paragraphStart);
    expect(view.state.selection.to).toBe(paragraphEnd);

    endOfTextblock.mockRestore();
    await editor.destroy();
  });

  it('preserves the anchor while extending through table cells', async () => {
    const editor = createEditor([
      'Before table',
      '',
      '| Key | Value |',
      '| --- | --- |',
      '| Table cell | Covered |',
      '',
      'After table',
    ].join('\n'));
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const anchor = findTextStart(view, 'Before table') + 'Before table'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));

    const acrossTable = pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(acrossTable.defaultPrevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.anchor).toBe(anchor);
    const tableHead = view.state.selection.head;
    expect(tableHead).toBeGreaterThan(anchor);
    const tableText = view.state.doc.textBetween(
      view.state.selection.from,
      view.state.selection.to,
      '\n',
    );
    expect(tableText).toContain('Table cell');
    expect(tableText).not.toContain('After table');

    const intoAfterParagraph = pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(intoAfterParagraph.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBeGreaterThan(tableHead);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n'))
      .toContain('After table');
    await editor.destroy();
  });

  it('extends upward through an isolating code block without stalling', async () => {
    const editor = createEditor([
      'Before code',
      '',
      '```ts',
      'const mixed = true;',
      '```',
      '<!--vlaina-markdown-blank-line-->',
      'After code',
    ].join('\n'));
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const anchor = findTextStart(view, 'After code');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));

    const intoCode = pressKey(view, 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(intoCode.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBeLessThan(anchor);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n'))
      .toContain('const mixed = true;');

    const pastCode = pressKey(view, 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(pastCode.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBe(findTextStart(view, 'Before code'));
    await editor.destroy();
  });

  it('extends downward through an isolating code block without stalling', async () => {
    const editor = createEditor([
      'Before code',
      '',
      '```ts',
      'const mixed = true;',
      '```',
      '<!--vlaina-markdown-blank-line-->',
      'After code',
    ].join('\n'));
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const anchor = findTextStart(view, 'Before code') + 'Before code'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));

    const intoCode = pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(intoCode.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n'))
      .toContain('const mixed = true;');

    const pastCode = pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(pastCode.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBe(findTextStart(view, 'After code') + 'After code'.length);
    await editor.destroy();
  });

  it('recovers when an opaque isolating code view maps the selection head back to its boundary', async () => {
    const editor = createEditor([
      'Before code',
      '',
      '```ts',
      'const mixed = true;',
      '```',
      '<!--vlaina-markdown-blank-line-->',
      'After code',
    ].join('\n'));
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const beforeEnd = findTextStart(view, 'Before code') + 'Before code'.length;
    const codeStart = findTextStart(view, 'const mixed = true;');
    const codeEnd = codeStart + 'const mixed = true;'.length;
    const afterStart = findTextStart(view, 'After code');

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, beforeEnd, codeStart)));
    const down = pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(down.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(beforeEnd);
    expect(view.state.selection.head).toBe(afterStart);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, afterStart, codeEnd)));
    const up = pressKey(view, 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(up.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(afterStart);
    expect(view.state.selection.head).toBe(beforeEnd);
    await editor.destroy();
  });

  it('keeps modified vertical selection inside the active table cell', async () => {
    const editor = createEditor([
      '| Key | Value |',
      '| --- | --- |',
      '| Table cell | Covered |',
    ].join('\n'));
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const cellStart = findTextStart(view, 'Table cell');
    const anchor = cellStart + 4;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));

    pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    const cellEnd = cellStart + 'Table cell'.length;
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBe(cellEnd);

    pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBe(cellEnd);
    await editor.destroy();
  });

  it('shrinks toward the anchor before reversing direction', async () => {
    const editor = createEditor('Alpha\n\nBeta\n\nGamma');
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const anchor = findTextStart(view, 'Alpha') + 'Alpha'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)));

    pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    pressKey(view, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    const grownHead = view.state.selection.head;
    pressKey(view, 'ArrowUp', { ctrlKey: true, shiftKey: true });

    expect(view.state.selection.anchor).toBe(anchor);
    expect(view.state.selection.head).toBeLessThan(grownHead);
    await editor.destroy();
  });
});
