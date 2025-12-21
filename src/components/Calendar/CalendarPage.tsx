/**
 * CalendarPage - Main calendar page component
 * 
 * Responsibilities:
 * 1. Compose layout components
 * 2. Coordinate child components
 * 
 * Note: DnD context is managed at App level for cross-panel dragging
 */

import { useEffect } from 'react';

import { CalendarLayout } from './layout/CalendarLayout';
import { TimeGrid } from './features/Grid/TimeGrid';
import { DayGrid } from './features/Grid/DayGrid';
import { MonthGrid } from './features/Grid/MonthGrid';
import { EventEditForm } from './features/ContextPanel/EventEditForm';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useCalendarKeyboard } from './hooks/useCalendarKeyboard';
import { useCalendarZoom } from './hooks/useCalendarZoom';

export function CalendarPage() {
  const {
    load, viewMode, showContextPanel,
    editingEventId, editingEventPosition, closeEditingEvent, events
  } = useCalendarStore();

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
    <>
      <CalendarLayout
        main={
          <div className="flex h-full flex-col">
            {/* Grid */}
            <div className="flex-1 min-h-0 relative" id="time-grid-container">
              {renderGrid()}
            </div>
          </div>
        }
      />

      {/* Floating editor */}
      {!showContextPanel && editingEvent && (
        <EventEditForm
          event={editingEvent}
          mode="floating"
          position={editingEventPosition || undefined}
        />
      )}
    </>
  );
}
