// Task and Group storage operations

import { readTextFile, writeTextFile, readDir, exists, remove } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';
import type { TaskData, GroupData } from './types';

/**
 * Parse task markdown file content
 */
function parseTasksMd(content: string): { 
  name: string; 
  pinned: boolean; 
  tasks: TaskData[]; 
  createdAt: number; 
  updatedAt: number;
} {
  const lines = content.split('\n');
  let name = 'Unnamed';
  let pinned = false;
  let createdAt = Date.now();
  let updatedAt = Date.now();
  const tasks: TaskData[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Parse title
    if (line.startsWith('# ')) {
      name = line.slice(2).trim();
      continue;
    }
    
    // Parse metadata
    if (line.startsWith('pinned:')) {
      pinned = line.includes('true');
      continue;
    }
    if (line.startsWith('created:')) {
      createdAt = parseInt(line.split(':')[1].trim()) || Date.now();
      continue;
    }
    if (line.startsWith('updated:')) {
      updatedAt = parseInt(line.split(':')[1].trim()) || Date.now();
      continue;
    }
    
    // Parse task line (supports indentation for hierarchy)
    const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
    if (taskMatch) {
      const completed = taskMatch[2] === 'x';
      const taskContent = taskMatch[3];
      
      // Parse task metadata from HTML comment
      const metaMatch = taskContent.match(/^(.+?)\s*<!--(.+)-->$/);
      let id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let taskCreatedAt = Date.now();
      let order = tasks.length;
      let content = taskContent;
      let scheduledTime: string | undefined;
      let completedAt: number | undefined;
      let parentId: string | null = null;
      let collapsed = false;
      let priority: TaskData['priority'];
      let estimatedMinutes: number | undefined;
      let actualMinutes: number | undefined;
      
      if (metaMatch) {
        content = metaMatch[1].trim();
        const meta = metaMatch[2];
        const idMatch = meta.match(/id:([^,]+)/);
        const createdMatch = meta.match(/created:([^,]+)/);
        const orderMatch = meta.match(/order:([^,]+)/);
        const timeMatch = meta.match(/time:([^,]+)/);
        const completedAtMatch = meta.match(/completedAt:([^,]+)/);
        const parentMatch = meta.match(/parent:([^,]+)/);
        const collapsedMatch = meta.match(/collapsed:true/);
        const priorityMatch = meta.match(/priority:([^,]+)/);
        const estimatedMatch = meta.match(/estimated:([^,]+)/);
        const actualMatch = meta.match(/actual:([^,]+)/);
        
        if (idMatch) id = idMatch[1];
        if (createdMatch) taskCreatedAt = parseInt(createdMatch[1]) || Date.now();
        if (orderMatch) order = parseInt(orderMatch[1]) || tasks.length;
        if (timeMatch) scheduledTime = timeMatch[1];
        if (completedAtMatch) completedAt = parseInt(completedAtMatch[1]);
        if (parentMatch) parentId = parentMatch[1];
        if (collapsedMatch) collapsed = true;
        if (priorityMatch) priority = priorityMatch[1] as TaskData['priority'];
        
        // Validate time values before storing
        if (estimatedMatch) {
          const val = parseFloat(estimatedMatch[1]);
          if (isFinite(val) && val > 0 && val < 100000) {
            estimatedMinutes = val;
          }
        }
        if (actualMatch) {
          const val = parseFloat(actualMatch[1]);
          if (isFinite(val) && val > 0 && val < 100000) {
            actualMinutes = val;
          }
        }
      }
      
      tasks.push({
        id,
        content,
        completed,
        createdAt: taskCreatedAt,
        completedAt,
        scheduledTime,
        order,
        parentId,
        collapsed,
        priority,
        estimatedMinutes,
        actualMinutes,
      });
    }
  }
  
  return { name, pinned, tasks, createdAt, updatedAt };
}

/**
 * Generate markdown content from group data (supports hierarchy)
 */
