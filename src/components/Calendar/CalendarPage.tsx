import { useEffect, useState } from 'react';
import { format, startOfWeek, addDays, startOfDay, addMinutes } from 'date-fns';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';

import { CalendarLayout } from './New/Layout';
import { TimeGrid } from './New/TimeGrid';
import { MiniCalendar } from './New/MiniCalendar';
import { ContextPanel } from './New/ContextPanel';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore'; // Import GroupStore

const HOUR_HEIGHT = 64;
const GUTTER_WIDTH = 60;
const SNAP_MINUTES = 15;

export function CalendarPage() {
  const { load, selectedDate, setSelectedDate, addEvent } = useCalendarStore();
  const { updateTask } = useGroupStore(); // Get updateTask
  const [activeDragItem, setActiveDragItem] = useState<any>(null);

  useEffect(() => {
    load();
  }, [load]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    const days = direction === 'prev' ? -7 : 7;
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const jumpToToday = () => setSelectedDate(new Date());

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

    // If dropped over the TimeGrid (we'll check coordinates manually for precision)
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
      if (relativeX < 0) return; // Dropped on gutter

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
      
      // 4. Handle Action based on Item Type
      const task = active.data.current?.task;

      if (task) {
        // --- SCENARIO A: Scheduling a Task ---
        // Update the task with the specific scheduled time
        // Note: TaskStore likely expects a string or specific format for scheduledTime.
        // Assuming it stores it as a timestamp string or simple string for now.
        updateTask(task.id, { 
          scheduledTime: startDate.getTime().toString(), // Storing as timestamp string
          estimatedMinutes: task.estimatedMinutes || 60 // Default duration if not set
        });
        console.log('[Calendar] Scheduled Task:', task.title, 'at', startDate);
      } else {
        // --- SCENARIO B: Creating a Generic Event (Fallback) ---
        // (This path might be used if we implement other drag types later)
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
            <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 justify-between bg-white dark:bg-zinc-950 z-30 relative">
               <div className="flex items-center gap-3">
                 <h2 className="text-lg font-semibold tracking-tight">
                   {format(selectedDate, 'MMMM yyyy')}
                 </h2>
                 <div className="flex items-center gap-1">
                   <button onClick={() => navigateWeek('prev')} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500"><CaretLeft className="size-4" /></button>
                   <button onClick={jumpToToday} className="px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">Today</button>
                   <button onClick={() => navigateWeek('next')} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500"><CaretRight className="size-4" /></button>
                 </div>
               </div>
               
               <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-800">
                  <button className="px-3 py-1 text-xs font-medium rounded-[4px] bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100">Week</button>
                  <button className="px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors">Month</button>
               </div>
            </div>
            
            {/* The Core Grid */}
            <div className="flex-1 min-h-0 relative" id="time-grid-container">
               {/* Pass IDs for coordinate calculation */}
               <TimeGrid /> 
            </div>
          </div>
        }
        contextPanel={<ContextPanel />}
      />

      {/* Drag Overlay for visual feedback */}
      <DragOverlay>
        {activeDragItem ? (
           <div className="p-2 bg-white dark:bg-zinc-800 rounded border border-blue-500 shadow-lg w-48 opacity-90 rotate-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
                {activeDragItem.content}
              </span>
           </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
