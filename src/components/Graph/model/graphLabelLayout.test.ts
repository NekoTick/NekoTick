import { describe, expect, it } from 'vitest';
import type { PositionedGraphNode } from './graphLayout';
import { layoutGraphLabels } from './graphLabelLayout';
import {
  getGraphLabelBounds,
  getGraphLabelWidth,
  getGraphNodeBounds,
} from './graphLabelGeometry';

function node(id: string, x: number, y: number, degree = 1): PositionedGraphNode {
  return { id: `${id}.md`, label: id, degree, x, y };
}

function intersects(
  left: ReturnType<typeof getGraphLabelBounds>,
  right: ReturnType<typeof getGraphLabelBounds>,
): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function expectCollisionFree(
  nodes: PositionedGraphNode[],
  viewport: { x: number; y: number; zoom: number },
  viewportSize?: { x: number; y: number },
): void {
  const placements = layoutGraphLabels(nodes, viewport, [], viewportSize);
  const labels = [...placements].map(([id, placement]) => ({
    bounds: getGraphLabelBounds(nodes.find((item) => item.id === id)!, viewport, placement),
    id,
  }));
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      expect(intersects(labels[left]!.bounds, labels[right]!.bounds)).toBe(false);
    }
    for (const graphNode of nodes) {
      if (graphNode.id === labels[left]!.id) continue;
      expect(intersects(labels[left]!.bounds, getGraphNodeBounds(graphNode, viewport))).toBe(false);
    }
  }
}

