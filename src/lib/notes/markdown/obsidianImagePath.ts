import { getParentPath } from '@/lib/storage/adapter';
import type { FileTreeNode } from '@/stores/notes/types';

function getBareImageFilename(src: string): string | null {
  const encodedPath = src.split(/[?#]/, 1)[0]?.replace(/\\/g, '/').trim() ?? '';
  if (!encodedPath || encodedPath.includes('/')) return null;

  try {
    const filename = decodeURIComponent(encodedPath);
    return filename && !filename.includes('/') && !filename.includes('\\') ? filename : null;
  } catch {
    return null;
  }
}

export function resolveObsidianImagePath(
  src: string,
  nodes: readonly FileTreeNode[],
  currentNotePath?: string,
): string | null {
  const filename = getBareImageFilename(src);
  if (!filename) return null;

  const exactMatches: string[] = [];
  const caseInsensitiveMatches: string[] = [];
  const normalizedFilename = filename.toLocaleLowerCase();
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.isFolder) {
      stack.push(...node.children);
      continue;
    }
    if (node.kind !== 'image') continue;

    if (node.name === filename) {
      exactMatches.push(node.path);
    } else if (node.name.toLocaleLowerCase() === normalizedFilename) {
      caseInsensitiveMatches.push(node.path);
    }
  }

  const matches = exactMatches.length > 0 ? exactMatches : caseInsensitiveMatches;
  if (matches.length === 0) return null;

  const currentDirectory = currentNotePath
    ? getParentPath(currentNotePath.replace(/\\/g, '/'))
    : null;
  return matches.sort((left, right) => {
    const leftIsLocal = currentDirectory !== null && getParentPath(left) === currentDirectory;
    const rightIsLocal = currentDirectory !== null && getParentPath(right) === currentDirectory;
    if (leftIsLocal !== rightIsLocal) return leftIsLocal ? -1 : 1;

    const leftDepth = left.replace(/\\/g, '/').split('/').length;
    const rightDepth = right.replace(/\\/g, '/').split('/').length;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    return left.localeCompare(right);
  })[0] ?? null;
}
