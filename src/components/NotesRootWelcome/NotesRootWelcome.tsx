import { useEffect, useState } from 'react';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { desktopWindow } from '@/lib/desktop/window';
import { cn } from '@/lib/utils';
import { RecentNotesRootsList } from './components/RecentNotesRootsList';
import './NotesRootWelcome.css';

export function NotesRootWelcome() {
  const initialize = useNotesRootStore((state) => state.initialize);
  const recentNotesRoots = useNotesRootStore((state) => state.recentNotesRoots);
  const openNotesRoot = useNotesRootStore((state) => state.openNotesRoot);
  const isLoading = useNotesRootStore((state) => state.isLoading);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initialize().then(() => setIsInitialized(true)).catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    const lockWindow = async () => {
        try {
          await desktopWindow.setResizable(false);
      } catch (e) {
      }
    };

    void lockWindow();

    return () => {
      const unlockWindow = async () => {
        try {
          await desktopWindow.setResizable(true);
        } catch (e) {
        }
      };
      void unlockWindow();
    };
  }, []);

  const handleOpenRecent = async (path: string) => {
    await openNotesRoot(path);
  };

  if (!isInitialized) {
    return null;
  }

  return (
    <div className={cn('notes-root-welcome', isLoading && 'notes-root-welcome--loading')}>
      <div className="notes-root-welcome__content">
        <div className="notes-root-welcome__main">
          {recentNotesRoots.length > 0 && (
            <RecentNotesRootsList notesRoots={recentNotesRoots} onOpen={handleOpenRecent} />
          )}
        </div>
      </div>
    </div>
  );
}
