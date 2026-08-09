import { useGraphUIStore } from '@/components/Graph/store/useGraphUIStore';
import { useWhiteboardStore } from '@/components/Whiteboard/stores/useWhiteboardStore';
import { normalizeNotePathKey } from '@/lib/notes/displayName';
import { isAbsolutePath, normalizeAbsolutePath } from '@/lib/storage/adapter';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useNotesStore } from '@/stores/useNotesStore';
import type { GlobalSearchResult } from './globalSearchResults';

export function didOpenGlobalSearchResult(result: GlobalSearchResult): boolean {
  if (result.kind === 'notes') {
    const requestedPath = result.note.openPath ?? result.note.path;
    const expectedPath = normalizeNotePathKey(
      isAbsolutePath(requestedPath) ? normalizeAbsolutePath(requestedPath) : requestedPath,
    );
    return normalizeNotePathKey(useNotesStore.getState().currentNote?.path) === expectedPath;
  }
  if (result.kind === 'chat') {
    return useAIUIStore.getState().currentSessionId === result.session.id;
  }
  if (result.kind === 'graph') {
    const graphState = useGraphUIStore.getState();
    return graphState.mode === 'local' && graphState.selectedPath === result.node.id;
  }
  return useWhiteboardStore.getState().activeBoardId === result.board.id;
}
