// Storage module - unified exports

// Types
export type { 
  TaskData, 
  GroupData, 
  ProgressData, 
  AppUsageData, 
  DayTimeData,
  ArchiveSection,
} from './types';

// Path utilities
export { 
  getBasePath, 
  getPaths, 
  ensureDirectories,
} from './paths';

// Task storage
export { 
  loadGroup, 
  loadGroups, 
  saveGroup, 
  deleteGroup,
} from './taskStorage';

// Progress storage
export { 
  loadProgress, 
  saveProgress,
} from './progressStorage';

// Time tracker storage
export { 
  loadTimeTracker,
} from './timeTrackerStorage';

// Archive storage
export { 
  archiveTasks, 
  loadArchiveData, 
  verifyArchive,
} from './archiveStorage';