describe('layoutGraphLabels', () => {
  it('uses available screen space for labels below the old zoom threshold', () => {
    const nodes = [
      node('Alpha', 100, 100),
      node('Beta', 500, 100),
      node('Gamma', 900, 100),
    ];

    expect([...layoutGraphLabels(nodes, { x: 0, y: 0, zoom: 0.5 }).keys()]).toEqual(
      nodes.map((item) => item.id),
    );
  });

  it('uses space around densely placed nodes instead of only placing labels below', () => {
    const nodes = [node('Alpha', 100, 100), node('Beta', 100, 106)];
    const placements = layoutGraphLabels(nodes, { x: 0, y: 0, zoom: 0.5 });

    expect(placements.size).toBe(2);
    expect(placements.get('Alpha.md')).not.toEqual(placements.get('Beta.md'));
  });

  it('shows every label at reading zoom even when nodes are close', () => {
    const nodes = [node('Alpha', 100, 100), node('Beta', 104, 100)];

    expect([...layoutGraphLabels(nodes, { x: 0, y: 0, zoom: 0.9 }).keys()]).toEqual(
      nodes.map((item) => item.id),
    );
    expectCollisionFree(nodes, { x: 0, y: 0, zoom: 0.9 });
  });

  it('keeps label and node collisions active at every zoom level', () => {
    const nodes = Array.from({ length: 16 }, (_, index) => (
      node(`Cluster ${index}`, 100 + (index % 4) * 5, 100 + Math.floor(index / 4) * 5, index)
    ));

    for (const zoom of [0.25, 0.9, 1.45, 3]) {
      expectCollisionFree(nodes, { x: 0, y: 0, zoom });
    }
  });

  it('keeps focused labels clear of nodes outside the focused neighborhood', () => {
    const candidates = [node('A', 100, 100), node('B', 160, 100)];
    const obstacle = node('C', 185, 100);
    const viewport = { x: 0, y: 0, zoom: 1 };
    const placements = layoutGraphLabels(
      candidates,
      viewport,
      ['A.md'],
      { x: 400, y: 240 },
      [...candidates, obstacle],
    );
    const placement = placements.get('B.md');

    expect(placement).toBeDefined();
    expect(intersects(
      getGraphLabelBounds(candidates[1]!, viewport, placement!),
      getGraphNodeBounds(obstacle, viewport),
    )).toBe(false);
  });

  it('keeps labels out of interactive overlay bounds', () => {
    const graphNode = node('Overlay neighbor', 100, 250);
    const viewport = { x: 0, y: 0, zoom: 1 };
    const exclusion = { bottom: 288, left: 68, right: 228, top: 246 };
    const placement = layoutGraphLabels(
      [graphNode],
      viewport,
      [],
      { x: 240, y: 300 },
      [graphNode],
      [exclusion],
    ).get(graphNode.id);

    expect(placement).toBeDefined();
    expect(intersects(
      getGraphLabelBounds(graphNode, viewport, placement!),
      exclusion,
    )).toBe(false);
  });

  it('does not force a priority label into an interactive overlay', () => {
    const graphNode = node('Focused note', 100, 100);
    const exclusion = { bottom: 160, left: 40, right: 160, top: 40 };
    const placement = layoutGraphLabels(
      [graphNode],
      { x: 0, y: 0, zoom: 1 },
      [graphNode.id],
      { x: 200, y: 200 },
      [graphNode],
      [exclusion],
    ).get(graphNode.id);

    expect(placement).toBeUndefined();
  });

  it('uses all available space for a sparse graph at low zoom', () => {
    const nodes = Array.from({ length: 100 }, (_, index) => (
      node(
        `Node ${index}`,
        200 + (index % 10) * 400,
        200 + Math.floor(index / 10) * 400,
        100 - index,
      )
    ));

    const placements = layoutGraphLabels(
      nodes,
      { x: 0, y: 0, zoom: 0.25 },
      [],
      { x: 1000, y: 1000 },
    );

    expect(placements.size).toBe(nodes.length);
  });

  it('reserves a placement for a focused node in a crowded cluster', () => {
    const nodes = Array.from({ length: 8 }, (_, index) => (
      node(index === 0 ? 'Focused' : `Hub ${index}`, 100, 100, index + 1)
    ));
    const placements = layoutGraphLabels(
      nodes,
      { x: 0, y: 0, zoom: 0.6 },
      ['Focused.md'],
    );

    expect(placements.has('Focused.md')).toBe(true);
    expect(placements.size).toBeLessThan(nodes.length);
  });

  it('caps dense preview labels while preserving the focused label', () => {
    const nodes = Array.from({ length: 20 }, (_, index) => (
      node(index === 0 ? 'Focused' : `Branch ${index}`, 100 + index * 100, 100, 20 - index)
    ));
    const placements = layoutGraphLabels(
      nodes,
      { x: 0, y: 0, zoom: 1 },
      ['Focused.md'],
      { x: 2400, y: 300 },
      nodes,
      [],
      6,
    );

    expect(placements.size).toBe(6);
    expect(placements.has('Focused.md')).toBe(true);
  });

  it('keeps a priority label visible inside a dense ring', () => {
    const focused = node('Focused', 100, 100);
    const ring = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI * 2 / 16;
      return node(
        `Ring ${index}`,
        100 + Math.cos(angle) * 36,
        100 + Math.sin(angle) * 36,
      );
    });
    const nodes = [focused, ...ring];
    const viewport = { x: 0, y: 0, zoom: 1 };
    const viewportSize = { x: 200, y: 200 };

    const placement = layoutGraphLabels(
      nodes,
      viewport,
      [focused.id],
      viewportSize,
    ).get(focused.id);

    expect(placement).toBeDefined();
    const bounds = getGraphLabelBounds(focused, viewport, placement!);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewportSize.x);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(viewportSize.y);
    expect(ring.some((item) => intersects(
      bounds,
      getGraphNodeBounds(item, viewport),
    ))).toBe(true);
  });

  it('places edge labels inward when the outward side would be clipped', () => {
    const nodes = [node('Left edge', 10, 100), node('Right edge', 180, 100)];
    const placements = layoutGraphLabels(
      nodes,
      { x: 0, y: 0, zoom: 1 },
      [],
      { x: 200, y: 200 },
    );

    expect(placements.get('Left edge.md')?.textAnchor).toBe('start');
    expect(placements.get('Right edge.md')?.textAnchor).toBe('end');
  });

  it('uses an inward diagonal when a corner blocks every cardinal placement', () => {
    const cornerNode = node('Corner', 0, 0);
    const placement = layoutGraphLabels(
      [cornerNode],
      { x: 0, y: 0, zoom: 1 },
      [],
      { x: 120, y: 120 },
    ).get(cornerNode.id);

    expect(placement?.textAnchor).toBe('start');
    expect(placement?.x).toBeGreaterThan(0);
    expect(placement?.y).toBeGreaterThan(0);
  });

  it('measures Latin, CJK, and emoji clusters conservatively in narrow viewports', () => {
    const labels = [
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      '\u56fe\u8c31\u6807\u7b7e\u56fe\u8c31\u6807\u7b7e\u56fe\u8c31\u6807\u7b7e\u56fe\u8c31',
      '\u{1f469}\u200d\u{1f4bb}'.repeat(14),
    ];

    for (const label of labels) {
      const graphNode = node(label, 90, 60);
      expect(layoutGraphLabels(
        [graphNode],
        { x: 0, y: 0, zoom: 1 },
        [],
        { x: 180, y: 120 },
      ).has(graphNode.id)).toBe(false);
    }
  });

  it('keeps a long priority label visible with its full name preserved outside the visual text', () => {
    const graphNode = node('A very long current note name that cannot fit', 160, 120);
    const viewport = { x: 0, y: 0, zoom: 1 };
    const placement = layoutGraphLabels(
      [graphNode],
      viewport,
      [graphNode.id],
      { x: 320, y: 240 },
    ).get(graphNode.id);

    expect(placement).toBeDefined();
    expect(placement?.text).toMatch(/\u2026$/u);
    const bounds = getGraphLabelBounds(
      graphNode,
      viewport,
      placement!,
      getGraphLabelWidth(placement!.text!),
    );
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(320);
  });

  it('accounts for variable Latin width and joined emoji without splitting graphemes', () => {
    const family = '\u{1f469}\u200d\u{1f4bb}';

    expect(getGraphLabelWidth('WWWWWW')).toBeGreaterThan(getGraphLabelWidth('iiiiii'));
    expect(getGraphLabelWidth(family.repeat(3))).toBe(getGraphLabelWidth('\u56fe'.repeat(3)));
    expect(getGraphLabelWidth('e\u0301'.repeat(8))).toBe(getGraphLabelWidth('e'.repeat(8)));
    expect(getGraphLabelWidth('\u{1f469}\u{1f3fd}')).toBe(getGraphLabelWidth('\u{1f469}'));
  });

  it('keeps every accepted label inside a narrow viewport', () => {
    const nodes = [
      node('Left edge', 8, 40),
      node('Middle', 75, 75),
      node('Right edge', 142, 110),
    ];
    const viewport = { x: 0, y: 0, zoom: 1 };
    const viewportSize = { x: 150, y: 150 };
    const placements = layoutGraphLabels(nodes, viewport, [], viewportSize);

    for (const [id, placement] of placements) {
      const bounds = getGraphLabelBounds(nodes.find((item) => item.id === id)!, viewport, placement);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(viewportSize.x);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(viewportSize.y);
    }
  });
});
