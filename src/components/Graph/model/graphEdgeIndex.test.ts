import { describe, expect, it } from 'vitest';
import type { PositionedGraphEdge, PositionedGraphNode } from './graphLayout';
import { buildGraphEdgeIndex } from './graphEdgeIndex';

const alpha: PositionedGraphNode = { id: 'Alpha.md', label: 'Alpha', degree: 2, x: 0, y: 0 };
const beta: PositionedGraphNode = { id: 'Beta.md', label: 'Beta', degree: 1, x: 100, y: 0 };
const gamma: PositionedGraphNode = { id: 'Gamma.md', label: 'Gamma', degree: 1, x: 200, y: 0 };
const edges: PositionedGraphEdge[] = [
  { source: alpha, target: beta },
  { source: alpha, target: gamma },
];

describe('buildGraphEdgeIndex', () => {
  it('indexes incident edges and neighbors for both directions', () => {
    const index = buildGraphEdgeIndex(edges);

    expect(index.get('Alpha.md')?.edges).toEqual(edges);
    expect([...index.get('Alpha.md')!.neighborIds]).toEqual(['Beta.md', 'Gamma.md']);
    expect(index.get('Beta.md')?.edges).toEqual([edges[0]]);
    expect([...index.get('Beta.md')!.neighborIds]).toEqual(['Alpha.md']);
    expect(index.has('Missing.md')).toBe(false);
  });
});
