import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';
import { GapCursor } from '@milkdown/kit/prose/gapcursor';
import * as ProseModel from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import {
  MilkdownEditorInner,
  createLargePlainMarkdownDocJSON,
  isEditorMarkdownEquivalentToNoteContent,
  isSameVisibleNoteContentIgnoringManagedFrontmatter,
  normalizeInitialEditorSelection,
  replaceEditorMarkdown,
  shouldUseLazyBlockVisibility,
  shouldUseVirtualizedEditorView,
} from './MilkdownEditorInner';
import {
  createDocumentFirstLineEndTextSelection,
  createDocumentStartTextSelection,
} from './utils/editorSelection';
import {
  blankAreaDragBoxPluginKey,
  CLEAR_BLOCKS_ACTION,
} from './plugins/cursor/blockSelectionPluginState';
import { setBlockSelectionInteractionPending } from './plugins/cursor/blockSelectionInteractionState';

const mocks = vi.hoisted(() => {
  const notesState = {
    currentNote: { path: 'small.md', content: '# Small' } as { path: string; content: string } | null,
    currentNoteDiskRevision: 1,
    updateContent: vi.fn(),
    saveNote: vi.fn().mockResolvedValue(undefined),
    isNewlyCreated: false,
    notesPath: '/notesRoot',
  };
  const editorState = {
    activeEditor: null as any,
    serializedMarkdown: '# Small',
  };
  const pendingMarkdownAutosaveState = {
    shouldSerialize: false,
    options: null as null | {
      onLocalMarkdownCommitted?: (content: string) => void;
    },
  };
  const debouncedSave = vi.fn();
  const flushCurrentPendingEditorMarkdown = vi.fn(() => false);
  const flushSave = vi.fn();
  const focusCurrentEditorAtViewportPoint = vi.fn(() => true);

  return {
    debouncedSave,
    editorState,
    flushCurrentPendingEditorMarkdown,
    flushSave,
    focusCurrentEditorAtViewportPoint,
    notesState,
    pendingMarkdownAutosaveState,
  };
});

vi.mock('@milkdown/react', () => ({
  MilkdownProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Milkdown: () => <div data-testid="milkdown-runtime" />,
  useEditor: () => ({ get: () => mocks.editorState.activeEditor }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof mocks.notesState) => unknown) => selector(mocks.notesState),
    {
      getState: () => mocks.notesState,
      subscribe: () => () => {},
    },
  ),
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: {
    data: {
      settings: {
        ui?: {
          colorMode?: 'system' | 'light' | 'dark';
        };
        markdown: {
          appearance: { importedThemeId: null };
          typewriterMode: boolean;
        };
      };
    };
  }) => unknown) => selector({
    data: {
      settings: {
        ui: { colorMode: 'system' },
        markdown: {
          appearance: { importedThemeId: null },
          typewriterMode: false,
        },
      },
    },
  }),
}));

vi.mock('@/components/markdown-theme/useImportedMarkdownThemePlatform', () => ({
  useImportedMarkdownThemePlatform: () => null,
}));

vi.mock('./utils/focusEditorAtPoint', () => ({
  focusCurrentEditorAtViewportPoint: mocks.focusCurrentEditorAtViewportPoint,
}));

vi.mock('./hooks/useEditorSave', () => ({
  useEditorSave: () => ({
    debouncedSave: mocks.debouncedSave,
    flushSave: mocks.flushSave,
  }),
}));

vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushCurrentPendingEditorMarkdown,
}));

vi.mock('./hooks/usePendingMarkdownAutosave', () => ({
  usePendingMarkdownAutosave: (options: {
    onLocalMarkdownCommitted?: (content: string) => void;
  }) => {
    mocks.pendingMarkdownAutosaveState.options = options;
    return {
      configureMarkdownListener: () => () => {},
      createUserInputMarker: () => () => {},
      setEditorGetter: vi.fn(),
      shouldSerializeEditorMarkdown: () => mocks.pendingMarkdownAutosaveState.shouldSerialize,
    };
  },
}));

const ProseSchema = (ProseModel as unknown as {
  Schema: new (spec: Record<string, unknown>) => {
    node: (type: string, attrs?: unknown, content?: unknown) => any;
    nodes: Record<string, any>;
    text: (text: string) => any;
  };
}).Schema;

function withSetMeta<T extends object>(transaction: T) {
  const result = transaction as T & { setMeta: ReturnType<typeof vi.fn> };
  result.setMeta = vi.fn(() => result);
  return result;
}

function createContext(parser: (markdown: string) => unknown) {
  const dispatch = vi.fn();
  const transaction = withSetMeta({ step: 'replace' });
  const replace = vi.fn(() => transaction);
  const nodeFromJSON = vi.fn((json: unknown) => ({
    content: { type: 'fast-doc-content', json },
  }));
  const view = {
    dispatch,
    state: {
      schema: { nodeFromJSON },
      doc: { content: { size: 12 } },
      tr: { replace },
    },
  };
  const ctx = {
    get: vi.fn((token: unknown) => {
      if (token === editorViewCtx) return view;
      if (token === parserCtx) return parser;
      throw new Error('Unexpected token');
    }),
  };

  return { ctx, dispatch, nodeFromJSON, replace, view };
}

