import { describe, expect, it } from 'vitest';
import {
  buildMentionPreviewParts,
  collectMentionCandidates,
  createMentionTitleMatcher,
  findMentionTitlesInValue,
  getNoteMentionTrigger,
  MAX_MENTION_QUERY_CHARS,
  MAX_MENTION_TITLE_CHARS,
  MAX_MENTION_TITLE_SCAN_ITEMS,
  type NoteMentionCandidate,
  valueContainsMentionLabel,
} from './noteMentionHelpers';
import type { FileTreeNode } from '@/stores/notes/types';

function createTree(): FileTreeNode[] {
  return [
    {
      id: 'docs',
      name: 'docs',
      path: 'docs',
      isFolder: true,
      expanded: true,
      children: [
        {
          id: 'docs/alpha.md',
          name: 'alpha',
          path: 'docs/alpha.md',
          isFolder: false,
        },
        {
          id: 'docs/beta.markdown',
          name: 'beta',
          path: 'docs/beta.markdown',
          isFolder: false,
        },
        {
          id: 'docs/gamma.mdown',
          name: 'gamma',
          path: 'docs/gamma.mdown',
          isFolder: false,
        },
        {
          id: 'docs/delta.mkd',
          name: 'delta',
          path: 'docs/delta.mkd',
          isFolder: false,
        },
        {
          id: 'docs/skip.txt',
          name: 'skip',
          path: 'docs/skip.txt',
          isFolder: false,
        },
      ],
    },
  ];
}

function createDeepTree(depth: number): FileTreeNode[] {
  let current: FileTreeNode = {
    id: `folder-${depth}/leaf.md`,
    name: 'leaf',
    path: `folder-${depth}/leaf.md`,
    isFolder: false,
  };

  for (let index = depth; index >= 0; index -= 1) {
    current = {
      id: `folder-${index}`,
      name: `folder-${index}`,
      path: `folder-${index}`,
      isFolder: true,
      expanded: true,
      children: [current],
    };
  }

  return [current];
}

describe('collectMentionCandidates', () => {
  it('includes every supported markdown note in the mention list', () => {
    const candidates: NoteMentionCandidate[] = [];

    collectMentionCandidates(createTree(), candidates);

    expect(candidates).toEqual([
      {
        path: 'docs',
        title: 'docs/',
        kind: 'folder',
        isCurrent: false,
      },
      {
        path: 'docs/alpha.md',
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: 'docs/alpha.md',
      },
      {
        path: 'docs/beta.markdown',
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: 'docs/beta.markdown',
      },
      {
        path: 'docs/gamma.mdown',
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: 'docs/gamma.mdown',
      },
      {
        path: 'docs/delta.mkd',
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: 'docs/delta.mkd',
      },
    ]);
  });

  it('skips internal note folders while keeping user dot folders', () => {
    const candidates: NoteMentionCandidate[] = [];

    collectMentionCandidates([
      {
        id: '.git',
        name: '.git',
        path: '.git',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: '.git/config.md',
            name: 'config',
            path: '.git/config.md',
            isFolder: false,
          },
        ],
      },
      {
        id: '.notes',
        name: '.notes',
        path: '.notes',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: '.notes/daily.md',
            name: 'daily',
            path: '.notes/daily.md',
            isFolder: false,
          },
        ],
      },
    ], candidates);

    expect(candidates).toEqual([
      {
        path: '.notes',
        title: '.notes/',
        kind: 'folder',
        isCurrent: false,
      },
      {
        path: '.notes/daily.md',
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: '.notes/daily.md',
      },
    ]);
  });

  it('collects candidates from deep trees without recursive traversal', () => {
    const candidates: NoteMentionCandidate[] = [];

    collectMentionCandidates(createDeepTree(2500), candidates);

    expect(candidates[candidates.length - 1]).toEqual({
      path: 'folder-2500/leaf.md',
      title: '',
      kind: 'note',
      isCurrent: false,
      notePath: 'folder-2500/leaf.md',
    });
  });

  it('does not spend the mention candidate tree budget on unsupported files before markdown notes', () => {
    const candidates: NoteMentionCandidate[] = [];

    collectMentionCandidates([
      ...Array.from({ length: 20_000 }, (_value, index) => ({
        id: `asset-${index}.png`,
        name: `asset-${index}.png`,
        path: `asset-${index}.png`,
        isFolder: false as const,
      })),
      {
        id: 'late.md',
        name: 'late.md',
        path: 'late.md',
        isFolder: false,
      },
    ], candidates);

    expect(candidates).toContainEqual({
      path: 'late.md',
      title: '',
      kind: 'note',
      isCurrent: false,
      notePath: 'late.md',
    });
  });
});

