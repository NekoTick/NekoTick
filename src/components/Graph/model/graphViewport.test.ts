import { describe, expect, it } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  GRAPH_INITIAL_VIEWPORT,
  clampGraphZoom,
  clientPointToGraphPoint,
  fitGraphViewportToNodes,
  getGraphViewportContentBounds,
  getGraphViewportOverlayBounds,
  zoomGraphViewportAtPoint,
} from './graphViewport';

describe('clampGraphZoom', () => {
  it('limits zoom to the graph range', () => {
    expect(clampGraphZoom(0)).toBe(themeGraphTokens.minZoom);
    expect(clampGraphZoom(1.5)).toBe(1.5);
    expect(clampGraphZoom(10)).toBe(themeGraphTokens.maxZoom);
  });
});

describe('clientPointToGraphPoint', () => {
  it('accounts for the viewport element position, translation, and zoom', () => {
    expect(clientPointToGraphPoint(
      { x: 260, y: 190 },
      { left: 20, top: 10 },
      { x: 40, y: -20, zoom: 2 },
    )).toEqual({ x: 100, y: 100 });
  });
});

describe('zoomGraphViewportAtPoint', () => {
  it('keeps the graph point under the cursor fixed', () => {
    const cursor = { x: 320, y: 180 };
    const current = { x: 40, y: -20, zoom: 1.4 };
    const graphPointBefore = {
      x: (cursor.x - current.x) / current.zoom,
      y: (cursor.y - current.y) / current.zoom,
    };

    const next = zoomGraphViewportAtPoint(current, cursor, 2.2);

    expect((cursor.x - next.x) / next.zoom).toBeCloseTo(graphPointBefore.x);
    expect((cursor.y - next.y) / next.zoom).toBeCloseTo(graphPointBefore.y);
  });

  it('uses the clamped zoom when preserving the cursor anchor', () => {
    expect(zoomGraphViewportAtPoint(
      { x: 0, y: 0, zoom: 1 },
      { x: 100, y: 50 },
      100,
    )).toEqual({
      x: 100 - 100 * themeGraphTokens.maxZoom,
      y: 50 - 50 * themeGraphTokens.maxZoom,
      zoom: themeGraphTokens.maxZoom,
    });
  });
});

describe('fitGraphViewportToNodes', () => {
  it('centers node bounds with padding without enlarging past the default zoom', () => {
    const viewport = fitGraphViewportToNodes(
      [{ x: 100, y: 100 }, { x: 500, y: 300 }],
      { x: 1000, y: 700 },
    );

    expect(viewport.zoom).toBe(themeGraphTokens.defaultZoom);
    expect(viewport.x).toBe(200);
    expect(viewport.y).toBe(150);
  });

  it('scales large bounds to fit the available viewport', () => {
    const viewport = fitGraphViewportToNodes(
      [{ x: 0, y: 0 }, { x: 1200, y: 760 }],
      { x: 600, y: 400 },
    );
    const nodeDiameter = themeGraphTokens.activeNodeRadiusPx * 2;
    const expectedZoom = Math.min(
      (600 - themeGraphTokens.fitViewPaddingPx * 2) / (1200 + nodeDiameter),
      (400 - themeGraphTokens.fitViewPaddingPx * 2) / (760 + nodeDiameter),
    );

    expect(viewport.zoom).toBeCloseTo(expectedZoom);
    expect(viewport.x).toBeCloseTo((600 - (1200 + nodeDiameter) * expectedZoom) / 2 + themeGraphTokens.activeNodeRadiusPx * expectedZoom);
    expect(viewport.y).toBeCloseTo((400 - (760 + nodeDiameter) * expectedZoom) / 2 + themeGraphTokens.activeNodeRadiusPx * expectedZoom);
  });

  it('keeps representative graph bounds within the fit padding on a 200px viewport', () => {
    const viewportSize = { x: 200, y: 680 };
    const nodes = [{ x: 0, y: 0 }, { x: 650, y: 420 }];
    const viewport = fitGraphViewportToNodes(nodes, viewportSize);
    const radius = themeGraphTokens.activeNodeRadiusPx;
    const left = viewport.x - radius * viewport.zoom;
    const right = viewport.x + (nodes[1]!.x + radius) * viewport.zoom;

    expect(left).toBeCloseTo(themeGraphTokens.fitViewPaddingPx);
    expect(right).toBeCloseTo(viewportSize.x - themeGraphTokens.fitViewPaddingPx);
  });

  it('returns the initial viewport when fitting is not possible', () => {
    expect(fitGraphViewportToNodes([], { x: 1000, y: 700 })).toEqual(GRAPH_INITIAL_VIEWPORT);
    expect(fitGraphViewportToNodes([{ x: 1, y: 1 }], { x: 0, y: 700 })).toEqual(GRAPH_INITIAL_VIEWPORT);
  });

  it('fits inside the content area when viewport controls occupy the bottom edge', () => {
    const viewportSize = { x: 800, y: 600 };
    const viewport = fitGraphViewportToNodes(
      [{ x: 0, y: 0 }, { x: 1000, y: 1000 }],
      viewportSize,
      getGraphViewportContentBounds(viewportSize, false),
    );
    const bottomRight = {
      x: viewport.x + 1000 * viewport.zoom,
      y: viewport.y + 1000 * viewport.zoom,
    };
    const content = getGraphViewportContentBounds(viewportSize, false);

    expect(bottomRight.y).toBeLessThanOrEqual(content.bottom - themeGraphTokens.fitViewPaddingPx);
  });
});

describe('getGraphViewportOverlayBounds', () => {
  it('reserves the reused whiteboard controls at the bottom-left', () => {
    expect(getGraphViewportOverlayBounds({ x: 800, y: 600 }, false)[0]).toEqual({
      bottom: 600 - themeGraphTokens.viewportControlsVerticalOffsetPx,
      left: themeGraphTokens.viewportControlsHorizontalOffsetPx,
      right: themeGraphTokens.viewportControlsHorizontalOffsetPx
        + themeGraphTokens.viewportControlsWidthPx,
      top: 600
        - themeGraphTokens.viewportControlsVerticalOffsetPx
        - themeGraphTokens.viewportControlsHeightPx,
    });
  });
});
