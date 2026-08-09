import { queryChatSidebarSessions } from '@/components/Chat/features/Sidebar/chatSidebarSearch';
import { rankGraphNodes } from '@/components/Graph/model/graphFilters';
import type { NoteGraphNode } from '@/components/Graph/model/noteGraph';
import type {
  NotesSidebarSearchEntry,
  NotesSidebarSearchResult,
} from '@/components/Notes/features/Sidebar/notesSidebarSearchResults';
import type { WhiteboardIndexEntry } from '@/components/Whiteboard/model/whiteboardRepository';
import type { ChatSession } from '@/lib/ai/types';
import type { AppViewMode } from '@/stores/uiSlice';
import type { GlobalSearchSources } from './globalSearchSources';

export type GlobalSearchKind = 'notes' | 'graph' | 'whiteboard' | 'chat';

export type GlobalSearchResult =
  | {
      id: string;
      kind: 'graph';
      node: NoteGraphNode;
      subtitle: string;
      title: string;
    }
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
const DEFAULT_KIND_ORDER: GlobalSearchKind[] = ['notes', 'graph', 'whiteboard', 'chat'];

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

export function createDefaultNoteSearchResults(
  searchIndex: NotesSidebarSearchEntry[],
): NotesSidebarSearchResult[] {
  return searchIndex.slice(0, MAX_RESULTS_PER_GROUP).map((entry) => ({
    ...entry,
    id: `${entry.path}::default`,
    matchIndex: 0,
    matchKind: 'name',
    contentSnippet: null,
    contentMatchOrdinal: null,
  }));
}

export function buildGlobalSearchGroups({
  appViewMode,
  chatTitleFallback,
  noteResults,
  query,
  sources,
}: {
  appViewMode: AppViewMode;
  chatTitleFallback: string;
  noteResults: NotesSidebarSearchResult[];
  query: string;
  sources: GlobalSearchSources;
}): GlobalSearchGroup[] {
  const trimmedQuery = getBoundedQuery(query);
  const chatSessions = trimmedQuery
    ? queryChatSidebarSessions(sources.chatEntries, trimmedQuery)
    : sources.chatSessions;
  const whiteboards = sources.whiteboards
    .filter((board) => !trimmedQuery || board.title.toLocaleLowerCase().includes(trimmedQuery));
  const matchingGraphNodes = trimmedQuery
    ? rankGraphNodes(sources.graphNodes, trimmedQuery)
    : sources.defaultGraphNodes;
  const resultsByKind: Record<GlobalSearchKind, GlobalSearchResult[]> = {
    notes: noteResults.slice(0, MAX_RESULTS_PER_GROUP).map((note) => ({
      id: `notes:${note.id}`,
      kind: 'notes',
      note,
      subtitle: note.contentSnippet ?? '',
      title: note.name,
    })),
    graph: matchingGraphNodes.slice(0, MAX_RESULTS_PER_GROUP).map((node) => ({
      id: `graph:${node.id}`,
      kind: 'graph',
      node,
      subtitle: '',
      title: node.label,
    })),
    whiteboard: whiteboards.slice(0, MAX_RESULTS_PER_GROUP).map((board) => ({
      board,
      id: `whiteboard:${board.id}`,
      kind: 'whiteboard',
      subtitle: '',
      title: board.title,
    })),
    chat: chatSessions.slice(0, MAX_RESULTS_PER_GROUP).map((session) => ({
      id: `chat:${session.id}`,
      kind: 'chat',
      session,
      subtitle: '',
      title: session.title || chatTitleFallback,
    })),
  };

  return getKindOrder(appViewMode)
    .map((kind) => ({ kind, results: resultsByKind[kind] }))
    .filter((group) => group.results.length > 0);
}