function createLargePlainMarkdown(): string {
  return [
    '# Large Fast Path',
    '',
    ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} ${'plain text '.repeat(90)}`),
  ].join('\n\n');
}

function createTextSchema(options: { blankLine?: boolean } = {}) {
  const nodes: Record<string, unknown> = {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  };

  if (options.blankLine) {
    nodes.blank_line = {
      group: 'block',
      atom: true,
      toDOM: () => ['div', { 'data-blank-line': 'true' }],
      parseDOM: [{ tag: 'div[data-blank-line="true"]' }],
    };
  }

  return new ProseSchema({ nodes });
}

function createMockActiveEditor() {
  let pendingSerializedMarkdown: string | null = null;
  const dispatch = vi.fn(() => {
    if (pendingSerializedMarkdown !== null) {
      mocks.editorState.serializedMarkdown = pendingSerializedMarkdown;
      pendingSerializedMarkdown = null;
    }
  });
  const transaction = withSetMeta({ step: 'replace' });
  const replace = vi.fn(() => transaction);
  const parser = vi.fn((markdown: string) => {
    pendingSerializedMarkdown = markdown;
    return { content: { type: 'parsed-doc-content', markdown } };
  });
  const view = {
    dom: document.createElement('div'),
    dispatch,
    state: {
      doc: { content: { size: 12 } },
      plugins: [],
      tr: { replace },
    },
  };
  const ctx = {
    get: vi.fn((token: unknown) => {
      if (token === editorViewCtx) return view;
      if (token === parserCtx) return parser;
      if (token === serializerCtx) return () => mocks.editorState.serializedMarkdown;
      throw new Error('Unexpected token');
    }),
  };
  const action = vi.fn((callback: (ctx: unknown) => unknown) => callback(ctx));
  const editor = { action, ctx, status: 'Created' };
  mocks.editorState.activeEditor = editor;
  return { action, dispatch, parser, replace, view };
}

beforeEach(() => {
  mocks.notesState.currentNote = { path: 'small.md', content: '# Small' };
  mocks.notesState.currentNoteDiskRevision = 1;
  mocks.notesState.updateContent.mockClear();
  mocks.notesState.saveNote.mockClear();
  mocks.notesState.isNewlyCreated = false;
  mocks.notesState.notesPath = '/notesRoot';
  mocks.editorState.activeEditor = null;
  mocks.editorState.serializedMarkdown = '# Small';
  mocks.debouncedSave.mockClear();
  mocks.flushCurrentPendingEditorMarkdown.mockClear();
  mocks.flushSave.mockClear();
  mocks.focusCurrentEditorAtViewportPoint.mockClear();
  mocks.pendingMarkdownAutosaveState.shouldSerialize = false;
  mocks.pendingMarkdownAutosaveState.options = null;
});

afterEach(() => {
  cleanup();
});

describe('replaceEditorMarkdown', () => {
  it('returns false without dispatching when the parser throws', () => {
    const { ctx, dispatch, replace } = createContext(() => {
      throw new Error('parse failed');
    });

    expect(replaceEditorMarkdown(ctx as never, '# Disk edit')).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false without dispatching when the parser cannot create a document', () => {
    const { ctx, dispatch, replace } = createContext(() => null);

    expect(replaceEditorMarkdown(ctx as never, '# Disk edit')).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches a document replacement only after parsing succeeds', () => {
    const doc = { content: { type: 'doc-content' } };
    const { ctx, dispatch, replace } = createContext(() => doc);

    expect(replaceEditorMarkdown(ctx as never, '# Disk edit')).toBe(true);
    expect(replace).toHaveBeenCalledWith(0, 12, expect.objectContaining({
      content: doc.content,
    }));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('preserves selection position when replacing same-note content', () => {
    const schema = createTextSchema();
    const currentDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Alpha Beta Gamma')),
    ]);
    const replacementDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Alpha Beta Gamma saved')),
    ]);
    const parserDoc = { content: replacementDoc.content };
    const setSelection = vi.fn(function setSelection(this: unknown, _selection: unknown) {
      return transaction;
    });
    const transaction = withSetMeta({
      doc: replacementDoc,
      setSelection,
    });
    const dispatch = vi.fn();
    const replace = vi.fn(() => transaction);
    const lastClick = { time: Date.now() };
    const view = {
      dispatch,
      input: { lastClick },
      state: {
        schema,
        doc: currentDoc,
        selection: TextSelection.create(currentDoc, 8),
        tr: { replace },
      },
    };
    const ctx = {
      get: vi.fn((token: unknown) => {
        if (token === editorViewCtx) return view;
        if (token === parserCtx) return () => parserDoc;
        throw new Error('Unexpected token');
      }),
    };

    expect(replaceEditorMarkdown(ctx as never, 'replacement')).toBe(true);

    const selection = setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(8);
    expect((selection as TextSelection).to).toBe(8);
    expect(lastClick.time).not.toBe(0);
    expect(dispatch).toHaveBeenCalledWith(transaction);
  });

  it('preserves a selected text range when replacing same-note content', () => {
    const schema = createTextSchema();
    const currentDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Alpha Beta Gamma')),
    ]);
    const replacementDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Alpha Beta Gamma saved')),
    ]);
    const parserDoc = { content: replacementDoc.content };
    const setSelection = vi.fn(function setSelection(this: unknown, _selection: unknown) {
      return transaction;
    });
    const transaction = withSetMeta({
      doc: replacementDoc,
      setSelection,
    });
    const dispatch = vi.fn();
    const replace = vi.fn(() => transaction);
    const view = {
      dispatch,
      state: {
        schema,
        doc: currentDoc,
        selection: TextSelection.create(currentDoc, 7, 11),
        tr: { replace },
      },
    };
    const ctx = {
      get: vi.fn((token: unknown) => {
        if (token === editorViewCtx) return view;
        if (token === parserCtx) return () => parserDoc;
        throw new Error('Unexpected token');
      }),
    };

    expect(replaceEditorMarkdown(ctx as never, 'replacement')).toBe(true);

    const selection = setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(7);
    expect((selection as TextSelection).to).toBe(11);
    expect(dispatch).toHaveBeenCalledWith(transaction);
  });

  it('clamps a preserved same-note cursor when the replacement document is shorter', () => {
    const schema = createTextSchema();
    const currentDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('A much longer paragraph before autosave normalization')),
    ]);
    const replacementDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Short')),
    ]);
    const parserDoc = { content: replacementDoc.content };
    const setSelection = vi.fn(function setSelection(this: unknown, _selection: unknown) {
      return transaction;
    });
    const transaction = withSetMeta({
      doc: replacementDoc,
      setSelection,
    });
    const dispatch = vi.fn();
    const replace = vi.fn(() => transaction);
    const view = {
      dispatch,
      state: {
        schema,
        doc: currentDoc,
        selection: TextSelection.create(currentDoc, currentDoc.content.size - 1),
        tr: { replace },
      },
    };
    const ctx = {
      get: vi.fn((token: unknown) => {
        if (token === editorViewCtx) return view;
        if (token === parserCtx) return () => parserDoc;
        throw new Error('Unexpected token');
      }),
    };

    expect(replaceEditorMarkdown(ctx as never, 'replacement')).toBe(true);

    const selection = setSelection.mock.calls[0]?.[0] as TextSelection;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.from).toBeLessThanOrEqual(replacementDoc.content.size);
    expect(selection.to).toBeLessThanOrEqual(replacementDoc.content.size);
    expect(selection.empty).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(transaction);
  });

  it('falls back to a nearby cursor when a same-note atomic block selection cannot be preserved as text', () => {
    const schema = createTextSchema({ blankLine: true });
    const currentDoc = schema.node('doc', null, [
      schema.nodes.blank_line.create(),
      schema.nodes.paragraph.create(null, schema.text('After atomic block')),
    ]);
    const replacementDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('After atomic block')),
    ]);
    const parserDoc = { content: replacementDoc.content };
    const setSelection = vi.fn(function setSelection(this: unknown, _selection: unknown) {
      return transaction;
    });
    const transaction = withSetMeta({
      doc: replacementDoc,
      setSelection,
    });
    const dispatch = vi.fn();
    const replace = vi.fn(() => transaction);
    const view = {
      dispatch,
      state: {
        schema,
        doc: currentDoc,
        selection: NodeSelection.create(currentDoc, 0),
        tr: { replace },
      },
    };
    const ctx = {
      get: vi.fn((token: unknown) => {
        if (token === editorViewCtx) return view;
        if (token === parserCtx) return () => parserDoc;
        throw new Error('Unexpected token');
      }),
    };

    expect(replaceEditorMarkdown(ctx as never, 'replacement')).toBe(true);

    const selection = setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(1);
    expect((selection as TextSelection).empty).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(transaction);
  });

  it('uses the large plain markdown fast document path without calling the parser', () => {
    const parser = vi.fn(() => {
      throw new Error('parser should not run');
    });
    const { ctx, dispatch, nodeFromJSON, replace } = createContext(parser);
    const markdown = [
      '# Large Fast Path',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    expect(replaceEditorMarkdown(ctx as never, markdown)).toBe(true);
    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(parser).not.toHaveBeenCalled();
    expect(nodeFromJSON).toHaveBeenCalledWith(expect.objectContaining({
      type: 'doc',
      content: expect.arrayContaining([
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'paragraph' }),
      ]),
    }));
    expect(replace).toHaveBeenCalledWith(0, 12, expect.objectContaining({
      content: expect.objectContaining({ type: 'fast-doc-content' }),
    }));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the parser for complex large markdown', () => {
    const doc = { content: { type: 'parsed-doc-content' } };
    const parser = vi.fn(() => doc);
    const { ctx, nodeFromJSON, replace } = createContext(parser);
    const markdown = [
      '# Large Complex Path',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} with [a link](https://example.com) ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    expect(replaceEditorMarkdown(ctx as never, markdown)).toBe(true);
    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(nodeFromJSON).not.toHaveBeenCalled();
    expect(parser).toHaveBeenCalledWith(markdown);
    expect(replace).toHaveBeenCalledWith(0, 12, expect.objectContaining({
      content: doc.content,
    }));
  });

  it('resets selection and clears block selection when replacing a different note', () => {
    const schema = createTextSchema({ blankLine: true });
    const currentDoc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, schema.text('Previous note body')),
    ]);
    const replacementDoc = schema.node('doc', null, [
      schema.nodes.blank_line.create(),
      schema.nodes.paragraph.create(null, schema.text('After leading blank line')),
    ]);
    const parserDoc = { content: replacementDoc.content };
    const setSelection = vi.fn(function setSelection(this: unknown, _selection: unknown) {
      return transaction;
    });
    const setMeta = vi.fn(function setMeta(this: unknown, _key: unknown, _value: unknown) {
      return transaction;
    });
    const transaction = {
      doc: replacementDoc,
      setSelection,
      setMeta,
    };
    const dispatch = vi.fn();
    const replace = vi.fn(() => transaction);
    const lastClick = {
      time: Date.now(),
      x: 439,
      y: 288,
      type: 'doubleClick',
      button: 0,
    };
    const view = {
      dispatch,
      input: { lastClick },
      state: {
        schema,
        doc: currentDoc,
        selection: TextSelection.create(currentDoc, currentDoc.content.size - 1),
        tr: { replace },
      },
    };
    const ctx = {
      get: vi.fn((token: unknown) => {
        if (token === editorViewCtx) return view;
        if (token === parserCtx) return () => parserDoc;
        throw new Error('Unexpected token');
      }),
    };

    expect(replaceEditorMarkdown(ctx as never, 'replacement', { resetSelection: true })).toBe(true);

    const selection = setSelection.mock.calls[0]?.[0];
    expect(selection).toBeInstanceOf(TextSelection);
    expect((selection as TextSelection).from).toBe(2 + 'After leading blank line'.length);
    expect(setMeta).toHaveBeenCalledWith(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    expect(lastClick.time).toBe(0);
    expect(dispatch).toHaveBeenCalledWith(transaction);
  });
});

describe('isEditorMarkdownEquivalentToNoteContent', () => {
  it('treats Milkdown paragraph separators as ordinary typed line breaks', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent('1\n\n2\n', '1\n2')
    ).toBe(true);
  });

  it('does not treat ordinary typed line breaks as markdown hard breaks', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent('1\n\n2\n', '1\\\n2')
    ).toBe(false);
  });

  it('keeps explicit markdown hard breaks distinct from ordinary line breaks', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent('1\\\n2\n', '1\\\n2')
    ).toBe(true);
    expect(
      isEditorMarkdownEquivalentToNoteContent('1\\\n2\n', '1\n2')
    ).toBe(false);
  });

  it('treats supported inline marks around links as equivalent to Milkdown mark ordering', () => {
    const source = [
      '<span style="font-weight: 600; color : #123456">[Color](https://example.test/color)</span>',
      '<mark style="background-color: #ecf6ff">[Background](docs/background.md)</mark>',
      '<sub>[Subscript](docs/subscript.md)</sub>',
      '~[Delimited](docs/delimited.md)~',
    ].join(' ');
    const serialized = [
      '[<span style="color: #123456">Color</span>](https://example.test/color)',
      '[<mark style="background-color: #ecf6ff">Background</mark>](docs/background.md)',
      '[~Subscript~](docs/subscript.md)',
      '[~Delimited~](docs/delimited.md)',
    ].join(' ');

    expect(isEditorMarkdownEquivalentToNoteContent(serialized, source)).toBe(true);
  });

  it('keeps different inline mark links and code literals non-equivalent', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent(
        '[~Label~](docs/changed.md)',
        '~[Label](docs/original.md)~',
      )
    ).toBe(false);
    expect(
      isEditorMarkdownEquivalentToNoteContent(
        '[<span data-note="keep">Label</span>](docs/link.md)',
        '<span data-note="keep">[Label](docs/link.md)</span>',
      )
    ).toBe(false);
    expect(
      isEditorMarkdownEquivalentToNoteContent(
        '`[~Label~](docs/link.md)`',
        '`~[Label](docs/link.md)~`',
      )
    ).toBe(false);
  });

  it('treats managed-only frontmatter changes as equivalent to the visible editor markdown', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent(
        '# Body',
        [
          '---',
          'vlaina_cover: "./assets/readme.gif" x=50 y=50 height=255 scale=1',
          'vlaina_icon: "💡" size=84',
          '---',
          '',
          '# Body',
        ].join('\n'),
      )
    ).toBe(true);
  });

  it('treats managed-only cover changes as equivalent for long paragraph notes', () => {
    const body = [
      '# Cover Rapid Switching E2E',
      '',
      'Cover e2e sentinel paragraph near the top.',
      '',
      ...Array.from({ length: 120 }, (_value, index) => (
        `Cover performance paragraph ${index + 1}: enough repeated text to make the editor scroll while the top cover remains stable.`
      )),
      '',
      'Final cover performance sentinel.',
    ].join('\n\n');
    const noteContent = [
      '---',
      'vlaina_cover: "./assets/e2e-cover-switch-06.svg" x=50 y=50 height=220 scale=1',
      '---',
      '',
      body,
    ].join('\n');

    expect(
      isEditorMarkdownEquivalentToNoteContent(
        body,
        noteContent,
      )
    ).toBe(true);
  });

  it('keeps user-authored frontmatter differences visible when comparing editor markdown', () => {
    expect(
      isEditorMarkdownEquivalentToNoteContent(
        [
          '```yaml-frontmatter vlaina-internal-frontmatter',
          'title: Demo',
          '```',
          '# Body',
        ].join('\n'),
        [
          '---',
          'title: Changed',
          'vlaina_cover: "./assets/readme.gif" x=50 y=50 height=255 scale=1',
          '---',
          '# Body',
        ].join('\n'),
      )
    ).toBe(false);
  });
});

