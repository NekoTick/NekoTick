export interface AppUsage {
  name: string;
  icon?: string;
  duration: number; // Seconds
}

export type TimeRange = 'day' | 'month' | 'year';
export type SourceType = 'app' | 'web';

export const timeRangeLabels: Record<TimeRange, string> = {
  day: 'By Day',
  month: 'By Month',
  year: 'By Year',
};
