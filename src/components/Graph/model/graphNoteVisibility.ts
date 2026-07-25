import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import type { BuiltNoteGraph, NoteGraphEdge } from './noteGraph';

export function buildVisibleNoteGraph(args: {
  candidateEdges: readonly NoteGraphEdge[];
  candidatePaths: readonly string[];
  contentIncomplete: boolean;
  maximumNodes: number;
  priorityPaths: readonly string[];
  totalCandidateNodes: number;
}): BuiltNoteGraph {
  const priorityByPath = new Map(args.priorityPaths.map((path, index) => [path, index]));
  const priorityNeighborPaths = new Set<string>();
  const degreeByPath = new Map(args.candidatePaths.map((path) => [path, 0]));
  for (const edge of args.candidateEdges) {
    degreeByPath.set(edge.source, (degreeByPath.get(edge.source) ?? 0) + 1);
    degreeByPath.set(edge.target, (degreeByPath.get(edge.target) ?? 0) + 1);
    if (priorityByPath.has(edge.source)) priorityNeighborPaths.add(edge.target);
    if (priorityByPath.has(edge.target)) priorityNeighborPaths.add(edge.source);
  }

  const paths = args.candidatePaths.length <= args.maximumNodes
    ? [...args.candidatePaths]
    : [...args.candidatePaths]
      .sort((left, right) => (
        (priorityByPath.get(left) ?? Number.POSITIVE_INFINITY)
          - (priorityByPath.get(right) ?? Number.POSITIVE_INFINITY)
        || Number(priorityNeighborPaths.has(right)) - Number(priorityNeighborPaths.has(left))
        || (degreeByPath.get(right) ?? 0) - (degreeByPath.get(left) ?? 0)
        || left.localeCompare(right)
      ))
      .slice(0, args.maximumNodes)
      .sort((left, right) => left.localeCompare(right));
  const pathSet = new Set(paths);
  const edges = args.candidateEdges.filter(
    (edge) => pathSet.has(edge.source) && pathSet.has(edge.target),
  );
  const visibleDegreeByPath = new Map(paths.map((path) => [path, 0]));
  for (const edge of edges) {
    visibleDegreeByPath.set(edge.source, (visibleDegreeByPath.get(edge.source) ?? 0) + 1);
    visibleDegreeByPath.set(edge.target, (visibleDegreeByPath.get(edge.target) ?? 0) + 1);
  }

  return {
    nodes: paths.map((path) => ({
      id: path,
      label: getNoteTitleFromPath(path),
      degree: visibleDegreeByPath.get(path) ?? 0,
    })),
    edges,
    stats: {
      totalCandidateNodes: args.totalCandidateNodes,
      totalCandidateEdges: args.candidateEdges.length,
      nodesTruncated: paths.length < args.totalCandidateNodes,
      edgesTruncated: args.contentIncomplete,
    },
  };
}
