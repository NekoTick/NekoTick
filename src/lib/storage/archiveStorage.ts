// Archive storage operations

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';
import type { TaskData, ArchiveSection } from './types';

// Archive section header pattern (supports both Chinese and English)
const ARCHIVE_HEADER_SPLIT = /\n## (?:Archived at|归档于) /;

/**
 * Archive tasks to archive file (atomic operation)
 */
export async function archiveTasks(groupId: string, tasks: TaskData[]): Promise<void> {
  if (tasks.length === 0) return;
  
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const archiveFilePath = `${paths.archive}\\${groupId}.md`;
    
    // Read existing archive content if exists
    let existingContent = '';
    if (await exists(archiveFilePath)) {
      existingContent = await readTextFile(archiveFilePath);
    }
    
    // Generate new archive entry with timestamp
    const timestamp = new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
    });
    
    // Add count marker for verification
    let archiveEntries = `\n## Archived at ${timestamp} [Count: ${tasks.length}]\n\n`;
    tasks.forEach(task => {
      const estimatedStr = task.estimatedMinutes ? ` [Est: ${task.estimatedMinutes}m]` : '';
      const actualStr = task.actualMinutes ? ` [Act: ${task.actualMinutes}m]` : '';
      const completedStr = task.completedAt ? ` (Completed: ${new Date(task.completedAt).toLocaleString('en-US')})` : '';
      const createdStr = task.createdAt ? ` (Created: ${task.createdAt})` : '';
      const priorityStr = task.priority && task.priority !== 'default' ? ` [Priority: ${task.priority}]` : '';
      archiveEntries += `- [x] ${task.content}${estimatedStr}${actualStr}${completedStr}${createdStr}${priorityStr}\n`;
    });
    
    // Write to archive file (append mode)
    const newContent = existingContent + archiveEntries;
    await writeTextFile(archiveFilePath, newContent);
    
    console.log(`[Archive] Wrote ${tasks.length} tasks to ${archiveFilePath}`);
  } catch (error) {
    console.error('[Archive] Write failed:', error);
    throw error;
  }
}

/**
 * Load archive data for display
 * @param groupId - Group ID to load archive for
 * @param maxDays - Limit to recent N days, null means load all
 */
