import { readTextFile, writeTextFile, mkdir, readDir, exists, remove } from '@tauri-apps/plugin-fs';
import { desktopDir } from '@tauri-apps/api/path';

// TODO: Replace with dynamic path in production
// For now, using desktop path for testing
// In production, should use: await desktopDir() + '\\NekoTick'
const BASE_PATH = 'C:\\Users\\vladelaina\\Desktop\\NekoTick';

export const PATHS = {
  base: BASE_PATH,
  tasks: `${BASE_PATH}\\tasks`,
  progress: `${BASE_PATH}\\progress`,
  timeTracker: `${BASE_PATH}\\time-tracker`,
};

// Helper function for future migration to dynamic paths
export async function initializeBasePath(): Promise<string> {
  const desktop = await desktopDir();
  return `${desktop}NekoTick`;
}

// 确保目录存在
export async function ensureDirectories() {
  try {
    for (const path of Object.values(PATHS)) {
      if (!(await exists(path))) {
        await mkdir(path, { recursive: true });
      }
    }
  } catch (error) {
    console.error('Failed to create directories:', error);
  }
}

// ============ 待办任务相关 ============

export interface TaskData {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string;
  order: number;
  parentId: string | null;   // Parent task ID for hierarchical structure
  collapsed: boolean;        // Whether children are hidden
  priority?: 'red' | 'yellow' | 'purple' | 'green' | 'default';  // Task priority
}

export interface GroupData {
  id: string;
  name: string;
  pinned: boolean;
  tasks: TaskData[];
  createdAt: number;
  updatedAt: number;
}

// 解析任务 MD 文件
function parseTasksMd(content: string, _groupId: string): { name: string; pinned: boolean; tasks: TaskData[]; createdAt: number; updatedAt: number } {
  const lines = content.split('\n');
  let name = '未命名';
  let pinned = false;
  let createdAt = Date.now();
  let updatedAt = Date.now();
  const tasks: TaskData[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 解析标题
    if (line.startsWith('# ')) {
      name = line.slice(2).trim();
      continue;
    }
    
    // 解析元数据
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
    
    // 解析任务（支持缩进层级）
    const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
    if (taskMatch) {
      // const indent = taskMatch[1]; // TODO: 未来可用于从缩进推断层级关系
      const completed = taskMatch[2] === 'x';
      const taskContent = taskMatch[3];
      
      // 尝试解析任务元数据
      const metaMatch = taskContent.match(/^(.+?)\s*<!--(.+)-->$/);
      let id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let taskCreatedAt = Date.now();
      let order = tasks.length;
      let content = taskContent;
      let scheduledTime: string | undefined;
      let completedAt: number | undefined;
      let parentId: string | null = null;
      let collapsed = false;
      let priority: 'red' | 'yellow' | 'purple' | 'green' | 'default' | undefined;
      
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
        
        if (idMatch) id = idMatch[1];
        if (createdMatch) taskCreatedAt = parseInt(createdMatch[1]) || Date.now();
        if (orderMatch) order = parseInt(orderMatch[1]) || tasks.length;
        if (timeMatch) scheduledTime = timeMatch[1];
        if (completedAtMatch) completedAt = parseInt(completedAtMatch[1]);
        if (parentMatch) parentId = parentMatch[1];
        if (collapsedMatch) collapsed = true;
        if (priorityMatch) priority = priorityMatch[1] as any;
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
      });
    }
  }
  
  return { name, pinned, tasks, createdAt, updatedAt };
}

