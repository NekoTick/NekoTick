import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphNodePositions } from './store/useGraphUIStore';
import type { PositionedNoteGraph } from './model/graphLayout';
import { GraphCanvas } from './GraphCanvas';

const forceMock = vi.hoisted(() => ({
  onPositionsFrame: null as null | ((positions: GraphNodePositions) => void),
  positionsRef: {
    current: {
      'Alpha.md': { x: 100, y: 100 },
      'Beta.md': { x: 300, y: 100 },
    } as GraphNodePositions,
  },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('./hooks/useGraphForceSimulation', () => ({
  useGraphForceSimulation: (args: {
    onPositionsFrame: (positions: GraphNodePositions) => void;
  }) => {
    forceMock.onPositionsFrame = args.onPositionsFrame;
    return {
      positionsRef: forceMock.positionsRef,
      releaseDragPosition: vi.fn(),
      updateDragPosition: vi.fn(),
    };
  },
}));

const graph: PositionedNoteGraph = {
  focusNodeId: 'Alpha.md',
  nodes: [
    { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 100, y: 100 },
    { id: 'Beta.md', label: 'Beta', degree: 1, x: 300, y: 100 },
  ],
  edges: [],
};
graph.edges = [{ source: graph.nodes[0]!, target: graph.nodes[1]! }];

describe('GraphCanvas first hover geometry', () => {
  beforeEach(() => {
    forceMock.onPositionsFrame = null;
    forceMock.positionsRef.current = {
      'Alpha.md': { x: 100, y: 100 },
      'Beta.md': { x: 300, y: 100 },
    };
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  it('uses the latest imperative node positions on the first hover render', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const latestPositions = forceMock.positionsRef.current;
    latestPositions['Alpha.md'] = { x: 220, y: 180 };
    latestPositions['Beta.md'] = { x: 460, y: 260 };
    act(() => forceMock.onPositionsFrame?.(latestPositions));

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Alpha' }));

    const activeEdge = screen.getByRole('group', { name: 'app.viewGraph' })
      .querySelector('[data-graph-edge-layer="active"]');
    expect(activeEdge).toHaveAttribute('opacity', '1');
    expect(activeEdge).toHaveAttribute('d', 'M220,180L460,260');
  });
});