function generateTasksMd(group: GroupData): string {
  const lines: string[] = [];
  
  lines.push(`# ${group.name}`);
  lines.push('');
  lines.push(`pinned: ${group.pinned}`);
  lines.push(`created: ${group.createdAt}`);
  lines.push(`updated: ${group.updatedAt}`);
  lines.push('');
  
  // Recursively render tasks with indentation
  const renderTask = (task: TaskData, indent: string = '') => {
    const checkbox = task.completed ? '[x]' : '[ ]';
    let meta = `id:${task.id},created:${task.createdAt},order:${task.order}`;
    if (task.scheduledTime) meta += `,time:${task.scheduledTime}`;
    if (task.completedAt) meta += `,completedAt:${task.completedAt}`;
    if (task.parentId) meta += `,parent:${task.parentId}`;
    if (task.collapsed) meta += `,collapsed:true`;
    if (task.priority && task.priority !== 'default') meta += `,priority:${task.priority}`;
    
    // Only serialize valid time values
    if (task.estimatedMinutes && isFinite(task.estimatedMinutes) && task.estimatedMinutes > 0) {
      meta += `,estimated:${task.estimatedMinutes}`;
    }
    if (task.actualMinutes && isFinite(task.actualMinutes) && task.actualMinutes > 0) {
      meta += `,actual:${task.actualMinutes}`;
    }
    
    lines.push(`${indent}- ${checkbox} ${task.content} <!--${meta}-->`);
    
    // Recursively render child tasks
    const children = group.tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => a.order - b.order);
    
    for (const child of children) {
      renderTask(child, indent + '  ');
    }
  };
  
  // Only render top-level tasks (those without parentId)
  const topLevelTasks = group.tasks
    .filter((t) => !t.parentId)
    .sort((a, b) => a.order - b.order);
  
  for (const task of topLevelTasks) {
    renderTask(task);
  }
  
  return lines.join('\n');
}

/**
 * Load a single group by ID (for lazy loading)
 */
export async function loadGroup(groupId: string): Promise<GroupData | null> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const filePath = `${paths.tasks}\\${groupId}.md`;
    
    if (!(await exists(filePath))) {
      return null;
    }
    
    const content = await readTextFile(filePath);
    const parsed = parseTasksMd(content);
    
    return {
      id: groupId,
      name: parsed.name,
      pinned: parsed.pinned,
      tasks: parsed.tasks,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    };
  } catch (error) {
    console.error(`Failed to load group ${groupId}:`, error);
    return null;
  }
}

/**
 * Load all groups from storage
 */
export async function loadGroups(): Promise<GroupData[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const entries = await readDir(paths.tasks);
    const groups: GroupData[] = [];
    
    for (const entry of entries) {
      if (entry.name?.endsWith('.md')) {
        const filePath = `${paths.tasks}\\${entry.name}`;
        const content = await readTextFile(filePath);
        const groupId = entry.name.replace('.md', '');
        const parsed = parseTasksMd(content);
        
        groups.push({
          id: groupId,
          name: parsed.name,
          pinned: parsed.pinned,
          tasks: parsed.tasks,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
        });
      }
    }
    
    // Create default group if none exist
    if (groups.length === 0) {
      const defaultGroup: GroupData = {
        id: 'default',
        name: 'Inbox',
        pinned: false,
        tasks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveGroup(defaultGroup);
      groups.push(defaultGroup);
    }
    
    return groups;
  } catch (error) {
    console.error('Failed to load groups:', error);
    // Return default group on error
    const defaultGroup: GroupData = {
      id: 'default',
      name: 'Inbox',
      pinned: false,
      tasks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await saveGroup(defaultGroup);
    } catch (saveError) {
      console.error('Failed to create default group:', saveError);
    }
    return [defaultGroup];
  }
}

/**
 * Save a group to storage
 */
export async function saveGroup(group: GroupData): Promise<void> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    const filePath = `${paths.tasks}\\${group.id}.md`;
    const content = generateTasksMd(group);
    await writeTextFile(filePath, content);
  } catch (error) {
    console.error('Failed to save group:', error);
    throw new Error('Save failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Delete a group from storage
 */
export async function deleteGroup(groupId: string): Promise<void> {
  try {
    const paths = await getPaths();
    const filePath = `${paths.tasks}\\${groupId}.md`;
    if (await exists(filePath)) {
      await remove(filePath);
    }
  } catch (error) {
    console.error('Failed to delete group:', error);
  }
}
