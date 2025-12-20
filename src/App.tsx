import { useEffect, useState } from 'react';
import { SettingsModal } from '@/components/common/Settings';
import { TimeTrackerPage } from '@/components/TimeTracker';
import { ProgressPage } from '@/components/Progress';
import { CalendarPage, CalendarToolbar, CalendarSidebar, CalendarTaskPanel } from '@/components/Calendar';
import { Layout } from '@/components/layout';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastContainer } from '@/components/ui/Toast';
import { useViewStore } from '@/stores/useViewStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useVimShortcuts } from '@/hooks/useVimShortcuts';
import { useShortcuts } from '@/hooks/useShortcuts';
import { getShortcutKeys } from '@/lib/shortcuts';

function AppContent() {
  // Enable shortcuts
  useShortcuts();
  const { currentView } = useViewStore();
  const { loadData } = useGroupStore();
  const { showContextPanel, showSidebar: showCalendarSidebar } = useCalendarStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Enable VIM-style keyboard navigation
  useVimShortcuts();

  // Load data on app startup
  useEffect(() => {
    loadData();
  }, [loadData]);

  // View switching order
  const viewOrder: Array<typeof currentView> = ['progress', 'calendar', 'time-tracker'];
  const { setView } = useViewStore();

  // Open/close settings shortcut + view switching shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab / Ctrl+Shift+Tab to switch views
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = viewOrder.indexOf(currentView);
        if (e.shiftKey) {
          // Switch to previous view
          const prevIndex = (currentIndex - 1 + viewOrder.length) % viewOrder.length;
          setView(viewOrder[prevIndex]);
        } else {
          // Switch to next view
          const nextIndex = (currentIndex + 1) % viewOrder.length;
          setView(viewOrder[nextIndex]);
        }
        return;
      }

      // Settings shortcut
      const keys = getShortcutKeys('open-settings');
      if (!keys || keys.length === 0) return;

      const matchesShortcut = keys.every((key: string) => {
        if (key === 'Ctrl') return e.ctrlKey;
        if (key === 'Shift') return e.shiftKey;
        if (key === 'Alt') return e.altKey;
        if (key === 'Meta') return e.metaKey;
        return e.key.toUpperCase() === key.toUpperCase();
      });

      if (matchesShortcut) {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, setView]);

  return (
    <>
      {/* Settings Modal - Global */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Time Tracker Page */}
      {currentView === 'time-tracker' && (
        <Layout onOpenSettings={() => setSettingsOpen(true)}>
          <TimeTrackerPage />
        </Layout>
      )}

      {/* Progress Page */}
      {currentView === 'progress' && (
        <Layout onOpenSettings={() => setSettingsOpen(true)}>
          <ProgressPage />
        </Layout>
      )}

      {/* Calendar Page (default) */}
      {currentView === 'calendar' && (
        <Layout 
          onOpenSettings={() => setSettingsOpen(true)} 
          toolbar={<CalendarToolbar />}
          leftPanel={<CalendarSidebar />}
          showLeftPanel={showCalendarSidebar}
          rightPanel={<CalendarTaskPanel />}
          showRightPanel={showContextPanel}
        >
          <CalendarPage />
        </Layout>
      )}
    </>
  );
}

function App() {
  // Prevent default browser zoom behavior on Ctrl+scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <ThemeProvider>
      <AppContent />
      <ToastContainer />
    </ThemeProvider>
  );
}

export default App;
