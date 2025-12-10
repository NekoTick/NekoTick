/**
 * Layered Storage - Separating user-readable content from application metadata
 * 
 * Philosophy: User files should be clean and human-readable.
 * All technical metadata lives in a hidden .nekotick folder.
 * 
 * User sees:     "📚 读书计划: 45 / 100 页"
 * App stores:    { id, history, createdAt, ... } in .nekotick/
 */

import type { ProgressData } from './types';

// ============================================================================
// Types  
// ============================================================================

/** Application metadata fields stored in .nekotick/progress.json */
interface ProgressMetadata {
  id: string;
  type: 'progress' | 'counter';
  direction?: 'increment' | 'decrement';
  step: number;
  todayCount: number;
  lastUpdateDate?: string;
  history?: Record<string, number>;
  startDate?: number;
  endDate?: number;
  createdAt: number;
  archived?: boolean;
  order?: number;
}

// ============================================================================
// User Content Layer - Clean, Human-Readable Markdown
// ============================================================================

/**
 * Generate beautiful, minimal markdown that users can read with any tool
 */
export function generateUserMarkdown(items: ProgressData[]): string {
  const lines: string[] = [
    '# Progress',
    '',
    '> Your journey, your milestones.',
    '',
  ];

  // Separate active and archived items
  const active = items.filter(i => !i.archived);
  const archived = items.filter(i => i.archived);

  if (active.length > 0) {
    for (const item of active) {
      const icon = item.icon || '○';
      
      if (item.type === 'progress') {
        const percent = item.total ? Math.round((item.current / item.total) * 100) : 0;
        lines.push(`## ${icon} ${item.title}`);
        lines.push(`${item.current} / ${item.total} ${item.unit} (${percent}%)`);
        lines.push('');
      } else {
        // Counter type
        lines.push(`## ${icon} ${item.title}`);
        lines.push(`${item.current} ${item.unit}`);
        if (item.frequency) {
          lines.push(`*${item.frequency}*`);
        }
        lines.push('');
      }
    }
  }

  if (archived.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('### Archived');
    lines.push('');
    
    for (const item of archived) {
      const icon = item.icon || '○';
      if (item.type === 'progress') {
        lines.push(`- ~~${icon} ${item.title}~~ — ${item.current}/${item.total} ${item.unit}`);
      } else {
        lines.push(`- ~~${icon} ${item.title}~~ — ${item.current} ${item.unit}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Metadata Layer - Application-Only Data in JSON
// ============================================================================

/** Extended metadata that includes all fields for archived items */
export interface ExtendedMetadataFile {
  version: 1;
  lastModified: number;
  items: Record<string, ProgressMetadata & {
    icon?: string;
    total?: number;
    unit?: string;
    current?: number;
    frequency?: string;
  }>;
}

/**
 * Generate extended metadata that preserves all fields (for archived items)
 */
export function generateExtendedMetadataJson(items: ProgressData[]): string {
  const metadata: ExtendedMetadataFile = {
    version: 1,
    lastModified: Date.now(),
    items: {},
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    metadata.items[item.title] = {
      id: item.id,
      type: item.type,
      direction: item.direction,
      step: item.step,
      todayCount: item.todayCount,
      lastUpdateDate: item.lastUpdateDate,
      history: item.history,
      startDate: item.startDate,
      endDate: item.endDate,
      createdAt: item.createdAt,
      archived: item.archived,
      order: i,
      // Extended fields for full reconstruction
      icon: item.icon,
      total: item.total,
      unit: item.unit,
      current: item.current,
      frequency: item.frequency,
    };
  }

  return JSON.stringify(metadata, null, 2);
}

/**
 * Parse extended metadata and reconstruct full items
 */
export function parseExtendedMetadataJson(content: string): ProgressData[] {
  try {
    const parsed = JSON.parse(content) as ExtendedMetadataFile;
    if (parsed.version !== 1 || !parsed.items) return [];

    const items: ProgressData[] = [];
    
    for (const [title, meta] of Object.entries(parsed.items)) {
      items.push({
        id: meta.id,
        type: meta.type,
        title: title,
        icon: meta.icon,
        direction: meta.direction,
        total: meta.total,
        step: meta.step,
        unit: meta.unit || '',
        current: meta.current || 0,
        todayCount: meta.todayCount,
        lastUpdateDate: meta.lastUpdateDate,
        history: meta.history,
        startDate: meta.startDate,
        endDate: meta.endDate,
        createdAt: meta.createdAt,
        archived: meta.archived,
        frequency: meta.frequency as 'daily' | 'weekly' | 'monthly' | undefined,
      });
    }

    // Sort by order
    items.sort((a, b) => {
      const orderA = parsed.items[a.title]?.order ?? Infinity;
      const orderB = parsed.items[b.title]?.order ?? Infinity;
      return orderA - orderB;
    });

    return items;
  } catch {
    return [];
  }
}
