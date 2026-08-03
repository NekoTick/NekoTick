import type { FileTreeNode, StarredEntry } from '@/stores/notes/types';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import { hasInternalNotePathSegment } from '@/stores/notes/utils/fs/internalNotePaths';
import { hasMentionEndBoundary, hasMentionStartBoundary } from './noteMentionBoundaries';
export {
  createMentionTitleMatcher,
  findMentionTitlesInValue,
  valueContainsMentionLabel,
} from './noteMentionTitleMatcher';

export interface NoteMentionCandidate {
  path: string;
  title: string;
  kind: 'note' | 'folder';
  isCurrent: boolean;
  icon?: string;
  notePath?: string;
  notesRootPath?: string;
  starredEntry?: StarredEntry;
}

export interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

export interface MentionPreviewPart {
  key: string;
  type: 'text' | 'mention';
  text: string;
  start: number;
  end: number;
  mention?: NoteMentionReference;
}

const MAX_MENTION_CANDIDATE_TREE_NODES = 20_000;
export const MAX_MENTION_TITLE_SCAN_ITEMS = 5_000;
export const MAX_MENTION_TITLE_SCAN_CHARS = 128 * 1024;
export const MAX_MENTION_TITLE_CHARS = 512;
export const MAX_MENTION_QUERY_CHARS = 256;
const MENTION_CANDIDATE_PRIORITY_BUCKETS = 4;

function getMentionCandidateNodePriority(node: FileTreeNode): number {
  if (hasInternalNotePathSegment(node.path)) {
    return 3;
  }
  if (!node.isFolder && isSupportedMarkdownPath(node.path)) {
    return 0;
  }
  if (node.isFolder) {
    return 1;
  }
  return 2;
}

function prioritizeMentionCandidateNodes(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  const buckets = Array.from(
    { length: MENTION_CANDIDATE_PRIORITY_BUCKETS },
    () => [] as FileTreeNode[],
  );
  for (const node of nodes) {
    const priority = getMentionCandidateNodePriority(node);
    buckets[priority]?.push(node);
  }
  return buckets.flat();
}

export function collectMentionCandidates(nodes: FileTreeNode[], result: NoteMentionCandidate[]): void {
  const stack = prioritizeMentionCandidateNodes(nodes).reverse();
  let visitedNodes = 0;

  while (stack.length > 0 && visitedNodes < MAX_MENTION_CANDIDATE_TREE_NODES) {
    const node = stack.pop()!;
    visitedNodes += 1;

    if (node.isFolder) {
      if (hasInternalNotePathSegment(node.path)) {
        continue;
      }
      const folderName = node.name || node.path.split('/').filter(Boolean).pop() || node.path;
      result.push({
        path: node.path,
        title: `${folderName.replace(/\/+$/, '')}/`,
        kind: 'folder',
        isCurrent: false,
      });
      const prioritizedChildren = prioritizeMentionCandidateNodes(node.children);
      for (let index = prioritizedChildren.length - 1; index >= 0; index -= 1) {
        stack.push(prioritizedChildren[index]);
      }
    } else if (isSupportedMarkdownPath(node.path) && !hasInternalNotePathSegment(node.path)) {
      result.push({
        path: node.path,
        title: '',
        kind: 'note',
        isCurrent: false,
        notePath: node.path,
      });
    }
  }
}

export function getNoteMentionTrigger(value: string, caret: number): MentionTrigger | null {
  if (caret < 0) {
    return null;
  }
  const boundedCaret = Math.min(caret, value.length);
  const searchStart = Math.max(0, boundedCaret - MAX_MENTION_QUERY_CHARS - 1);
  const before = value.slice(searchStart, boundedCaret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) {
    return null;
  }

  const triggerStart = searchStart + atIndex;
  const query = value.slice(triggerStart + 1, boundedCaret);
  if (query.length > MAX_MENTION_QUERY_CHARS) {
    return null;
  }
  if (query.includes('\n') || query.includes('\r') || /\s/.test(query)) {
    return null;
  }

  return {
    start: triggerStart,
    end: boundedCaret,
    query,
  };
}

export function buildMentionPreviewParts(
  value: string,
  mentions: NoteMentionReference[]
): MentionPreviewPart[] {
  if (!value || mentions.length === 0) {
    return [];
  }

  const labels = mentions
    .map((mention) => ({
      mention,
      label: `@${mention.title}`,
    }))
    .sort((a, b) => b.label.length - a.label.length);
  const labelsByInitial = new Map<string, typeof labels>();
  for (const label of labels) {
    const initial = label.label[1] ?? '';
    const group = labelsByInitial.get(initial);
    if (group) {
      group.push(label);
    } else {
      labelsByInitial.set(initial, [label]);
    }
  }

  const parts: MentionPreviewPart[] = [];
  let cursor = 0;
  let partIndex = 0;

  while (cursor < value.length) {
    let nextMatchIndex = -1;
    let nextMatch: (typeof labels)[number] | null = null;
    let atIndex = cursor;

    while (atIndex < value.length) {
      atIndex = value.indexOf('@', atIndex);
      if (atIndex < 0) {
        break;
      }
      if (!hasMentionStartBoundary(value, atIndex)) {
        atIndex += 1;
        continue;
      }

      const initial = value[atIndex + 1] ?? '';
      const candidateLabels = [
        ...(labelsByInitial.get(initial) ?? []),
        ...(initial ? labelsByInitial.get('') ?? [] : []),
      ];
      nextMatch = candidateLabels.find((label) =>
        value.startsWith(label.label, atIndex) &&
        hasMentionEndBoundary(value, atIndex + label.label.length)
      ) ?? null;
      if (nextMatch) {
        nextMatchIndex = atIndex;
        break;
      }
      atIndex += 1;
    }

    if (nextMatchIndex < 0 || !nextMatch) {
      const rest = value.slice(cursor);
      if (rest.length > 0) {
        parts.push({
          key: `text-${partIndex++}`,
          type: 'text',
          text: rest,
          start: cursor,
          end: value.length,
        });
      }
      break;
    }

    const before = value.slice(cursor, nextMatchIndex);
    if (before.length > 0) {
      parts.push({
        key: `text-${partIndex++}`,
        type: 'text',
        text: before,
        start: cursor,
        end: nextMatchIndex,
      });
    }

    parts.push({
      key: `mention-${partIndex++}-${nextMatch.mention.path}`,
      type: 'mention',
      text: nextMatch.label,
      start: nextMatchIndex,
      end: nextMatchIndex + nextMatch.label.length,
      mention: nextMatch.mention,
    });

    cursor = nextMatchIndex + nextMatch.label.length;
  }

  return parts;
}

export function insertMentionAtTrigger(
  value: string,
  trigger: MentionTrigger,
  mentionTitle: string
): { nextValue: string; nextCaret: number } {
  const prefix = value.slice(0, trigger.start);
  const suffix = value.slice(trigger.end);
  const label = `@${mentionTitle}`;
  const trailingSpace = suffix.startsWith(' ') || suffix.startsWith('\n') ? '' : ' ';
  const nextValue = `${prefix}${label}${trailingSpace}${suffix}`;
  const nextCaret = prefix.length + label.length + trailingSpace.length;
  return { nextValue, nextCaret };
}
