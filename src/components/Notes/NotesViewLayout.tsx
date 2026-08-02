import { Suspense, type MutableRefObject, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { ResizablePanel } from '@/components/layout/ResizablePanel';
import { ModuleShortcutsDialog } from '@/components/common/ModuleShortcutsDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { BlurBackdrop } from '@/components/common/BlurBackdrop';
import { TreeItemDeleteDialog } from '@/components/Notes/features/FileTree/components/TreeItemDeleteDialog';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import {
  FLOATING_CHAT_WINDOW_VARIANTS,
  RIGHT_SIDEBAR_SLIDE_VARIANTS,
  SIDEBAR_SLIDE_TRANSITION,
} from '@/lib/animations';
import { themeBackdropTokens } from '@/styles/themeTokens';
import type { useResizableBox } from '@/components/layout/shell/useResizableBox';
import type { NotesChatFloatingSize } from '@/stores/uiSlice';
import type { useI18n } from '@/lib/i18n';
import { EmbeddedChatView } from './notesViewLazyComponents';
import { NotesSplitDiagnosticsButton } from './features/Split/NotesSplitDiagnosticsButton';
import { ImageFileHoverPreview } from './features/FileTree/ImageFileHoverPreview';

function DockedChatMotionPanel({
  children,
  onAnimationComplete,
}: {
  children: ReactNode;
  onAnimationComplete: (definition: unknown) => void;
}) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      data-notes-chat-panel-motion="true"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className={cn(
        'h-full flex-shrink-0 transform-gpu will-change-transform',
        !isPresent && 'pointer-events-none',
      )}
      variants={RIGHT_SIDEBAR_SLIDE_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={SIDEBAR_SLIDE_TRANSITION}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}

export function NotesViewLayout({
  active,
  beginFloatingChatResize,
  cancelPendingDraftDiscard,
  chatFloatingOpen,
  chatPanelCollapsed,
  children,
  closeFloatingChat,
  confirmPendingDraftDiscard,
  deleteNote,
  floatingChatLiveSize,
  floatingChatPanelRef,
  getDisplayName,
  getDockedChatPanelMaxWidth,
  handleChatPanelDragStateChange,
  handleDockedChatPanelAnimationComplete,
  handleFloatingChatAnimationComplete,
  hasSplitPanes,
  isBlankWorkspaceDropActive,
  isEmbeddedChatViewReady,
  isDockedChatPanelPresent,
  isFloatingChatResizing,
  isFloatingChatPresent,
  isShortcutsOpen,
  notesViewRef,
  pendingDeleteCurrentNotePath,
  pendingDraftDiscardPath,
  promoteFloatingChatToSidePanel,
  resetChatFloatingSize,
  scheduleChatPanelCaretRefresh,
  setChatPanelCollapsed,
  setIsShortcutsOpen,
  setPendingDeleteCurrentNotePath,
  splitDropRootRef,
  t,
  unifiedLoaded,
}: {
  active: boolean;
  beginFloatingChatResize: ReturnType<typeof useResizableBox<NotesChatFloatingSize>>['handleResizeStart'];
  cancelPendingDraftDiscard: () => void;
  chatFloatingOpen: boolean;
  chatPanelCollapsed: boolean;
  children: ReactNode;
  closeFloatingChat: () => void;
  confirmPendingDraftDiscard: () => void;
  deleteNote: (path: string) => Promise<void>;
  floatingChatLiveSize: NotesChatFloatingSize;
  floatingChatPanelRef: MutableRefObject<HTMLDivElement | null>;
  getDisplayName: (path: string) => string;
  getDockedChatPanelMaxWidth: () => number;
  handleChatPanelDragStateChange: (dragging: boolean) => void;
  handleDockedChatPanelAnimationComplete: (definition: unknown) => void;
  handleFloatingChatAnimationComplete: (definition: unknown) => void;
  hasSplitPanes: boolean;
  isBlankWorkspaceDropActive: boolean;
  isEmbeddedChatViewReady: boolean;
  isDockedChatPanelPresent: boolean;
  isFloatingChatResizing: boolean;
  isFloatingChatPresent: boolean;
  isShortcutsOpen: boolean;
  notesViewRef: MutableRefObject<HTMLDivElement | null>;
  pendingDeleteCurrentNotePath: string | null;
  pendingDraftDiscardPath: string | null;
  promoteFloatingChatToSidePanel: () => void;
  resetChatFloatingSize: () => void;
  scheduleChatPanelCaretRefresh: () => void;
  setChatPanelCollapsed: (collapsed: boolean) => void;
  setIsShortcutsOpen: (open: boolean) => void;
  setPendingDeleteCurrentNotePath: (path: string | null) => void;
  splitDropRootRef: MutableRefObject<HTMLDivElement | null>;
  t: ReturnType<typeof useI18n>['t'];
  unifiedLoaded: boolean;
}) {
  return (
    <>
      <AnimatePresence>
        {isBlankWorkspaceDropActive && (
          <BlurBackdrop
            className="pointer-events-none"
            overlayClassName="bg-[var(--vlaina-color-drop-overlay)]"
            zIndex={themeBackdropTokens.notesBlankWorkspaceDropZIndex}
            blurPx={themeBackdropTokens.notesBlankWorkspaceDropBlurPx}
            duration={themeBackdropTokens.notesBlankWorkspaceDropDurationSeconds}
            data-testid="blank-workspace-drop-overlay"
          />
        )}
      </AnimatePresence>

      <div ref={notesViewRef} data-notes-view-mode="true" className="h-full w-full relative flex min-w-0">
        <div
          ref={splitDropRootRef}
          className="flex-1 min-w-0 relative"
          data-notes-split-drop-root="true"
        >
          {children}
          <ImageFileHoverPreview />
        </div>

        <AnimatePresence mode="popLayout">
          {active && !chatPanelCollapsed && (
            <DockedChatMotionPanel
              onAnimationComplete={handleDockedChatPanelAnimationComplete}
            >
              <ResizablePanel
                defaultWidth={320}
                minWidth={320}
                maxWidth={760}
                getMaxWidth={getDockedChatPanelMaxWidth}
                storageKey="vlaina_notes_chat_panel_width_v2"
                onWidthChange={scheduleChatPanelCaretRefresh}
                onDragStateChange={handleChatPanelDragStateChange}
                className="h-full border-l border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-bg-primary)]"
              >
                <div
                  data-notes-chat-panel="true"
                  data-notes-external-block-selection-root="true"
                  className="h-full min-h-0 relative"
                >
                  <Suspense fallback={null}>
                    <EmbeddedChatView
                      mode="embedded"
                      active={active}
                      onCloseEmbeddedPanel={() => setChatPanelCollapsed(true)}
                    />
                  </Suspense>
                </div>
              </ResizablePanel>
            </DockedChatMotionPanel>
          )}
        </AnimatePresence>

        {active
          && chatPanelCollapsed
          && !isDockedChatPanelPresent
          && isEmbeddedChatViewReady
          && unifiedLoaded && (
          <Suspense fallback={null}>
            <motion.div
              ref={floatingChatPanelRef}
              data-notes-chat-floating={chatFloatingOpen ? 'true' : undefined}
              data-notes-external-block-selection-root="true"
              aria-hidden={!chatFloatingOpen}
              inert={!chatFloatingOpen}
              className={cn(
                'absolute bottom-4 right-4 z-[var(--vlaina-z-30)] overflow-hidden !rounded-[var(--vlaina-notes-ui-radius-panel)] transform-gpu',
                !chatFloatingOpen && 'pointer-events-none',
                isFloatingChatPresent ? 'will-change-transform' : 'invisible',
                isFloatingChatResizing && 'will-change-[width,height]',
                raisedPillSurfaceClass,
              )}
              style={{
                width: `${floatingChatLiveSize.width}px`,
                height: `${floatingChatLiveSize.height}px`,
                maxWidth: 'calc(100% - var(--vlaina-size-32px))',
                maxHeight: 'calc(100% - var(--vlaina-size-32px))',
              }}
              variants={FLOATING_CHAT_WINDOW_VARIANTS}
              initial="hidden"
              animate={chatFloatingOpen ? 'visible' : 'hidden'}
              transition={SIDEBAR_SLIDE_TRANSITION}
              onAnimationComplete={handleFloatingChatAnimationComplete}
            >
              <div
                aria-hidden="true"
                data-notes-chat-floating-resize-handle="left"
                data-no-editor-drag-box="true"
                className="absolute bottom-5 left-0 top-5 z-[var(--vlaina-z-50)] w-2 cursor-ew-resize touch-none bg-transparent"
                onPointerDown={(event) => beginFloatingChatResize('left', event)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resetChatFloatingSize();
                }}
              />
              <div
                aria-hidden="true"
                data-notes-chat-floating-resize-handle="top"
                data-no-editor-drag-box="true"
                className="absolute left-5 right-5 top-0 z-[var(--vlaina-z-50)] h-2 cursor-ns-resize touch-none bg-transparent"
                onPointerDown={(event) => beginFloatingChatResize('top', event)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resetChatFloatingSize();
                }}
              />
              <div
                aria-hidden="true"
                data-notes-chat-floating-resize-handle="top-left"
                data-no-editor-drag-box="true"
                className="absolute left-0 top-0 z-[var(--vlaina-z-50)] h-4 w-4 cursor-nwse-resize touch-none bg-transparent"
                onPointerDown={(event) => beginFloatingChatResize('top-left', event)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resetChatFloatingSize();
                }}
              />
              <EmbeddedChatView
                mode="embedded"
                active={active && isFloatingChatPresent}
                onCloseEmbeddedPanel={closeFloatingChat}
                onPromoteEmbeddedPanel={promoteFloatingChatToSidePanel}
              />
            </motion.div>
          </Suspense>
        )}

        {active && hasSplitPanes ? <NotesSplitDiagnosticsButton /> : null}
      </div>

      <TreeItemDeleteDialog
        open={Boolean(pendingDeleteCurrentNotePath)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteCurrentNotePath(null);
          }
        }}
        itemLabel={pendingDeleteCurrentNotePath ? getDisplayName(pendingDeleteCurrentNotePath) : ''}
        itemType="Note"
        onConfirm={() => {
          const path = pendingDeleteCurrentNotePath;
          setPendingDeleteCurrentNotePath(null);
          if (path) {
            void deleteNote(path).catch(() => undefined);
          }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDraftDiscardPath)}
        onClose={cancelPendingDraftDiscard}
        onConfirm={confirmPendingDraftDiscard}
        title={t('notes.discardDraftTitle')}
        description={t('notes.discardDraftDescription')}
        confirmText={t('notes.discard')}
        cancelText={t('common.cancel')}
        variant="danger"
      />

      <ModuleShortcutsDialog module="notes" open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />
    </>
  );
}
