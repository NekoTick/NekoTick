import { useCallback, useEffect, useRef, useState } from 'react';
import { openStoredNotePath } from '@/stores/notes/openNotePath';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useToastStore } from '@/stores/useToastStore';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { useAbsoluteNoteExternalRenameSync } from './hooks/useAbsoluteNoteExternalRenameSync';
import { useCurrentNotesRootExternalPathSync } from './hooks/useCurrentNotesRootExternalPathSync';
import { useCurrentNotesRootInitialization } from './hooks/useCurrentNotesRootInitialization';
import { useNotesExternalSync } from './hooks/useNotesExternalSync';
import { useNotesOpenMarkdownTarget } from './hooks/useNotesOpenMarkdownTarget';
import { clearRemoteImageMemoryCache } from './features/Editor/plugins/image-block/utils/remoteImageMemoryCache';
import { scheduleSidebarScroll } from './notesViewHelpers';
import { useNotesBlankWorkspaceDropLifecycle } from './useNotesBlankWorkspaceDropLifecycle';
import { restoreDraftNoteRecoveries } from '@/stores/notes/noteRecovery';
import { getElectronBridge } from '@/lib/electron/bridge';

export function useNotesWorkspaceLifecycle(args: {
  active: boolean;
  adoptAbsoluteNoteIntoNotesRoot: ReturnType<typeof useNotesStore.getState>['adoptAbsoluteNoteIntoNotesRoot'];
  blankDropDraftHasUnsavedChanges: boolean;
  cancelNoteContentScan: ReturnType<typeof useNotesStore.getState>['cancelNoteContentScan'];
  cleanupAssetTempFiles: ReturnType<typeof useNotesStore.getState>['cleanupAssetTempFiles'];
  clearAssetUrlCache: ReturnType<typeof useNotesStore.getState>['clearAssetUrlCache'];
  currentNotePath: string | undefined;
  currentNotesRoot: { path: string } | null | undefined;
  draftNotes: ReturnType<typeof useNotesStore.getState>['draftNotes'];
  externalSyncEnabled: boolean;
  isDirty: boolean;
  isLoading: boolean;
  launchNotePath: string | null;
  launchFolderPath: string | null;
  loadFileTree: ReturnType<typeof useNotesStore.getState>['loadFileTree'];
  loadStarred: ReturnType<typeof useNotesStore.getState>['loadStarred'];
  notesError: string | null;
  notesPath: string;
  notesRootStoreHasInitialized: boolean;
  openNote: ReturnType<typeof useNotesStore.getState>['openNote'];
  openNoteByAbsolutePath: ReturnType<typeof useNotesStore.getState>['openNoteByAbsolutePath'];
  openNotesRoot: (path: string, name?: string, options?: { preserveSidebarTree?: boolean }) => Promise<boolean>;
  openTabs: ReturnType<typeof useNotesStore.getState>['openTabs'];
  pendingStarredNavigation: ReturnType<typeof useNotesStore.getState>['pendingStarredNavigation'];
  revealFolder: ReturnType<typeof useNotesStore.getState>['revealFolder'];
  rootFolder: ReturnType<typeof useNotesStore.getState>['rootFolder'];
  rootFolderPath: string | null;
  saveNote: ReturnType<typeof useNotesStore.getState>['saveNote'];
  setPendingStarredNavigation: ReturnType<typeof useNotesStore.getState>['setPendingStarredNavigation'];
}) {
  const {
    active,
    adoptAbsoluteNoteIntoNotesRoot,
    blankDropDraftHasUnsavedChanges,
    cancelNoteContentScan,
    cleanupAssetTempFiles,
    clearAssetUrlCache,
    currentNotePath,
    currentNotesRoot,
    draftNotes,
    externalSyncEnabled,
    isDirty,
    isLoading,
    launchFolderPath,
    launchNotePath,
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
  } = args;
  const addToast = useToastStore(s => s.addToast);
  const [isNotesRootInitializing, setIsNotesRootInitializing] = useState(false);
  const hasHandledLaunchNoteRef = useRef(false);
  const lastPresentedNotesErrorRef = useRef<string | null>(null);
  const notesRootInitializingRef = useRef(false);
  const consumedPendingStarredNavigationKeyRef = useRef<string | null>(null);
  const restoredDraftRecoveryRootRef = useRef<string | null>(null);

  const focusSidebarPath = useCallback((path: string) => {
    revealFolder(path);
    scheduleSidebarScroll(path);
  }, [revealFolder]);

  const handleNotesRootInitializingChange = useCallback((initializing: boolean) => {
    notesRootInitializingRef.current = initializing;
    setIsNotesRootInitializing(initializing);
  }, []);

  const {
    isOpenTargetBusy,
    openMarkdownTarget,
    pendingOpenMarkdownTargetNotesRootPath,
  } = useNotesOpenMarkdownTarget({
    active,
    currentNotesRootPath: currentNotesRoot?.path ?? null,
    notesPath,
    currentNotePath,
    isDirty,
    saveNote,
    openNote,
    openNoteByAbsolutePath,
    adoptAbsoluteNoteIntoNotesRoot,
    openNotesRoot,
  });

  useEffect(() => {
    if (!notesError) {
      lastPresentedNotesErrorRef.current = null;
      return;
    }

    if (!active || lastPresentedNotesErrorRef.current === notesError) {
      return;
    }

    lastPresentedNotesErrorRef.current = notesError;
    addToast(normalizeUserFacingErrorMessage(notesError), 'error', themeUiFeedbackTokens.errorToastDurationMs);
  }, [active, addToast, notesError]);

  const activeNotesRootPath = active && externalSyncEnabled ? currentNotesRoot?.path ?? null : null;
  useCurrentNotesRootExternalPathSync(activeNotesRootPath);
  useNotesExternalSync(activeNotesRootPath, active && externalSyncEnabled ? notesPath : '');
  useAbsoluteNoteExternalRenameSync(active && externalSyncEnabled ? currentNotePath : undefined);
  useCurrentNotesRootInitialization({
    currentNotesRootPath: currentNotesRoot?.path ?? null,
    launchNotePath,
    pendingStarredNavigation,
    pendingOpenMarkdownTargetNotesRootPath,
    loadStarred,
    loadFileTree,
    cleanupAssetTempFiles,
    clearAssetUrlCache,
    clearRemoteImageMemoryCache,
    cancelNoteContentScan,
    onInitializingChange: handleNotesRootInitializingChange,
  });

  useEffect(() => {
    if (!active || !notesRootStoreHasInitialized || isLoading || isNotesRootInitializing) return;
    const recoveryRoot = currentNotesRoot?.path ?? '';
    if (notesPath !== recoveryRoot || restoredDraftRecoveryRootRef.current === recoveryRoot) return;

    restoredDraftRecoveryRootRef.current = recoveryRoot;
    void restoreDraftNoteRecoveries(recoveryRoot, useNotesStore).catch((error) => {
      if (restoredDraftRecoveryRootRef.current === recoveryRoot) {
        restoredDraftRecoveryRootRef.current = null;
      }
      useNotesStore.setState({ error: 'Failed to restore unsaved draft notes.' });
      void getElectronBridge()?.app?.reportRendererError?.({
        source: 'note-recovery',
        type: 'persistence',
        name: error instanceof Error ? error.name : 'Error',
        message: 'Unsaved draft recovery could not be read.',
      }).catch(() => undefined);
    });
  }, [
    active,
    currentNotesRoot,
    isLoading,
    isNotesRootInitializing,
    notesPath,
    notesRootStoreHasInitialized,
  ]);

  useEffect(() => {
    if (hasHandledLaunchNoteRef.current) return;
    if ((!launchFolderPath && !launchNotePath) || !currentNotesRoot || notesPath !== currentNotesRoot.path) return;

    hasHandledLaunchNoteRef.current = true;
    if (launchFolderPath) {
      focusSidebarPath(launchFolderPath);
      return;
    }

    if (!launchNotePath) return;

    void openStoredNotePath(launchNotePath, {
      openNote,
      openNoteByAbsolutePath,
    })
      .catch((_error) => {
      });
  }, [currentNotesRoot, focusSidebarPath, launchFolderPath, launchNotePath, notesPath, openNote, openNoteByAbsolutePath]);

  useEffect(() => {
    if (!currentNotesRoot || !pendingStarredNavigation) return;
    if (pendingStarredNavigation.notesRootPath !== currentNotesRoot.path) return;
    if (notesPath !== currentNotesRoot.path || !rootFolder || rootFolderPath !== currentNotesRoot.path) return;
    const pendingNavigationKey = [
      pendingStarredNavigation.notesRootPath,
      pendingStarredNavigation.kind,
      pendingStarredNavigation.relativePath,
      pendingStarredNavigation.openInNewTab ? 'new-tab' : 'same-tab',
    ].join('\n');
    if (consumedPendingStarredNavigationKeyRef.current === pendingNavigationKey) {
      return;
    }
    consumedPendingStarredNavigationKeyRef.current = pendingNavigationKey;

    const navigateToStarredTarget = async () => {
      setPendingStarredNavigation(null);
      if (pendingStarredNavigation.kind === 'folder') {
        revealFolder(pendingStarredNavigation.relativePath);
        scheduleSidebarScroll(pendingStarredNavigation.relativePath);
      } else {
        revealFolder(pendingStarredNavigation.relativePath);
        await openNote(
          pendingStarredNavigation.relativePath,
          pendingStarredNavigation.openInNewTab ?? false
        );
        scheduleSidebarScroll(pendingStarredNavigation.relativePath);
      }
    };

    void navigateToStarredTarget().catch(() => undefined);
  }, [
    currentNotesRoot,
    pendingStarredNavigation,
    notesPath,
    rootFolder,
    rootFolderPath,
    revealFolder,
    openNote,
    setPendingStarredNavigation,
  ]);

  useEffect(() => {
    if (pendingStarredNavigation) {
      return;
    }
    consumedPendingStarredNavigationKeyRef.current = null;
  }, [pendingStarredNavigation]);

  const { isBlankWorkspaceDropActive } = useNotesBlankWorkspaceDropLifecycle({
    active,
    blankDropDraftHasUnsavedChanges,
    currentNotePath,
    currentNotesRoot,
    draftNotes,
    isLoading,
    isNotesRootInitializing,
    isOpenTargetBusy,
    launchNotePath: hasHandledLaunchNoteRef.current ? null : launchNotePath,
    loadFileTree,
    notesPath,
    notesRootInitializing: notesRootInitializingRef.current,
    notesRootStoreHasInitialized,
    openMarkdownTarget,
    openNotesRoot,
    openTabs,
    pendingStarredNavigation,
    revealFolder,
    rootFolder,
    rootFolderPath,
  });

  return {
    focusSidebarPath,
    isBlankWorkspaceDropActive,
  };
}