describe('isSameVisibleNoteContentIgnoringManagedFrontmatter', () => {
  it('treats cover-only metadata updates as the same visible note content', () => {
    const body = [
      '# Cover Rapid Switching E2E',
      '',
      'Cover e2e sentinel paragraph near the top.',
      '',
      ...Array.from({ length: 120 }, (_value, index) => (
        `Cover performance paragraph ${index + 1}: enough repeated text to make the editor scroll while the top cover remains stable.`
      )),
      '',
      'Final cover performance sentinel.',
    ].join('\n\n');

    expect(
      isSameVisibleNoteContentIgnoringManagedFrontmatter(
        [
          '---',
          'vlaina_cover: "./assets/e2e-cover-switch-05.svg" x=50 y=50 height=220 scale=1',
          '---',
          '',
          body,
        ].join('\n'),
        [
          '---',
          'vlaina_cover: "./assets/e2e-cover-switch-06.svg" x=50 y=50 height=220 scale=1',
          '---',
          '',
          body,
        ].join('\n'),
      )
    ).toBe(true);
  });

  it('does not hide body changes behind managed frontmatter updates', () => {
    expect(
      isSameVisibleNoteContentIgnoringManagedFrontmatter(
        [
          '---',
          'vlaina_cover: "./assets/a.svg"',
          '---',
          '',
          '# Body',
        ].join('\n'),
        [
          '---',
          'vlaina_cover: "./assets/b.svg"',
          '---',
          '',
          '# Body changed',
        ].join('\n'),
      )
    ).toBe(false);
  });
});

