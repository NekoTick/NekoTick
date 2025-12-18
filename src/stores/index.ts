/**
 * Store Module Exports
 * 
 * Main entry point for all stores.
 * useUnifiedStore is the source of truth for all data.
 */

// Main unified store
export { useUnifiedStore, useStore } from './useUnifiedStore';
export type { ViewMode } from './useUnifiedStore';

// Compatibility wrappers
export { useGroupStore, useUIStore } from './useGroupStore';
export { useCalendarStore } from './useCalendarStore';
export { useProgressStore } from './useProgressStore';

// UI stores
export { useViewStore } from './useViewStore';
export { useToastStore } from './useToastStore';
export { useUndoStore } from './useUndoStore';

// Types
export type { Group, StoreTask, ArchiveTimeView, ItemColor } from './types';
export { PRIORITY_COLORS, ITEM_COLORS } from './types';

// Utilities
export { parseTimeString, parseTimeEstimation } from './timeParser';
export { collectTaskAndDescendants, calculateActualTime } from './taskUtils';
export { reorderTasksInGroup, crossStatusReorderTask, moveTaskBetweenGroups } from './reorderUtils';
