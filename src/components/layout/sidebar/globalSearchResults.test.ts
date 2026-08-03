import { describe, expect, it } from 'vitest';
import type { NotesSidebarSearchResult } from '@/components/Notes/features/Sidebar/notesSidebarSearchResults';
import { buildGlobalSearchGroups, createRecentNoteSearchResults } from './globalSearchResults';

const note: NotesSidebarSearchResult = {
  id: 'note.md::name',
  path: 'note.md',
  name: 'Project note',
  preview: '',
  matchIndex: 0,
  matchKind: 'name',
  contentSnippet: null,
  contentMatchOrdinal: null,
};
const board = {
  id: 'board-1',
  title: 'Project board',
  folder: 'board-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};
const session = {
  id: 'chat-1',
  title: 'Project chat',
  modelId: 'model',
  createdAt: 1,
  updatedAt: 2,
};

describe('globalSearchResults', () => {
  it.each([
    ['chat', ['chat', 'notes', 'whiteboard']],
    ['notes', ['notes', 'whiteboard', 'chat']],
    ['whiteboard', ['whiteboard', 'notes', 'chat']],
  ] as const)('puts the current %s module first while returning all matching modules', (appViewMode, expectedOrder) => {
    const groups = buildGlobalSearchGroups({
      appViewMode,
      boards: [board],
      chatTitleFallback: 'New chat',
      noteResults: [note],
      query: 'project',
      sessions: [session],
    });

    expect(groups.map((group) => group.kind)).toEqual(expectedOrder);
    expect(groups.flatMap((group) => group.results.map((result) => result.title))).toEqual(
      expectedOrder.map((kind) => `Project ${kind === 'whiteboard' ? 'board' : kind === 'notes' ? 'note' : kind}`),
    );
  });

  it('marks absolute recent notes as external', () => {
    const results = createRecentNoteSearchResults(
      ['/external/recent.md', 'local.md'],
      (path) => path.split('/').pop() ?? path,
    );

    expect(results[0]).toMatchObject({ isExternal: true, contentSearchable: false });
    expect(results[1]).toMatchObject({ isExternal: false, contentSearchable: true });
  });

  it('caps large result sets per module', () => {
    const groups = buildGlobalSearchGroups({
      appViewMode: 'notes',
      boards: Array.from({ length: 100 }, (_, index) => ({
        ...board,
        id: `board-${index}`,
        folder: `board-${index}`,
        title: `Project board ${index}`,
      })),
      chatTitleFallback: 'New chat',
      noteResults: Array.from({ length: 100 }, (_, index) => ({
        ...note,
        id: `note-${index}`,
        name: `Project note ${index}`,
        path: `note-${index}.md`,
      })),
      query: 'project',
      sessions: Array.from({ length: 100 }, (_, index) => ({
        ...session,
        id: `chat-${index}`,
        title: `Project chat ${index}`,
      })),
    });

    expect(groups.map((group) => group.results)).toHaveLength(3);
    expect(groups.every((group) => group.results.length === 60)).toBe(true);
    expect(groups.flatMap((group) => group.results)).toHaveLength(180);
  });
});
