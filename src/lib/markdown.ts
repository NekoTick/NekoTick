import { nanoid } from 'nanoid';
import type { Task } from '@/types';

/**
 * Markdown Parser for GitHub Flavored Markdown Task Lists
 * 
 * Format:
 * - [ ] Uncompleted task
 * - [x] Completed task
 * 
 * Extended format with inline metadata tags:
 * - [ ] Task content {est:30} {act:45} {done:2024-01-15} <!-- id:abc123 created:1234567890 -->
 * 
 * Inline Tags:
 * - {est:N}     - Estimated time in minutes
 * - {act:N}     - Actual time in minutes  
 * - {done:DATE} - Completion date (YYYY-MM-DD)
 */

// Main task regex - captures checkbox, content (with possible tags), and metadata comment
const TASK_REGEX = /^- \[([ xX])\] (.+?)(?:\s*<!--\s*id:(\S+)\s+created:(\d+)\s*-->)?$/;

// Inline tag patterns
const TAG_PATTERNS = {
  est: /\{est:(\d+)\}/,
  act: /\{act:(\d+)\}/,
  done: /\{done:([\d-]+)\}/,
};

const METADATA_TEMPLATE = (id: string, created: number) => 
  `<!-- id:${id} created:${created} -->`;

/**
 * Extract inline tags from task content and return clean content + parsed values
 */
function parseInlineTags(rawContent: string): {
  content: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  completedAt?: string;
} {
  let content = rawContent;
  let estimatedMinutes: number | undefined;
  let actualMinutes: number | undefined;
  let completedAt: string | undefined;

  // Extract {est:N}
  const estMatch = content.match(TAG_PATTERNS.est);
  if (estMatch) {
    estimatedMinutes = parseInt(estMatch[1], 10);
    content = content.replace(TAG_PATTERNS.est, '');
  }

  // Extract {act:N}
  const actMatch = content.match(TAG_PATTERNS.act);
  if (actMatch) {
    actualMinutes = parseInt(actMatch[1], 10);
    content = content.replace(TAG_PATTERNS.act, '');
  }

  // Extract {done:DATE}
  const doneMatch = content.match(TAG_PATTERNS.done);
  if (doneMatch) {
    completedAt = doneMatch[1];
    content = content.replace(TAG_PATTERNS.done, '');
  }

  return {
    content: content.trim(),
    estimatedMinutes,
    actualMinutes,
    completedAt,
  };
}

/**
 * Build inline tags string from task metadata
 */
function buildInlineTags(task: Task): string {
  const tags: string[] = [];
  
  if (task.estimatedMinutes !== undefined) {
    tags.push(`{est:${task.estimatedMinutes}}`);
  }
  if (task.actualMinutes !== undefined) {
    tags.push(`{act:${task.actualMinutes}}`);
  }
  if (task.completedAt) {
    tags.push(`{done:${task.completedAt}}`);
  }
  
  return tags.length > 0 ? ' ' + tags.join(' ') : '';
}

/**
 * Parse Markdown string to Task array
 */
export function parseMarkdown(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(TASK_REGEX);
    if (match) {
      const [, checkbox, rawContent, existingId, existingCreated] = match;
      
      // Parse inline tags from content
      const { content: cleanContent, estimatedMinutes, actualMinutes, completedAt } = 
        parseInlineTags(rawContent);
      
      tasks.push({
        id: existingId || nanoid(),
        content: cleanContent,
        isDone: checkbox.toLowerCase() === 'x',
        createdAt: existingCreated ? parseInt(existingCreated, 10) : Date.now(),
        estimatedMinutes,
        actualMinutes,
        completedAt,
      });
    }
  }

  return tasks;
}

/**
 * Serialize Task array to Markdown string
 */
export function serializeToMarkdown(tasks: Task[]): string {
  const lines = tasks.map((task) => {
    const checkbox = task.isDone ? 'x' : ' ';
    const inlineTags = buildInlineTags(task);
    const metadata = METADATA_TEMPLATE(task.id, task.createdAt);
    return `- [${checkbox}] ${task.content}${inlineTags} ${metadata}`;
  });

  return lines.join('\n') + '\n';
}

/**
 * Create empty Markdown file content with header
 */
export function createEmptyMarkdown(): string {
  return `# Nekotick Tasks

`;
}
