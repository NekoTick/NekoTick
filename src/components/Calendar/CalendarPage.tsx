/**
 * CalendarPage - Main calendar page component
 * 
 * Responsibilities:
 * 1. Compose layout components
 * 2. Manage DnD context
 * 3. Coordinate child components
 */

import { useEffect, useState } from 'react';
import { format, startOfWeek, addDays, startOfDay, addMinutes } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';

import { CalendarLayout } from './layout/CalendarLayout';
import { TimeGrid } from './features/Grid/TimeGrid';
import { DayGrid } from './features/Grid/DayGrid';
import { MonthGrid } from './features/Grid/MonthGrid';
import { MiniCalendar } from './features/Sidebar/MiniCalendar';
import { ContextPanel } from './features/ContextPanel/ContextPanel';
import { EventEditForm } from './features/ContextPanel/EventEditForm';
import { ViewSwitcher } from './features/ViewSwitcher';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';
import { useCalendarKeyboard } from './hooks/useCalendarKeyboard';
import { useCalendarZoom } from './hooks/useCalendarZoom';
import { CALENDAR_CONSTANTS } from './utils/timeUtils';

const { GUTTER_WIDTH } = CALENDAR_CONSTANTS;
const SNAP_MINUTES = 15;

export function CalendarPage() {
  const {
    load, selectedDate, addEvent, viewMode, showSidebar, showContextPanel,
    hourHeight, editingEventId, editingEventPosition, closeEditingEvent, events
  } = useCalendarStore();
  const { updateTaskTime, updateTaskEstimation } = useGroupStore();
  const [activeDragItem, setActiveDragItem] = useState<any>(null);

  // Get the event being edited
  const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

  // Initialize
  useEffect(() => {
    load();
  }, [load]);

  // Keyboard shortcuts
  useCalendarKeyboard();

  // Zoom functionality
  useCalendarZoom();

  // Global click listener: close editing when clicking outside edit area
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!editingEventId) return;

      const target = e.target as HTMLElement;

      // Check if clicked inside edit panel
      if (target.closest('[data-context-panel]')) return;
      // Check if clicked on event block
      if (target.closest('.event-block')) return;
      // Check if clicked on context menu
      if (target.closest('[data-event-context-menu]')) return;

      closeEditingEvent();
    };

    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [editingEventId, closeEditingEvent]);

  // DnD configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: any) => {
    setActiveDragItem(event.active.data.current?.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    setActiveDragItem(null);

    const gridContainer = document.getElementById('time-grid-container');
    if (!gridContainer) return;

    const rect = gridContainer.getBoundingClientRect();
    const dropRect = event.active.rect.current.translated;
    if (!dropRect) return;

    const x = dropRect.left + 20;
    const y = dropRect.top + 20;

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const relativeX = x - rect.left - GUTTER_WIDTH;
      if (relativeX < 0) return;

      const dayWidth = (rect.width - GUTTER_WIDTH) / 7;
      const dayIndex = Math.floor(relativeX / dayWidth);
      if (dayIndex < 0 || dayIndex > 6) return;

      const scrollContainer = document.getElementById('time-grid-scroll');
      const scrollTop = scrollContainer?.scrollTop || 0;

      const relativeY = y - rect.top + scrollTop;
      const totalMinutes = (relativeY / hourHeight) * 60;
      const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const dayDate = addDays(weekStart, dayIndex);
      const startDate = addMinutes(startOfDay(dayDate), snappedMinutes);

      const task = active.data.current?.task;

      if (task) {
        const endDate = addMinutes(startDate, task.estimatedMinutes || 60);
        updateTaskTime(task.id, startDate.getTime(), endDate.getTime());
        if (!task.estimatedMinutes) {
          updateTaskEstimation(task.id, 60);
        }
      } else {
        const endDate = addMinutes(startDate, 60);
        addEvent({
          title: 'New Event',
          startDate: startDate.getTime(),
          endDate: endDate.getTime(),
          isAllDay: false,
          color: 'blue',
        });
      }
    }
  };

  // Render current view
  const renderGrid = () => {
    switch (viewMode) {
      case 'day':
        return <DayGrid />;
      case 'week':
        return <TimeGrid />;
      case 'month':
        return <MonthGrid />;
      default:
        return <TimeGrid />;
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <CalendarLayout
        sidebar={
          <div className="p-4">
            <MiniCalendar />
          </div>
        }
        main={
          <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div
              className="h-12 flex items-center px-4 justify-between bg-white dark:bg-zinc-950 relative backdrop-blur-md bg-opacity-80"
              style={{ zIndex: 100 }}
            >
              <h2 className="text-lg font-semibold tracking-tight">
                {format(selectedDate, 'yyyy年M月', { locale: zhCN })}
              </h2>
              <ViewSwitcher />
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 relative" id="time-grid-container">
              {renderGrid()}
            </div>
          </div>
        }
        contextPanel={<ContextPanel />}
        showSidebar={showSidebar}
        showContextPanel={showContextPanel}
      />

      {/* Drag preview */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 max-w-[200px] rotate-1">
            <span className="text-[13px] text-zinc-700 dark:text-zinc-200 line-clamp-2">
              {activeDragItem.content}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Floating editor */}
      {!showContextPanel && editingEvent && (
        <EventEditForm
          event={editingEvent}
          mode="floating"
          position={editingEventPosition || undefined}
        />
      )}
    </DndContext>
  );
}