describe('MilkdownEditorInner lazy block visibility', () => {
  it('recomputes lazy block visibility after first painting a switched large plain note', async () => {
    const { container, rerender } = render(<MilkdownEditorInner />);
    const getShell = () => container.querySelector<HTMLElement>('[data-note-content-root="true"]');

    expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBeNull();

    mocks.notesState.currentNote = { path: 'large.md', content: createLargePlainMarkdown() };
    mocks.notesState.currentNoteDiskRevision = 2;
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBeNull();
    await waitFor(() => {
      expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBe('true');
    });
  });

  it('defers cold large-note analysis until after the first paint and then keeps lazy block visibility', async () => {
    const plainMarkdown = createLargePlainMarkdown();
    mocks.notesState.currentNote = { path: 'large.md', content: plainMarkdown };
    mocks.notesState.currentNoteDiskRevision = 2;
    const { container, rerender } = render(<MilkdownEditorInner />);
    const getShell = () => container.querySelector<HTMLElement>('[data-note-content-root="true"]');

    expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBeNull();
    expect(container.querySelector('[data-testid="milkdown-runtime"]')).toBeNull();

    await waitFor(() => {
      expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBe('true');
      expect(container.querySelector('[data-testid="milkdown-runtime"]')).not.toBeNull();
    });

    mocks.notesState.currentNote = {
      path: 'large.md',
      content: plainMarkdown.replace('Paragraph 100', 'Paragraph [100](https://example.com)'),
    };
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(getShell()?.getAttribute('data-note-lazy-block-visibility')).toBe('true');
  });
});

