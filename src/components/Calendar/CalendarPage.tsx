import { useEffect, useState } from 'react';
import { format, startOfWeek, addDays, startOfDay, addMinutes } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';

// Updated imports for the new modular structure
import { CalendarLayout } from './layout/CalendarLayout';
import { TimeGrid } from './features/Grid/TimeGrid';
import { DayGrid } from './features/Grid/DayGrid';
import { MonthGrid } from './features/Grid/MonthGrid';
import { MiniCalendar } from './features/Sidebar/MiniCalendar';
import { ContextPanel } from './features/ContextPanel/ContextPanel';
import { ViewSwitcher } from './features/ViewSwitcher';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';

const HOUR_HEIGHT = 64;
const GUTTER_WIDTH = 60;
const SNAP_MINUTES = 15;

export function CalendarPage() {
  const { load, selectedDate, addEvent, viewMode, showSidebar, showContextPanel } = useCalendarStore();
  const { updateTaskSchedule, updateTaskEstimation } = useGroupStore();
  const [activeDragItem, setActiveDragItem] = useState<any>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Navigation is now handled by ViewSwitcher component

  // Sensors for DnD
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

    if (
      x >= rect.left && 
      x <= rect.right && 
      y >= rect.top && 
      y <= rect.bottom
    ) {
      // 1. Calculate Day
      const relativeX = x - rect.left - GUTTER_WIDTH;
      if (relativeX < 0) return; 

      const dayWidth = (rect.width - GUTTER_WIDTH) / 7;
      const dayIndex = Math.floor(relativeX / dayWidth);
      if (dayIndex < 0 || dayIndex > 6) return;

      // 2. Calculate Time
      const scrollContainer = document.getElementById('time-grid-scroll');
      const scrollTop = scrollContainer?.scrollTop || 0;
      
      const relativeY = y - rect.top + scrollTop;
      const totalMinutes = (relativeY / HOUR_HEIGHT) * 60;
      const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      // 3. Determine Date
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const dayDate = addDays(weekStart, dayIndex);
      const startDate = addMinutes(startOfDay(dayDate), snappedMinutes);
      
      // 4. Handle Action
      const task = active.data.current?.task;

      if (task) {
        updateTaskSchedule(task.id, startDate.getTime().toString());
        // Only update estimation if it was default/fallback, otherwise keep original or update if needed
        // For simplicity, we just ensure schedule is set. Estimation update is optional here.
        if (!task.estimatedMinutes) {
           updateTaskEstimation(task.id, 60);
        }
        console.log('[Calendar] Scheduled Task:', task.title, 'at', startDate);
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

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <CalendarLayout
        sidebar={
          <div className="p-4">
            <MiniCalendar />
          </div>
        }
        main={
          <div className="flex h-full flex-col">
            {/* Header Toolbar */}
            <div className="h-12 flex items-center px-4 justify-between bg-white dark:bg-zinc-950 relative backdrop-blur-md bg-opacity-80" style={{ zIndex: 100 }}>
               <h2 className="text-lg font-semibold tracking-tight">
                 {format(selectedDate, 'yyyy年M月', { locale: zhCN })}
               </h2>
               
               <ViewSwitcher />
            </div>
            
            {/* The Core Grid - switches based on viewMode */}
            <div className="flex-1 min-h-0 relative" id="time-grid-container">
               {viewMode === 'day' && <DayGrid />}
               {viewMode === 'week' && <TimeGrid />}
               {viewMode === 'month' && <MonthGrid />}
            </div>
          </div>
        }
        contextPanel={<ContextPanel />}
        showSidebar={showSidebar}
        showContextPanel={showContextPanel}
      />

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
           <div className="px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 max-w-[200px] rotate-1">
              <span className="text-[13px] text-zinc-700 dark:text-zinc-200 line-clamp-2">
                {activeDragItem.content}
              </span>
           </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}