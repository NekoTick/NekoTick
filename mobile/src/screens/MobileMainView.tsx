import { lazy, Suspense, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import type { MobileViewMode } from '../app/mobilePlatform';

const NotesView = lazy(async () => {
  const module = await import('@/components/Notes/NotesView');
  return { default: module.NotesView };
});
const ChatView = lazy(async () => {
  const module = await import('@/components/Chat/ChatView');
  return { default: module.ChatView };
});
const WhiteboardView = lazy(async () => {
  const module = await import('@/components/Whiteboard/WhiteboardView');
  return { default: module.WhiteboardView };
});
const GraphView = lazy(async () => {
  const module = await import('@/components/Graph/GraphView');
  return { default: module.GraphView };
});

interface MobileMainViewProps {
  activeView: MobileViewMode;
  onCreateNote: () => void;
}

export function MobileMainView({ activeView, onCreateNote }: MobileMainViewProps) {
  const { t } = useI18n();
  const currentNotePath = useNotesStore((state) => state.currentNote?.path ?? null);
  const storageLoaded = useUnifiedStore((state) => state.loaded);
  const [mountedViews, setMountedViews] = useState<Set<MobileViewMode>>(
    () => new Set([activeView]),
  );

  useEffect(() => {
    setMountedViews((current) => {
      if (current.has(activeView)) return current;
      return new Set([...current, activeView]);
    });
  }, [activeView]);

  const renderPane = (view: MobileViewMode) => {
    if (!mountedViews.has(view)) return null;
    const active = activeView === view;
    return (
      <section
        key={view}
        className="mobile-view-pane"
        data-mobile-view={view}
        data-active={active ? 'true' : undefined}
        hidden={!active}
      >
        <Suspense fallback={<div className="mobile-loading" aria-busy="true" />}>
          {view === 'notes' ? (
            <>
              <NotesView active={active} presentation="mobile" />
              {active && storageLoaded && !currentNotePath ? (
                <div className="mobile-notes-empty" data-mobile-notes-empty="true">
                  <span className="mobile-notes-empty__icon" aria-hidden="true">
                    <Icon name="file.text" size="xl" />
                  </span>
                  <strong>{t('app.viewNotes')}</strong>
                  <button type="button" onClick={onCreateNote}>
                    <Icon name="common.add" size="md" />
                    <span>{t('sidebar.newNote')}</span>
                  </button>
                </div>
              ) : null}
            </>
          ) : view === 'chat' ? (
            <ChatView mode="full" presentation="mobile" active={active} />
          ) : view === 'whiteboard' ? (
            <WhiteboardView active={active} drawWithTouch />
          ) : (
            <GraphView active={active} />
          )}
        </Suspense>
      </section>
    );
  };

  return (
    <main className="mobile-main-view">
      {renderPane('notes')}
      {renderPane('chat')}
      {renderPane('whiteboard')}
      {renderPane('graph')}
    </main>
  );
}
