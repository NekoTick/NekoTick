// Calendar module exports
export { CalendarPage } from './CalendarPage';
export { ViewSwitcher as CalendarToolbar } from './features/ViewSwitcher';
export { ContextPanel as CalendarContextPanel } from './features/ContextPanel/ContextPanel';
// CalendarSidebar wrapper with proper padding
export { CalendarSidebarWrapper as CalendarSidebar } from './features/Sidebar/CalendarSidebarWrapper';
// Task panel for right sidebar
export { CalendarTaskPanel } from './features/TaskPanel';

// Hooks
export { useCalendarEvents } from './hooks/useCalendarEvents';
export { useCalendarKeyboard } from './hooks/useCalendarKeyboard';
export { useCalendarZoom } from './hooks/useCalendarZoom';
export { useAutoScroll } from './hooks/useAutoScroll';

// Utils
export { calculateEventLayout } from './utils/eventLayout';
export * from './utils/timeUtils';
