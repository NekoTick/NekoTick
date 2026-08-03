import {
  buildChatSidebarSearchEntries,
  getNavigableChatSidebarSessions,
  queryChatSidebarSessions,
} from '@/components/Chat/features/Sidebar/chatSidebarSearch';
import type { NotesSidebarSearchResult } from '@/components/Notes/features/Sidebar/notesSidebarSearchResults';
import type { WhiteboardIndexEntry } from '@/components/Whiteboard/model/whiteboardRepository';
import type { ChatSession } from '@/lib/ai/types';
import { isAbsolutePath } from '@/lib/storage/adapter';
import type { AppViewMode } from '@/stores/uiSlice';

export type GlobalSearchKind = 'notes' | 'whiteboard' | 'chat';

export type GlobalSearchResult =
  | {
      id: string;
      kind: 'notes';
      note: NotesSidebarSearchResult;
      subtitle: string;
      title: string;
    }
  | {
      id: string;
      kind: 'chat';
      session: ChatSession;
      subtitle: string;
      title: string;
    }
  | {
      board: WhiteboardIndexEntry;
      id: string;
      kind: 'whiteboard';
      subtitle: string;
      title: string;
    };

export interface GlobalSearchGroup {
  kind: GlobalSearchKind;
  results: GlobalSearchResult[];
}

const MAX_RESULTS_PER_GROUP = 60;
const MAX_TEXT_QUERY_CHARS = 256;
const DEFAULT_KIND_ORDER: GlobalSearchKind[] = ['notes', 'whiteboard', 'chat'];

function getKindOrder(appViewMode: AppViewMode): GlobalSearchKind[] {
  if (!DEFAULT_KIND_ORDER.includes(appViewMode as GlobalSearchKind)) return DEFAULT_KIND_ORDER;
  return [
    appViewMode as GlobalSearchKind,
    ...DEFAULT_KIND_ORDER.filter((kind) => kind !== appViewMode),
  ];
}

function getBoundedQuery(query: string) {
  return query.trim().slice(0, MAX_TEXT_QUERY_CHARS).toLocaleLowerCase();
}

export function createRecentNoteSearchResults(
  recentNotes: string[],
  getDisplayName: (path: string) => string,
): NotesSidebarSearchResult[] {
  return recentNotes.slice(0, 30).map((path, index) => {
    const isExternal = isAbsolutePath(path);
    const normalized = path.replace(/\\/g, '/');
    const separatorIndex = normalized.lastIndexOf('/');
    return {
      id: `${path}::recent::${index}`,
      path,
      name: getDisplayName(path),
      preview: separatorIndex < 0 ? '' : normalized.slice(0, separatorIndex + 1),
      isExternal,
      contentSearchable: !isExternal,
      matchIndex: 0,
      matchKind: 'name',
      contentSnippet: null,
      contentMatchOrdinal: null,
    };
  });
}

export function buildGlobalSearchGroups({
  appViewMode,
  boards,
  chatTitleFallback,
  noteResults,
  query,
  sessions,
}: {
  appViewMode: AppViewMode;
  boards: WhiteboardIndexEntry[];
  chatTitleFallback: string;
  noteResults: NotesSidebarSearchResult[];
  query: string;
  sessions: ChatSession[];
}): GlobalSearchGroup[] {
  const trimmedQuery = getBoundedQuery(query);
  const chatSessions = trimmedQuery
    ? queryChatSidebarSessions(buildChatSidebarSearchEntries(getNavigableChatSidebarSessions(sessions)), trimmedQuery)
    : getNavigableChatSidebarSessions(sessions);
  const whiteboards = [...boards]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((board) => !trimmedQuery || board.title.toLocaleLowerCase().includes(trimmedQuery));
  const resultsByKind: Record<GlobalSearchKind, GlobalSearchResult[]> = {
    notes: noteResults.slice(0, MAX_RESULTS_PER_GROUP).map((note) => ({
      id: `notes:${note.id}`,
      kind: 'notes',
      note,
      subtitle: note.contentSnippet ?? note.preview.replace(/\/$/, ''),
      title: note.name,
    })),
    whiteboard: whiteboards.slice(0, MAX_RESULTS_PER_GROUP).map((board) => ({
      board,
      id: `whiteboard:${board.id}`,
      kind: 'whiteboard',
      subtitle: new Date(board.updatedAt).toLocaleString(),
      title: board.title,
    })),
    chat: chatSessions.slice(0, MAX_RESULTS_PER_GROUP).map((session) => ({
      id: `chat:${session.id}`,
      kind: 'chat',
      session,
      subtitle: new Date(session.updatedAt).toLocaleString(),
      title: session.title || chatTitleFallback,
    })),
  };

  return getKindOrder(appViewMode)
    .map((kind) => ({ kind, results: resultsByKind[kind] }))
    .filter((group) => group.results.length > 0);
}
