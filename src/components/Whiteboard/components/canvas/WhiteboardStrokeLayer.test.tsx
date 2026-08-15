import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardDrawingTool, WhiteboardStroke } from '../../model/whiteboardModel';
import { rotateSelectionStroke } from '../../model/whiteboardSelection';
import { WhiteboardDraftStrokeLayer, WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';

function renderBrush(tool: WhiteboardDrawingTool) {
  const stroke: WhiteboardStroke = {
    color: '#334455',
    id: `${tool}-stroke`,
    points: [
      { pressure: 0.4, x: 0, y: 0 },
      { pressure: 0.9, x: 20, y: 8 },
      { pressure: 0.9, x: 40, y: 0 },
    ],
    size: 1,
    tool,
  };
  const { container } = render(<WhiteboardStrokeLayer strokes={[stroke]} />);
  return container.querySelector(`[data-whiteboard-brush="${tool}"]`)!;
}

function createProgressiveStrokes(color: string, offset: number): WhiteboardStroke[] {
  return Array.from({ length: 128 }, (_, index) => ({
    color,
    id: `stroke-${index}`,
    points: [
      { pressure: 0.4, x: index * 3 + offset, y: offset },
      { pressure: 0.8, x: index * 3 + offset + 20, y: offset + 10 },
    ],
    size: 1,
    tool: 'pen',
  }));
}

function installAnimationFrameQueue() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });
  return {
    flushNext() {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      expect(next).toBeDefined();
      if (!next) return;
      callbacks.delete(next[0]);
      act(() => next[1](performance.now()));
    },
  };
}

function getProgressiveSlot(container: HTMLElement, slot: number): SVGSVGElement {
  return container.querySelector(`[data-whiteboard-progressive-slot="${slot}"]`)!;
}

function getRenderedStrokeCount(node: ParentNode): number {
  return node.querySelectorAll('[data-whiteboard-stroke]').length;
}

