import { describe, expect, it, vi } from 'vitest';
import * as ProseModel from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import { setCurrentEditorView } from './editorViewRegistry';
import {
  focusEditorToFirstLineEnd,
  focusEditorToFirstLineStart,
  focusEditorToInitialPosition,
} from './focusEditor';

const ProseSchema = (ProseModel as unknown as {
  Schema: new (spec: Record<string, unknown>) => {
    node: (type: string, attrs?: unknown, content?: unknown) => any;
    nodes: Record<string, any>;
    text: (text: string) => any;
  };
}).Schema;

describe('focusEditorToFirstLineStart', () => {
  it('skips a leading atomic block and focuses the first editable text block', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
        atom_block: {
          group: 'block',
          atom: true,
          selectable: true,
          toDOM: () => ['div'],
          parseDOM: [{ tag: 'div' }],
        },
      },
    });
    const doc = schema.node('doc', null, [
      schema.nodes.atom_block.create(),
      schema.nodes.paragraph.create(null, schema.text('First editable block')),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineStart();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(2);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });
});

describe('focusEditorToInitialPosition', () => {
  it('focuses the rich text editor at the first editable line end', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
      },
    });
    const firstLine = 'First editable line';
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text(firstLine)),
      schema.nodes.paragraph.create(null, schema.text('Second line')),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToInitialPosition();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(1 + firstLine.length);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the source editor at the first line end when source mode is active', () => {
    const sourceEditor = document.createElement('textarea');
    sourceEditor.dataset.noteSourceEditor = 'true';
    sourceEditor.value = '# Heading\n\nBody';
    document.body.appendChild(sourceEditor);
    sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);

    try {
      focusEditorToInitialPosition();

      expect(document.activeElement).toBe(sourceEditor);
      expect(sourceEditor.selectionStart).toBe('# Heading'.length);
      expect(sourceEditor.selectionEnd).toBe('# Heading'.length);
    } finally {
      sourceEditor.remove();
    }
  });
});

describe('focusEditorToFirstLineEnd', () => {
  it('skips a leading atomic block and focuses the end of the first editable text block', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
        atom_block: {
          group: 'block',
          atom: true,
          selectable: true,
          toDOM: () => ['div'],
          parseDOM: [{ tag: 'div' }],
        },
      },
    });
    const paragraphText = 'First editable block';
    const doc = schema.node('doc', null, [
      schema.nodes.atom_block.create(),
      schema.nodes.paragraph.create(null, schema.text(paragraphText)),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineEnd();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(2 + paragraphText.length);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses before the first inline hardbreak instead of the whole text block end', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
        hardbreak: {
          inline: true,
          group: 'inline',
          selectable: false,
          atom: true,
          toDOM: () => ['br'],
          parseDOM: [{ tag: 'br' }],
        },
      },
    });
    const firstLineText = 'First line';
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [
        schema.text(firstLineText),
        schema.nodes.hardbreak.create(),
        schema.text('Second line'),
      ]),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineEnd();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(1 + firstLineText.length);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses at the first visual line end when a text block wraps', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
      },
    });
    const text = 'First visual line wraps here and continues on the next line';
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const firstVisualLineEnd = 1 + 'First visual line'.length;
    const view = {
      coordsAtPos: vi.fn((pos: number) => (
        pos <= firstVisualLineEnd
          ? { left: pos, right: pos, top: 0, bottom: 20 }
          : { left: pos, right: pos, top: 24, bottom: 44 }
      )),
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineEnd();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(firstVisualLineEnd);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('keeps scanning across shifted inline content that overlaps the first visual line', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
      },
    });
    const text = 'Reference tail remains on the same visual line';
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const contentEnd = 1 + text.length;
    const view = {
      coordsAtPos: vi.fn((pos: number) => (
        pos >= 10 && pos <= 14
          ? { left: pos, right: pos, top: -8, bottom: 8 }
          : { left: pos, right: pos, top: 0, bottom: 20 }
      )),
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineEnd();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(contentEnd);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('skips an image-only paragraph and focuses the next editable text line end', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        text: { group: 'inline' },
        image: {
          inline: true,
          group: 'inline',
          atom: true,
          selectable: true,
          attrs: { src: { default: '' }, alt: { default: '' }, title: { default: '' } },
          toDOM: () => ['img'],
          parseDOM: [{ tag: 'img' }],
        },
      },
    });
    const afterImageText = 'Text after image';
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.nodes.image.create({ src: 'x.png', alt: 'x' })),
      schema.nodes.paragraph.create(null, schema.text(afterImageText)),
    ]);
    const tr = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return tr;
      }),
      scrollIntoView: vi.fn(function scrollIntoView() {
        return tr;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        doc,
        tr,
      },
    };

    try {
      setCurrentEditorView(view as never);
      focusEditorToFirstLineEnd();
    } finally {
      setCurrentEditorView(null);
    }

    const selection = tr.setSelection.mock.calls[0]?.[0];
    const secondParagraphFrom = doc.child(0).nodeSize;
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(secondParagraphFrom + 1 + afterImageText.length);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });
});
