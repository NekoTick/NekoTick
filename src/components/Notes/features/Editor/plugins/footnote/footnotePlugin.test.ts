import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { DOMParser as ProseDOMParser, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { getMarkdown } from '@milkdown/kit/utils';
import {
  MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS,
  footnoteInteractionPluginKey,
  footnotePlugin,
  FOOTNOTE_TOOLTIP_POSITIONED_CLASS,
  handleEmptyFootnoteDefinitionDelete,
  handleFootnoteArrowNavigation,
  handleFootnoteModEnterExit,
  hasNonBlankFootnoteRefInputPrefix,
  serializeFootnoteDefinitionToMarkdown,
  syncFootnoteTooltipPosition,
  transactionTouchesFootnoteContext,
} from './footnotePlugin';
import { normalizeFootnoteLabel, normalizeFootnotePreview } from './footnoteLabels';
import { configureTheme } from '../../theme';
import { atomicBlockKeyboardNavigationPlugin } from '../cursor/atomicBlockKeyboardNavigationPlugin';
import { autoPairPlugin } from '../pairs/autoPairPlugin';

function createRecorder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const state = {
    openNode: (...args: unknown[]) => {
      calls.push({ method: 'openNode', args });
      return state;
    },
    next: (...args: unknown[]) => {
      calls.push({ method: 'next', args });
      return state;
    },
    closeNode: (...args: unknown[]) => {
      calls.push({ method: 'closeNode', args });
      return state;
    },
  };

  return { calls, state };
}

function findTextEndPosition(doc: any, text: string): number {
  let position = -1;
  doc.descendants((node: any, pos: number) => {
    if (!node.isText || typeof node.text !== 'string') return true;
    const index = node.text.indexOf(text);
    if (index < 0) return true;
    position = pos + index + text.length;
    return false;
  });
  if (position < 0) {
    throw new Error(`Text not found: ${text}`);
  }
  return position;
}

function typeText(view: EditorView, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, text) || handled;
      return handled;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  }
}

function pressEnter(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    if (handled) return handled;
    handled = handleKeyDown(view, event) || handled;
    return handled;
  });
  return handled;
}

describe('footnote markdown serialization', () => {
  it('positions a visible tooltip outside overflow containers', () => {
    const ref = document.createElement('sup');
    vi.spyOn(ref, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 80,
      left: 120,
      top: 80,
      right: 136,
      bottom: 96,
      width: 16,
      height: 16,
      toJSON: () => ({}),
    });

    syncFootnoteTooltipPosition(ref);

    expect(ref.classList.contains(FOOTNOTE_TOOLTIP_POSITIONED_CLASS)).toBe(true);
    expect(ref.style.getPropertyValue('--vlaina-footnote-tooltip-left')).toBe('128px');
    expect(ref.style.getPropertyValue('--vlaina-footnote-tooltip-top')).toBe('80px');
  });

  it('serializes footnote definitions as real footnoteDefinition nodes', () => {
    const { calls, state } = createRecorder();
    const content = { id: 'footnote-content' };

    serializeFootnoteDefinitionToMarkdown(state, {
      attrs: { id: 'note-1' },
      content,
    });

    expect(calls).toEqual([
      {
        method: 'openNode',
        args: ['footnoteDefinition', undefined, { label: 'note-1', identifier: 'note-1' }],
      },
      { method: 'next', args: [content] },
      { method: 'closeNode', args: [] },
    ]);
  });

  it('normalizes footnote ids before markdown serialization', () => {
    const { calls, state } = createRecorder();
    const content = { id: 'footnote-content' };

    serializeFootnoteDefinitionToMarkdown(state, {
      attrs: { id: ` ${'a'.repeat(140)}\u202E ` },
      content,
    });

    expect(calls[0]).toEqual({
      method: 'openNode',
      args: ['footnoteDefinition', undefined, {
        label: 'a'.repeat(128),
        identifier: 'a'.repeat(128),
      }],
    });
  });
});

