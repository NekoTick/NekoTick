import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { useNotesStore, type FolderNode } from '@/stores/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useI18n } from '@/lib/i18n';
import { getSidebarContextMenuPosition } from '../common/sidebarMenuPosition';
import {
  clearHoveredSidebarRenamePath,
  registerSidebarHoverRenameTarget,
  setHoveredSidebarRenamePath,
} from '../common/sidebarHoverRename';
import { useExternalFileTreeDropState } from '../FileTree/hooks/externalFileTreeDropState';
import { useIsFileTreePointerFolderDropTarget } from '../FileTree/hooks/fileTreePointerDragState';
import { shouldVirtualizeFileTree } from '../FileTree/VirtualizedFileTree';
import { countVisibleFileTreeRows } from '../FileTree/virtualFileTree';
import { useRootBlankContextMenu } from './useRootBlankContextMenu';

const INTERNAL_ROOT_AUTO_EXPAND_DELAY_MS = 120;
const EXTERNAL_ROOT_AUTO_EXPAND_DELAY_MS = 560;
const RENAMEABLE_ROW_CLICK_DELAY_MS = 180;

interface UseRootFolderRowControllerOptions {
  rootFolder: FolderNode | null;
  isLoading: boolean;
  blankContextMenuRef?: RefObject<HTMLElement | null>;
  scrollRootRef?: RefObject<HTMLElement | null>;
  active: boolean;
}

