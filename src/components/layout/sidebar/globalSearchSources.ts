import {
  buildChatSidebarSearchEntries,
  getNavigableChatSidebarSessions,
  type ChatSidebarSearchEntry,
} from '@/components/Chat/features/Sidebar/chatSidebarSearch';
import type { NoteGraphNode } from '@/components/Graph/model/noteGraph';
import type { WhiteboardIndexEntry } from '@/components/Whiteboard/model/whiteboardRepository';
import type { ChatSession } from '@/lib/ai/types';

export interface GlobalSearchSources {
  chatEntries: ChatSidebarSearchEntry[];
  chatSessions: ChatSession[];
  defaultGraphNodes: NoteGraphNode[];
  graphNodes: NoteGraphNode[];
  whiteboards: WhiteboardIndexEntry[];
}

export function prepareGlobalChatSearch(sessions: ChatSession[]) {
  const chatSessions = getNavigableChatSidebarSessions(sessions);
  return {
    chatEntries: buildChatSidebarSearchEntries(chatSessions),
    chatSessions,
  };
}

export function sortDefaultGlobalGraphNodes(graphNodes: NoteGraphNode[]) {
  return [...graphNodes].sort((left, right) => (
    right.degree - left.degree
    || left.label.localeCompare(right.label)
    || left.id.localeCompare(right.id)
  ));
}

export function sortGlobalWhiteboards(boards: WhiteboardIndexEntry[]) {
  return [...boards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
