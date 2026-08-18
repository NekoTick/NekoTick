import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDiagnosticsLog, getDiagnosticsLogText } from '@/lib/diagnostics/diagnosticsLog';
import { themeGraphTokens } from '@/styles/themeTokens';
import { GraphCanvas } from './GraphCanvas';
import {
  getGraphLabelExclusionBounds,
  GraphCanvasScene,
} from './canvas/GraphCanvasScene';
import { GraphLabelBoundsIndex } from './model/graphLabelBoundsIndex';
import type { PositionedGraphNode, PositionedNoteGraph } from './model/graphLayout';

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const graph: PositionedNoteGraph = {
  focusNodeId: 'Alpha.md',
  nodes: [
    { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 100, y: 100 },
    { id: 'Beta.md', label: 'Beta', degree: 1, x: 300, y: 100 },
    { id: 'Gamma.md', label: 'Gamma', degree: 0, x: 500, y: 100 },
  ],
  edges: [],
};
graph.edges = [{ source: graph.nodes[0]!, target: graph.nodes[1]! }];

function readNodePosition(element: Element) {
  const match = element.closest('[data-graph-node-position]')?.getAttribute('transform')
    ?.match(/^translate\(([-+\d.e]+)[ ,]([-+\d.e]+)\)$/i);
  return {
    x: Number(match?.[1]),
    y: Number(match?.[2]),
  };
}

function mockAnimationFrameQueue() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 100_000;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  return (now: number) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  };
}