describe('getNoteMentionTrigger', () => {
  it('returns the active mention query near the caret', () => {
    expect(getNoteMentionTrigger('Ask @Alpha', 'Ask @Alpha'.length)).toEqual({
      start: 4,
      end: 10,
      query: 'Alpha',
    });
  });

  it('rejects overlong mention queries', () => {
    const value = `@${'a'.repeat(MAX_MENTION_QUERY_CHARS + 1)}`;

    expect(getNoteMentionTrigger(value, value.length)).toBeNull();
  });

  it('keeps short mention queries after long message prefixes', () => {
    const prefix = 'a'.repeat(MAX_MENTION_QUERY_CHARS * 4);
    const value = `${prefix} @Note`;

    expect(getNoteMentionTrigger(value, value.length)).toEqual({
      start: prefix.length + 1,
      end: value.length,
      query: 'Note',
    });
  });
});

describe('mention label matching', () => {
  it('matches inserted mention labels only on mention boundaries', () => {
    expect(valueContainsMentionLabel('@Today please', 'Today')).toBe(true);
    expect(valueContainsMentionLabel('see (@Today) please', 'Today')).toBe(true);
    expect(valueContainsMentionLabel('email me@Today please', 'Today')).toBe(false);
    expect(valueContainsMentionLabel('prefix@Today please', 'Today')).toBe(false);
    expect(valueContainsMentionLabel('@TodayLater please', 'Today')).toBe(false);
  });

  it('does not render mention previews for labels embedded in ordinary text', () => {
    const parts = buildMentionPreviewParts('email me@Today please, then @Today ', [
      { path: 'Today.md', title: 'Today', kind: 'note' },
    ]);

    expect(parts.filter((part) => part.type === 'mention')).toEqual([
      expect.objectContaining({
        text: '@Today',
        start: 28,
        end: 34,
      }),
    ]);
  });

  it('does not duplicate long ordinary text into a mention preview', () => {
    expect(buildMentionPreviewParts('ordinary text '.repeat(10_000), [])).toEqual([]);
  });

  it('prefers the longest mention label when titles share a prefix', () => {
    const parts = buildMentionPreviewParts('@TodayLater and @Today', [
      { path: 'Today.md', title: 'Today', kind: 'note' },
      { path: 'TodayLater.md', title: 'TodayLater', kind: 'note' },
    ]);

    expect(parts.filter((part) => part.type === 'mention').map((part) => part.text)).toEqual([
      '@TodayLater',
      '@Today',
    ]);
  });

  it('finds mention titles with the same boundaries as single-label matching', () => {
    const matches = findMentionTitlesInValue(
      'email me@Today, then @Today and @TodayLater plus (@Docs/)',
      ['Today', 'TodayLater', 'Docs/', 'Missing'],
    );

    expect([...matches].sort()).toEqual(['Docs/', 'Today', 'TodayLater']);
  });

  it('skips overlong mention titles while building the matching trie', () => {
    const overlongTitle = 'x'.repeat(MAX_MENTION_TITLE_CHARS + 1);
    const matches = findMentionTitlesInValue(
      `@Safe @${overlongTitle}`,
      ['Safe', overlongTitle],
    );

    expect([...matches]).toEqual(['Safe']);
  });

  it('bounds mention title scans for large candidate lists', () => {
    const titles = Array.from({ length: MAX_MENTION_TITLE_SCAN_ITEMS + 1 }, (_value, index) =>
      index === MAX_MENTION_TITLE_SCAN_ITEMS ? 'AfterBudget' : `Title-${index}`,
    );

    const matches = findMentionTitlesInValue('@Title-0 @AfterBudget', titles);

    expect(matches.has('Title-0')).toBe(true);
    expect(matches.has('AfterBudget')).toBe(false);
  });

  it('reuses a prepared mention title index across value scans', () => {
    let titleIterations = 0;
    const titles = {
      *[Symbol.iterator]() {
        titleIterations += 1;
        yield 'Today';
        yield 'Tomorrow';
      },
    };
    const matcher = createMentionTitleMatcher(titles);

    expect([...matcher.findInValue('@Today')]).toEqual(['Today']);
    expect([...matcher.findInValue('@Tomorrow')]).toEqual(['Tomorrow']);
    expect(titleIterations).toBe(1);
  });
});
