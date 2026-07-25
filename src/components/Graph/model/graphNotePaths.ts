import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import type { FileTreeNode } from '@/stores/notes/types';
import type { NoteGraphNode } from './noteGraph';

export function collectNotePaths(
  nodes: readonly FileTreeNode[],
  limit: number,
  priorityPaths: readonly string[] = [],
) {
  const paths: string[] = [];
  const priorityPathSet = new Set(priorityPaths);
  const stack = [...nodes].reverse();
  let total = 0;

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.isFolder) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]!);
      }
      continue;
    }
    if (node.kind === 'image') continue;
    total += 1;
    if (paths.length < limit || priorityPathSet.has(node.path)) paths.push(node.path);
  }

  return { paths: paths.sort((left, right) => left.localeCompare(right)), total };
}

export function collectNoteGraphSearchNodes(
  nodes: readonly FileTreeNode[],
): NoteGraphNode[] {
  return collectNotePaths(nodes, Number.POSITIVE_INFINITY).paths.map((path) => ({
    degree: 0,
    id: path,
    label: getNoteTitleFromPath(path),
  }));
}
