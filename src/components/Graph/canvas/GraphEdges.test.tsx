import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  getGraphBaseEdgeOpacity,
  getGraphBaseEdgeRenderCount,
  GraphEdges,
  selectGraphBaseEdges,
} from './GraphEdges';
import { selectRepresentativeGraphEdges } from '../model/graphEdgeSampling';
import { applyGraphPositions } from './applyGraphPositions';
import { buildGraphEdgeIndex } from '../model/graphEdgeIndex';
import type { PositionedGraphEdge, PositionedGraphNode } from '../model/graphLayout';

const alpha: PositionedGraphNode = { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 0, y: 0 };
const beta: PositionedGraphNode = { id: 'Beta.md', label: 'Beta', degree: 1, x: 100, y: 0 };
const edges: PositionedGraphEdge[] = [{ source: alpha, target: beta }];

afterEach(() => vi.useRealTimers());

describe('GraphEdges', () => {
  it('updates active edge endpoints without rebuilding the base edge layer', () => {
    const view = render(
      <svg>
        <GraphEdges edgeIndex={buildGraphEdgeIndex(edges)} edges={edges} hoveredPath="Alpha.md" />
        <g data-graph-node-position="Alpha.md" />
        <g data-graph-node-position="Beta.md" />
      </svg>,
    );
    const svg = view.container.querySelector('svg')!;
    const baseEdge = svg.querySelector('[data-graph-edge-layer="base"]')!;
    const activeEdge = svg.querySelector('[data-graph-edge-layer="active"]')!;
    const basePath = baseEdge.getAttribute('d');

    applyGraphPositions(svg, {
      'Alpha.md': { x: 40, y: 20 },
      'Beta.md': { x: 160, y: 60 },
    }, 'active');

    expect(baseEdge).toHaveAttribute('d', basePath);
    expect(activeEdge).toHaveAttribute('d', 'M40,20L160,60');
  });

  it('keeps the active path mounted while its opacity fades out', () => {
    vi.useFakeTimers();
    const view = render(<svg><GraphEdges edgeIndex={buildGraphEdgeIndex(edges)} edges={edges} hoveredPath="Alpha.md" /></svg>);
    const activeEdge = view.container.querySelector('[data-graph-edge-layer="active"]')!;
    expect(activeEdge.getAttribute('d')).not.toBe('');
    expect(activeEdge).toHaveAttribute('opacity', '1');
    expect(activeEdge).toHaveAttribute('stroke-opacity', String(themeGraphTokens.activeEdgeOpacity));

    view.rerender(<svg><GraphEdges edgeIndex={buildGraphEdgeIndex(edges)} edges={edges} hoveredPath={null} /></svg>);
    expect(activeEdge.getAttribute('d')).not.toBe('');
    expect(activeEdge).toHaveAttribute('opacity', '0');

    act(() => vi.advanceTimersByTime(themeGraphTokens.edgeHighlightFadeDurationMs));
    expect(activeEdge).toHaveAttribute('d', '');
  });

  it('keeps edge path precision bounded for force-generated coordinates', () => {
    const preciseEdges: PositionedGraphEdge[] = [{
      source: { ...alpha, x: 12.3456789, y: -0.004 },
      target: { ...beta, x: 98.7654321, y: 40.006 },
    }];
    const view = render(
      <svg><GraphEdges edgeIndex={buildGraphEdgeIndex(preciseEdges)} edges={preciseEdges} hoveredPath="Alpha.md" /></svg>,
    );

    expect(view.container.querySelector('[data-graph-edge-layer="base"]'))
      .toHaveAttribute('d', 'M12.3,0L98.8,40');
  });

  it('progressively quiets dense overview edges while preserving sparse detail', () => {
    const sparse = getGraphBaseEdgeOpacity(
      themeGraphTokens.edgeDensityStartCount,
      themeGraphTokens.defaultZoom,
    );
    const dense = getGraphBaseEdgeOpacity(
      themeGraphTokens.denseEdgeThreshold,
      themeGraphTokens.defaultZoom,
    );
    const denseOverview = getGraphBaseEdgeOpacity(
      themeGraphTokens.denseEdgeThreshold,
      themeGraphTokens.minZoom,
    );

    expect(sparse).toBe(themeGraphTokens.edgeOpacity);
    expect(dense).toBeLessThan(sparse);
    expect(denseOverview).toBeLessThan(dense);
  });

  it('reduces dense overview paths while restoring every edge at reading zoom', () => {
    const denseEdges = Array.from({ length: 2_000 }, (_, index) => {
      const source = { id: `Node-${index % 100}.md`, label: '', degree: 20, x: index, y: 0 };
      const target = { id: `Node-${(index + 1) % 100}.md`, label: '', degree: 20, x: index + 1, y: 0 };
      return { source, target };
    });

    expect(getGraphBaseEdgeRenderCount(denseEdges.length, themeGraphTokens.minZoom))
      .toBeLessThan(denseEdges.length);
    expect(getGraphBaseEdgeRenderCount(denseEdges.length, themeGraphTokens.defaultZoom))
      .toBe(denseEdges.length);
    expect(selectGraphBaseEdges(denseEdges, themeGraphTokens.minZoom)).toHaveLength(
      getGraphBaseEdgeRenderCount(denseEdges.length, themeGraphTokens.minZoom),
    );
  });

  it('keeps a representative base connection for every node in a dense overview', () => {
    const denseEdges = Array.from({ length: 1_000 }, (_, index) => {
      const source = { id: `Node-${index % 100}.md`, label: '', degree: 20, x: index, y: 0 };
      const target = { id: `Node-${(index + 1) % 100}.md`, label: '', degree: 20, x: index + 1, y: 0 };
      return { source, target };
    });
    const selected = selectGraphBaseEdges(denseEdges, themeGraphTokens.minZoom);
    const covered = new Set(selected.flatMap((edge) => [edge.source.id, edge.target.id]));

    expect(covered.size).toBe(100);
  });

  it('shares deterministic edge sampling semantics with the layout budget', () => {
    const sampled = selectRepresentativeGraphEdges(
      edges.map((edge) => ({ source: edge.source.id, target: edge.target.id })),
      1,
    );

    expect(sampled).toEqual([{ source: 'Alpha.md', target: 'Beta.md' }]);
    expect(selectRepresentativeGraphEdges(sampled, 4)).toBe(sampled);
  });

  it('dims only the base layer while a connected path is focused', () => {
    const normal = getGraphBaseEdgeOpacity(400, 0.7, false);
    const focused = getGraphBaseEdgeOpacity(400, 0.7, true);

    expect(focused).toBeLessThan(normal);
    expect(themeGraphTokens.activeEdgeOpacity).toBe(1);
  });
});