describe('MilkdownEditorInner shell focus', () => {
  function renderEditorShellWithProseMirror() {
    const { container } = render(<MilkdownEditorInner />);
    const shell = container.querySelector<HTMLElement>('[data-note-content-root="true"]')!;
    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    vi.spyOn(proseMirror, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 500,
      bottom: 240,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect);
    shell.appendChild(proseMirror);
    return { proseMirror, shell };
  }

  it('focuses the editor from the original shell blank-area click point', () => {
    const { shell } = renderEditorShellWithProseMirror();

    const wasNotPrevented = fireEvent.mouseDown(shell, {
      button: 0,
      clientX: 80,
      clientY: 120,
    });

    expect(wasNotPrevented).toBe(false);
    expect(mocks.focusCurrentEditorAtViewportPoint).toHaveBeenCalledWith({
      clientX: 80,
      clientY: 120,
    });
  });

  it('does not override native editor or editor chrome mouse handling', () => {
    const { proseMirror, shell } = renderEditorShellWithProseMirror();
    const chrome = document.createElement('button');
    chrome.setAttribute('data-no-editor-drag-box', 'true');
    shell.appendChild(chrome);

    fireEvent.mouseDown(proseMirror, { button: 0, clientX: 120, clientY: 120 });
    fireEvent.mouseDown(chrome, { button: 0, clientX: 80, clientY: 120 });

    expect(mocks.focusCurrentEditorAtViewportPoint).not.toHaveBeenCalled();
  });

  it('does not focus shell blank space while block selection is pending', () => {
    const { proseMirror, shell } = renderEditorShellWithProseMirror();
    setBlockSelectionInteractionPending(proseMirror, true);

    try {
      fireEvent.mouseDown(shell, {
        button: 0,
        clientX: 80,
        clientY: 120,
      });

      expect(mocks.focusCurrentEditorAtViewportPoint).not.toHaveBeenCalled();
    } finally {
      setBlockSelectionInteractionPending(proseMirror, false);
    }
  });
});

