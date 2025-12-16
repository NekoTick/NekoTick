/**
 * Calendar Storage - Layered Architecture
 * 
 * Implements the "Gold Standard" persistence strategy:
 * 1. Metadata Layer: .nekotick/calendar.json (Source of Truth)
 * 2. User Layer: calendar/schedule.md (Human-readable backup)
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';

// ============================================================================ 
// Types
// ============================================================================ 

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: number; // timestamp
  endDate: number;   // timestamp
  isAllDay: boolean;
  color?: string;    // 'blue', 'red', 'green', etc.
  
  // Linkage to Task system (optional)
  taskId?: string;   
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}

interface CalendarMetadataFile {
  version: 1;
  lastModified: number;
  events: Record<string, CalendarEvent>;
}

// ============================================================================ 
// Logic
// ============================================================================ 

/**
 * Load all calendar events from the hidden metadata file
 */
export async function loadEvents(): Promise<CalendarEvent[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    
    // Ensure .nekotick folder exists
    if (!(await exists(paths.metadata))) {
      await mkdir(paths.metadata, { recursive: true });
    }
    
    const metadataPath = `${paths.metadata}\calendar.json`;
    
    if (await exists(metadataPath)) {
      const content = await readTextFile(metadataPath);
      const parsed = JSON.parse(content) as CalendarMetadataFile;
      
      if (parsed.version !== 1 || !parsed.events) return [];
      
      return Object.values(parsed.events);
    }
    
    return [];
  } catch (error) {
    console.error('[CalendarStorage] Failed to load events:', error);
    return [];
  }
}

/**
 * Save events to both JSON (app data) and Markdown (user data)
 */
export async function saveEvents(events: CalendarEvent[]): Promise<void> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    
    // 1. Prepare Paths
    if (!(await exists(paths.metadata))) {
      await mkdir(paths.metadata, { recursive: true });
    }
    const calendarDir = `${paths.base}\calendar`; // Create dedicated calendar folder
    if (!(await exists(calendarDir))) {
        await mkdir(calendarDir, { recursive: true });
    }

    const metadataPath = `${paths.metadata}\calendar.json`;
    const userFilePath = `${calendarDir}\schedule.md`;
    
    // 2. Write Metadata (JSON)
    const metadata: CalendarMetadataFile = {
      version: 1,
      lastModified: Date.now(),
      events: events.reduce((acc, event) => {
        acc[event.id] = event;
        return acc;
      }, {} as Record<string, CalendarEvent>),
    };
    await writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 3. Write User Content (Markdown)
    const markdown = generateUserMarkdown(events);
    await writeTextFile(userFilePath, markdown);
    
    console.log('[CalendarStorage] Persisted', events.length, 'events');
  } catch (error) {
    console.error('[CalendarStorage] Failed to save events:', error);
  }
}

/**
 * Generates a clean, chronological markdown schedule
 */
function generateUserMarkdown(events: CalendarEvent[]): string {
  // Sort by start time
  const sorted = [...events].sort((a, b) => a.startDate - b.startDate);
  
  const lines = [
    '# Schedule',
    '',
    '> Auto-generated from NekoTick Calendar.',
    ''
  ];

  let currentDay = '';

  for (const event of sorted) {
    const date = new Date(event.startDate);
    const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    if (dateStr !== currentDay) {
      currentDay = dateStr;
      lines.push(`## ${currentDay}`);
      lines.push('');
    }

    const timeStr = event.isAllDay 
      ? 'All Day' 
      : `${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.endDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

    lines.push(`- **${timeStr}**: ${event.title}`);
  }

  return lines.join('\n');
}
