import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { readWindowLaunchContext } from '@/lib/desktop/launchContext';
import { useNotesViewShortcuts } from './hooks/useNotesViewShortcuts';
import { useModuleShortcutsDialog } from '@/hooks/useModuleShortcutsDialog';
import { hasDraftUnsavedChanges, isDraftNotePath } from '@/stores/notes/draftNote';
import { subscribeDeleteCurrentNoteEvent } from '@/components/Notes/noteDeleteEvents';
import { collectNotePathsInTreeOrder } from './features/common/noteTreeNavigation';
import { useI18n } from '@/lib/i18n';
import { findStarredEntryByPath } from '@/stores/notes/starred';
import { getNoteMetadataEntry } from '@/stores/notes/noteMetadataState';
import { NotesViewLayout } from './NotesViewLayout';
import { NotesViewSplitContent } from './NotesViewSplitContent';
import { useNotesFloatingChat } from './useNotesFloatingChat';
import { useNotesPrimaryContentState } from './useNotesPrimaryContentState';
import { useNotesSplitPanes } from './useNotesSplitPanes';
import { useNotesWorkspaceLifecycle } from './useNotesWorkspaceLifecycle';

export function NotesView({
  active = true,
  presentation = 'desktop',
  onStartupReady,
  onPrimaryContentReady,
}: {
  active?: boolean;
  presentation?: 'desktop' | 'mobile';
  onStartupReady?: () => void;
  onPrimaryContentReady?: () => void;
}) {
  const { t } = useI18n();
  const currentNotePath = useNotesStore(s => s.currentNote?.path);
  const loadFileTree = useNotesStore(s => s.loadFileTree);
  const openTabs = useNotesStore(s => s.openTabs);
  const closeTab = useNotesStore(s => s.closeTab);
  const reopenClosedTab = useNotesStore(s => s.reopenClosedTab);
  const openNote = useNotesStore(s => s.openNote);
  const prefetchNote = useNotesStore(s => s.prefetchNote);
  const loadStarred = useNotesStore(s => s.loadStarred);
  const deleteNote = useNotesStore(s => s.deleteNote);
  const saveNote = useNotesStore(s => s.saveNote);
  const cleanupAssetTempFiles = useNotesStore(s => s.cleanupAssetTempFiles);
  const clearAssetUrlCache = useNotesStore(s => s.clearAssetUrlCache);
  const cancelNoteContentScan = useNotesStore(s => s.cancelNoteContentScan);
  const revealFolder = useNotesStore(s => s.revealFolder);
  const isDirty = useNotesStore(s => s.isDirty);
  const pendingStarredNavigation = useNotesStore(s => s.pendingStarredNavigation);
  const setPendingStarredNavigation = useNotesStore(s => s.setPendingStarredNavigation);
  const notesPath = useNotesStore(s => s.notesPath);
  const rootFolder = useNotesStore(s => s.rootFolder);
  const rootFolderPath = useNotesStore(s => s.rootFolderPath);
  const isLoading = useNotesStore(s => s.isLoading);
  const unifiedLoaded = useUnifiedStore((s) => s.loaded);
  const draftNotes = useNotesStore(s => s.draftNotes);
  const currentDraftMetadata = useNotesStore(
    useCallback((state) => {
      if (!currentNotePath || !isDraftNotePath(currentNotePath)) {
        return undefined;
      }
      return state.noteMetadata?.notes[currentNotePath];
    }, [currentNotePath])
  );
  const currentNoteStarred = useNotesStore(
    useCallback((state) => {
      if (!currentNotePath) return false;
      return Boolean(findStarredEntryByPath(state.starredEntries, 'note', currentNotePath, state.notesPath));
    }, [currentNotePath])
  );
  const toggleStarred = useNotesStore(s => s.toggleStarred);
  const currentNoteMetadata = useNotesStore(
    useCallback((state) => {
      return getNoteMetadataEntry(state.noteMetadata, currentNotePath);
    }, [currentNotePath])
  );
  const openNoteByAbsolutePath = useNotesStore(s => s.openNoteByAbsolutePath);
  const adoptAbsoluteNoteIntoNotesRoot = useNotesStore(s => s.adoptAbsoluteNoteIntoNotesRoot);
  const pendingDraftDiscardPath = useNotesStore(s => s.pendingDraftDiscardPath);
  const cancelPendingDraftDiscard = useNotesStore(s => s.cancelPendingDraftDiscard);
  const confirmPendingDraftDiscard = useNotesStore(s => s.confirmPendingDraftDiscard);
  const getDisplayName = useNotesStore(s => s.getDisplayName);
  const notesError = useNotesStore(s => s.error);
  const blankDropDraftHasUnsavedChanges = useNotesStore(
    useCallback((state) => {
      if (!currentNotePath || !isDraftNotePath(currentNotePath)) {
        return false;
      }
      if (openTabs.length !== 1 || openTabs[0]?.path !== currentNotePath) {
        return false;
      }
      const draftEntry = state.draftNotes[currentNotePath];
      if (!draftEntry) {
        return false;
      }
      return hasDraftUnsavedChanges({
        draftName: draftEntry.name,
        content: state.currentNote?.path === currentNotePath ? state.currentNote.content : '',
        metadata: state.noteMetadata?.notes[currentNotePath],
      });
    }, [currentNotePath, openTabs])
  );
  const currentNotesRoot = useNotesRootStore((state) => state.currentNotesRoot);
  const openNotesRoot = useNotesRootStore((state) => state.openNotesRoot);
  const notesRootStoreHasInitialized = useNotesRootStore((state) => state.hasInitialized);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [pendingDeleteCurrentNotePath, setPendingDeleteCurrentNotePath] = useState<string | null>(null);
  const launchContextRef = useRef(readWindowLaunchContext());
  const notesViewRef = useRef<HTMLDivElement>(null);
  const desktopInteractionsActive = active && presentation === 'desktop';
  const toggleShortcutsDialog = useCallback(() => setIsShortcutsOpen((prev) => !prev), []);
  const {
    beginFloatingChatResize,
    chatFloatingOpen,
    chatPanelCollapsed,
    closeChatPanel,
    closeFloatingChat,
    floatingChatLiveSize,
    floatingChatPanelRef,
    focusNotesChatComposer,
    getDockedChatPanelMaxWidth,
    handleChatPanelDragStateChange,
    isEmbeddedChatViewReady,
    isFloatingChatResizing,
    openFloatingChat,
    promoteFloatingChatToSidePanel,
    resetChatFloatingSize,
    scheduleChatPanelCaretRefresh,
    setChatPanelCollapsed,
  } = useNotesFloatingChat({ active: desktopInteractionsActive, notesViewRef });
  const {
    activatePrimaryPreviewPane,
    activateSplitPane,
    activeSplitPreviewLeafId,
    applyPendingSplitEditorFocus,
    beginSplitPaneDrag,
    beginSplitResize,
    closeActiveSplitPane,
    closePrimaryPreviewPane,
    closeSplitPane,
    hasSplitPanes,
    primaryPreviewLeaf,
    splitDropRootRef,
    splitDropTarget,
    splitPaneTree,
  } = useNotesSplitPanes({
    active: desktopInteractionsActive,
    currentNotePath,
    openNote,
    openNoteByAbsolutePath,
    openTabs,
    prefetchNote,
  });
  const notePathsInTreeOrder = useMemo(() => (
    rootFolder && rootFolderPath === notesPath ? collectNotePathsInTreeOrder(rootFolder.children) : []
  ), [notesPath, rootFolder, rootFolderPath]);

  const {
    canLoadMarkdownEditor,
    firstPaintPreviewBlocks,
    isPrimaryContentReady,
    reportNotesPrimaryContentReady,
  } = useNotesPrimaryContentState({
    active,
    applyPendingSplitEditorFocus,
    currentDraftMetadata,
    currentNotePath,
    currentNotesRoot,
    draftNotes,
    isLoading,
    notesViewRef,
    onPrimaryContentReady,
    onStartupReady,
    openTabs,
  });

  const { focusSidebarPath, isBlankWorkspaceDropActive } = useNotesWorkspaceLifecycle({
    active,
    adoptAbsoluteNoteIntoNotesRoot,
    blankDropDraftHasUnsavedChanges,
    cancelNoteContentScan,
    cleanupAssetTempFiles,
    clearAssetUrlCache,
    currentNotePath,
    currentNotesRoot,
    draftNotes,
    externalSyncEnabled: presentation === 'desktop',
    isDirty,
    isLoading,
    launchFolderPath: launchContextRef.current.folderPath,
    launchNotePath: launchContextRef.current.notePath,
    loadFileTree,
    loadStarred,
    notesError,
    notesPath,
    notesRootStoreHasInitialized,
    openNote,
    openNoteByAbsolutePath,
    openNotesRoot,
    openTabs,
    pendingStarredNavigation,
    revealFolder,
    rootFolder,
    rootFolderPath,
    saveNote,
    setPendingStarredNavigation,
  });

  useModuleShortcutsDialog({ enabled: desktopInteractionsActive, onToggle: toggleShortcutsDialog });

  useEffect(() => {
    return subscribeDeleteCurrentNoteEvent(() => {
      if (!currentNotePath) {
        return;
      }
      setPendingDeleteCurrentNotePath(currentNotePath);
    });
  }, [currentNotePath]);

  useNotesViewShortcuts({
    active: desktopInteractionsActive,
    currentNotePath,
    openTabs,
    notePathsInTreeOrder,
    openNote,
    closeTab,
    reopenClosedTab,
    chatPanelCollapsed,
    chatFloatingOpen,
    closeChatPanel,
    closeFloatingChat,
    openFloatingChat,
    focusNotesChatComposer,
    focusSidebarPath,
    saveNote,
  });

  return (
    <NotesViewLayout
      active={desktopInteractionsActive}
      beginFloatingChatResize={beginFloatingChatResize}
      cancelPendingDraftDiscard={cancelPendingDraftDiscard}
      chatFloatingOpen={chatFloatingOpen}
      chatPanelCollapsed={chatPanelCollapsed}
      closeFloatingChat={closeFloatingChat}
      confirmPendingDraftDiscard={confirmPendingDraftDiscard}
      deleteNote={deleteNote}
      floatingChatLiveSize={floatingChatLiveSize}
      floatingChatPanelRef={floatingChatPanelRef}
      getDisplayName={getDisplayName}
      getDockedChatPanelMaxWidth={getDockedChatPanelMaxWidth}
      handleChatPanelDragStateChange={handleChatPanelDragStateChange}
      hasSplitPanes={hasSplitPanes}
      isBlankWorkspaceDropActive={isBlankWorkspaceDropActive}
      isEmbeddedChatViewReady={isEmbeddedChatViewReady}
      isFloatingChatResizing={isFloatingChatResizing}
      isShortcutsOpen={isShortcutsOpen}
      notesViewRef={notesViewRef}
      presentation={presentation}
      pendingDeleteCurrentNotePath={pendingDeleteCurrentNotePath}
      pendingDraftDiscardPath={pendingDraftDiscardPath}
      promoteFloatingChatToSidePanel={promoteFloatingChatToSidePanel}
      resetChatFloatingSize={resetChatFloatingSize}
      scheduleChatPanelCaretRefresh={scheduleChatPanelCaretRefresh}
      setChatPanelCollapsed={setChatPanelCollapsed}
      setIsShortcutsOpen={setIsShortcutsOpen}
      setPendingDeleteCurrentNotePath={setPendingDeleteCurrentNotePath}
      splitDropRootRef={splitDropRootRef}
      t={t}
      unifiedLoaded={unifiedLoaded}
    >
      <NotesViewSplitContent
        active={active}
        activeSplitPreviewLeafId={activeSplitPreviewLeafId}
        activatePrimaryPreviewPane={activatePrimaryPreviewPane}
        activateSplitPane={activateSplitPane}
        beginSplitPaneDrag={beginSplitPaneDrag}
        beginSplitResize={beginSplitResize}
        canLoadMarkdownEditor={canLoadMarkdownEditor}
        closeActiveSplitPane={closeActiveSplitPane}
        closePrimaryPreviewPane={closePrimaryPreviewPane}
        closeSplitPane={closeSplitPane}
        currentNoteMetadata={currentNoteMetadata}
        currentNotePath={currentNotePath}
        currentNoteStarred={currentNoteStarred}
        firstPaintPreviewBlocks={firstPaintPreviewBlocks}
        getDisplayName={getDisplayName}
        hasSplitPanes={hasSplitPanes}
        isPrimaryContentReady={isPrimaryContentReady}
        notesPath={notesPath}
        onPrimaryContentReady={reportNotesPrimaryContentReady}
        primaryPreviewLeaf={primaryPreviewLeaf}
        splitDropTarget={splitDropTarget}
        splitPaneTree={splitPaneTree}
        toggleStarred={toggleStarred}
      />
    </NotesViewLayout>
  );
}