// 生成任务 MD 文件 (支持层级结构)
function generateTasksMd(group: GroupData): string {
  const lines: string[] = [];
  
  lines.push(`# ${group.name}`);
  lines.push('');
  lines.push(`pinned: ${group.pinned}`);
  lines.push(`created: ${group.createdAt}`);
  lines.push(`updated: ${group.updatedAt}`);
  lines.push('');
  
  // 递归生成任务（带缩进）
  const renderTask = (task: any, indent: string = '') => {
    const checkbox = task.completed ? '[x]' : '[ ]';
    let meta = `id:${task.id},created:${task.createdAt},order:${task.order}`;
    if (task.scheduledTime) meta += `,time:${task.scheduledTime}`;
    if (task.completedAt) meta += `,completedAt:${task.completedAt}`;
    if (task.parentId) meta += `,parent:${task.parentId}`;
    if (task.collapsed) meta += `,collapsed:true`;
    if (task.priority && task.priority !== 'default') meta += `,priority:${task.priority}`;
    
    lines.push(`${indent}- ${checkbox} ${task.content} <!--${meta}-->`);

    
    // 递归渲染子任务
    const children = group.tasks
      .filter((t: any) => t.parentId === task.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    for (const child of children) {
      renderTask(child, indent + '  ');
    }
  };
  
  // 只渲染顶层任务（没有 parentId 的）
  const topLevelTasks = group.tasks
    .filter((t: any) => !t.parentId)
    .sort((a: any, b: any) => a.order - b.order);
  
  for (const task of topLevelTasks) {
    renderTask(task);
  }
  
  return lines.join('\n');
}

// 读取所有分组
export async function loadGroups(): Promise<GroupData[]> {
  try {
    await ensureDirectories();
    
    const entries = await readDir(PATHS.tasks);
    const groups: GroupData[] = [];
    
    for (const entry of entries) {
      if (entry.name?.endsWith('.md')) {
        const filePath = `${PATHS.tasks}\\${entry.name}`;
        const content = await readTextFile(filePath);
        const groupId = entry.name.replace('.md', '');
        const parsed = parseTasksMd(content, groupId);
        
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
    
    // 如果没有分组，创建默认分组
    if (groups.length === 0) {
      const defaultGroup: GroupData = {
        id: 'default',
        name: '收集箱',
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
      name: '收集箱',
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

// 保存分组
export async function saveGroup(group: GroupData): Promise<void> {
  try {
    await ensureDirectories();
    const filePath = `${PATHS.tasks}\\${group.id}.md`;
    const content = generateTasksMd(group);
    await writeTextFile(filePath, content);
  } catch (error) {
    console.error('Failed to save group:', error);
    throw new Error('保存失败：' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 删除分组
export async function deleteGroup(groupId: string): Promise<void> {
  try {
    const filePath = `${PATHS.tasks}\\${groupId}.md`;
    if (await exists(filePath)) {
      await remove(filePath);
    }
  } catch (error) {
    console.error('Failed to delete group:', error);
  }
}

// ============ 进度相关 ============

export interface ProgressData {
  id: string;
  type: 'progress' | 'counter';
  title: string;
  note?: string;
  direction?: 'increment' | 'decrement';
  total?: number;
  step: number;
  unit: string;
  current: number;
  todayCount: number;
  lastUpdateDate?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  startDate?: number;
  endDate?: number;
  createdAt: number;
}

// 解析进度 MD 文件
function parseProgressMd(content: string): ProgressData[] {
  const items: ProgressData[] = [];
  const blocks = content.split('\n## ').slice(1); // 跳过第一个块（标题）
  
  for (const block of blocks) {
    const lines = block.split('\n');
    const item: Partial<ProgressData> = {};
    
    // 第一行是标题
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

// 生成进度 MD 文件
function generateProgressMd(items: ProgressData[]): string {
  const lines: string[] = ['# 进度列表', ''];
  
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

// 读取所有进度
export async function loadProgress(): Promise<ProgressData[]> {
  try {
    await ensureDirectories();
    const filePath = `${PATHS.progress}\\progress.md`;
    
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

// 保存进度
export async function saveProgress(items: ProgressData[]): Promise<void> {
  try {
    await ensureDirectories();
    const filePath = `${PATHS.progress}\\progress.md`;
    const content = generateProgressMd(items);
    await writeTextFile(filePath, content);
  } catch (error) {
    console.error('Failed to save progress:', error);
  }
}

// ============ 时间追踪相关 ============

export interface AppUsageData {
  name: string;
  duration: number; // 秒
}

export interface DayTimeData {
  date: string;
  apps: AppUsageData[];
  websites: AppUsageData[];
}

// 解析时间追踪 MD 文件
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
      
      // 解析日期 (格式: 2024-11-30 或标题行)
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        currentDate = trimmed;
        continue;
      }
      
      // 解析section
      if (trimmed.includes('应用使用时间')) {
        currentSection = 'apps';
        continue;
      }
      if (trimmed.includes('网站访问时间')) {
        currentSection = 'websites';
        continue;
      }
      
      // 解析数据行 (格式: - AppName: 1234秒)
      const dataMatch = trimmed.match(/^- (.+?):\s*(\d+)秒?$/);
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

// 读取时间追踪数据
export async function loadTimeTracker(): Promise<DayTimeData[]> {
  try {
    await ensureDirectories();
    const filePath = `${PATHS.timeTracker}\\time-log.md`;
    
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