describe('WhiteboardStrokeLayer brush rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders straight linear paths and an open end arrowhead', () => {
    const { container } = render(<WhiteboardStrokeLayer strokes={[
      { color: '#111111', id: 'line', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }], size: 1, tool: 'line' },
      { color: '#ef4444', id: 'arrow', points: [{ pressure: 0.5, x: 0, y: 20 }, { pressure: 0.5, x: 100, y: 20 }], size: 1, tool: 'arrow' },
    ]} />);

    expect(container.querySelector('[data-whiteboard-linear="line"] path')?.getAttribute('d')).toMatch(/\bC/);
    expect(container.querySelector('[data-whiteboard-linear="arrow"] > path')?.getAttribute('d')).toMatch(/\bC/);
    expect(container.querySelector('[data-whiteboard-arrowhead="end"]')).toHaveAttribute('fill', 'none');
  });

  it('renders recognized closed shapes as Rough.js outlines', () => {
    const shape: WhiteboardStroke = {
      autoShape: 'ellipse', color: '#111111', id: 'ellipse',
      points: [
        { pressure: 0.5, x: 0, y: 50 }, { pressure: 0.5, x: 100, y: 0 },
        { pressure: 0.5, x: 200, y: 50 }, { pressure: 0.5, x: 100, y: 100 },
      ],
      size: 1, tool: 'line',
    };
    const { container, rerender } = render(<WhiteboardStrokeLayer strokes={[shape]} />);

    const path = container.querySelector('[data-whiteboard-linear="line"] path');
    expect(container.querySelector('[data-whiteboard-autoshape="ellipse"]')).not.toBeNull();
    expect(path?.getAttribute('d')).toMatch(/\bC/);
    expect(path).toHaveAttribute('fill', 'none');
    expect(path).toHaveAttribute('stroke-width', String(themeWhiteboardTokens.autoShapeStrokeWidthPx));
    const originalPath = path?.getAttribute('d');

    const rotated = rotateSelectionStroke(shape, { x: 100, y: 50 }, Math.PI / 4);
    rerender(<WhiteboardStrokeLayer strokes={[rotated]} />);
    expect(container.querySelector('[data-whiteboard-linear="line"] path')?.getAttribute('d')).not.toBe(originalPath);
    expect(rotated.points[0]).toMatchObject({ x: expect.closeTo(29.29, 1), y: expect.closeTo(-20.71, 1) });
  });

  it('renders marker ink with a flat core and no round cap circles', () => {
    const marker = renderBrush('marker');

    expect(marker.querySelectorAll('circle')).toHaveLength(0);
    expect(marker.querySelectorAll('path')[1]).toHaveAttribute('stroke-linecap', 'butt');
  });

  it('uses material-specific grain density for dry brushes', () => {
    const pencil = renderBrush('pencil');
    const coloredPencil = renderBrush('colored-pencil');
    const crayon = renderBrush('crayon');

    expect(pencil.querySelectorAll('path[stroke-dasharray]')).toHaveLength(2);
    expect(pencil.querySelectorAll('path[stroke-dashoffset]')).toHaveLength(2);
    expect(coloredPencil.querySelectorAll('[data-whiteboard-grain-group]')).toHaveLength(2);
    expect(crayon.querySelectorAll('[data-whiteboard-grain-group]')).toHaveLength(2);
  });

  it('keeps every material grain lane after grouping SVG paths', () => {
    const materials = [
      { brush: renderBrush('colored-pencil'), lanes: themeWhiteboardTokens.coloredPencilGrainLaneCount },
      { brush: renderBrush('crayon'), lanes: themeWhiteboardTokens.crayonGrainLaneCount },
    ];

    materials.forEach(({ brush, lanes }) => {
      const commands = Array.from(brush.querySelectorAll('[data-whiteboard-grain-group]'))
        .reduce((count, path) => count + (path.getAttribute('d')?.match(/\bM\b/g)?.length ?? 0), 0);
      expect(commands).toBe(lanes);
    });
  });

  it('layers pressure pigment into watercolor and fountain strokes', () => {
    const watercolor = renderBrush('watercolor');
    const fountain = renderBrush('fountain');

    expect(watercolor.querySelectorAll('path')).toHaveLength(5);
    expect(fountain.querySelectorAll('path')).toHaveLength(4);
    expect(fountain.querySelectorAll('circle')).toHaveLength(0);
  });

  it('uses material-specific marks for single-point strokes', () => {
    const createDot = (tool: WhiteboardDrawingTool) => ({
      color: '#334455',
      id: `${tool}-dot`,
      points: [{ pressure: 0.7, x: 20, y: 30 }],
      size: 1,
      tool,
    });
    const { container } = render(<WhiteboardStrokeLayer strokes={[
      createDot('marker'),
      createDot('fountain'),
      createDot('colored-pencil'),
      createDot('watercolor'),
      createDot('crayon'),
    ]} />);

    expect(container.querySelector('[data-whiteboard-brush-dab="marker"]')).toHaveAttribute('transform', 'rotate(90 20 30)');
    expect(container.querySelector('[data-whiteboard-brush-dab="fountain"]')).toHaveAttribute('transform', 'rotate(-42 20 30)');
    expect(container.querySelector('[data-whiteboard-brush-dab="colored-pencil"]')?.querySelectorAll('ellipse')).toHaveLength(2);
    expect(container.querySelector('[data-whiteboard-brush-dab="watercolor"]')?.querySelectorAll('ellipse')).toHaveLength(3);
    expect(container.querySelector('[data-whiteboard-brush-dab="crayon"]')?.querySelectorAll('ellipse')).toHaveLength(2);
  });

  it('dims complete strokes selected by an active erase gesture', () => {
    const stroke: WhiteboardStroke = {
      color: '#334455',
      id: 'target-stroke',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 0 }],
      size: 1,
      tool: 'pen',
    };
    const { container } = render(<WhiteboardStrokeLayer erasingStrokeIds={[stroke.id]} strokes={[stroke]} />);

    expect(container.querySelector(`[data-whiteboard-stroke="${stroke.id}"]`))
      .toHaveAttribute('opacity', String(themeWhiteboardTokens.eraserTargetPreviewOpacity));
  });

  it.each([
    'pen', 'pencil', 'marker', 'colored-pencil', 'fountain', 'watercolor', 'crayon',
  ] as const)('uses identical chunked %s paths before and after commit', (tool) => {
    const stroke: WhiteboardStroke = {
      color: '#334455',
      id: `long-${tool}`,
      points: Array.from({ length: 300 }, (_, index) => ({
        pressure: 0.4 + index % 5 / 10,
        x: index,
        y: Math.sin(index / 20) * 40,
      })),
      size: 1,
      tool,
    };
    const { container, rerender } = render(<WhiteboardDraftStrokeLayer stroke={stroke} />);
    const previewPaths = Array.from(container.querySelectorAll('path')).map((path) => path.getAttribute('d'));

    expect(container.querySelectorAll('[data-whiteboard-render-chunk]').length).toBeGreaterThan(1);

    rerender(<WhiteboardStrokeLayer strokes={[{ ...stroke }]} />);

    const committedPaths = Array.from(container.querySelectorAll('path')).map((path) => path.getAttribute('d'));
    expect(committedPaths).toEqual(previewPaths);
  });

  it('replaces large stroke layers progressively without a blank frame', () => {
    const frames = installAnimationFrameQueue();
    const source = createProgressiveStrokes('#112233', 0);
    const target = createProgressiveStrokes('#445566', 100);
    const { container, rerender } = render(<WhiteboardStrokeLayer progressive strokes={source} />);

    expect(getRenderedStrokeCount(container)).toBe(128);
    rerender(<WhiteboardStrokeLayer progressive strokes={target} />);

    const sourceSlot = getProgressiveSlot(container, 0);
    const targetSlot = getProgressiveSlot(container, 1);
    expect(getRenderedStrokeCount(sourceSlot)).toBe(128);
    expect(getRenderedStrokeCount(targetSlot)).toBe(0);

    let previousTargetCount = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      frames.flushNext();
      const targetCount = getRenderedStrokeCount(targetSlot);
      expect(targetCount - previousTargetCount).toBeGreaterThan(0);
      expect(targetCount - previousTargetCount).toBeLessThanOrEqual(16);
      expect(getRenderedStrokeCount(container)).toBe(128);
      previousTargetCount = targetCount;
    }

    expect(getRenderedStrokeCount(sourceSlot)).toBe(0);
    expect(getRenderedStrokeCount(targetSlot)).toBe(128);
    expect(Array.from(targetSlot.querySelectorAll('path')).every((path) => path.getAttribute('fill') === '#445566')).toBe(true);
  });

  it('drops an obsolete progressive target when the stroke result changes', () => {
    const frames = installAnimationFrameQueue();
    const source = createProgressiveStrokes('#112233', 0);
    const firstTarget = createProgressiveStrokes('#445566', 100);
    const finalTarget = createProgressiveStrokes('#778899', 200);
    const { container, rerender } = render(<WhiteboardStrokeLayer progressive strokes={source} />);

    rerender(<WhiteboardStrokeLayer progressive strokes={firstTarget} />);
    frames.flushNext();
    expect(Array.from(container.querySelectorAll('path')).some((path) => path.getAttribute('fill') === '#445566')).toBe(true);

    rerender(<WhiteboardStrokeLayer progressive strokes={finalTarget} />);

    expect(getRenderedStrokeCount(container)).toBe(128);
    expect(Array.from(container.querySelectorAll('path')).every((path) => path.getAttribute('fill') === '#778899')).toBe(true);
  });
});
