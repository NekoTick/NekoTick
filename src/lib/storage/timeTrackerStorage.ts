// Time tracker storage operations

import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';
import type { DayTimeData, AppUsageData } from './types';

/**
 * Parse time tracker markdown file content
 */
function parseTimeTrackerMd(content: string): DayTimeData[] {
  const days: DayTimeData[] = [];
  const blocks = content.split('\n## ').filter(Boolean);
  
  for (const block of blocks) {
    const lines = block.startsWith('## ') ? block.slice(3).split('\n') : block.split('\n');
    let currentDate = '';
    let currentSection: 'apps' | 'websites' | null = null;
    const apps: AppUsageData[] = [];
    const websites: AppUsageData[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse date (format: 2024-11-30 or title line)
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        currentDate = trimmed;
        continue;
      }
      
      // Parse section headers (support both Chinese and English)
      if (trimmed.includes('应用使用时间') || trimmed.includes('App Usage')) {
        currentSection = 'apps';
        continue;
      }
      if (trimmed.includes('网站访问时间') || trimmed.includes('Website Usage')) {
        currentSection = 'websites';
        continue;
      }
      
      // Parse data line (format: - AppName: 1234s or - AppName: 1234 with Chinese seconds char)
      const dataMatch = trimmed.match(/^- (.+?):\s*(\d+)[秒s]?$/);
      if (dataMatch && currentSection) {
        const item = { name: dataMatch[1].trim(), duration: parseInt(dataMatch[2]) };
        if (currentSection === 'apps') {
          apps.push(item);
        } else {
          websites.push(item);
        }
      }
    }
    
    if (currentDate && (apps.length > 0 || websites.length > 0)) {
      days.push({ date: currentDate, apps, websites });
    }
  }
  
  return days;
}

/**
 * Load time tracker data from storage
 */
export async function loadTimeTracker(): Promise<DayTimeData[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const filePath = `${paths.timeTracker}\\time-log.md`;
    
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      return parseTimeTrackerMd(content);
    }
    
    return [];
  } catch (error) {
    console.error('Failed to load time tracker:', error);
    return [];
  }
}
