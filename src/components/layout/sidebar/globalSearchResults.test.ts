import { describe, expect, it } from 'vitest';
import type {
  NotesSidebarSearchEntry,
  NotesSidebarSearchResult,
} from '@/components/Notes/features/Sidebar/notesSidebarSearchResults';
import { buildGlobalSearchGroups, createDefaultNoteSearchResults } from './globalSearchResults';

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
const graphNode = {
  degree: 2,
  id: 'graph-note.md',
  label: 'Project graph',
};

describe('globalSearchResults', () => {
  it.each([
    ['chat', ['chat', 'notes', 'graph', 'whiteboard']],
    ['graph', ['graph', 'notes', 'whiteboard', 'chat']],
    ['notes', ['notes', 'graph', 'whiteboard', 'chat']],
    ['whiteboard', ['whiteboard', 'notes', 'graph', 'chat']],
  ] as const)('puts the current %s module first while returning all matching modules', (appViewMode, expectedOrder) => {
    const groups = buildGlobalSearchGroups({
      appViewMode,
      boards: [board],
      chatTitleFallback: 'New chat',
      graphNodes: [graphNode],
      noteResults: [note],
      query: '',
      sessions: [session],
    });

    expect(groups.map((group) => group.kind)).toEqual(expectedOrder);
    expect(groups.flatMap((group) => group.results.map((result) => result.title))).toEqual(
      expectedOrder.map((kind) => (
        `Project ${kind === 'whiteboard' ? 'board' : kind === 'notes' ? 'note' : kind}`
      )),
    );
  });

  it('returns matching files as graph results', () => {
    const groups = buildGlobalSearchGroups({
      appViewMode: 'graph',
      boards: [],
      chatTitleFallback: 'New chat',
      graphNodes: [graphNode],
      noteResults: [],
      query: 'project',
      sessions: [],
    });

    expect(groups).toEqual([{
      kind: 'graph',
      results: [{
        id: 'graph:graph-note.md',
        kind: 'graph',
        node: graphNode,
        subtitle: '',
        title: 'Project graph',
      }],
    }]);
  });

  it('omits timestamps from chat and whiteboard results', () => {
    const groups = buildGlobalSearchGroups({
      appViewMode: 'chat',
      boards: [board],
      chatTitleFallback: 'New chat',
      graphNodes: [],
      noteResults: [],
      query: 'project',
      sessions: [session],
    });

    expect(groups.flatMap((group) => group.results)).toEqual([
      expect.objectContaining({ kind: 'chat', subtitle: '' }),
      expect.objectContaining({ kind: 'whiteboard', subtitle: '' }),
    ]);
  });

  it('omits note directories while preserving content match snippets', () => {
    const groups = buildGlobalSearchGroups({
      appViewMode: 'notes',
      boards: [],
      chatTitleFallback: 'New chat',
      graphNodes: [],
      noteResults: [{ ...note, preview: 'projects/' }, {
        ...note,
        id: 'content.md::content::0',
        path: 'content.md',
        contentSnippet: 'Matched note content',
        matchKind: 'content',
      }],
      query: 'note',
      sessions: [],
    });

    expect(groups[0].results.map((result) => result.subtitle)).toEqual([
      '',
      'Matched note content',
    ]);
  });

  it('creates default note results from the workspace and starred search index', () => {
    const searchIndex: NotesSidebarSearchEntry[] = [{
      path: 'local.md',
      name: 'Local',
      preview: '',
    }, {
      path: '/external/starred.md',
      openPath: '/external/starred.md',
      name: 'Starred',
      preview: 'external/',
      isExternal: true,
      contentSearchable: false,
    }];

    expect(createDefaultNoteSearchResults(searchIndex)).toEqual([
      expect.objectContaining({ id: 'local.md::default', path: 'local.md', name: 'Local' }),
      expect.objectContaining({
        id: '/external/starred.md::default',
        openPath: '/external/starred.md',
        isExternal: true,
        contentSearchable: false,
      }),
    ]);
  });

  it('only materializes default notes that can appear in the result group', () => {
    const searchIndex = Array.from({ length: 100 }, (_, index) => ({
      path: `note-${index}.md`,
      name: `Note ${index}`,
      preview: '',
    }));

    expect(createDefaultNoteSearchResults(searchIndex)).toHaveLength(60);
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
      graphNodes: Array.from({ length: 100 }, (_, index) => ({
        ...graphNode,
        id: `graph-${index}.md`,
        label: `Project graph ${index}`,
      })),
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

    expect(groups.map((group) => group.results)).toHaveLength(4);
    expect(groups.every((group) => group.results.length === 60)).toBe(true);
    expect(groups.flatMap((group) => group.results)).toHaveLength(240);
  });
});