describe('GraphCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    clearDiagnosticsLog();
    Object.defineProperty(SVGSVGElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(SVGSVGElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(SVGSVGElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
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

  it('drags a node without opening it', () => {
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const edge = canvas.querySelector('[data-graph-edge-layer="base"]')!;
    const activeEdge = canvas.querySelector('[data-graph-edge-layer="active"]')!;
    const visibleNode = node.querySelectorAll('circle')[1]!;
    expect(canvas.querySelectorAll('.vlaina-graph-enter')).toHaveLength(1);
    expect(node).not.toHaveClass('vlaina-graph-node-enter');
    expect(Number(hitTarget.getAttribute('r'))).toBeGreaterThanOrEqual(16);
    expect(edge).toHaveAttribute('stroke', 'var(--vlaina-color-graph-edge)');
    expect(Number(edge.getAttribute('stroke-opacity'))).toBeGreaterThan(0);
    expect(edge).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
    const startPosition = readNodePosition(hitTarget);
    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    expect(visibleNode).toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');
    expect(activeEdge).toHaveAttribute('opacity', '1');
    expect(activeEdge.getAttribute('d')).not.toBe('');
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 120, pointerId: 1 });
    expect(edge.getAttribute('d')).toContain(
      `M${startPosition.x + 40},${startPosition.y + 20}`,
    );

    expect(onPositionCommit).toHaveBeenCalledWith('Alpha.md', expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    expect(onOpenPath).not.toHaveBeenCalled();
    const diagnostics = getDiagnosticsLogText();
    expect(diagnostics).toContain('pointer-drag-start');
    expect(diagnostics).toContain('pointer-drag-release');
    expect(diagnostics).toContain('force-release');
  });

  it('keeps a local child edge attached without showing a stale base edge', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    const child = screen.getByRole('option', { name: 'Beta' });
    const hitTarget = child.querySelector('[data-graph-node-hit-target="Beta.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const baseEdge = canvas.querySelector('[data-graph-edge-layer="base"]')!;
    const activeEdge = canvas.querySelector('[data-graph-edge-layer="active"]')!;
    const startPosition = readNodePosition(hitTarget);

    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 300, clientY: 100, pointerId: 11 });
    expect(baseEdge).toHaveAttribute('stroke-opacity', '0');
    expect(activeEdge).toHaveAttribute('opacity', '1');
    fireEvent.pointerMove(canvas, { clientX: 340, clientY: 120, pointerId: 11 });
    fireEvent.pointerUp(canvas, { clientX: 340, clientY: 120, pointerId: 11 });

    expect(baseEdge).toHaveAttribute('stroke-opacity', '0.14');
    expect(baseEdge.getAttribute('d')).toContain(
      `L${startPosition.x + 40},${startPosition.y + 20}`,
    );
  });

  it('cancels an interrupted node drag without opening or committing it', () => {
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });

    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 10 });
    fireEvent.pointerCancel(canvas, { clientX: 0, clientY: 0, pointerId: 10 });

    expect(onOpenPath).not.toHaveBeenCalled();
    expect(onPositionCommit).not.toHaveBeenCalled();
  });

  it('restores a moved node when pointer capture is lost', () => {
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 100_043;
    });
    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const startPosition = readNodePosition(hitTarget);

    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 12 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 120, pointerId: 12 });
    act(() => scheduledFrame?.(performance.now()));
    expect(readNodePosition(hitTarget)).not.toEqual(startPosition);
    fireEvent.lostPointerCapture(canvas, { pointerId: 12 });

    expect(readNodePosition(hitTarget)).toEqual(startPosition);
    expect(onOpenPath).not.toHaveBeenCalled();
    expect(onPositionCommit).not.toHaveBeenCalled();
  });

  it('coalesces repeated pointer moves into one animation frame', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    let scheduledFrame: FrameRequestCallback | null = null;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 100_042;
    });
    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });

    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 4 });
    for (let offset = 1; offset <= 20; offset += 1) {
      fireEvent.pointerMove(canvas, { clientX: 100 + offset, clientY: 100, pointerId: 4 });
    }

    expect(requestFrame).toHaveBeenCalledTimes(1);
    act(() => scheduledFrame?.(performance.now()));
    expect(readNodePosition(hitTarget).x).toBeGreaterThan(100);
  });

  it('opens on click and reserves plain arrows for navigation', () => {
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );

    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 5 });
    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    fireEvent.doubleClick(node);
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onOpenPath).toHaveBeenCalledTimes(3);
    expect(onOpenPath).toHaveBeenLastCalledWith('Alpha.md');

    const currentPosition = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const { x: currentX, y: currentY } = readNodePosition(currentPosition);
    const betaPosition = readNodePosition(screen.getByRole('option', { name: 'Beta' }));
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    expect(onSelectPath).toHaveBeenLastCalledWith('Beta.md');
    expect(onPositionCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(node, { altKey: true, key: 'ArrowRight' });
    fireEvent.keyDown(node, { altKey: true, key: 'ArrowRight' });
    expect(onPositionCommit).toHaveBeenLastCalledWith('Alpha.md', {
      x: currentX + 4,
      y: currentY,
    });
    expect(readNodePosition(currentPosition)).toEqual({ x: currentX + 4, y: currentY });
    expect(canvas.querySelector('[data-graph-edge-layer="base"]')).toHaveAttribute(
      'd',
      `M${currentX + 4},${currentY}L${betaPosition.x},${betaPosition.y}`,
    );
  });

  it('ignores pointer events from a different active pointer', () => {
    const onOpenPath = vi.fn();
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );

    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 21 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 100, pointerId: 22 });
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 100, pointerId: 22 });

    expect(onOpenPath).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 21 });
    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('cancels an active drag when the graph topology changes', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const expandedNodes = [
      { ...graph.nodes[0]! },
      { ...graph.nodes[1]!, degree: 2 },
      { ...graph.nodes[2]! },
      { id: 'Delta.md', label: 'Delta', degree: 1, x: 700, y: 100 },
    ];
    const expandedGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: expandedNodes,
      edges: [
        { source: expandedNodes[0]!, target: expandedNodes[1]! },
        { source: expandedNodes[1]!, target: expandedNodes[3]! },
      ],
    };
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    const onPositionsCommit = vi.fn();
    const view = render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={onPositionsCommit}
        onSelectPath={vi.fn()}
      />,
    );
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const hitTarget = screen.getByRole('option', { name: 'Alpha' })
      .querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const startPosition = readNodePosition(hitTarget);
    onPositionsCommit.mockClear();
    let pointerFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pointerFrame = callback;
      return 100_044;
    });

    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 23 });
    expect(canvas.querySelector('[data-graph-edge-layer="base"]'))
      .toHaveAttribute('stroke-opacity', '0');
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 120, pointerId: 23 });
    act(() => pointerFrame?.(performance.now()));
    expect(readNodePosition(hitTarget)).not.toEqual(startPosition);

    view.rerender(
      <GraphCanvas
        graph={expandedGraph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={onPositionsCommit}
        onSelectPath={vi.fn()}
      />,
    );

    expect(canvas.querySelector('[data-graph-edge-layer="base"]'))
      .toHaveAttribute('stroke-opacity', String(themeGraphTokens.edgeOpacity));
    expect(readNodePosition(hitTarget)).toEqual(startPosition);
    expect(onPositionsCommit).toHaveBeenCalled();
    expect(onPositionsCommit.mock.lastCall?.[0]?.['Alpha.md']).toEqual(startPosition);
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 23 });
    expect(onOpenPath).not.toHaveBeenCalled();
    expect(onPositionCommit).not.toHaveBeenCalled();
  });

  it('preserves a user-positioned viewport while the graph view is inactive', () => {
    const runFrames = mockAnimationFrameQueue();
    const positionOverrides = {
      'Alpha.md': { x: 100, y: 100 },
      'Beta.md': { x: 300, y: 100 },
      'Gamma.md': { x: 500, y: 100 },
    };
    const renderCanvas = (active: boolean) => (
      <GraphCanvas
        active={active}
        graph={graph}
        positionOverrides={positionOverrides}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />
    );
    const view = render(renderCanvas(true));
    act(() => runFrames(performance.now()));
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const scene = canvas.querySelector(':scope > g')!;

    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 24 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 70, pointerId: 24 });
    act(() => runFrames(performance.now()));
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 70, pointerId: 24 });
    const positionedTransform = scene.getAttribute('transform');

    view.rerender(renderCanvas(false));
    act(() => runFrames(performance.now()));
    view.rerender(renderCanvas(true));
    act(() => runFrames(performance.now()));

    expect(scene).toHaveAttribute('transform', positionedTransform);
  });

  it('preserves a user-positioned viewport across background topology updates', () => {
    const runFrames = mockAnimationFrameQueue();
    const positionOverrides = {
      'Alpha.md': { x: 100, y: 100 },
      'Beta.md': { x: 300, y: 100 },
      'Gamma.md': { x: 500, y: 100 },
    };
    const view = render(
      <GraphCanvas
        graph={graph}
        positionOverrides={positionOverrides}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    act(() => runFrames(performance.now()));
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const scene = canvas.querySelector(':scope > g')!;
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 25 });
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: 60, pointerId: 25 });
    act(() => runFrames(performance.now()));
    fireEvent.pointerUp(canvas, { clientX: 90, clientY: 60, pointerId: 25 });
    const positionedTransform = scene.getAttribute('transform');
    const nextGraph: PositionedNoteGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        { source: graph.nodes[1]!, target: graph.nodes[2]! },
      ],
    };

    view.rerender(
      <GraphCanvas
        graph={nextGraph}
        positionOverrides={positionOverrides}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    act(() => runFrames(performance.now()));

    expect(scene).toHaveAttribute('transform', positionedTransform);
  });

  it('highlights a hovered node and its incident edges', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Gamma.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const alpha = screen.getByRole('option', { name: 'Alpha' });
    const gamma = screen.getByRole('option', { name: 'Gamma' });
    const visibleNode = alpha.querySelectorAll('circle')[1]!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const edge = canvas.querySelector('[data-graph-edge-layer="base"]')!;
    const activeEdge = canvas.querySelector('[data-graph-edge-layer="active"]')!;
    expect(visibleNode).toHaveClass('fill-[var(--vlaina-color-graph-node)]');
    expect(visibleNode).not.toHaveClass('vlaina-graph-node-dot-enter');
    expect(gamma).not.toHaveClass('vlaina-graph-node-enter');
    expect(edge).toHaveAttribute('stroke', 'var(--vlaina-color-graph-edge)');
    expect(activeEdge).toHaveAttribute('d', '');
    expect(activeEdge).toHaveAttribute('opacity', '0');

    fireEvent.mouseEnter(alpha.querySelector('[data-graph-node-hit-target="Alpha.md"]')!);

    expect(visibleNode).toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');
    expect(screen.getByRole('option', { name: 'Beta' }).querySelectorAll('circle')[1]).toHaveStyle({ opacity: '1' });
    expect(activeEdge).toHaveAttribute('stroke', 'var(--vlaina-color-graph-edge-active)');
    expect(activeEdge.getAttribute('d')).not.toBe('');
    expect(activeEdge).toHaveAttribute('opacity', '1');
  });

  it('does not highlight a node when only its label is hovered', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const alpha = screen.getByRole('option', { name: 'Alpha' });
    const visibleNode = alpha.querySelectorAll('circle')[1]!;
    const activeEdge = screen.getByRole('group', { name: 'app.viewGraph' })
      .querySelector('[data-graph-edge-layer="active"]')!;

    fireEvent.mouseEnter(screen.getByText('Alpha'));

    expect(visibleNode).toHaveClass('fill-[var(--vlaina-color-graph-node)]');
    expect(activeEdge).toHaveAttribute('opacity', '0');
  });

  it('clears hover state when a graph changes and does not resurrect it when returning', () => {
    const alternateGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: [
        { id: 'Alpha.md', label: 'Alpha', degree: 0, x: 100, y: 100 },
        { id: 'Delta.md', label: 'Delta', degree: 0, x: 300, y: 100 },
      ],
      edges: [],
    };
    const view = render(
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

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Alpha' })
      .querySelector('[data-graph-node-hit-target="Alpha.md"]')!);
    expect(screen.getByRole('option', { name: 'Alpha' }).querySelectorAll('circle')[1])
      .toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');

    view.rerender(
      <GraphCanvas
        graph={alternateGraph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    view.rerender(
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

    expect(screen.getByRole('option', { name: 'Alpha' }).querySelectorAll('circle')[1])
      .toHaveClass('fill-[var(--vlaina-color-graph-node)]');
  });

  it('shows the current, hovered, and directly connected labels while zoomed out', () => {
    render(
      <svg>
        <GraphCanvasScene
          currentPath="Gamma.md"
          dragPositionId={null}
          edges={graph.edges}
          focusablePath="Alpha.md"
          hoveredPath="Alpha.md"
          labelLayoutRevision={0}
          labelsReady
          maxVisibleLabels={1}
          nodes={graph.nodes}
          onHoverChange={vi.fn()}
          onFocusChange={vi.fn()}
          onNavigate={vi.fn()}
          onOpen={vi.fn()}
          onPositionNudge={vi.fn()}
          onSelect={vi.fn()}
          onStartDrag={vi.fn()}
          selectedPath={null}
          showAllLabels
          viewport={{ x: 0, y: 0, zoom: 0.5 }}
          viewportSize={{ x: 800, y: 600 }}
        />
      </svg>,
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('shows only parent labels in a low-zoom all-notes overview', () => {
    const intersectionArea = vi.spyOn(GraphLabelBoundsIndex.prototype, 'getIntersectionArea');
    const parent = { id: 'Parent.md', label: 'Parent', degree: 20, x: 400, y: 300 };
    const secondaryParent = {
      id: 'Secondary Parent.md',
      label: 'Secondary Parent',
      degree: 3,
      x: 400,
      y: 100,
    };
    const children = Array.from({ length: 11 }, (_, index) => ({
      id: `Child ${index}.md`,
      label: `Child ${index}`,
      degree: 1,
      x: 100 + (index % 4) * 180,
      y: 400 + Math.floor(index / 4) * 120,
    }));
    const nodes = [parent, secondaryParent, ...children];
    const edges = children.map((child) => ({ source: parent, target: child }));

    render(
      <svg>
        <GraphCanvasScene
          currentPath={null}
          dragPositionId={null}
          edges={edges}
          focusablePath="Parent.md"
          hoveredPath={null}
          labelLayoutRevision={0}
          labelsReady
          nodes={nodes}
          onHoverChange={vi.fn()}
          onFocusChange={vi.fn()}
          onNavigate={vi.fn()}
          onOpen={vi.fn()}
          onPositionNudge={vi.fn()}
          onSelect={vi.fn()}
          onStartDrag={vi.fn()}
          selectedPath={null}
          showAllLabels
          viewport={{ x: 0, y: 0, zoom: 0.4 }}
          viewportSize={{ x: 800, y: 600 }}
        />
      </svg>,
    );

    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Secondary Parent')).toBeInTheDocument();
    for (const child of children) expect(screen.queryByText(child.label)).not.toBeInTheDocument();
    expect(intersectionArea).not.toHaveBeenCalled();
  });

  it('shows every note label in the all-notes canvas even when nodes overlap', () => {
    const intersectionArea = vi.spyOn(GraphLabelBoundsIndex.prototype, 'getIntersectionArea');
    const nodes = Array.from({ length: 12 }, (_, index) => ({
      id: `Note-${index}.md`,
      label: `Note ${index}`,
      degree: 0,
      x: 200,
      y: 150,
    }));
    const denseGraph: PositionedNoteGraph = {
      edges: [],
      focusNodeId: nodes[0]!.id,
      nodes,
    };
    const positionOverrides = Object.fromEntries(nodes.map((item) => [
      item.id,
      { x: item.x, y: item.y },
    ]));
    const view = render(
      <GraphCanvas
        active={false}
        graph={denseGraph}
        positionOverrides={positionOverrides}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    expect(view.container.querySelectorAll('[data-graph-node-label="true"]'))
      .toHaveLength(nodes.length);
    expect(intersectionArea).not.toHaveBeenCalled();
  });

  it('shows every connected name without dropping highlighted edges for a hovered node', () => {
    const hub = { id: 'Hub.md', label: 'Hub', degree: 24, x: 0, y: 0 };
    const neighbors = Array.from({ length: 24 }, (_, index) => ({
      id: `Neighbor-${index}.md`,
      label: `Neighbor ${index}`,
      degree: index + 1,
      x: index * 20 + 20,
      y: 100,
    }));
    const nodes = [hub, ...neighbors];
    const edges = neighbors.map((neighbor) => ({ source: hub, target: neighbor }));
    const view = render(
      <svg>
        <GraphCanvasScene
          currentPath={null}
          dragPositionId={null}
          edges={edges}
          focusablePath="Hub.md"
          hoveredPath="Hub.md"
          labelLayoutRevision={0}
          labelsReady
          nodes={nodes}
          onHoverChange={vi.fn()}
          onFocusChange={vi.fn()}
          onNavigate={vi.fn()}
          onOpen={vi.fn()}
          onPositionNudge={vi.fn()}
          onSelect={vi.fn()}
          onStartDrag={vi.fn()}
          selectedPath={null}
          viewport={{ x: 0, y: 0, zoom: 0.5 }}
          viewportSize={{ x: 800, y: 600 }}
        />
      </svg>,
    );

    const labelCount = view.container.querySelectorAll('[data-graph-node-label="true"]').length;
    expect(labelCount).toBe(nodes.length);
    for (const node of nodes) expect(screen.getByText(node.label)).toBeInTheDocument();
    const activePath = view.container.querySelector('[data-graph-edge-layer="active"]')
      ?.getAttribute('d') ?? '';
    expect(activePath.match(/M/g)).toHaveLength(edges.length);
  });

  it('uses free space for lower-degree labels at an intermediate zoom', () => {
    const overviewNodes = graph.nodes.map((node, index) => ({
      ...node,
      degree: [6, 3, 1][index]!,
    }));
    render(
      <svg>
        <GraphCanvasScene
          currentPath={null}
          dragPositionId={null}
          edges={[{ source: overviewNodes[0]!, target: overviewNodes[1]! }]}
          focusablePath="Alpha.md"
          hoveredPath={null}
          labelLayoutRevision={0}
          labelsReady
          nodes={overviewNodes}
          onHoverChange={vi.fn()}
          onFocusChange={vi.fn()}
          onNavigate={vi.fn()}
          onOpen={vi.fn()}
          onPositionNudge={vi.fn()}
          onSelect={vi.fn()}
          onStartDrag={vi.fn()}
          selectedPath={null}
          viewport={{ x: 0, y: 0, zoom: 0.6 }}
          viewportSize={{ x: 800, y: 600 }}
        />
      </svg>,
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('recomputes label visibility when the viewport is panned', () => {
    const edgeNode: PositionedGraphNode = {
      id: 'Edge.md',
      label: 'Edge',
      degree: 1,
      x: 100,
      y: 100,
    };
    const sceneProps = {
      currentPath: null,
      dragPositionId: null,
      edges: [],
      focusablePath: 'Edge.md',
      labelsReady: true,
      nodes: [edgeNode],
      onHoverChange: vi.fn(),
      onFocusChange: vi.fn(),
      onNavigate: vi.fn(),
      onOpen: vi.fn(),
      onPositionNudge: vi.fn(),
      onSelect: vi.fn(),
      onStartDrag: vi.fn(),
      selectedPath: null,
      viewportSize: { x: 200, y: 200 },
    };
    const view = render(
      <svg>
        <GraphCanvasScene
          {...sceneProps}
          hoveredPath={null}
          labelLayoutRevision={0}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />
      </svg>,
    );

    expect(screen.getByText('Edge')).toBeInTheDocument();

    view.rerender(
      <svg>
        <GraphCanvasScene
          {...sceneProps}
          hoveredPath={null}
          labelLayoutRevision={0}
          viewport={{ x: 0, y: -130, zoom: 1 }}
        />
      </svg>,
    );

    expect(screen.getByText('Edge')).toBeInTheDocument();

    view.rerender(
      <svg>
        <GraphCanvasScene
          {...sceneProps}
          hoveredPath={null}
          labelLayoutRevision={1}
          viewport={{ x: 0, y: -130, zoom: 1 }}
        />
      </svg>,
    );

    expect(screen.queryByText('Edge')).not.toBeInTheDocument();
  });

  it('focuses the selected node and its direct connections', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const alphaDot = screen.getByRole('option', { name: 'Alpha' }).querySelectorAll('circle')[1]!;
    const betaDot = screen.getByRole('option', { name: 'Beta' }).querySelectorAll('circle')[1]!;
    const gammaDot = screen.getByRole('option', { name: 'Gamma' }).querySelectorAll('circle')[1]!;
    const baseEdge = canvas.querySelector('[data-graph-edge-layer="base"]')!;
    const activeEdge = canvas.querySelector('[data-graph-edge-layer="active"]')!;

    expect(Number(alphaDot.getAttribute('r'))).toBeGreaterThan(Number(gammaDot.getAttribute('r')));
    expect(alphaDot).toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');
    expect(alphaDot).toHaveStyle({ opacity: '1' });
    expect(betaDot).toHaveStyle({ opacity: '1' });
    expect(gammaDot).toHaveStyle({ opacity: '0.16' });
    expect(baseEdge).toHaveAttribute('stroke-opacity', '0.14');
    expect(activeEdge.getAttribute('d')).not.toBe('');
    expect(activeEdge).toHaveAttribute('opacity', '1');
  });

  it('keeps the selected node prominent while another branch is hovered', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Gamma.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Alpha' })
      .querySelector('[data-graph-node-hit-target="Alpha.md"]')!);

    const selectedDot = screen.getByRole('option', { name: 'Gamma' }).querySelectorAll('circle')[1]!;
    expect(selectedDot).toHaveStyle({ opacity: '1' });
  });

  it('keeps the current note prominent while another branch is hovered', () => {
    render(
      <GraphCanvas
        currentPath="Gamma.md"
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Alpha' })
      .querySelector('[data-graph-node-hit-target="Alpha.md"]')!);

    const currentDot = screen.getByRole('option', { name: 'Gamma' }).querySelectorAll('circle')[1]!;
    expect(currentDot).toHaveStyle({ opacity: '1' });
  });

  it('keeps a partial saved position fixed during initial stabilization', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{ 'Alpha.md': { x: 180, y: 160 } }}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const node = screen.getByRole('option', { name: 'Alpha' });
    const position = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    expect(readNodePosition(position)).toEqual({ x: 180, y: 160 });
  });

  it('holds the clustered force layout until the graph becomes active', async () => {
    const view = render(
      <GraphCanvas
        active={false}
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const clusteredPosition = readNodePosition(hitTarget);
    expect(clusteredPosition).not.toEqual({ x: 100, y: 100 });

    view.rerender(
      <GraphCanvas
        active
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    await waitFor(
      () => expect(readNodePosition(hitTarget)).not.toEqual(clusteredPosition),
      { timeout: 3_000 },
    );
  });

  it('accepts the first hover after returning from an inactive view', () => {
    const view = render(
      <GraphCanvas
        active={false}
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    view.rerender(
      <GraphCanvas
        active
        graph={graph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const alpha = screen.getByRole('option', { name: 'Alpha' });
    fireEvent.mouseEnter(alpha.querySelector('[data-graph-node-hit-target="Alpha.md"]')!);

    expect(alpha.querySelectorAll('circle')[1]).toHaveClass(
      'fill-[var(--vlaina-color-graph-node-active)]',
    );
  });

  it('renders a complete saved layout directly without replaying spatial motion', () => {
    const runFrames = mockAnimationFrameQueue();
    render(
      <GraphCanvas
        active={false}
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const alpha = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = alpha.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const edge = screen.getByRole('group', { name: 'app.viewGraph' })
      .querySelector('[data-graph-edge-layer="base"]')!;
    expect(readNodePosition(hitTarget)).toEqual({ x: 100, y: 100 });
    expect(edge).toHaveAttribute('d', 'M100,100L300,100');
    act(() => runFrames(performance.now() + 1_000));
    expect(readNodePosition(hitTarget)).toEqual({ x: 100, y: 100 });
  });

  it('synchronizes node and edge geometry when saved positions change in place', () => {
    const view = render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    view.rerender(
      <GraphCanvas
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 180, y: 160 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    expect(readNodePosition(screen.getByRole('option', { name: 'Alpha' }))).toEqual({
      x: 180,
      y: 160,
    });
    expect(canvas.querySelector('[data-graph-edge-layer="base"]')).toHaveAttribute(
      'd',
      'M180,160L300,100',
    );
  });

  it('keeps shared node positions when switching to a local graph', () => {
    const runFrames = mockAnimationFrameQueue();
    const positionOverrides = {
      'Alpha.md': { x: 100, y: 100 },
      'Beta.md': { x: 300, y: 100 },
      'Gamma.md': { x: 500, y: 100 },
    };
    const view = render(
      <GraphCanvas
        graph={graph}
        positionOverrides={positionOverrides}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );
    act(() => {
      const now = performance.now() + 1_000;
      runFrames(now);
    });

    const localGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: graph.nodes.slice(0, 2),
      edges: graph.edges,
    };
    view.rerender(
      <GraphCanvas
        graph={localGraph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    expect(readNodePosition(screen.getByRole('option', { name: 'Alpha' }))).toEqual({ x: 100, y: 100 });
    expect(readNodePosition(screen.getByRole('option', { name: 'Beta' }))).toEqual({ x: 300, y: 100 });

    view.rerender(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    expect(readNodePosition(screen.getByRole('option', { name: 'Alpha' }))).toEqual({ x: 100, y: 100 });
    expect(readNodePosition(screen.getByRole('option', { name: 'Beta' }))).toEqual({ x: 300, y: 100 });
    expect(readNodePosition(screen.getByRole('option', { name: 'Gamma' }))).toEqual({ x: 500, y: 100 });
  });

  it('pans the canvas and zooms around the pointer', () => {
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const content = canvas.querySelector('g')!;
    expect(content).toHaveClass('vlaina-graph-viewport');
    expect(content.style.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
    const before = content.getAttribute('transform');
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 60, pointerId: 2 });
    expect(content.getAttribute('transform')).not.toBe(before);

    const afterPan = content.getAttribute('transform');
    const zoomFrames: FrameRequestCallback[] = [];
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      zoomFrames.push(callback);
      return 100_084 + zoomFrames.length;
    });
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: -120 });
    const framesAfterFirstWheel = requestFrame.mock.calls.length;
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: -120 });
    expect(requestFrame).toHaveBeenCalledTimes(framesAfterFirstWheel);
    act(() => zoomFrames.forEach((callback) => callback(performance.now())));
    expect(content.getAttribute('transform')).not.toBe(afterPan);
  });

  it('clears stale node hover when wheel zoom moves the graph', () => {
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

    const node = screen.getByRole('option', { name: 'Alpha' });
    const dot = node.querySelectorAll('circle')[1]!;
    fireEvent.mouseEnter(node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!);
    expect(dot).toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');

    fireEvent.wheel(screen.getByRole('group', { name: 'app.viewGraph' }), {
      clientX: 400,
      clientY: 300,
      deltaY: -120,
    });

    expect(dot).toHaveClass('fill-[var(--vlaina-color-graph-node)]');
  });

  it('clears the selection when the canvas is clicked', () => {
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );

    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 8 });
    fireEvent.pointerUp(canvas, { clientX: 20, clientY: 20, pointerId: 8 });

    expect(onSelectPath).toHaveBeenCalledWith(null);
  });

  it('clears temporary hover focus when a drag is released', () => {
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

    const node = screen.getByRole('option', { name: 'Alpha' });
    const hitTarget = node.querySelector('[data-graph-node-hit-target="Alpha.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const baseEdge = canvas.querySelector('[data-graph-edge-layer="base"]')!;
    fireEvent.mouseEnter(hitTarget);
    fireEvent.pointerDown(hitTarget, { button: 0, clientX: 100, clientY: 100, pointerId: 9 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 120, pointerId: 9 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 120, pointerId: 9 });

    expect(node.querySelectorAll('circle')[1]).toHaveStyle({ opacity: '1' });
    expect(node.querySelectorAll('circle')[1]).not.toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');
    expect(baseEdge).toHaveAttribute('stroke-opacity', '0.82');
  });

  it('does not carry hover focus into a replacement graph', () => {
    const view = render(
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
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Alpha' })
      .querySelector('[data-graph-node-hit-target="Alpha.md"]')!);

    const replacementGraph: PositionedNoteGraph = {
      focusNodeId: 'Delta.md',
      nodes: [
        { id: 'Delta.md', label: 'Delta', degree: 1, x: 120, y: 120 },
        { id: 'Epsilon.md', label: 'Epsilon', degree: 1, x: 320, y: 120 },
      ],
      edges: [],
    };
    replacementGraph.edges = [{
      source: replacementGraph.nodes[0]!,
      target: replacementGraph.nodes[1]!,
    }];
    view.rerender(
      <GraphCanvas
        graph={replacementGraph}
        positionOverrides={{}}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const dots = screen.getByRole('group', { name: 'app.viewGraph' })
      .querySelectorAll('.vlaina-graph-node-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveStyle({ opacity: '1' });
    expect(dots[1]).toHaveStyle({ opacity: '1' });
  });

  it('marks the current note and exposes one roving tab stop', () => {
    render(
      <GraphCanvas
        currentPath="Beta.md"
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const nodes = screen.getAllByRole('option');
    expect(nodes.filter((node) => node.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('option', { name: 'Beta' })
      .querySelector('[data-graph-current-note="true"]')).toBeInTheDocument();
  });

  it('keeps the current-note ring visible around an active high-degree node', () => {
    const highDegreeGraph: PositionedNoteGraph = {
      focusNodeId: 'Current.md',
      nodes: [{ id: 'Current.md', label: 'Current', degree: 100, x: 400, y: 300 }],
      edges: [],
    };
    render(
      <GraphCanvas
        currentPath="Current.md"
        graph={highDegreeGraph}
        positionOverrides={{ 'Current.md': { x: 400, y: 300 } }}
        selectedPath="Current.md"
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    const graphNode = screen.getByRole('option', { name: 'Current' });
    const dot = graphNode.querySelector('.vlaina-graph-node-dot')!;
    const ring = graphNode.querySelector('[data-graph-current-note="true"]')!;
    expect(dot.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ring).toHaveAttribute('r', String(themeGraphTokens.currentNodeRingRadiusPx));
  });

  it('opens a node for an assistive-technology click and toggles keyboard selection', () => {
    const onOpenPath = vi.fn();
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{}}
        selectedPath="Alpha.md"
        onOpenPath={onOpenPath}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );
    const node = screen.getByRole('option', { name: 'Alpha' });

    fireEvent.click(node, { detail: 0 });
    fireEvent.keyDown(node, { key: ' ' });
    fireEvent.keyDown(node, { key: 'Escape' });

    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    expect(onSelectPath).toHaveBeenCalledWith(null);
  });

  it('pans from a visible label without activating the node', () => {
    const onOpenPath = vi.fn();
    const onPositionCommit = vi.fn();
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={onPositionCommit}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );

    const label = screen.getByText('Alpha');
    expect(label.closest('[data-graph-node-label="true"]')).toHaveClass('pointer-events-none');
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    const content = canvas.querySelector('g')!;
    const initialTransform = content.getAttribute('transform');
    expect(fireEvent.pointerDown(label, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 31,
    })).toBe(false);
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 120, pointerId: 31 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 120, pointerId: 31 });

    expect(content.getAttribute('transform')).not.toBe(initialTransform);
    expect(onOpenPath).not.toHaveBeenCalled();
    expect(onPositionCommit).not.toHaveBeenCalled();
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('opens the closest node when low-zoom hit targets overlap', () => {
    const closeGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: [
        { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 100, y: 100 },
        { id: 'Beta.md', label: 'Beta', degree: 1, x: 118, y: 100 },
      ],
      edges: [],
    };
    const onOpenPath = vi.fn();
    const onSelectPath = vi.fn();
    render(
      <GraphCanvas
        graph={closeGraph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 118, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={onOpenPath}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={onSelectPath}
      />,
    );

    const betaHitTarget = document.querySelector('[data-graph-node-hit-target="Beta.md"]')!;
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    fireEvent.mouseEnter(betaHitTarget, { clientX: 100, clientY: 100 });
    expect(screen.getByRole('option', { name: 'Alpha' }).querySelectorAll('circle')[1])
      .toHaveClass('fill-[var(--vlaina-color-graph-node-active)]');

    fireEvent.pointerDown(betaHitTarget, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 32,
    });
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 32 });

    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    expect(onOpenPath).not.toHaveBeenCalledWith('Beta.md');
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('reuses the whiteboard viewport controls at the bottom-left', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    render(
      <GraphCanvas
        graph={graph}
        positionOverrides={{
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
          'Gamma.md': { x: 500, y: 100 },
        }}
        selectedPath={null}
        onOpenPath={vi.fn()}
        onPositionCommit={vi.fn()}
        onPositionsCommit={vi.fn()}
        onSelectPath={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.zoomIn' }));
    const percentage = screen.getByRole('button', { name: '125%' });
    const controls = percentage.closest('.absolute');
    const canvas = screen.getByRole('group', { name: 'app.viewGraph' });
    expect(controls).toHaveClass('bottom-4', 'left-3');
    expect(controls?.querySelectorAll('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'whiteboard.fitView' })).toBeInTheDocument();
    expect(canvas).toHaveClass('active:cursor-grabbing');
    fireEvent.click(percentage);
    const resetPercentage = screen.getByRole('button', { name: '100%' });
    fireEvent.wheel(resetPercentage, { deltaY: -1 });
    expect(screen.getByRole('button', { name: '125%' })).toBeInTheDocument();
  });

  it('does not move the viewport when a transient scan overlay appears', () => {
    const runFrames = mockAnimationFrameQueue();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const sharedProps = {
      graph,
      positionOverrides: {
        'Alpha.md': { x: 100, y: 100 },
        'Beta.md': { x: 300, y: 100 },
        'Gamma.md': { x: 500, y: 100 },
      },
      selectedPath: null,
      onOpenPath: vi.fn(),
      onPositionCommit: vi.fn(),
      onPositionsCommit: vi.fn(),
      onSelectPath: vi.fn(),
    };
    const view = render(<GraphCanvas {...sharedProps} topOverlayVisible={false} />);
    act(() => runFrames(1000));
    const scene = screen.getByRole('listbox');
    const initialTransform = scene.getAttribute('transform');

    view.rerender(<GraphCanvas {...sharedProps} topOverlayVisible />);
    act(() => runFrames(1016));

    expect(scene).toHaveAttribute('transform', initialTransform);
  });

  it('reserves the reused whiteboard controls area on the lower left for labels', () => {
    expect(getGraphLabelExclusionBounds({ x: 200, y: 600 }, false)).toEqual([{
      bottom: 600 - themeGraphTokens.viewportControlsVerticalOffsetPx,
      left: themeGraphTokens.viewportControlsHorizontalOffsetPx,
      right: Math.min(
        200,
        themeGraphTokens.viewportControlsHorizontalOffsetPx
          + themeGraphTokens.viewportControlsWidthPx,
      ),
      top: 600
        - themeGraphTokens.viewportControlsVerticalOffsetPx
        - themeGraphTokens.viewportControlsHeightPx,
    }]);
  });

});