describe('MilkdownEditorInner external content sync', () => {
  it('flushes pending body input and its save before deactivating the editor', () => {
    createMockActiveEditor();
    const { rerender } = render(<MilkdownEditorInner active />);

    rerender(<MilkdownEditorInner active={false} />);

    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.flushSave).toHaveBeenCalledTimes(1);
    expect(mocks.flushCurrentPendingEditorMarkdown.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.flushSave.mock.invocationCallOrder[0]!);
  });

  it('labels the rich-text surface as a multiline note body editor without changing shortcut semantics', async () => {
    const { view } = createMockActiveEditor();

    render(<MilkdownEditorInner />);

    await waitFor(() => {
      expect(view.dom).not.toHaveAttribute('role');
      expect(view.dom).toHaveAttribute('aria-label', 'Note body editor');
      expect(view.dom).toHaveAttribute('aria-multiline', 'true');
    });
  });

  it('reports ready when an already-created editor is available before the status callback is observed', async () => {
    createMockActiveEditor();
    const onEditorViewReady = vi.fn();

    render(<MilkdownEditorInner onEditorViewReady={onEditorViewReady} />);

    await waitFor(() => {
      expect(onEditorViewReady).toHaveBeenCalledTimes(1);
    });
  });

  it('retries readiness reporting when the first callback does not complete', async () => {
    createMockActiveEditor();
    const onEditorContentSyncFailure = vi.fn();
    const onEditorViewReady = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('Readiness observer did not complete');
      });

    render(
      <MilkdownEditorInner
        onEditorContentSyncFailure={onEditorContentSyncFailure}
        onEditorViewReady={onEditorViewReady}
      />,
    );

    await waitFor(() => {
      expect(onEditorViewReady).toHaveBeenCalledTimes(2);
    });
    expect(onEditorContentSyncFailure).not.toHaveBeenCalled();
  });

  it('replaces a stale empty editor document before reporting a non-empty note ready', async () => {
    mocks.editorState.serializedMarkdown = '';
    const editor = createMockActiveEditor();
    const onEditorViewReady = vi.fn();

    render(<MilkdownEditorInner onEditorViewReady={onEditorViewReady} />);

    await waitFor(() => {
      expect(editor.parser).toHaveBeenCalledWith('# Small');
      expect(editor.replace).toHaveBeenCalledTimes(1);
      expect(onEditorViewReady).toHaveBeenCalledTimes(1);
    });
  });

  it('replaces a stale non-empty editor document when there is no pending user input', async () => {
    mocks.editorState.serializedMarkdown = '# Stale note';
    const editor = createMockActiveEditor();
    const onEditorViewReady = vi.fn();

    render(<MilkdownEditorInner onEditorViewReady={onEditorViewReady} />);

    await waitFor(() => {
      expect(editor.parser).toHaveBeenCalledWith('# Small');
      expect(editor.replace).toHaveBeenCalledTimes(1);
      expect(onEditorViewReady).toHaveBeenCalledTimes(1);
    });
  });

  it('reports ready after a successful replacement even when Milkdown normalizes the source', async () => {
    mocks.editorState.serializedMarkdown = '# Milkdown normalized';
    const editor = createMockActiveEditor();
    editor.dispatch.mockImplementation(() => {
      mocks.editorState.serializedMarkdown = '# Milkdown normalized';
    });
    const onEditorContentSyncFailure = vi.fn();
    const onEditorViewReady = vi.fn();

    render(
      <MilkdownEditorInner
        onEditorContentSyncFailure={onEditorContentSyncFailure}
        onEditorViewReady={onEditorViewReady}
      />,
    );

    await waitFor(() => {
      expect(editor.parser).toHaveBeenCalledWith('# Small');
      expect(editor.replace).toHaveBeenCalled();
      expect(onEditorViewReady).toHaveBeenCalledTimes(1);
    });
    expect(onEditorContentSyncFailure).not.toHaveBeenCalled();
  });

  it('preserves a non-empty live document while user input is pending', () => {
    mocks.editorState.serializedMarkdown = '# Pending local edit';
    mocks.pendingMarkdownAutosaveState.shouldSerialize = true;
    const editor = createMockActiveEditor();

    render(<MilkdownEditorInner />);

    expect(editor.parser).not.toHaveBeenCalled();
    expect(editor.replace).not.toHaveBeenCalled();
  });

  it('retries a failed note replacement once before reporting a sync failure', async () => {
    const editor = createMockActiveEditor();
    const onEditorContentSyncFailure = vi.fn();
    const { rerender } = render(
      <MilkdownEditorInner onEditorContentSyncFailure={onEditorContentSyncFailure} />,
    );
    editor.parser.mockImplementation(() => {
      throw new Error('Unsupported markdown node');
    });

    mocks.notesState.currentNote = { path: 'small.md', content: '# Broken' };
    rerender(
      <MilkdownEditorInner
        showBodyLineNumbers
        onEditorContentSyncFailure={onEditorContentSyncFailure}
      />,
    );

    await waitFor(() => {
      expect(onEditorContentSyncFailure).toHaveBeenCalledTimes(1);
    });
    expect(editor.action).toHaveBeenCalledTimes(2);
    expect(editor.parser).toHaveBeenCalledTimes(2);
    expect(editor.replace).not.toHaveBeenCalled();
  });

  it('reports ready when a note replacement succeeds on its retry', async () => {
    const editor = createMockActiveEditor();
    const onEditorContentSyncFailure = vi.fn();
    const onEditorViewReady = vi.fn();
    const { rerender } = render(
      <MilkdownEditorInner
        onEditorContentSyncFailure={onEditorContentSyncFailure}
        onEditorViewReady={onEditorViewReady}
      />,
    );
    onEditorViewReady.mockClear();
    editor.parser.mockImplementationOnce(() => {
      throw new Error('Editor is still activating');
    });

    mocks.notesState.currentNote = { path: 'small.md', content: '# Recovered' };
    rerender(
      <MilkdownEditorInner
        showBodyLineNumbers
        onEditorContentSyncFailure={onEditorContentSyncFailure}
        onEditorViewReady={onEditorViewReady}
      />,
    );

    await waitFor(() => {
      expect(editor.parser).toHaveBeenCalledTimes(2);
      expect(onEditorViewReady).toHaveBeenCalledTimes(1);
    });
    expect(onEditorContentSyncFailure).not.toHaveBeenCalled();
  });

  it('does not replace the editor document when same-note updates only change managed frontmatter', () => {
    mocks.notesState.currentNote = { path: 'small.md', content: '# Body' };
    mocks.editorState.serializedMarkdown = '# Body';
    const editor = createMockActiveEditor();
    const { rerender } = render(<MilkdownEditorInner />);

    expect(editor.replace).not.toHaveBeenCalled();

    mocks.notesState.currentNote = {
      path: 'small.md',
      content: [
        '---',
        'vlaina_cover: "./assets/readme.gif" x=50 y=50 height=255 scale=1',
        '---',
        '',
        '# Body',
      ].join('\n'),
    };
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(editor.parser).not.toHaveBeenCalled();
    expect(editor.replace).not.toHaveBeenCalled();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('does not replace the editor document when managed frontmatter is removed from the same note', () => {
    mocks.notesState.currentNote = {
      path: 'small.md',
      content: [
        '---',
        'vlaina_cover: "./assets/readme.gif" x=50 y=50 height=255 scale=1',
        'vlaina_icon: "💡" size=84',
        '---',
        '',
        '# Body',
      ].join('\n'),
    };
    mocks.editorState.serializedMarkdown = '# Body';
    const editor = createMockActiveEditor();
    const { rerender } = render(<MilkdownEditorInner />);

    expect(editor.replace).not.toHaveBeenCalled();

    mocks.notesState.currentNote = { path: 'small.md', content: '# Body' };
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(editor.parser).not.toHaveBeenCalled();
    expect(editor.replace).not.toHaveBeenCalled();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('replaces same-revision store content when the editor still has stale startup markdown', () => {
    const editor = createMockActiveEditor();
    const { rerender } = render(<MilkdownEditorInner />);

    expect(editor.replace).not.toHaveBeenCalled();

    mocks.notesState.currentNote = { path: 'small.md', content: '# Updated' };
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(editor.parser).toHaveBeenCalledWith('# Updated');
    expect(editor.replace).toHaveBeenCalledTimes(1);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not replace a locally committed same-note document when autosave only advances the disk revision', () => {
    mocks.notesState.currentNote = { path: 'small.md', content: '# Small' };
    mocks.editorState.serializedMarkdown = '# Small';
    const editor = createMockActiveEditor();
    const { rerender } = render(<MilkdownEditorInner />);

    expect(editor.replace).not.toHaveBeenCalled();

    mocks.editorState.serializedMarkdown = '# Locally edited';
    mocks.pendingMarkdownAutosaveState.options?.onLocalMarkdownCommitted?.('# Locally edited');
    mocks.notesState.currentNote = { path: 'small.md', content: '# Locally edited' };
    mocks.notesState.currentNoteDiskRevision = 2;
    rerender(<MilkdownEditorInner showBodyLineNumbers />);

    expect(editor.parser).not.toHaveBeenCalled();
    expect(editor.replace).not.toHaveBeenCalled();
    expect(editor.dispatch).not.toHaveBeenCalled();
  });
});

describe('createDocumentStartTextSelection', () => {
  it('skips a leading atomic block and places the cursor in the first text block', () => {
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
          toDOM: () => ['div'],
          parseDOM: [{ tag: 'div' }],
        },
      },
    });
    const doc = schema.node('doc', null, [
      schema.nodes.atom_block.create(),
      schema.nodes.paragraph.create(null, schema.text('First editable block')),
    ]);

    const selection = createDocumentStartTextSelection(doc);

    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.from).toBe(2);
    expect(selection.empty).toBe(true);
  });
});

describe('createDocumentFirstLineEndTextSelection', () => {
  it('skips leading frontmatter and places the cursor at the first body line end', () => {
    const schema = new ProseSchema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          toDOM: () => ['p', 0],
          parseDOM: [{ tag: 'p' }],
        },
        frontmatter: {
          content: 'text*',
          group: 'block',
          code: true,
          isolating: true,
          toDOM: () => ['div', 0],
          parseDOM: [{ tag: 'div' }],
        },
        text: { group: 'inline' },
      },
    });
    const bodyText = 'First body line';
    const frontmatter = schema.nodes.frontmatter.create(null, schema.text('title: Demo'));
    const doc = schema.node('doc', null, [
      frontmatter,
      schema.nodes.paragraph.create(null, schema.text(bodyText)),
    ]);

    const selection = createDocumentFirstLineEndTextSelection(doc);

    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.from).toBe(frontmatter.nodeSize + 1 + bodyText.length);
    expect(selection.$from.parent.type.name).toBe('paragraph');
    expect(selection.empty).toBe(true);
  });

  it('skips a leading atomic block and places the cursor at the end of the first text block line', () => {
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
          toDOM: () => ['div'],
          parseDOM: [{ tag: 'div' }],
        },
      },
    });
    const text = 'First editable block';
    const doc = schema.node('doc', null, [
      schema.nodes.atom_block.create(),
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);

    const selection = createDocumentFirstLineEndTextSelection(doc);

    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.from).toBe(2 + text.length);
    expect(selection.empty).toBe(true);
  });

  it('places a gap cursor after a document that contains only an atomic block', () => {
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
          toDOM: () => ['div'],
          parseDOM: [{ tag: 'div' }],
        },
      },
    });
    const doc = schema.node('doc', null, [schema.nodes.atom_block.create()]);

    const selection = createDocumentFirstLineEndTextSelection(doc);

    expect(selection).toBeInstanceOf(GapCursor);
    expect(selection.from).toBe(doc.content.size);
    expect(selection.empty).toBe(true);
  });
});

