import { describe, expect, it } from 'vitest';
import { slashPluginKey } from './slashPluginKey';
import {
  canOpenSlashMenuFromSelection,
  createDismissedSlashState,
  createSlashState,
  deriveSlashState,
  getSlashTextRange,
} from './slashState';

function createSelection(
  textBefore: string,
  pos = textBefore.length,
  options: { empty?: boolean; isTextblock?: boolean; isCode?: boolean } = {}
) {
  return {
    empty: options.empty ?? true,
    $from: {
      parentOffset: textBefore.length,
      pos,
      parent: {
        isTextblock: options.isTextblock ?? true,
        type: { spec: { code: options.isCode ?? false } },
        textBetween: (from = 0, to = textBefore.length) => textBefore.slice(from, to),
      },
    },
  } as any;
}

function createView(textBefore: string, pos = textBefore.length) {
  return {
    state: {
      selection: createSelection(textBefore, pos),
    },
  } as any;
}

function createTransaction(options: {
  selectionText: string;
  selectionPos?: number;
  docChanged?: boolean;
  selectionSet?: boolean;
  meta?: Record<string, unknown>;
}) {
  const metaMap = options.meta ?? {};

  return {
    docChanged: options.docChanged ?? false,
    selectionSet: options.selectionSet ?? false,
    selection: createSelection(options.selectionText, options.selectionPos),
    getMeta: (key: unknown) => metaMap[String((key as { key?: string }).key ?? 'slashMenu')] ?? null,
  } as any;
}

describe('deriveSlashState', () => {
  it('opens from plugin meta', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/',
        meta: {
          [slashPluginKey.key]: { isOpen: true, query: '', selectedIndex: 0 },
        },
      }),
      createSlashState()
    );

    expect(next.isOpen).toBe(true);
  });

  it('closes when selection moves away from slash query without doc change', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: 'plain text',
        selectionSet: true,
      }),
      {
        isOpen: true,
        query: 'todo',
        selectedIndex: 0,
      }
    );

    expect(next).toEqual(createSlashState());
  });

  it('updates query when selection changes within slash query without doc change', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/hea',
        selectionSet: true,
      }),
      {
        isOpen: true,
        query: 'he',
        selectedIndex: 4,
      }
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('hea');
    expect(next.selectedIndex).toBeGreaterThanOrEqual(0);
  });

  it('does not open from a cursor move into an existing slash query', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/hea',
        selectionSet: true,
      }),
      createSlashState()
    );

    expect(next).toEqual(createSlashState());
  });

  it('resets the selected item when the query changes', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/h',
        docChanged: true,
      }),
      {
        isOpen: true,
        query: '',
        selectedIndex: 5,
      }
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('h');
    expect(next.selectedIndex).toBe(0);
  });

  it('closes when query no longer matches any slash item', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/zzzz-no-match',
        docChanged: true,
      }),
      {
        isOpen: true,
        query: 'z',
        selectedIndex: 0,
      }
    );

    expect(next).toEqual(createSlashState());
  });

  it('stays closed while a slash query has no matches', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/x',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next).toEqual(createSlashState());
  });

  it('reopens when a previously unmatched slash query becomes fuzzy-matchable', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/j3',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('j3');
    expect(next.selectedIndex).toBe(0);
  });

  it('reopens when a noisy slash query keeps a numeric command alias suffix', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/ssssss3',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('ssssss3');
    expect(next.selectedIndex).toBe(0);
  });

  it('closes after whitespace in the slash query', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/h ',
        docChanged: true,
      }),
      {
        isOpen: true,
        query: 'h',
        selectedIndex: 0,
      }
    );

    expect(next).toEqual(createSlashState());
  });

  it('tracks slashes inside ordinary text', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: 'hello/e',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('e');
  });

  it('does not track slashes inside urls', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: 'https://example.com',
        docChanged: true,
      }),
      {
        isOpen: true,
        query: '',
        selectedIndex: 0,
      }
    );

    expect(next).toEqual(createSlashState());
  });

  it('does not track slashes inside domain-like urls without protocols', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: 'visit example.com/path/e',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next).toEqual(createSlashState());
  });

  it('does not track slashes in long url paths beyond the old short lookback window', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: `visit https://example.com/${'a'.repeat(80)}/e`,
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next).toEqual(createSlashState());
  });

  it('does not treat a slash inside an uncollapsed markdown link target as a command', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '[](https//xxx)1',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next).toEqual(createSlashState());
  });

  it('still tracks a slash typed after an uncollapsed markdown link target', () => {
    const next = deriveSlashState(
      createTransaction({
        selectionText: '[](https//xxx)/e',
        docChanged: true,
      }),
      createSlashState()
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('e');
  });

  it('keeps an explicitly dismissed slash query closed while the user keeps typing it', () => {
    const dismissed = createDismissedSlashState(createSelection('/h', 10));
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/he',
        selectionPos: 11,
        docChanged: true,
      }),
      dismissed
    );

    expect(next.isOpen).toBe(false);
    expect(next.dismissedSlashFrom).toBe(dismissed.dismissedSlashFrom);
  });

  it('clears a dismissed slash query after the slash range stops being active', () => {
    const dismissed = createDismissedSlashState(createSelection('/h', 10));
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/h ',
        selectionPos: 12,
        docChanged: true,
      }),
      dismissed
    );

    expect(next).toEqual(createSlashState());
  });

  it('opens again for a new slash after a different dismissed slash query', () => {
    const dismissed = createDismissedSlashState(createSelection('/h', 10));
    const next = deriveSlashState(
      createTransaction({
        selectionText: '/he /e',
        selectionPos: 20,
        docChanged: true,
      }),
      dismissed
    );

    expect(next.isOpen).toBe(true);
    expect(next.query).toBe('e');
    expect(next.dismissedSlashFrom).toBeUndefined();
  });
});

describe('getSlashTextRange', () => {
  it('returns the exact delete range for a slash query inside ordinary text', () => {
    const range = getSlashTextRange(createView('prefix/e', 42));

    expect(range).toEqual({
      query: 'e',
      deleteFrom: 40,
      deleteTo: 42,
    });
  });

  it('returns the exact delete range for a slash query before existing suffix text', () => {
    const range = getSlashTextRange(createView('prefix/e', 18));

    expect(range).toEqual({
      query: 'e',
      deleteFrom: 16,
      deleteTo: 18,
    });
  });
});

describe('canOpenSlashMenuFromSelection', () => {
  it('opens at the start of a text block, after whitespace, and inside ordinary text', () => {
    expect(canOpenSlashMenuFromSelection(createSelection(''))).toBe(true);
    expect(canOpenSlashMenuFromSelection(createSelection('hello '))).toBe(true);
    expect(canOpenSlashMenuFromSelection(createSelection('hello'))).toBe(true);
  });

  it('does not open inside urls, code blocks, or range selections', () => {
    expect(canOpenSlashMenuFromSelection(createSelection('https:'))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('https:/'))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('https://example.com'))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('visit www.example.com'))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('visit example.com/path'))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('', 0, { isCode: true }))).toBe(false);
    expect(canOpenSlashMenuFromSelection(createSelection('', 0, { empty: false }))).toBe(false);
  });
});
