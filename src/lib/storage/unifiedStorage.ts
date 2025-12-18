/**
 * Unified Storage - Single File Architecture
 * 
 * All user data stored in one MD file (nekotick.md)
 * Technical metadata stored in .nekotick/data.json
 * 
 * Structure:
 * - nekotick.md: Human-readable markdown with all tasks, events, progress
 * - .nekotick/data.json: IDs, timestamps, settings, and other metadata
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

// ============================================================================
// Types
// ============================================================================

/**
 * 统一事项模型
 * 
 * 核心理念：世界上只有一种"事项"，它可以有时间属性，也可以没有。
 * - 有时间属性的事项会出现在日历视图中
 * - 没有时间属性的事项只出现在待办视图中
 * - 颜色系统统一，跨视图保持一致
 */
export interface UnifiedTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId: string;
  parentId: string | null;
  collapsed: boolean;
  
  // 统一颜色系统
  color: 'red' | 'yellow' | 'purple' | 'green' | 'blue' | 'default';
  
  // 时间属性（有时间 = 日历事件，无时间 = 纯待办）
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
  
  // 时间追踪
  estimatedMinutes?: number;
  actualMinutes?: number;
  
  // 日历相关（可选）
  location?: string;
  description?: string;
}

export interface UnifiedGroup {
  id: string;
  name: string;
  pinned: boolean;
  createdAt: number;
  updatedAt?: number;
}

// UnifiedEvent 已废弃，所有事项统一使用 UnifiedTask
// 保留类型别名以便渐进式迁移
export type UnifiedEvent = UnifiedTask;

export interface UnifiedProgress {
  id: string;
  type: 'progress' | 'counter';
  title: string;
  icon?: string;
  direction?: 'increment' | 'decrement';
  total?: number;
  step: number;
  unit: string;
  current: number;
  todayCount: number;
  lastUpdateDate?: string;
  history?: Record<string, number>;
  frequency?: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
  createdAt: number;
  archived?: boolean;
}

export interface UnifiedArchiveEntry {
  content: string;
  completedAt?: number;
  createdAt?: number;
  color?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  groupId: string;
}

export interface UnifiedArchiveSection {
  timestamp: number;
  tasks: UnifiedArchiveEntry[];
}

export interface UnifiedData {
  groups: UnifiedGroup[];
  tasks: UnifiedTask[];
  // events 已废弃，所有事项统一存储在 tasks 中
  // 有 startDate 的 task 会显示在日历中
  progress: UnifiedProgress[];
  archive: UnifiedArchiveSection[];
  settings: {
    timezone: number;
    viewMode: 'day' | 'week' | 'month';
    dayCount: number;
    hourHeight?: number;
  };
}

interface DataFile {
  version: 2;
  lastModified: number;
  data: UnifiedData;
}

// ============================================================================
// Path Management
// ============================================================================

let basePath: string | null = null;

async function getBasePath(): Promise<string> {
  if (basePath === null) {
    const appData = await appDataDir();
    basePath = appData.endsWith('\\') || appData.endsWith('/') 
      ? appData.slice(0, -1)
      : appData;
  }
  return basePath;
}

function getSeparator(path: string): string {
  return path.includes('\\') ? '\\' : '/';
}

async function ensureDirectories(): Promise<void> {
  const base = await getBasePath();
  const sep = getSeparator(base);
  const metadataDir = `${base}${sep}.nekotick`;
  
  if (!(await exists(metadataDir))) {
    await mkdir(metadataDir, { recursive: true });
  }
}

// ============================================================================
// Default Data
// ============================================================================

function getDefaultData(): UnifiedData {
  return {
    groups: [{
      id: 'default',
      name: 'Inbox',
      pinned: false,
      createdAt: Date.now(),
    }],
    tasks: [],
    progress: [],
    archive: [],
    settings: {
      timezone: 8,
      viewMode: 'day',
      dayCount: 1,
    },
  };
}

// ============================================================================
// Load & Save
// ============================================================================

export async function loadUnifiedData(): Promise<UnifiedData> {
  try {
    await ensureDirectories();
    const base = await getBasePath();
    const sep = getSeparator(base);
    const jsonPath = `${base}${sep}.nekotick${sep}data.json`;
    
    if (await exists(jsonPath)) {
      const content = await readTextFile(jsonPath);
      const parsed = JSON.parse(content) as DataFile;
      
      if (parsed.version === 2 && parsed.data) {
        console.log('[UnifiedStorage] Loaded data from JSON');
        return parsed.data;
      }
    }
    
    console.log('[UnifiedStorage] No existing data, returning defaults');
    return getDefaultData();
  } catch (error) {
    console.error('[UnifiedStorage] Failed to load:', error);
    return getDefaultData();
  }
}


// Debounce save to avoid frequent writes
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingData: UnifiedData | null = null;