export async function loadArchiveData(
  groupId: string, 
  maxDays: number | null = null
): Promise<ArchiveSection[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const archiveFilePath = `${paths.archive}\\${groupId}.md`;
    
    console.log(`[Archive] Looking for archive file: ${archiveFilePath}`);
    
    if (!(await exists(archiveFilePath))) {
      console.log(`[Archive] Archive file does not exist for group ${groupId}`);
      return [];
    }
    
    const content = await readTextFile(archiveFilePath);
    console.log(`[Archive] Read archive file, content length: ${content.length}`);
    
    // Split by archive section (support both Chinese and English headers)
    const sections = content.split(ARCHIVE_HEADER_SPLIT).filter(s => s.trim());
    if (sections.length === 0) return [];
    
    const result: ArchiveSection[] = [];
    const now = Date.now();
    const cutoffTime = maxDays !== null ? now - maxDays * 24 * 60 * 60 * 1000 : 0;
    
    for (const section of sections) {
      // Extract timestamp
      const timestampMatch = section.match(/^(.+?)\s*\[Count: \d+\]/);
      if (!timestampMatch) continue;
      
      const timestamp = timestampMatch[1].trim();
      
      // If time limit is set, check if section is within range
      if (maxDays !== null) {
        const sectionDate = new Date(timestamp);
        if (!isNaN(sectionDate.getTime()) && sectionDate.getTime() < cutoffTime) {
          console.log(`[Archive] Skipping section ${timestamp} - older than ${maxDays} days`);
          continue;
        }
      }
      
      // Extract tasks
      const taskLines = section.split('\n').filter(line => /^- \[x\]/.test(line));
      const tasks = taskLines.map(line => {
        // Parse task content
        const contentMatch = line.match(/^- \[x\] (.+)$/);
        if (!contentMatch) return null;
        
        let fullContent = contentMatch[1];
        
        // Extract estimated time (support both formats)
        const estimatedMatch = fullContent.match(/\[(?:Est|预估): ([^\]]+)\]/);
        const estimated = estimatedMatch ? estimatedMatch[1] : undefined;
        if (estimatedMatch) {
          fullContent = fullContent.replace(estimatedMatch[0], '').trim();
        }
        
        // Extract actual time (support both formats)
        const actualMatch = fullContent.match(/\[(?:Act|实际): ([^\]]+)\]/);
        const actual = actualMatch ? actualMatch[1] : undefined;
        if (actualMatch) {
          fullContent = fullContent.replace(actualMatch[0], '').trim();
        }
        
        // Extract completion time (support both formats)
        const completedMatch = fullContent.match(/\((?:Completed|完成于): ([^\)]+)\)/);
        const completedAt = completedMatch ? completedMatch[1] : undefined;
        if (completedMatch) {
          fullContent = fullContent.replace(completedMatch[0], '').trim();
        }
        
        // Extract creation time (support both formats)
        const createdMatch = fullContent.match(/\((?:Created|创建于): (\d+)\)/);
        const createdAt = createdMatch ? parseInt(createdMatch[1], 10) : undefined;
        if (createdMatch) {
          fullContent = fullContent.replace(createdMatch[0], '').trim();
        }
        
        // Extract priority (support both formats)
        const priorityMatch = fullContent.match(/\[(?:Priority|优先级): ([^\]]+)\]/);
        const priority = priorityMatch ? priorityMatch[1] : undefined;
        if (priorityMatch) {
          fullContent = fullContent.replace(priorityMatch[0], '').trim();
        }
        
        return {
          content: fullContent,
          estimated,
          actual,
          completedAt,
          createdAt,
          priority,
        };
      }).filter((t): t is NonNullable<typeof t> => t !== null);
      
      if (tasks.length > 0) {
        result.push({ timestamp, tasks });
      }
    }
    
    // Reverse order, newest first
    return result.reverse();
  } catch (error) {
    console.error('Failed to load archive data:', error);
    return [];
  }
}

/**
 * Verify archive file was written successfully
 */
export async function verifyArchive(groupId: string, expectedCount: number): Promise<boolean> {
  try {
    const paths = await getPaths();
    const archiveFilePath = `${paths.archive}\\${groupId}.md`;
    
    // Check if file exists
    if (!(await exists(archiveFilePath))) {
      console.error('[Archive] Verification failed: file does not exist');
      return false;
    }
    
    // Read file content
    const content = await readTextFile(archiveFilePath);
    
    // Find last archive block (support both formats)
    const sections = content.split(ARCHIVE_HEADER_SPLIT);
    if (sections.length < 2) {
      console.error('[Archive] Verification failed: no archive section found');
      return false;
    }
    
    const lastSection = sections[sections.length - 1];
    
    // Extract declared count
    const countMatch = lastSection.match(/\[Count: (\d+)\]/);
    if (!countMatch) {
      console.error('[Archive] Verification failed: no count marker found');
      return false;
    }
    const declaredCount = parseInt(countMatch[1]);
    
    // Extract actual task line count (only count lines starting with - [x])
    const taskLines = lastSection.split('\n').filter(line => /^- \[x\]/.test(line));
    const actualCount = taskLines.length;
    
    // Verify declared count matches actual and expected count
    if (declaredCount !== expectedCount || actualCount !== expectedCount) {
      console.error(`[Archive] Verification failed: expected ${expectedCount}, declared ${declaredCount}, found ${actualCount}`);
      return false;
    }
    
    console.log(`[Archive] Verification passed: ${expectedCount} tasks confirmed`);
    return true;
  } catch (error) {
    console.error('[Archive] Verification error:', error);
    return false;
  }
}
