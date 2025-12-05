// Progress storage operations

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';
import type { ProgressData } from './types';

/**
 * Parse progress markdown file content
 */
function parseProgressMd(content: string): ProgressData[] {
  const items: ProgressData[] = [];
  const blocks = content.split('\n## ').slice(1); // Skip first block (title)
  
  for (const block of blocks) {
    const lines = block.split('\n');
    const item: Partial<ProgressData> = {};
    
    // First line is the title
    if (lines.length > 0 && lines[0].trim()) {
      item.title = lines[0].trim();
    }
    
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- id:')) {
        item.id = trimmed.slice(5).trim();
      } else if (trimmed.startsWith('- type:')) {
        item.type = trimmed.slice(7).trim() as 'progress' | 'counter';
      } else if (trimmed.startsWith('- note:')) {
        item.note = trimmed.slice(7).trim() || undefined;
      } else if (trimmed.startsWith('- direction:')) {
        item.direction = trimmed.slice(12).trim() as 'increment' | 'decrement';
      } else if (trimmed.startsWith('- total:')) {
        item.total = parseInt(trimmed.slice(8).trim()) || 0;
      } else if (trimmed.startsWith('- step:')) {
        item.step = parseInt(trimmed.slice(7).trim()) || 1;
      } else if (trimmed.startsWith('- unit:')) {
        item.unit = trimmed.slice(7).trim();
      } else if (trimmed.startsWith('- current:')) {
        item.current = parseInt(trimmed.slice(10).trim()) || 0;
      } else if (trimmed.startsWith('- todayCount:')) {
        item.todayCount = parseInt(trimmed.slice(13).trim()) || 0;
      } else if (trimmed.startsWith('- lastUpdateDate:')) {
        item.lastUpdateDate = trimmed.slice(17).trim() || undefined;
      } else if (trimmed.startsWith('- frequency:')) {
        item.frequency = trimmed.slice(12).trim() as 'daily' | 'weekly' | 'monthly';
      } else if (trimmed.startsWith('- createdAt:')) {
        item.createdAt = parseInt(trimmed.slice(12).trim()) || Date.now();
      }
    }
    
    if (item.id && item.type && item.title) {
      items.push(item as ProgressData);
    }
  }
  
  return items;
}

/**
 * Generate markdown content from progress items
 */
function generateProgressMd(items: ProgressData[]): string {
  const lines: string[] = ['# Progress List', ''];
  
  for (const item of items) {
    lines.push(`## ${item.title}`);
    lines.push(`- id: ${item.id}`);
    lines.push(`- type: ${item.type}`);
    if (item.note) lines.push(`- note: ${item.note}`);
    if (item.direction) lines.push(`- direction: ${item.direction}`);
    if (item.total !== undefined) lines.push(`- total: ${item.total}`);
    lines.push(`- step: ${item.step}`);
    lines.push(`- unit: ${item.unit}`);
    lines.push(`- current: ${item.current}`);
    lines.push(`- todayCount: ${item.todayCount}`);
    if (item.lastUpdateDate) lines.push(`- lastUpdateDate: ${item.lastUpdateDate}`);
    if (item.frequency) lines.push(`- frequency: ${item.frequency}`);
    lines.push(`- createdAt: ${item.createdAt}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Load all progress items from storage
 */
export async function loadProgress(): Promise<ProgressData[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const filePath = `${paths.progress}\\progress.md`;
    
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      return parseProgressMd(content);
    }
    
    return [];
  } catch (error) {
    console.error('Failed to load progress:', error);
    return [];
  }
}

/**
 * Save progress items to storage
 */
export async function saveProgress(items: ProgressData[]): Promise<void> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const filePath = `${paths.progress}\\progress.md`;
    const content = generateProgressMd(items);
    await writeTextFile(filePath, content);
  } catch (error) {
    console.error('Failed to save progress:', error);
  }
}