export async function saveUnifiedData(data: UnifiedData): Promise<void> {
  pendingData = data;
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(async () => {
    if (!pendingData) return;
    
    try {
      await ensureDirectories();
      const base = await getBasePath();
      const sep = getSeparator(base);
      const jsonPath = `${base}${sep}.nekotick${sep}data.json`;
      const mdPath = `${base}${sep}nekotick.md`;
      
      // Save JSON (source of truth)
      const dataFile: DataFile = {
        version: 2,
        lastModified: Date.now(),
        data: pendingData,
      };
      await writeTextFile(jsonPath, JSON.stringify(dataFile, null, 2));
      
      // Save MD (human-readable view)
      const markdown = generateMarkdown(pendingData);
      await writeTextFile(mdPath, markdown);
      
      console.log('[UnifiedStorage] Saved data');
      pendingData = null;
    } catch (error) {
      console.error('[UnifiedStorage] Failed to save:', error);
    }
  }, 300); // 300ms debounce
}

// Force immediate save (for critical operations)
export async function saveUnifiedDataImmediate(data: UnifiedData): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingData = null;
  
  try {
    await ensureDirectories();
    const base = await getBasePath();
    const sep = getSeparator(base);
    const jsonPath = `${base}${sep}.nekotick${sep}data.json`;
    const mdPath = `${base}${sep}nekotick.md`;
    
    const dataFile: DataFile = {
      version: 2,
      lastModified: Date.now(),
      data,
    };
    await writeTextFile(jsonPath, JSON.stringify(dataFile, null, 2));
    
    const markdown = generateMarkdown(data);
    await writeTextFile(mdPath, markdown);
    
    console.log('[UnifiedStorage] Saved data (immediate)');
  } catch (error) {
    console.error('[UnifiedStorage] Failed to save:', error);
  }
}

// ============================================================================
// Markdown Generation
// ============================================================================

function generateMarkdown(data: UnifiedData): string {
  const lines: string[] = [];
  
  // Tasks Section
  lines.push('# Tasks');
  lines.push('');
  
  for (const group of data.groups) {
    const groupTasks = data.tasks.filter(t => t.groupId === group.id);
    if (groupTasks.length === 0 && group.id !== 'default') continue;
    
    lines.push(`## ${group.name}`);
    lines.push('');
    
    // Render top-level tasks
    const topLevel = groupTasks
      .filter(t => !t.parentId)
      .sort((a, b) => a.order - b.order);
    
    for (const task of topLevel) {
      renderTask(task, groupTasks, lines, '');
    }
    
    if (topLevel.length > 0) lines.push('');
  }
  
  // Calendar Section - 从 tasks 中筛选有时间属性的事项
  lines.push('# Calendar');
  lines.push('');
  
  const scheduledTasks = data.tasks
    .filter(t => t.startDate !== undefined)
    .sort((a, b) => (a.startDate || 0) - (b.startDate || 0));
  
  const tasksByDate = new Map<string, UnifiedTask[]>();
  
  for (const task of scheduledTasks) {
    const dateKey = new Date(task.startDate!).toISOString().split('T')[0];
    if (!tasksByDate.has(dateKey)) {
      tasksByDate.set(dateKey, []);
    }
    tasksByDate.get(dateKey)!.push(task);
  }
  
  for (const [date, tasks] of tasksByDate) {
    lines.push(`## ${date}`);
    for (const task of tasks) {
      const start = new Date(task.startDate!);
      const end = task.endDate ? new Date(task.endDate) : start;
      const timeStr = task.isAllDay 
        ? 'All Day'
        : `${formatTime(start)}-${formatTime(end)}`;
      const checkbox = task.completed ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${timeStr} ${task.content}`);
    }
    lines.push('');
  }
  
  // Progress Section
  lines.push('# Progress');
  lines.push('');
  
  const activeProgress = data.progress.filter(p => !p.archived);
  const archivedProgress = data.progress.filter(p => p.archived);
  
  for (const item of activeProgress) {
    const icon = item.icon || '○';
    const resetInfo = item.resetFrequency === 'daily' ? ' (↻)' : '';
    
    if (item.type === 'progress') {
      const percent = item.total ? Math.round((item.current / item.total) * 100) : 0;
      lines.push(`## ${icon} ${item.title}${resetInfo}`);
      lines.push(`${item.current} / ${item.total} ${item.unit} (${percent}%)`);
    } else {
      lines.push(`## ${icon} ${item.title}${resetInfo}`);
      lines.push(`${item.current} ${item.unit}`);
    }
    lines.push('');
  }
  
  if (archivedProgress.length > 0) {
    lines.push('### Archived');
    for (const item of archivedProgress) {
      const icon = item.icon || '○';
      lines.push(`- ~~${icon} ${item.title}~~`);
    }
    lines.push('');
  }
  
  // Archive Section
  if (data.archive.length > 0) {
    lines.push('# Archive');
    lines.push('');
    
    for (const section of data.archive) {
      const date = new Date(section.timestamp).toISOString().split('T')[0];
      lines.push(`## ${date}`);
      for (const task of section.tasks) {
        lines.push(`- [x] ${task.content}`);
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

function renderTask(task: UnifiedTask, allTasks: UnifiedTask[], lines: string[], indent: string): void {
  const checkbox = task.completed ? '[x]' : '[ ]';
  const color = task.color && task.color !== 'default' ? ` [${task.color}]` : '';
  lines.push(`${indent}- ${checkbox} ${task.content}${color}`);
  
  // Render children
  const children = allTasks
    .filter(t => t.parentId === task.id)
    .sort((a, b) => a.order - b.order);
  
  for (const child of children) {
    renderTask(child, allTasks, lines, indent + '  ');
  }
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
