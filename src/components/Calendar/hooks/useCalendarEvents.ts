import { useMemo } from 'react';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';

export function useCalendarEvents() {
  const { events } = useCalendarStore();
  const { tasks } = useGroupStore();

  const displayItems = useMemo(() => {
    // 1. Regular Calendar Events
    const mappedEvents = events.map(e => ({ ...e, type: 'event' as const }));

    // 2. Tasks with scheduledTime
    const mappedTasks = tasks
      .filter(t => t.scheduledTime && !t.completed)
      .map(t => {
        const start = Number(t.scheduledTime);
        const duration = t.estimatedMinutes || 60; 
        
        return {
          id: t.id,
          title: t.content,
          startDate: start,
          endDate: start + (duration * 60 * 1000),
          isAllDay: false,
          color: t.priority === 'default' ? 'blue' : t.priority,
          type: 'task' as const,
          originalTask: t
        } as CalendarEvent & { type: 'task', originalTask: any };
      });

    return [...mappedEvents, ...mappedTasks];
  }, [events, tasks]);

  return displayItems;
}
