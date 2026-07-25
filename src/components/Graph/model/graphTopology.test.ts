import { describe, expect, it } from 'vitest';
import type { PositionedNoteGraph } from './graphLayout';
import { getGraphTopologyKey } from './graphTopology';

const graph: PositionedNoteGraph = {
  focusNodeId: 'Alpha.md',
  nodes: [
    { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 0, y: 0 },
    { id: 'Beta.md', label: 'Beta', degree: 1, x: 100, y: 0 },
  ],
  edges: [],
};
graph.edges = [{ source: graph.nodes[0]!, target: graph.nodes[1]! }];

describe('getGraphTopologyKey', () => {
  it('stays stable when focus and array order change', () => {
    const reordered: PositionedNoteGraph = {
      focusNodeId: 'Beta.md',
      nodes: [...graph.nodes].reverse(),
      edges: [{ source: graph.nodes[1]!, target: graph.nodes[0]! }],
    };

    expect(getGraphTopologyKey(reordered)).toBe(getGraphTopologyKey(graph));
  });

  it('does not collide when note ids contain topology delimiters', () => {
    const nodes = ['a', 'b>c', 'a>b', 'c'].map((id) => ({
      degree: 1,
      id,
      label: id,
      x: 0,
      y: 0,
    }));
    const left: PositionedNoteGraph = {
      focusNodeId: null,
      nodes,
      edges: [{ source: nodes[0]!, target: nodes[1]! }],
    };
    const right: PositionedNoteGraph = {
      focusNodeId: null,
      nodes,
      edges: [{ source: nodes[2]!, target: nodes[3]! }],
    };

    expect(getGraphTopologyKey(left)).not.toBe(getGraphTopologyKey(right));
  });
});
