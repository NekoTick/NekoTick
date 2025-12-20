import { useMemo } from 'react';
import { ActivityCalendar, type ThemeInput } from 'react-activity-calendar';
import { Tooltip } from 'react-tooltip';
import { useGroupStore } from '@/stores/useGroupStore';

// Zinc-based monochromatic theme
const calendarTheme: ThemeInput = {
  light: ['#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#3f3f46'],
  dark: ['#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa'],
};

interface ActivityData {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Transform tasks into activity calendar data format
 */
function useActivityData(): ActivityData[] {
  const { tasks } = useGroupStore();

  return useMemo(() => {
    // Get date range: last 365 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Count completions by date
    const countsByDate = new Map<string, number>();

    tasks.forEach((task) => {
      if (task.completed && task.completedAt) {
        const dateStr = new Date(task.completedAt).toISOString().split('T')[0];
        const current = countsByDate.get(dateStr) || 0;
        countsByDate.set(dateStr, current + 1);
      }
    });

    // Generate data for all days in range
    const data: ActivityData[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const count = countsByDate.get(dateStr) || 0;
      
      // Calculate level (0-4) based on count
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count >= 8) level = 4;
      else if (count >= 5) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      data.push({ date: dateStr, count, level });
      current.setDate(current.getDate() + 1);
    }

    return data;
  }, [tasks]);
}

export function ActivityHeatmap() {
  const data = useActivityData();
  
  // Use useMemo to cache statistics calculation, avoid recalculating on every render
  const { totalCompleted, currentStreak } = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    
    // Find streak
    let streak = 0;
    for (let i = 0; i < data.length; i++) {
      const dayData = data[data.length - 1 - i]; // Start from the most recent date
      if (dayData.count > 0) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    
    return { totalCompleted: total, currentStreak: streak };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Completed" value={totalCompleted} />
        <StatCard label="Current Streak" value={`${currentStreak} days`} />
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto pb-2">
        <ActivityCalendar
          data={data}
          theme={calendarTheme}
          blockSize={12}
          blockMargin={4}
          blockRadius={2}
          fontSize={12}
          showWeekdayLabels
          renderBlock={(block, activity) => (
            <g 
              data-tooltip-id="activity-tooltip" 
              data-tooltip-content={`${activity.count} task${activity.count !== 1 ? 's' : ''} on ${activity.date}`}
            >
              {block}
            </g>
          )}
        />
        <Tooltip id="activity-tooltip" />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
