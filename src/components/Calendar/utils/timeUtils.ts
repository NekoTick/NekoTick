/**
 * Calendar Time Utilities
 * 
 * Centralized management of all time-related calculations
 */

/**
 * Day start hour - the hour at which a "day" begins in the calendar view
 * Hours before this are shown at the bottom (after midnight)
 * 
 * Example: DAY_START_HOUR = 5 means:
 * - Calendar shows: 5:00, 6:00, ..., 23:00, 0:00, 1:00, 2:00, 3:00, 4:00
 * - A day runs from 5:00 AM to 4:59 AM the next day
 */
export const DAY_START_HOUR = 5;

/**
 * Convert actual hour (0-23) to display position (0-23)
 * Maps hours so that DAY_START_HOUR appears at position 0
 */
export function hourToDisplayPosition(hour: number): number {
  if (hour >= DAY_START_HOUR) {
    return hour - DAY_START_HOUR;
  }
  return hour + (24 - DAY_START_HOUR);
}

/**
 * Convert display position (0-23) to actual hour (0-23)
 */
export function displayPositionToHour(position: number): number {
  const hour = position + DAY_START_HOUR;
  return hour >= 24 ? hour - 24 : hour;
}

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
 * Convert pixel position to minutes (adjusted for day start hour)
 */
export function pixelsToMinutes(pixels: number, hourHeight: number): number {
  const displayMinutes = (pixels / hourHeight) * 60;
  // Convert display minutes to actual minutes
  const displayHour = Math.floor(displayMinutes / 60);
  const minutesPart = displayMinutes % 60;
  const actualHour = displayPositionToHour(displayHour);
  return actualHour * 60 + minutesPart;
}

/**
 * Convert minutes to pixel position (adjusted for day start hour)
 */
export function minutesToPixels(minutes: number, hourHeight: number): number {
  const hour = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  const displayPosition = hourToDisplayPosition(hour);
  return (displayPosition * 60 + minutesPart) / 60 * hourHeight;
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
 * Calculate event's vertical position in the grid (adjusted for day start hour)
 */
export function calculateEventTop(startDate: number, hourHeight: number): number {
  const date = new Date(startDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const displayPosition = hourToDisplayPosition(hours);
  return displayPosition * hourHeight + (minutes / 60) * hourHeight;
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
