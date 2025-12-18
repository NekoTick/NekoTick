/**
 * DayGrid - Day view
 * 
 * Based on BaseTimeGrid, configured to display dayCount days
 */

import { useMemo } from 'react';
import { addDays } from 'date-fns';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { BaseTimeGrid } from './BaseTimeGrid';

export function DayGrid() {
  const { selectedDate, dayCount } = useCalendarStore();

  const days = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(selectedDate, i));
  }, [selectedDate, dayCount]);

  return <BaseTimeGrid days={days} />;
}
