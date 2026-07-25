import { describe, expect, it } from 'vitest';
import { buildVisibleNoteGraph } from './graphNoteVisibility';

describe('buildVisibleNoteGraph', () => {
  it('keeps a priority node connected when higher-degree nodes fill the render budget', () => {
    const graph = buildVisibleNoteGraph({
      candidateEdges: [
        { source: 'Focus.md', target: 'Neighbor.md' },
        { source: 'Hub A.md', target: 'Hub B.md' },
        { source: 'Hub B.md', target: 'Hub C.md' },
        { source: 'Hub C.md', target: 'Hub A.md' },
      ],
      candidatePaths: ['Focus.md', 'Neighbor.md', 'Hub A.md', 'Hub B.md', 'Hub C.md'],
      contentIncomplete: false,
      maximumNodes: 4,
      priorityPaths: ['Focus.md'],
      totalCandidateNodes: 5,
    });

    expect(graph.nodes.map((node) => node.id)).toContain('Neighbor.md');
    expect(graph.edges).toContainEqual({ source: 'Focus.md', target: 'Neighbor.md' });
    expect(graph.nodes.find((node) => node.id === 'Focus.md')?.degree).toBe(1);
  });
});