export function useRootFolderRowController({
  rootFolder,
  isLoading,
  blankContextMenuRef,
  scrollRootRef,
  active,
}: UseRootFolderRowControllerOptions) {
  const { t } = useI18n();
  const currentNotesRoot = useNotesRootStore((state) => state.currentNotesRoot);
  const renameCurrentNotesRoot = useNotesRootStore((state) => state.renameCurrentNotesRoot);
  const notesPath = useNotesStore((state) => state.notesPath);
  const fileTreeSortMode = useNotesStore((state) => state.fileTreeSortMode);
  const setFileTreeSortMode = useNotesStore((state) => state.setFileTreeSortMode);
  const toggleFolder = useNotesStore((state) => state.toggleFolder);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [shouldRenderChildren, setShouldRenderChildren] = useState(rootFolder?.expanded ?? true);
  const rootRowRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isRenamingRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const isInternalRootDragOver = useIsFileTreePointerFolderDropTarget('', active);
  const isExternalRootDragOver = useExternalFileTreeDropState(
    (state) => active && state.dropTargetKind === 'folder' && state.dropTargetPath === '',
  );
  const isRootDragOver = isInternalRootDragOver || isExternalRootDragOver;
  const autoExpandDelayMs = isInternalRootDragOver
    ? INTERNAL_ROOT_AUTO_EXPAND_DELAY_MS
    : EXTERNAL_ROOT_AUTO_EXPAND_DELAY_MS;
  const autoExpandTimeoutRef = useRef<number | null>(null);

  const rootFolderTitle = rootFolder?.name === 'Notes' ? t('app.viewNotes') : rootFolder?.name;
  const title = currentNotesRoot?.name || rootFolderTitle || t('app.viewNotes');
  const notesRootPath = currentNotesRoot?.path ?? '';
  const hasChildren = rootFolder ? rootFolder.children.length > 0 : false;
  const expanded = rootFolder?.expanded ?? true;
  const displayExpanded = !hasChildren || expanded;
  const visibleFileTreeRowCount = useMemo(
    () => rootFolder ? countVisibleFileTreeRows(rootFolder.children) : 0,
    [rootFolder],
  );
  const isExpandedRootDragOver = (
    isRootDragOver &&
    expanded &&
    shouldRenderChildren &&
    hasChildren
  );
  const useVirtualFileTree = Boolean(
    scrollRootRef && shouldVirtualizeFileTree(visibleFileTreeRowCount),
  );
  const isRootTreePending = Boolean(currentNotesRoot && notesPath === currentNotesRoot.path && !rootFolder);
  const isRootBusy = isLoading || isRootTreePending;
  const setExpanded = (value: boolean | ((value: boolean) => boolean)) => {
    if (!hasChildren) {
      return;
    }

    const nextValue = typeof value === 'function' ? value(expanded) : value;
    if (nextValue !== expanded) {
      toggleFolder('');
    }
  };

  const cancelPendingClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  useEffect(() => {
    isRenamingRef.current = isRenaming;
  }, [isRenaming]);

  useEffect(() => () => cancelPendingClick(), []);

  useEffect(() => {
    if (!expanded) {
      setShouldRenderChildren(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setShouldRenderChildren(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [expanded]);

  useEffect(() => {
    if (isRenaming) {
      return;
    }

    setRenameValue(title);
  }, [isRenaming, title]);

  useEffect(() => {
    if (!active || !rootFolder) {
      return;
    }

    return registerSidebarHoverRenameTarget(rootFolder.path, {
      startRename: () => {
        setIsRenaming(true);
        setShowMenu(false);
      },
      cancelRename: () => {
        setIsRenaming(false);
      },
      isRenaming: () => isRenamingRef.current,
    });
  }, [active, rootFolder]);

  useRootBlankContextMenu({
    enabled: active && Boolean(rootFolder),
    blankContextMenuRef,
    rootRowRef,
    onOpen: (position) => {
      setMenuPosition(position);
      setShowMenu(true);
    },
  });

  useEffect(() => {
    if (autoExpandTimeoutRef.current !== null) {
      window.clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }

    if (!active || !isRootDragOver || expanded) {
      return;
    }

    autoExpandTimeoutRef.current = window.setTimeout(() => {
      setExpanded(true);
      autoExpandTimeoutRef.current = null;
    }, autoExpandDelayMs);

    return () => {
      if (autoExpandTimeoutRef.current !== null) {
        window.clearTimeout(autoExpandTimeoutRef.current);
        autoExpandTimeoutRef.current = null;
      }
    };
  }, [active, autoExpandDelayMs, expanded, isInternalRootDragOver, isRootDragOver]);

  const handleMenuOpen = (event: MouseEvent<HTMLButtonElement>) => {
    const rowElement = event.currentTarget.closest('[data-notes-root-folder-row="true"]');
    const rowRect = (rowElement ?? event.currentTarget).getBoundingClientRect();
    setMenuPosition(getSidebarContextMenuPosition(rowRect, event.clientY));
    setShowMenu(true);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition(
      getSidebarContextMenuPosition(
        event.currentTarget.getBoundingClientRect(),
        event.clientY,
        event.clientX,
      ),
    );
    setShowMenu(true);
  };

  const handleClick = () => {
    if (!hasChildren) {
      return;
    }

    cancelPendingClick();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      toggleFolder('');
    }, RENAMEABLE_ROW_CLICK_DELAY_MS);
  };

  const handleRenameFromDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button,a,input,textarea,select,[role="button"]')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelPendingClick();
    setShowMenu(false);
    setIsRenaming(true);
  };

  const handleRenameSubmit = async () => {
    const trimmedValue = renameValue.trim();
    if (trimmedValue && trimmedValue !== title) {
      await renameCurrentNotesRoot(trimmedValue);
    }
    setIsRenaming(false);
  };

  return {
    displayExpanded,
    expanded,
    fileTreeSortMode,
    handleClick,
    handleContextMenu,
    handleMenuOpen,
    handleRenameFromDoubleClick,
    handleRenameSubmit,
    hasChildren,
    isExpandedRootDragOver,
    isRenaming,
    isRootBusy,
    isRootDragOver,
    isRootTreePending,
    menuButtonRef,
    menuPosition,
    notesRootPath,
    openRootFolderMenuLabel: t('notes.openRootFolderMenu'),
    renameValue,
    rootRowRef,
    setExpanded,
    setFileTreeSortMode,
    setIsRenaming,
    setRenameValue,
    setShowMenu,
    setHoveredSidebarRenamePath,
    clearHoveredSidebarRenamePath,
    shouldRenderChildren,
    showMenu,
    title,
    useVirtualFileTree,
  };
}
