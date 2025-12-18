/**
 * TimeGrid - Week view
 * 
 * Based on BaseTimeGrid, configured to display 7 days of the week
 */

import { useMemo } from 'react';
import { startOfWeek, addDays } from 'date-fns';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { BaseTimeGrid } from './BaseTimeGrid';

export function TimeGrid() {
  const { selectedDate } = useCalendarStore();

  const days = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [selectedDate]);

  return <BaseTimeGrid days={days} />;
}