describe('normalizeInitialEditorSelection', () => {
  it('moves an initial atomic node selection to the end of the first editable text block line', () => {
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
    const text = 'First editable block';
    const doc = schema.node('doc', null, [
      schema.nodes.atom_block.create(),
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);
    const transaction = {
      setSelection: vi.fn(function setSelection(_selection: unknown) {
        return transaction;
      }),
      setMeta: vi.fn(function setMeta(_key: unknown, _value: unknown) {
        return transaction;
      }),
    };
    const view = {
      dispatch: vi.fn(),
      state: {
        doc,
        selection: NodeSelection.create(doc, 0),
        tr: transaction,
      },
    };

    expect(normalizeInitialEditorSelection(view as never)).toBe(true);

    const nextSelection = transaction.setSelection.mock.calls[0]?.[0];
    expect(nextSelection).toBeInstanceOf(TextSelection);
    expect((nextSelection as TextSelection).from).toBe(2 + text.length);
    expect(transaction.setMeta).toHaveBeenCalledWith(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    expect(view.dispatch).toHaveBeenCalledWith(transaction);
  });

});

describe('createLargePlainMarkdownDocJSON', () => {
  it('creates ProseMirror JSON for large headings, paragraphs, and blank line placeholders', () => {
    const markdown = [
      '# Large Fast Path',
      '',
      '<!--vlaina-markdown-blank-line-->',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    const doc = createLargePlainMarkdownDocJSON(markdown);
    expect(doc?.type).toBe('doc');
    expect(doc?.content?.length).toBe(1102);
    expect(doc?.content?.[0]).toEqual({
      type: 'heading',
      attrs: { level: 1 },
      content: [
        {
          type: 'text',
          marks: [{
            type: 'markdownSyntax',
            attrs: { edge: 'prefix', kind: 'heading' },
          }],
          text: '# ',
        },
        { type: 'text', text: 'Large Fast Path' },
      ],
    });
    expect(doc?.content?.[1]).toEqual({
      type: 'html_block',
      attrs: { value: '<!--vlaina-markdown-blank-line-->' },
    });
    expect(doc?.content?.[2]?.type).toBe('paragraph');
  });

  it('rejects large markdown that needs full markdown parsing', () => {
    const markdown = Array.from(
      { length: 1100 },
      (_, index) => `Paragraph ${index} with **strong** markup ${'plain text '.repeat(90)}`,
    ).join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
  });

  it('rejects large markdown with character references that need markdown decoding', () => {
    const markdown = [
      '# Large Entity Document',
      '',
      ...Array.from({ length: 1100 }, (_, index) => (
        index === 100
          ? `Paragraph ${index} with Fish &amp; Chips ${'plain text '.repeat(90)}`
          : `Paragraph ${index} ${'plain text '.repeat(90)}`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
  });

  it('rejects large markdown with GFM autolink literals', () => {
    const paragraph = 'plain text '.repeat(120);
    const cases = [
      `Paragraph with https://example.com/path ${paragraph}`,
      `Paragraph with www.example.com ${paragraph}`,
      `Paragraph with hello@example.com ${paragraph}`,
      `# Heading with https://example.com`,
    ];

    for (const line of cases) {
      const markdown = [
        '# Large Autolink Document',
        '',
        ...Array.from({ length: 1100 }, (_value, index) => (
          index === 100 ? line : `Paragraph ${index} ${paragraph}`
        )),
      ].join('\n\n');

      expect(markdown.length).toBeGreaterThan(1_000_000);
      expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
    }
  });

  it('rejects large markdown with structural list and rule syntax', () => {
    const paragraph = 'plain text '.repeat(120);
    const cases = [
      `- item ${paragraph}`,
      `1. item ${paragraph}`,
      `: definition ${paragraph}`,
      `---`,
      `----`,
      `****`,
      `_ _ _ _`,
      `===`,
    ];

    for (const structuralLine of cases) {
      const markdown = [
        '# Large Structural Document',
        '',
        ...Array.from({ length: 1100 }, (_value, index) => (
          index === 100 ? structuralLine : `Paragraph ${index} ${paragraph}`
        )),
      ].join('\n\n');

      expect(markdown.length).toBeGreaterThan(1_000_000);
      expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
    }
  });

  it('rejects large markdown with empty atx headings', () => {
    const paragraph = 'plain text '.repeat(120);
    const cases = [
      '#',
      '###',
      '### ',
      '# #',
      '## ##',
    ];

    for (const headingLine of cases) {
      const markdown = [
        '# Large Empty Heading Document',
        '',
        ...Array.from({ length: 1100 }, (_value, index) => (
          index === 100 ? headingLine : `Paragraph ${index} ${paragraph}`
        )),
      ].join('\n\n');

      expect(markdown.length).toBeGreaterThan(1_000_000);
      expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
    }
  });

  it('rejects adjacent plain text lines that form a CommonMark soft-wrapped paragraph', () => {
    const markdown = [
      '# Large Soft Wrapped Document',
      '',
      ...Array.from({ length: 1100 }, (_value, index) => (
        index === 100
          ? ['first soft wrapped line', `second soft wrapped line ${'plain text '.repeat(100)}`].join('\n')
          : `Paragraph ${index} ${'plain text '.repeat(100)}`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(createLargePlainMarkdownDocJSON(markdown)).toBeNull();
  });

  it('normalizes closing atx heading markers on the fast path', () => {
    const markdown = [
      '# Large Fast Path #',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    const doc = createLargePlainMarkdownDocJSON(markdown);

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(shouldUseVirtualizedEditorView(markdown)).toBe(true);
    expect(doc?.content?.[0]).toEqual({
      type: 'heading',
      attrs: { level: 1 },
      content: [
        {
          type: 'text',
          marks: [{
            type: 'markdownSyntax',
            attrs: { edge: 'prefix', kind: 'heading' },
          }],
          text: '# ',
        },
        { type: 'text', text: 'Large Fast Path' },
      ],
    });
  });
});

describe('shouldUseLazyBlockVisibility', () => {
  it('enables lazy block visibility for large plain fast-path markdown', () => {
    const markdown = [
      '# Large Fast Path',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('enables lazy block visibility for large mixed syntax markdown', () => {
    const markdown = [
      '# Large Complex Path',
      '',
      ...Array.from({ length: 1100 }, (_, index) => `Paragraph ${index} with **strong** markup ${'plain text '.repeat(90)}`),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('keeps small mixed syntax markdown on stable block layout', () => {
    const markdown = [
      '# Small Complex Path',
      '',
      ...Array.from({ length: 20 }, (_, index) => `Paragraph ${index} with **strong** markup`),
    ].join('\n\n');

    expect(shouldUseLazyBlockVisibility(markdown)).toBe(false);
  });

  it('keeps medium multi-line manuals on stable block layout', () => {
    const markdown = [
      '# Manual',
      '',
      ...Array.from({ length: 220 }, (_, index) => (
        `Section ${index} with **mixed** syntax and enough prose to create a real rendered block.`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(16_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(false);
  });

  it('keeps medium notes with many independent blocks on stable block layout', () => {
    const markdown = [
      '# Medium High Block Count',
      '',
      ...Array.from({ length: 520 }, (_, index) => (
        `## Section ${index} with **mixed syntax**`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(12_000);
    expect(markdown.length).toBeLessThan(60_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(false);
    expect(shouldUseVirtualizedEditorView(markdown)).toBe(false);
  });

  it('enables lazy block visibility for syntax notes with multiple Mermaid blocks', () => {
    const markdown = [
      '# Syntax checks',
      '',
      ...Array.from({ length: 4 }, (_, index) => [
        '```mermaid',
        'flowchart TD',
        `  A${index} --> B${index}`,
        '```',
        '',
      ].join('\n')),
    ].join('\n');

    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('enables lazy block visibility for dense medium-size markdown', () => {
    const markdown = [
      '# Dense Manual',
      '',
      ...Array.from({ length: 800 }, (_, index) => (
        `Section ${index} with **mixed** syntax and enough prose to create a rendered block.`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(60_000);
    expect(markdown.length).toBeLessThan(100_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('enables lazy block visibility for large multi-line mixed manuals', () => {
    const markdown = [
      '# Large Manual',
      '',
      ...Array.from({ length: 520 }, (_, index) => (
        `Section ${index} with **mixed** syntax and enough prose to create a real rendered block. ${'more prose '.repeat(12)}`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(100_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('keeps medium dense heavy block markdown on stable block layout', () => {
    const markdown = [
      '# Dense Heavy Manual',
      '',
      ...Array.from({ length: 100 }, (_, index) => [
        `## Section ${index}`,
        '```txt',
        `heavy fenced block ${index}`,
        '```',
        `| Feature ${index} | Value |`,
        '| --- | --- |',
        `| Row ${index} | ${index} |`,
        `<video src="./assets/${index}.mp4"></video>`,
        `<iframe src="https://example.invalid/${index}"></iframe>`,
        `Section prose ${index} ${'ordinary text '.repeat(35)}`,
        '',
      ].join('\n')),
    ].join('\n');

    expect(markdown.length).toBeGreaterThan(60_000);
    expect(markdown.length).toBeLessThan(1_000_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(false);
  });

  it('enables lazy block visibility for dense imported documents with many editable blocks', () => {
    const markdown = [
      '# Imported document',
      '',
      ...Array.from({ length: 70 }, (_, index) => [
        `${index + 1}. Imported compatibility note ${index} with broken [link](https://example.invalid/${index} ${'legacy syntax and ordinary text '.repeat(18)}`,
        '<!--vlaina-markdown-blank-line-->',
        `## Shortcut ${index}`,
        '<!--vlaina-markdown-blank-line-->',
        `| Feature ${index} | Windows | macOS |`,
        '| --- | --- | --- |',
        `| Row ${index} | Ctrl+/ | command+/ |`,
        `> Nested quote ${index}`,
        `<video src="./assets/${index}.mp4" />`,
        `[^bad-${index}: incomplete footnote`,
        `- [ ] task ${index}`,
        '```txt',
        `Imported code ${index}`,
        '```',
        '<!--vlaina-markdown-blank-line-->',
        `Final section ${index}`,
        '',
      ].join('\n')),
    ].join('\n');

    expect(markdown.length).toBeGreaterThan(60_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('enables lazy block visibility for very large dense heavy markdown', () => {
    const markdown = [
      '# Very Large Dense Heavy Manual',
      '',
      ...Array.from({ length: 1300 }, (_, index) => [
        `## Section ${index}`,
        '```txt',
        `heavy fenced block ${index}`,
        '```',
        `| Feature ${index} | Value |`,
        '| --- | --- |',
        `| Row ${index} | ${index} |`,
        `<video src="./assets/${index}.mp4"></video>`,
        `<iframe src="https://example.invalid/${index}"></iframe>`,
        `Section prose ${index} ${'ordinary text '.repeat(60)}`,
        '',
      ].join('\n')),
    ].join('\n');

    expect(markdown.length).toBeGreaterThan(1_000_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });

  it('keeps sparse heavy blocks lazy in an otherwise ordinary long note', () => {
    const markdown = [
      '# Sparse Heavy Manual',
      '',
      ...Array.from({ length: 600 }, (_, index) => (
        index % 100 === 0
          ? `| Feature ${index} | Value |\n| --- | --- |\n| Row ${index} | ${index} |`
          : `Section ${index} with **mixed** syntax and enough prose to create a rendered block. ${'more prose '.repeat(8)}`
      )),
    ].join('\n\n');

    expect(markdown.length).toBeGreaterThan(60_000);
    expect(shouldUseLazyBlockVisibility(markdown)).toBe(true);
  });
});
