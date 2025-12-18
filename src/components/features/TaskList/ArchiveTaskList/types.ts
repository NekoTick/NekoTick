import { StoreTask, Group } from '@/stores/types';
import { TimeView } from '@/lib/dateUtils';

export interface ArchiveTaskListProps {
  tasks: StoreTask[];
  groups: Group[];
  timeView: TimeView;
  selectedColors: string[];
  dayRange: number | 'all';
  weekRange: number | 'all';
  monthRange: number | 'all';
  deleteTask: (id: string) => void;
  renderTaskItem: (task: StoreTask, level: number) => React.ReactNode;
}

export type DateGroups = Record<string, Record<string, StoreTask[]>>;

export interface ArchiveStats {
  count: number;
  estimated: number;
  actual: number;
}
