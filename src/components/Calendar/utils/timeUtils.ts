/**
 * Calendar Time Utilities
 * 
 * Centralized management of all time-related calculations
 */

/**
 * Dynamically calculate time precision (minutes) based on zoom level
 */
export function getSnapMinutes(hourHeight: number): number {
  if (hourHeight >= 400) return 1;
  if (hourHeight >= 256) return 5;
  if (hourHeight >= 128) return 10;
  if (hourHeight >= 64) return 15;
  return 30;
}

/**
 * Convert pixel position to minutes
 */
export function pixelsToMinutes(pixels: number, hourHeight: number): number {
  return (pixels / hourHeight) * 60;
}

/**
 * Convert minutes to pixel position
 */
export function minutesToPixels(minutes: number, hourHeight: number): number {
  return (minutes / 60) * hourHeight;
}

/**
 * Snap minutes to interval
 */
export function snapMinutes(minutes: number, snapInterval: number): number {
  return Math.round(minutes / snapInterval) * snapInterval;
}

/**
 * Get minutes offset from midnight for a timestamp
 */
export function getMinutesFromMidnight(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Calculate event's vertical position in the grid
 */
export function calculateEventTop(startDate: number, hourHeight: number): number {
  const date = new Date(startDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * hourHeight + (minutes / 60) * hourHeight;
}

/**
 * Calculate event's height in the grid
 */
export function calculateEventHeight(startDate: number, endDate: number, hourHeight: number): number {
  const durationMs = endDate - startDate;
  const durationMinutes = durationMs / (1000 * 60);
  return (durationMinutes / 60) * hourHeight;
}

/**
 * Constants configuration
 */
export const CALENDAR_CONSTANTS = {
  GUTTER_WIDTH: 60,
  GAP: 3,
  RESIZE_HANDLE_HEIGHT: 6,
  AUTO_SCROLL_THRESHOLD: 5,
  AUTO_SCROLL_SPEED: 10,
  MIN_HOUR_HEIGHT: 32,
  MAX_HOUR_HEIGHT: 800,
  ZOOM_FACTOR: 1.15,
  MIN_EVENT_DURATION_MINUTES: 5,
} as const;
