import React, { useCallback } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { useNotesStore } from '@/stores/useNotesStore';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useUIStore } from '@/stores/uiSlice';
import { cn } from '@/lib/utils';
import {
  ghostIconButtonClass,
  raisedPillSurfaceClass,
} from '@/components/ui/surfaceStyles';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ShortcutKeys } from '@/components/ui/shortcut-keys';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { resolveSiblingNoteParentPath } from '@/stores/notes/notePathState';
import { NotesDragOverlay } from '../common/NotesDragOverlay';
import { NoteHistoryButton, SortableTab, TabOverlay } from './NotesTabRowItems';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { dispatchNotesTabSplitDrag } from '../Split/notesSplitDragEvents';
import { TitleBarCenterRegion, TitleBarInteractiveRegion } from '@/components/layout/shell/TitleBarCenterRegion';

const EMPTY_NOTE_NAVIGATION_HISTORY: never[] = [];

export function NotesTabRow() {
  const { t } = useI18n();
  const notesSplitPanesActive = useUIStore((s) => s.notesSplitPanesActive);
  const currentNotesRootPath = useNotesRootStore((s) => s.currentNotesRoot?.path ?? null);
  const currentNotePath = useNotesStore((s) => s.currentNote?.path);
  const notesPath = useNotesStore((s) => s.notesPath);
  const rootFolderPath = useNotesStore((s) => s.rootFolderPath);
  const openTabs = useNotesStore((s) => s.openTabs);
  const closeTab = useNotesStore((s) => s.closeTab);
  const openNote = useNotesStore((s) => s.openNote);
  const createNote = useNotesStore((s) => s.createNote);
  const reorderTabs = useNotesStore((s) => s.reorderTabs);
  const noteNavigationHistory = useNotesStore((s) => s.noteNavigationHistory ?? EMPTY_NOTE_NAVIGATION_HISTORY);
  const noteNavigationHistoryIndex = useNotesStore((s) => s.noteNavigationHistoryIndex ?? -1);
  const navigateBackInNoteHistory = useNotesStore((s) => s.navigateBackInNoteHistory);
  const navigateForwardInNoteHistory = useNotesStore((s) => s.navigateForwardInNoteHistory);
  const hasOpenedFolder = Boolean(currentNotesRootPath && notesPath === currentNotesRootPath && rootFolderPath === currentNotesRootPath);
  const hasOpenTabs = openTabs.length > 0;
  const hasNoteNavigationHistory = noteNavigationHistory.length > 1;
  const canNavigateBack = noteNavigationHistoryIndex > 0;
  const canNavigateForward =
    noteNavigationHistoryIndex >= 0 &&
    noteNavigationHistoryIndex < noteNavigationHistory.length - 1;

  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const activeSplitDragPathRef = React.useRef<string | null>(null);
  const splitDragPointRef = React.useRef<{ clientX: number; clientY: number } | null>(null);
  const splitDragMoveFrameRef = React.useRef<number | null>(null);
  const pendingSplitDragPointRef = React.useRef<{ clientX: number; clientY: number } | null>(null);

  const getSplitDragPoint = React.useCallback((event: DragMoveEvent | DragEndEvent) => {
    const rect = event.active.rect.current.translated ?? event.active.rect.current.initial;
    return rect
      ? {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }
      : splitDragPointRef.current;
  }, []);

  const applySplitDragMove = React.useCallback(() => {
    splitDragMoveFrameRef.current = null;
    const path = activeSplitDragPathRef.current;
    const point = pendingSplitDragPointRef.current;
    pendingSplitDragPointRef.current = null;
    if (!path || !point) return;

    dispatchNotesTabSplitDrag({
      phase: 'move',
      path,
      source: 'tab',
      ...point,
    });
  }, []);

  const scheduleSplitDragMove = React.useCallback((point: { clientX: number; clientY: number }) => {
    splitDragPointRef.current = point;
    pendingSplitDragPointRef.current = point;
    if (splitDragMoveFrameRef.current !== null) return;
    splitDragMoveFrameRef.current = window.requestAnimationFrame(applySplitDragMove);
  }, [applySplitDragMove]);

  const flushSplitDragMove = React.useCallback((point?: { clientX: number; clientY: number }) => {
    if (point) {
      splitDragPointRef.current = point;
      pendingSplitDragPointRef.current = point;
    }
    if (splitDragMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(splitDragMoveFrameRef.current);
      splitDragMoveFrameRef.current = null;
    }
    applySplitDragMove();
  }, [applySplitDragMove]);

  const cancelSplitDragMove = React.useCallback(() => {
    if (splitDragMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(splitDragMoveFrameRef.current);
      splitDragMoveFrameRef.current = null;
    }
    pendingSplitDragPointRef.current = null;
  }, []);

  const handleSplitDragPointerMove = React.useCallback((event: PointerEvent) => {
    if (!activeSplitDragPathRef.current) return;
    scheduleSplitDragMove({
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }, [scheduleSplitDragMove]);

  const stopSplitDragTracking = React.useCallback(() => {
    cancelSplitDragMove();
    window.removeEventListener('pointermove', handleSplitDragPointerMove);
  }, [cancelSplitDragMove, handleSplitDragPointerMove]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleCreateNote = useCallback(() => {
    const folderPath = resolveSiblingNoteParentPath(
      useNotesStore.getState().draftNotes,
      currentNotePath,
    );
    createNote(folderPath, { asDraft: true });
  }, [currentNotePath, createNote]);

  React.useEffect(() => {
    return () => {
      stopSplitDragTracking();
    };
  }, [stopSplitDragTracking]);

  const handleDragStart = (event: DragStartEvent) => {
    const path = event.active.id as string;
    setActiveTabId(path);
    activeSplitDragPathRef.current = path;
    splitDragPointRef.current = null;
    pendingSplitDragPointRef.current = null;
    cancelSplitDragMove();
    window.addEventListener('pointermove', handleSplitDragPointerMove);
    dispatchNotesTabSplitDrag({ phase: 'start', path });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const path = activeSplitDragPathRef.current;
    if (!path) {
      return;
    }

    const point = getSplitDragPoint(event);
    if (!point) {
      return;
    }

    scheduleSplitDragMove(point);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTabId(null);
    const path = active.id as string;
    const point = getSplitDragPoint(event);
    flushSplitDragMove(point ?? undefined);
    activeSplitDragPathRef.current = null;
    splitDragPointRef.current = null;
    stopSplitDragTracking();
    dispatchNotesTabSplitDrag({
      phase: 'end',
      path,
      source: 'tab',
      ...(point ?? {}),
    });
    if (over && active.id !== over.id) {
      const oldIndex = openTabs.findIndex((tab) => tab.path === active.id);
      const newIndex = openTabs.findIndex((tab) => tab.path === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderTabs(oldIndex, newIndex);
      }
    }
  };

  const handleDragCancel = () => {
    const path = activeSplitDragPathRef.current;
    setActiveTabId(null);
    cancelSplitDragMove();
    activeSplitDragPathRef.current = null;
    splitDragPointRef.current = null;
    stopSplitDragTracking();
    if (path) {
      dispatchNotesTabSplitDrag({ phase: 'cancel', path });
    }
  };

  const activeTab = activeTabId ? openTabs.find((tab) => tab.path === activeTabId) : null;

  if (notesSplitPanesActive) {
    return null;
  }

  return (
    <TitleBarCenterRegion className="group/tab-row gap-1">
      {hasOpenTabs ? (
        <TitleBarInteractiveRegion
          className={cn(
            'h-8 rounded-[var(--vlaina-notes-ui-radius-group)] px-1.5 transition-all duration-[var(--vlaina-duration-200)]',
            raisedPillSurfaceClass,
          )}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={openTabs.map((tab) => tab.path)} strategy={horizontalListSortingStrategy}>
              <div className="flex min-w-0 items-center overflow-x-auto">
                {openTabs.map((tab, index) => (
                  <SortableTab
                    key={tab.path}
                    tab={tab}
                    isActive={currentNotePath === tab.path}
                    onClose={closeTab}
                    onClick={(path) => void openNote(path)}
                    showSeparator={index > 0}
                  />
                ))}
              </div>
            </SortableContext>

            <NotesDragOverlay>
              {activeTab ? (
                <TabOverlay tab={activeTab} isActive={currentNotePath === activeTab.path} />
              ) : null}
            </NotesDragOverlay>
          </DndContext>
        </TitleBarInteractiveRegion>
      ) : null}

      {hasOpenedFolder ? (
        <Tooltip delayDuration={themeUiFeedbackTokens.defaultTooltipDelayMs}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCreateNote}
              className={cn(
                'notes-tab-row-new-note-button app-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
                hasOpenTabs
                  ? 'pointer-events-none opacity-[var(--vlaina-opacity-0)] group-hover/tab-row:pointer-events-auto group-hover/tab-row:opacity-[var(--vlaina-opacity-100)] group-focus-within/tab-row:pointer-events-auto group-focus-within/tab-row:opacity-[var(--vlaina-opacity-100)]'
                  : 'pointer-events-auto opacity-[var(--vlaina-opacity-100)]',
                ghostIconButtonClass,
                'text-[var(--vlaina-color-tab-muted-fg)]'
              )}
            >
              <Icon name="common.add" className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={6}
            showArrow={false}
            className={cn(
              'flex items-center gap-1.5 rounded-[var(--vlaina-notes-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
              raisedPillSurfaceClass,
            )}
          >
            <span>{t('sidebar.newNote')}</span>
            <ShortcutKeys
              keys={['Ctrl', 'Shift', 'T']}
              keyClassName="rounded-md bg-[var(--vlaina-sidebar-chat-row-hover)] text-[var(--vlaina-sidebar-chat-text)]"
            />
          </TooltipContent>
        </Tooltip>
      ) : null}

      {hasNoteNavigationHistory ? (
        <div
          className={cn(
            'notes-tab-row-history-controls flex h-7 w-14 shrink-0 items-center justify-center transition-all',
            hasOpenTabs
              ? 'pointer-events-none opacity-[var(--vlaina-opacity-0)] group-hover/tab-row:pointer-events-auto group-hover/tab-row:opacity-[var(--vlaina-opacity-100)] group-focus-within/tab-row:pointer-events-auto group-focus-within/tab-row:opacity-[var(--vlaina-opacity-100)]'
              : 'pointer-events-auto opacity-[var(--vlaina-opacity-100)]'
          )}
        >
          <NoteHistoryButton
            direction="back"
            disabled={!canNavigateBack}
            label={t('notes.previous')}
            onNavigate={navigateBackInNoteHistory}
          />
          <NoteHistoryButton
            direction="forward"
            disabled={!canNavigateForward}
            label={t('notes.next')}
            onNavigate={navigateForwardInNoteHistory}
          />
        </div>
      ) : null}
    </TitleBarCenterRegion>
  );
}
