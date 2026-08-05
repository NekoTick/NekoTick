import { lazy, Suspense, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useGraphUIStore } from '@/components/Graph/store/useGraphUIStore';
import { useWhiteboardStore } from '@/components/Whiteboard/stores/useWhiteboardStore';
import type { MobileViewMode } from '../app/mobilePlatform';
import { MobileLayer } from './MobileLayer';

const NotesSidebar = lazy(async () => {
  const module = await import('@/components/Notes/features/Sidebar/NotesSidebarWrapper');
  return { default: module.NotesSidebarWrapper };
});
const ChatSidebar = lazy(async () => {
  const module = await import('@/components/Chat/features/Sidebar/ChatSidebar');
  return { default: module.ChatSidebar };
});
const WhiteboardSidebar = lazy(async () => {
  const module = await import('@/components/Whiteboard/WhiteboardSidebar');
  return { default: module.WhiteboardSidebar };
});
const GraphSidebar = lazy(async () => {
  const module = await import('@/components/Graph/GraphSidebar');
  return { default: module.GraphSidebar };
});

interface MobileSidebarSheetProps {
  activeView: MobileViewMode;
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarSheet({ activeView, open, onClose }: MobileSidebarSheetProps) {
  const { t } = useI18n();
  const currentNotePath = useNotesStore((state) => state.currentNote?.path ?? null);
  const currentSessionId = useAIUIStore((state) => state.currentSessionId);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const selectedGraphPath = useGraphUIStore((state) => state.selectedPath);
  const interactedRef = useRef(false);
  const selectionRef = useRef('');
  const selection = activeView === 'notes'
    ? currentNotePath
    : activeView === 'chat'
      ? currentSessionId
      : activeView === 'whiteboard'
        ? activeBoardId
        : selectedGraphPath;

  useEffect(() => {
    selectionRef.current = selection ?? '';
    interactedRef.current = false;
  }, [activeView, open]);

  useEffect(() => {
    const nextSelection = selection ?? '';
    if (
      open
      && interactedRef.current
      && nextSelection
      && nextSelection !== selectionRef.current
    ) {
      onClose();
    }
    selectionRef.current = nextSelection;
  }, [onClose, open, selection]);

  return (
    <MobileLayer
      open={open}
      title={t('sidebar.mobileTitle')}
      variant="drawer"
      onClose={onClose}
      contentClassName="mobile-sidebar-sheet"
    >
      <div
        className="mobile-sidebar-sheet__body"
        data-mobile-sidebar={activeView}
        onPointerDownCapture={() => {
          interactedRef.current = true;
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(
            '[data-sidebar-row-actions="true"], '
            + '[data-notes-sidebar-section-actions="true"], '
            + '[data-whiteboard-board-menu-trigger="true"]',
          )) {
            return;
          }
          if (target.closest('[aria-current="page"], [aria-current="true"]')) {
            onClose();
          }
        }}
      >
        <Suspense fallback={<div className="mobile-loading" aria-busy="true" />}>
          {activeView === 'notes' ? (
            <NotesSidebar active loadContent />
          ) : activeView === 'chat' ? (
            <ChatSidebar embedded active onRequestClose={onClose} />
          ) : activeView === 'whiteboard' ? (
            <WhiteboardSidebar />
          ) : (
            <GraphSidebar active />
          )}
        </Suspense>
      </div>
    </MobileLayer>
  );
}
