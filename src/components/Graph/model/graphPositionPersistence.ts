import type { FileTreeNode } from '@/stores/notes/types';
import { MAX_GRAPH_CANDIDATE_NODES } from './noteGraph';
import { collectNotePaths } from './graphNotePaths';
import type { GraphNodePositions } from '../store/useGraphUIStore';

export const MAX_GRAPH_POSITION_ENTRIES = MAX_GRAPH_CANDIDATE_NODES;

export function collectLiveGraphPositionPaths(
  nodes: readonly FileTreeNode[],
  priorityPaths: readonly string[] = [],
): Set<string> {
  return new Set(collectNotePaths(nodes, MAX_GRAPH_POSITION_ENTRIES, priorityPaths).paths);
}

export function pruneGraphNodePositions(
  positions: GraphNodePositions,
  livePaths: ReadonlySet<string>,
  priorityPaths: readonly string[] = [],
): GraphNodePositions {
  const retained: GraphNodePositions = {};
  const orderedPaths = [
    ...new Set(priorityPaths),
    ...Object.keys(positions),
  ];
  let retainedCount = 0;
  for (const path of orderedPaths) {
    const position = positions[path];
    if (!position || !livePaths.has(path) || retained[path]
      || retainedCount >= MAX_GRAPH_POSITION_ENTRIES) {
      continue;
    }
    retained[path] = position;
    retainedCount += 1;
  }
  return retained;
}
