import { useState, useEffect } from 'react';
import type { DayTimeData } from '@/lib/storage/types';
import { AppUsage, TimeRange, SourceType } from './types';

export function useTimeTracker() {
  const [allData, setAllData] = useState<DayTimeData[]>([]);
  const [appUsages, setAppUsages] = useState<AppUsage[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [sourceType, setSourceType] = useState<SourceType>('app');
  const [selectedApp, setSelectedApp] = useState<AppUsage | null>(null);

  // Load data - time tracker will be migrated to unified storage later
  useEffect(() => {
    // Placeholder - time tracker data loading
    setAllData([]);
  }, []);

  // Filter and aggregate data based on selection
  useEffect(() => {
    if (allData.length === 0) return;

    let filteredData: AppUsage[] = [];
    
    if (timeRange === 'day') {
      // Get first day's data (assuming index 0 is today/latest)
      const dayData = allData[0];
      if (dayData) {
        filteredData = sourceType === 'app' ? dayData.apps : dayData.websites;
      }
    } else if (timeRange === 'month' || timeRange === 'year') {
      // Merge all data
      const merged: Record<string, number> = {};
      for (const day of allData) {
        const items = sourceType === 'app' ? day.apps : day.websites;
        for (const item of items) {
          merged[item.name] = (merged[item.name] || 0) + item.duration;
        }
      }
      filteredData = Object.entries(merged)
        .map(([name, duration]) => ({ name, duration }))
        .sort((a, b) => b.duration - a.duration);
    }

    setAppUsages(filteredData);
    setTodayTotal(filteredData.reduce((sum, app) => sum + app.duration, 0));
  }, [allData, sourceType, timeRange]);

  const maxDuration = appUsages.length > 0 ? appUsages[0].duration : 1;

  return {
    allData,
    appUsages,
    todayTotal,
    timeRange,
    setTimeRange,
    sourceType,
    setSourceType,
    selectedApp,
    setSelectedApp,
    maxDuration
  };
}
