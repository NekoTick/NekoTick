/**
 * Calendar Time Utilities
 * 
 * Centralized management of all time-related calculations
 * Supports configurable day start time
 */

/**
 * Default day start time in minutes (5:00 AM = 300 minutes)
 */
export const DEFAULT_DAY_START_MINUTES = 300;

/**
 * Convert actual minutes (0-1439) to display position minutes (0-1439)
 * Maps minutes so that dayStartMinutes appears at position 0
 */
export function minutesToDisplayPosition(actualMinutes: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  if (actualMinutes >= dayStartMinutes) {
    return actualMinutes - dayStartMinutes;
  }
  return actualMinutes + (1440 - dayStartMinutes);
}

/**
 * Convert display position minutes (0-1439) to actual minutes (0-1439)
 */
export function displayPositionToMinutes(displayMinutes: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const actualMinutes = displayMinutes + dayStartMinutes;
  return actualMinutes >= 1440 ? actualMinutes - 1440 : actualMinutes;
}

/**
 * Convert actual hour (0-23) to display position (0-23)
 * Maps hours so that day start hour appears at position 0
 */
export function hourToDisplayPosition(hour: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const dayStartHour = Math.floor(dayStartMinutes / 60);
  if (hour >= dayStartHour) {
    return hour - dayStartHour;
  }
  return hour + (24 - dayStartHour);
}

/**
 * Convert display position (0-23) to actual hour (0-23)
 */
export function displayPositionToHour(position: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const dayStartHour = Math.floor(dayStartMinutes / 60);
  const hour = position + dayStartHour;
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
 * Convert pixel position to minutes (adjusted for day start time)
 * Returns actual time minutes (0-1439) where 0 = midnight
 */
export function pixelsToMinutes(pixels: number, hourHeight: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const displayMinutes = (pixels / hourHeight) * 60;
  return displayPositionToMinutes(displayMinutes, dayStartMinutes);
}

/**
 * Convert pixel delta to minutes delta (for relative movement calculations)
 * This does NOT apply day start offset - used for drag deltas
 */
export function pixelsDeltaToMinutes(pixelsDelta: number, hourHeight: number): number {
  return (pixelsDelta / hourHeight) * 60;
}

/**
 * Convert minutes to pixel position (adjusted for day start time)
 */
export function minutesToPixels(minutes: number, hourHeight: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const displayMinutes = minutesToDisplayPosition(minutes, dayStartMinutes);
  return (displayMinutes / 60) * hourHeight;
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
 * Calculate event's vertical position in the grid (adjusted for day start time)
 */
export function calculateEventTop(startDate: number, hourHeight: number, dayStartMinutes: number = DEFAULT_DAY_START_MINUTES): number {
  const date = new Date(startDate);
  const actualMinutes = date.getHours() * 60 + date.getMinutes();
  return minutesToPixels(actualMinutes, hourHeight, dayStartMinutes);
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
 * Parse time string to minutes (0-1439)
 * Supports multiple formats:
 * - 24h: "14:30", "14：30" (Chinese colon), "1430"
 * - 12h: "2:30pm", "2:30 PM", "2:30下午", "2pm"
 * Returns null if parsing fails
 */
export function parseTimeString(input: string, _use24Hour: boolean = true): { hours: number; minutes: number } | null {
  if (!input) return null;
  
  // Normalize input: trim, lowercase, replace Chinese colon
  let str = input.trim().toLowerCase().replace(/：/g, ':');
  
  // Try to detect AM/PM indicators
  const pmIndicators = ['pm', 'p.m.', 'p.m', '下午', '晚上'];
  const amIndicators = ['am', 'a.m.', 'a.m', '上午', '早上', '凌晨'];
  
  let isPM = false;
  let isAM = false;
  
  for (const indicator of pmIndicators) {
    if (str.includes(indicator)) {
      isPM = true;
      str = str.replace(indicator, '').trim();
      break;
    }
  }
  
  if (!isPM) {
    for (const indicator of amIndicators) {
      if (str.includes(indicator)) {
        isAM = true;
        str = str.replace(indicator, '').trim();
        break;
      }
    }
  }
  
  let hours = 0;
  let minutes = 0;
  
  // Try HH:MM format
  const colonMatch = str.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
  } else {
    // Try HHMM format (4 digits)
    const fourDigitMatch = str.match(/^(\d{2})(\d{2})$/);
    if (fourDigitMatch) {
      hours = parseInt(fourDigitMatch[1], 10);
      minutes = parseInt(fourDigitMatch[2], 10);
    } else {
      // Try H or HH format (hours only)
      const hoursOnlyMatch = str.match(/^(\d{1,2})$/);
      if (hoursOnlyMatch) {
        hours = parseInt(hoursOnlyMatch[1], 10);
        minutes = 0;
      } else {
        return null;
      }
    }
  }
  
  // Apply AM/PM conversion
  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }
  
  // Validate
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return { hours, minutes };
}

/**
 * Format minutes (0-1439) to time string
 */
export function formatMinutesToTimeString(totalMinutes: number, use24Hour: boolean = true): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  
  if (use24Hour) {
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  } else {
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const ampm = hours < 12 ? 'AM' : 'PM';
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }
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

/**
 * Check if an event belongs to a "visual day" based on dayStartMinutes
 * 
 * A visual day runs from dayStartMinutes on one calendar day to dayStartMinutes on the next.
 * For example, if dayStartMinutes is 300 (5:00 AM):
 * - Visual day for Monday runs from Monday 5:00 AM to Tuesday 5:00 AM
 * - An event at Monday 11:00 PM belongs to Monday's visual day
 * - An event at Tuesday 2:00 AM also belongs to Monday's visual day
 * 
 * @param eventStartDate - The event's start timestamp
 * @param visualDay - The calendar date representing the visual day
 * @param dayStartMinutes - Minutes from midnight when the visual day starts
 */
export function isEventInVisualDay(
  eventStartDate: number,
  visualDay: Date,
  dayStartMinutes: number = DEFAULT_DAY_START_MINUTES
): boolean {
  const eventDate = new Date(eventStartDate);
  
  // Calculate the visual day's start and end timestamps
  const visualDayStart = new Date(visualDay);
  visualDayStart.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0);
  
  const visualDayEnd = new Date(visualDayStart);
  visualDayEnd.setDate(visualDayEnd.getDate() + 1);
  
  const eventTime = eventDate.getTime();
  
  return eventTime >= visualDayStart.getTime() && eventTime < visualDayEnd.getTime();
}

/**
 * Get the visual day boundaries for a given event timestamp
 * Returns the start and end timestamps of the visual day the event belongs to
 */
export function getVisualDayBoundaries(
  eventTimestamp: number,
  dayStartMinutes: number = DEFAULT_DAY_START_MINUTES
): { start: number; end: number } {
  const eventDate = new Date(eventTimestamp);
  const eventHour = eventDate.getHours();
  const eventMinute = eventDate.getMinutes();
  const eventTotalMinutes = eventHour * 60 + eventMinute;
  
  // Determine which visual day this event belongs to
  const visualDayStart = new Date(eventDate);
  
  if (eventTotalMinutes < dayStartMinutes) {
    // Event is in the "late night" portion (before dayStartMinutes)
    // It belongs to the previous calendar day's visual day
    visualDayStart.setDate(visualDayStart.getDate() - 1);
  }
  
  visualDayStart.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0);
  
  const visualDayEnd = new Date(visualDayStart);
  visualDayEnd.setDate(visualDayEnd.getDate() + 1);
  
  return {
    start: visualDayStart.getTime(),
    end: visualDayEnd.getTime(),
  };
}
