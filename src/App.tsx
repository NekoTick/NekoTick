import { useEffect, useState } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SettingsModal } from '@/components/common/Settings';
import { CalendarPage, CalendarToolbar, CalendarTaskPanel } from '@/components/Calendar';
import { CalendarHeaderControl } from '@/components/Calendar/features/Grid/CalendarHeaderControl';
import { Layout } from '@/components/layout';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastContainer } from '@/components/ui/Toast';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useVimShortcuts } from '@/hooks/useVimShortcuts';
import { useShortcuts } from '@/hooks/useShortcuts';
import { getShortcutKeys } from '@/lib/shortcuts';
import { startOfWeek, addDays, startOfDay, addMinutes } from 'date-fns';
import { CALENDAR_CONSTANTS } from '@/components/Calendar/utils/timeUtils';

const { GUTTER_WIDTH } = CALENDAR_CONSTANTS;
const SNAP_MINUTES = 15;

function AppContent() {
  // Enable shortcuts
  useShortcuts();
  const { loadData, updateTaskTime, updateTaskEstimation } = useGroupStore();
  const { showContextPanel, selectedDate, hourHeight, viewMode, dayCount } = useCalendarStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Enable VIM-style keyboard navigation
  useVimShortcuts();

  // Load data on app startup
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open/close settings shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, []);

  // DnD sensors for cross-panel dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (_event: DragStartEvent) => {
    // Just track that dragging started - the DragOverlay is in CalendarTaskPanel
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;

    const task = active.data.current?.task;
    if (!task) return;

    const gridContainer = document.getElementById('time-grid-container');
    if (!gridContainer) return;

    const rect = gridContainer.getBoundingClientRect();
    const dropRect = event.active.rect.current.translated;
    if (!dropRect) return;

    const x = dropRect.left + 20;
    const y = dropRect.top + 20;

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      // Calculate day count based on view mode
      const numDays = viewMode === 'week' ? 7 : (dayCount || 1);
      
      const relativeX = x - rect.left - GUTTER_WIDTH;
      if (relativeX < 0) return;

      const dayWidth = (rect.width - GUTTER_WIDTH) / numDays;
      const dayIndex = Math.floor(relativeX / dayWidth);
      if (dayIndex < 0 || dayIndex >= numDays) return;

      const scrollContainer = document.getElementById('time-grid-scroll');
      const scrollTop = scrollContainer?.scrollTop || 0;

      const relativeY = y - rect.top + scrollTop;
      const totalMinutes = (relativeY / hourHeight) * 60;
      const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      const weekStart = viewMode === 'week' 
        ? startOfWeek(selectedDate, { weekStartsOn: 1 })
        : selectedDate;
      const dayDate = addDays(weekStart, dayIndex);
      const startDate = addMinutes(startOfDay(dayDate), snappedMinutes);

      const endDate = addMinutes(startDate, task.estimatedMinutes || 60);
      updateTaskTime(task.id, startDate.getTime(), endDate.getTime());
      if (!task.estimatedMinutes) {
        updateTaskEstimation(task.id, 60);
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Settings Modal - Global */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Calendar Page */}
      <Layout 
        onOpenSettings={() => setSettingsOpen(true)} 
        toolbar={<CalendarToolbar />}
        content={<CalendarHeaderControl />}
        rightPanel={<CalendarTaskPanel />}
        showRightPanel={showContextPanel}
      >
        <CalendarPage />
      </Layout>
    </DndContext>
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
