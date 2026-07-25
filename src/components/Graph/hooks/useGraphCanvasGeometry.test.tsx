import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PositionedNoteGraph } from '../model/graphLayout';
import type { GraphNodePositions } from '../store/useGraphUIStore';
import { useGraphCanvasGeometry } from './useGraphCanvasGeometry';

const graph: PositionedNoteGraph = {
  focusNodeId: 'Alpha.md',
  nodes: [
    { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 0, y: 0 },
    { id: 'Beta.md', label: 'Beta', degree: 1, x: 100, y: 0 },
  ],
  edges: [],
};
graph.edges = [{ source: graph.nodes[0]!, target: graph.nodes[1]! }];

describe('useGraphCanvasGeometry', () => {
  it('refreshes geometry when a stable simulation snapshot advances', () => {
    const simulationPositions: GraphNodePositions = {
      'Alpha.md': { x: 20, y: 30 },
      'Beta.md': { x: 120, y: 30 },
    };
    const hook = renderHook(
      ({ simulationVersion }: { simulationVersion: number }) => useGraphCanvasGeometry({
        dragPosition: null,
        graph,
        positionOverrides: {},
        simulationPositions,
        simulationVersion,
      }),
      { initialProps: { simulationVersion: 0 } },
    );
    simulationPositions['Beta.md']!.x = 260;

    hook.rerender({ simulationVersion: 1 });

    expect(hook.result.current.nodes[1]).toMatchObject({ x: 260, y: 30 });
    expect(hook.result.current.edges[0]?.target).toMatchObject({ x: 260, y: 30 });
  });
});