describe('footnote reference markup', () => {
  it('positions the tooltip when a reference is hovered', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, ['Text[^note].', '', '[^note]: Body'].join('\n')))
      .use(commonmark)
      .use(gfm)
      .use(footnotePlugin)
      .use(configureTheme);

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const reference = view.dom.querySelector<HTMLElement>('sup.footnote-ref');
    expect(reference).toBeInstanceOf(HTMLElement);
    vi.spyOn(reference!, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 80,
      left: 120,
      top: 80,
      right: 136,
      bottom: 96,
      width: 16,
      height: 16,
      toJSON: () => ({}),
    });

    reference!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(reference!.classList.contains(FOOTNOTE_TOOLTIP_POSITIONED_CLASS)).toBe(true);
    expect(reference!.style.getPropertyValue('--vlaina-footnote-tooltip-left')).toBe('128px');
    await editor.destroy();
  });

  it('creates an editable footnote definition from its typed marker', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, ''))
      .use(commonmark)
      .use(gfm)
      .use(footnotePlugin)
      .use(autoPairPlugin);

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '[^typed-note]: Typed **footnote body**');
    expect(pressEnter(view)).toBe(true);

    const definition = view.state.doc.firstChild;
    expect(definition?.type.name).toBe('footnote_definition');
    expect(definition?.attrs.label).toBe('typed-note');
    expect(definition?.textContent).toBe('Typed footnote body');
    expect(definition?.firstChild?.lastChild?.marks.some((mark) => mark.type.name === 'strong')).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(view.state.selection.$from.depth).toBe(1);
    expect(editor.action(getMarkdown())).toContain('[^typed-note]: Typed **footnote body**');

    await editor.destroy();
  });

  it('bounds footnote reference input prefix checks', () => {
    const textBetween = vi.fn(() => 'prefix');
    const start = 10_000;

    expect(hasNonBlankFootnoteRefInputPrefix({ textBetween }, 1, start)).toBe(true);
    expect(textBetween).toHaveBeenCalledWith(
      start - MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS,
      start
    );
  });

  it('normalizes footnote labels and preview text', () => {
    expect(normalizeFootnoteLabel(` note[1]\u202E${'x'.repeat(140)} `)).toBe(`note1${'x'.repeat(123)}`);
    expect(normalizeFootnotePreview(` ${'x '.repeat(600)}`)).toBe('x '.repeat(256).trim());
  });

  it('uses a data-backed custom tooltip instead of the native title tooltip', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/Notes/features/Editor/plugins/footnote/footnotePlugin.ts'),
      'utf8'
    );

    expect(source).toContain("'data-footnote-value': label");
    expect(source).toContain("'aria-label': `Footnote ${id}`");
    expect(source).not.toContain('title: `Footnote ${id}`');
  });

  it('applies the custom footnote markup to the active GFM schema', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const reference = view.dom.querySelector('sup.footnote-ref');
    const definition = view.dom.querySelector('.footnote-def');

    expect(reference?.classList.contains('md-footnote')).toBe(true);
    expect(reference?.getAttribute('data-type')).toBe('footnote_reference');
    expect(reference?.getAttribute('data-footnote-value')).toBe('[1]');
    expect(reference?.getAttribute('contenteditable')).toBe('false');
    expect(reference?.querySelector('a')).toBeNull();
    expect(reference?.querySelector('.footnote-ref-label')?.textContent).toBe('[1]');
    expect(reference?.querySelector('.footnote-ref-label')?.getAttribute('contenteditable')).toBe('false');
    expect(reference?.getAttribute('title')).toBeNull();
    expect(definition?.getAttribute('data-type')).toBe('footnote_definition');
    expect(definition?.classList.contains('footnote-line')).toBe(true);
    expect(definition?.querySelector('.footnote-def-label')?.textContent).toBe('[1]:');
    expect(definition?.querySelector('.footnote-def-label')?.getAttribute('contenteditable')).toBe('false');

    await editor.destroy();
  });

  it('normalizes GFM footnote labels from markdown and DOM attrs', async () => {
    const longId = 'a'.repeat(140);
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, [`Text[^${longId}].`, '', `[^${longId}]: Body`].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const reference = view.dom.querySelector('sup.footnote-ref');
    const definition = view.dom.querySelector('.footnote-def');

    expect(reference?.getAttribute('data-id')).toBe('a'.repeat(128));
    expect(definition?.getAttribute('data-id')).toBe('a'.repeat(128));

    const container = document.createElement('div');
    container.innerHTML = [
      `<p>Text<sup class="footnote-ref" data-id=" ${'b'.repeat(140)}\u202E "></sup></p>`,
      `<div class="footnote-def" data-id=" ${'b'.repeat(140)}\u202E "><div class="footnote-def-content"><p>Body</p></div></div>`,
    ].join('');
    const parsed = ProseDOMParser.fromSchema(view.state.schema).parse(container);
    const attrs: Record<string, unknown>[] = [];
    parsed.descendants((node: ProseNode) => {
      if (node.type.name === 'footnote_reference' || node.type.name === 'footnote_definition') {
        attrs.push(node.attrs);
      }
      return true;
    });

    expect(attrs).toEqual([
      { label: 'b'.repeat(128) },
      { label: 'b'.repeat(128) },
    ]);

    await editor.destroy();
  });

  it('moves across GFM footnote references as a single inline unit with arrow keys', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['A[^1]B', '', '[^1]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    let footnoteFrom: number | null = null;

    view.state.doc.child(0).descendants((node, pos) => {
      if (node.type.name === 'footnote_reference') {
        footnoteFrom = 1 + pos;
      }
    });

    expect(footnoteFrom).toBeTypeOf('number');

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, footnoteFrom!)));
    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    expect(handleFootnoteArrowNavigation(view, rightEvent)).toBe(true);
    expect(rightEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.from).toBe(footnoteFrom! + 1);

    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    expect(handleFootnoteArrowNavigation(view, leftEvent)).toBe(true);
    expect(leftEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.from).toBe(footnoteFrom);

    await editor.destroy();
  });

  it('keeps GFM footnote references atomic for deletion operations', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['A[^1]B', '', '[^1]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const paragraph = view.state.doc.child(0);
    let footnoteFrom: number | null = null;
    let footnoteSize: number | null = null;

    paragraph.descendants((node, pos) => {
      if (node.type.name === 'footnote_reference') {
        footnoteFrom = 1 + pos;
        footnoteSize = node.nodeSize;
      }
    });

    expect(footnoteFrom).toBeTypeOf('number');
    expect(footnoteSize).toBe(1);

    const from = footnoteFrom!;
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, from, from + footnoteSize!))
        .deleteSelection()
    );

    expect(view.state.doc.child(0).textContent).toBe('AB');
    expect(view.dom.querySelector('sup.footnote-ref')).toBeNull();

    await editor.destroy();
  });

  it('scrolls to the matching definition when a footnote reference is clicked', async () => {
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['A[^1]B', '', '[^1]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    try {
      await editor.create();
      const view = editor.ctx.get(editorViewCtx);
      const referenceLabel = view.dom.querySelector('.footnote-ref-label');
      const definition = view.dom.querySelector('.footnote-def');

      expect(referenceLabel).toBeInstanceOf(HTMLElement);
      expect(definition).toBeInstanceOf(HTMLElement);

      referenceLabel?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
      expect(scrollIntoView.mock.contexts[0]).toBe(definition);
    } finally {
      await editor.destroy();
      HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
    }
  });

  it('shows the footnote definition content in the hover capsule', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Text[^note2].', '', '[^note2]: Footnote body with detail'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const reference = view.dom.querySelector('sup.footnote-ref');

    expect(reference?.getAttribute('data-footnote-value')).toBe('Footnote body with detail');

    await editor.destroy();
  });

  it('bounds long footnote hover preview text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Text[^note].', '', `[^note]: ${'x'.repeat(600)}`].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const reference = view.dom.querySelector('sup.footnote-ref');

    expect(reference?.getAttribute('data-footnote-value')).toBe('x'.repeat(512));

    await editor.destroy();
  });

  it('moves the cursor out of a footnote definition on Ctrl+Enter from its content', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Text[^note2].', '', '[^note2]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    let footnoteTextPos: number | null = null;

    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Footnote body') {
        footnoteTextPos = pos + node.text.length;
        return false;
      }
      return;
    });

    expect(footnoteTextPos).toBeTypeOf('number');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, footnoteTextPos!)));

    const originalFootnoteSize = view.state.doc.child(1).nodeSize;
    const userInputListener = vi.fn();
    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(handleFootnoteModEnterExit(view)).toBe(true);

    expect(userInputListener).toHaveBeenCalledTimes(1);
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).type.name).toBe('footnote_definition');
    expect(view.state.doc.child(2).type.name).toBe('paragraph');
    expect(view.state.selection.from).toBe(view.state.doc.child(0).nodeSize + originalFootnoteSize + 1);

    view.dom.removeEventListener('editor:block-user-input', userInputListener);
    await editor.destroy();
  });

  it('deletes an empty footnote definition on Delete without selecting the previous block', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(gfm)
      .use(footnotePlugin);

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { schema } = view.state;
      const footnoteType = schema.nodes.footnote_def ?? schema.nodes.footnote_definition;
      const before = schema.nodes.paragraph.create(null, schema.text('Before'));
      const emptyFootnoteParagraph = schema.nodes.paragraph.create();
      const footnote = footnoteType.create({ id: '1', label: '1' }, [emptyFootnoteParagraph]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [before, footnote]));

      let emptyFootnoteTextPos: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (emptyFootnoteTextPos !== null) return false;
        if (node.type.name === 'paragraph' && node.content.size === 0 && pos > before.nodeSize) {
          emptyFootnoteTextPos = pos + 1;
          return false;
        }
        return true;
      });
      expect(emptyFootnoteTextPos).toBeTypeOf('number');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyFootnoteTextPos!)));

      const userInputListener = vi.fn();
      view.dom.addEventListener('editor:block-user-input', userInputListener);
      const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });

      expect(handleEmptyFootnoteDefinitionDelete(view, event)).toBe(true);

      expect(event.defaultPrevented).toBe(true);
      expect(userInputListener).toHaveBeenCalledTimes(1);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).textContent).toBe('Before');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);

      view.dom.removeEventListener('editor:block-user-input', userInputListener);
    } finally {
      await editor.destroy();
    }
  });

  it('handles empty footnote definition Delete before structural block navigation', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(gfm)
      .use(footnotePlugin)
      .use(atomicBlockKeyboardNavigationPlugin);

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { schema } = view.state;
      const footnoteType = schema.nodes.footnote_def ?? schema.nodes.footnote_definition;
      const before = schema.nodes.heading.create({ level: 2 }, schema.text('Before'));
      const emptyFootnoteParagraph = schema.nodes.paragraph.create();
      const footnote = footnoteType.create({ id: '1', label: '1' }, [emptyFootnoteParagraph]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [before, footnote]));

      let emptyFootnoteTextPos: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (emptyFootnoteTextPos !== null) return false;
        if (node.type.name === 'paragraph' && node.content.size === 0 && pos > before.nodeSize) {
          emptyFootnoteTextPos = pos + 1;
          return false;
        }
        return true;
      });
      expect(emptyFootnoteTextPos).toBeTypeOf('number');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyFootnoteTextPos!)));

      const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
      let handled = false;
      view.someProp('handleKeyDown', (handleKeyDown: any) => {
        if (handled) return handled;
        handled = handleKeyDown(view, event) || handled;
        return handled;
      });

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).type.name).toBe('heading');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
    } finally {
      await editor.destroy();
    }
  });

  it('does not delete a non-empty footnote definition with the empty-definition shortcut', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Before', '', '[^1]: Body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(footnotePlugin);

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const bodyPos = findTextEndPosition(view.state.doc, 'Body');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, bodyPos)));
      const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });

      expect(handleEmptyFootnoteDefinitionDelete(view, event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.textContent).toContain('Body');
    } finally {
      await editor.destroy();
    }
  });

  it('keeps footnote interaction state stable for unrelated paragraph edits', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Intro text.', '', 'Text[^note].', '', '[^note]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const initialPluginState = footnoteInteractionPluginKey.getState(view.state);
    const tr = view.state.tr.insertText(' typed', findTextEndPosition(view.state.doc, 'Intro text.'));

    expect(transactionTouchesFootnoteContext(view.state.doc, tr.doc, tr)).toBe(false);

    view.dispatch(tr);

    expect(footnoteInteractionPluginKey.getState(view.state)).toBe(initialPluginState);

    await editor.destroy();
  });

  it('marks footnote definition edits as needing interaction sync', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Text[^note].', '', '[^note]: Footnote body'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const initialPluginState = footnoteInteractionPluginKey.getState(view.state);
    const tr = view.state.tr.insertText(' updated', findTextEndPosition(view.state.doc, 'Footnote body'));

    expect(transactionTouchesFootnoteContext(view.state.doc, tr.doc, tr)).toBe(true);

    view.dispatch(tr);

    const nextPluginState = footnoteInteractionPluginKey.getState(view.state);
    expect(nextPluginState).not.toBe(initialPluginState);
    expect(nextPluginState?.hasFootnotes).toBe(true);

    await editor.destroy();
  });

  it('detects range deletions that span footnotes away from the range boundary', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['Start paragraph.', '', 'Text[^note].', '', '[^note]: Footnote body', '', 'End paragraph.'].join('\n'));
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme)
      .use(footnotePlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const tr = view.state.tr.delete(
      findTextEndPosition(view.state.doc, 'Start paragraph.'),
      findTextEndPosition(view.state.doc, 'End paragraph.'),
    );

    expect(transactionTouchesFootnoteContext(view.state.doc, tr.doc, tr)).toBe(true);

    await editor.destroy();
  });
});
