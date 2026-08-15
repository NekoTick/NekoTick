import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureNativeFileShare } from '@/lib/nativeFileShare';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { createWhiteboardExportBlob, exportWhiteboard } from './whiteboardExport';

describe('whiteboard export appearance', () => {
  const originalImage = globalThis.Image;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
    configureNativeFileShare(null);
  });

  it('exports images on the selected paper background', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    document.body.appendChild(root);

    try {
      const blob = await createWhiteboardExportBlob({
        elements: [{ id: 'image-1', imageSrc: 'data:image/png;base64,demo', type: 'image', x: 0, y: 0, width: 100, height: 80, text: 'demo.png' }],
        paper: 'dots',
        root,
        strokes: [],
      }, 'svg');
      const svg = await blob?.text();

      expect(svg).toContain('<image href="data:image/png;base64,demo"');
      expect(svg).toContain('id="whiteboard-paper-pattern"');
      expect(svg).toContain('width="20" height="20" patternUnits="userSpaceOnUse"');
      expect(svg).toContain('cx="0.65" cy="0.65" r="0.65"');
    } finally {
      root.remove();
    }
  });

  it('exports flipped image orientation', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [{
        flipY: true, height: 80, id: 'image-1', imageSrc: 'data:image/png;base64,demo',
        text: 'demo.png', type: 'image', width: 100, x: 0, y: 0,
      }],
      paper: 'blank',
      root,
      strokes: [],
    }, 'svg');

    expect(await blob?.text()).toContain('scale(1 -1)');
  });

  it('exports image rotation around its center', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [{
        height: 80, id: 'image-1', imageSrc: 'data:image/png;base64,demo', rotation: Math.PI / 2,
        text: 'demo.png', type: 'image', width: 100, x: 0, y: 0,
      }],
      paper: 'blank',
      root,
      strokes: [],
    }, 'svg');

    expect(await blob?.text()).toContain('rotate(90)');
  });

  it('exports escaped multiline text with its transform', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [{
        color: '#1e96eb', flipY: true, fontSize: 24, height: 60, id: 'text-1', lineHeight: 1.25,
        rotation: Math.PI / 2, text: '<First>\nSecond & third', type: 'text', width: 120, x: 10, y: 20,
      }],
      paper: 'blank', root, strokes: [],
    }, 'svg');
    const svg = await blob?.text();

    expect(svg).toContain('data-whiteboard-text="true"');
    expect(svg).toContain('&lt;First&gt;');
    expect(svg).toContain('Second &amp; third');
    expect(svg?.match(/<tspan /g)).toHaveLength(2);
    expect(svg).toContain('rotate(90)');
    expect(svg).toMatch(/scale\([^ ]+ -/);
  });

  it('preserves material-specific brush layers in exported SVG', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    document.body.appendChild(root);
    const points = [{ pressure: 0.4, x: 0, y: 0 }, { pressure: 0.8, x: 30, y: 10 }];

    try {
      const blob = await createWhiteboardExportBlob({
        elements: [],
        paper: 'blank',
        root,
        strokes: [
          { color: '#111111', id: 'pencil', points, size: 1, tool: 'pencil' },
          { color: '#22aa44', id: 'marker', points: points.map((point) => ({ ...point, y: point.y + 30 })), size: 1, tool: 'marker' },
          { color: '#3344aa', id: 'fountain', points: points.map((point) => ({ ...point, y: point.y + 60 })), size: 1, tool: 'fountain' },
          { color: '#1e96eb', id: 'colored-pencil', points: points.map((point) => ({ ...point, y: point.y + 90 })), size: 1, tool: 'colored-pencil' },
          { color: '#ef4444', id: 'crayon', points: points.map((point) => ({ ...point, y: point.y + 120 })), size: 1, tool: 'crayon' },
          { color: '#ffaa00', id: 'marker-dot', points: [{ pressure: 0.7, x: 80, y: 20 }], size: 1, tool: 'marker' },
        ],
      }, 'svg');
      const svg = await blob?.text();

      expect(svg).toContain('data-whiteboard-brush="pencil"');
      expect(svg).toContain('stroke-dashoffset="');
      expect(svg).toContain('data-whiteboard-brush="marker"');
      expect(svg).toContain('stroke-linecap="butt"');
      expect(svg).toContain('data-whiteboard-brush="fountain"');
      expect(svg).toContain('data-whiteboard-brush="colored-pencil"');
      expect(svg).toContain('data-whiteboard-brush="crayon"');
      expect(svg?.match(/data-whiteboard-grain-group=/g)).toHaveLength(4);
      expect(svg).toContain('data-whiteboard-brush-dab="marker"');
      expect(svg).toContain('transform="rotate(90 80 20)"');
      expect(svg?.match(/d="M 0 0 L 30 10"/g)?.length).toBeGreaterThan(1);
    } finally {
      root.remove();
    }
  });

  it('exports line and arrow geometry', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [], paper: 'blank', root,
      strokes: [
        { color: '#111111', id: 'line', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }], size: 1, tool: 'line' },
        { color: '#ef4444', id: 'arrow', points: [{ pressure: 0.5, x: 0, y: 30 }, { pressure: 0.5, x: 100, y: 30 }], size: 1, tool: 'arrow' },
      ],
    }, 'svg');
    const svg = await blob?.text();

    expect(svg).toContain('data-whiteboard-linear="line"');
    expect(svg).toContain('data-whiteboard-linear="arrow"');
    expect(svg).toMatch(/data-whiteboard-linear="arrow"[^]*\bC/);
  });

  it('exports recognized auto shape outlines', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [], paper: 'blank', root,
      strokes: [{
        autoShape: 'diamond', color: '#111111', id: 'diamond',
        points: [
          { pressure: 0.5, x: 50, y: 0 }, { pressure: 0.5, x: 100, y: 50 },
          { pressure: 0.5, x: 50, y: 100 }, { pressure: 0.5, x: 0, y: 50 }, { pressure: 0.5, x: 50, y: 0 },
        ],
        size: 1, tool: 'line',
      }],
    }, 'svg');

    const svg = await blob?.text();
    expect(svg).toContain('data-whiteboard-linear="line"');
    expect(svg).toMatch(/data-whiteboard-linear="line"[^]*\bC/);
    expect(svg).toContain(`stroke-width="${themeWhiteboardTokens.autoShapeStrokeWidthPx}"`);
  });

  it('exports AutoDraw icons as editable vector outlines', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    const blob = await createWhiteboardExportBlob({
      elements: [{
        autoDrawIcon: 'house', color: '#1e96eb', height: 120, id: 'house',
        rotation: Math.PI / 2, text: 'House', type: 'icon', width: 140, x: 10, y: 20,
      }],
      paper: 'blank', root, strokes: [],
    }, 'svg');
    const svg = await blob?.text();

    expect(svg).toContain('data-whiteboard-autodraw-icon="house"');
    expect(svg).toContain(`stroke-width="${themeWhiteboardTokens.autoShapeStrokeWidthPx * themeWhiteboardTokens.autoDrawIconViewBoxSizePx / Math.sqrt(140 * 120)}"`);
    expect(svg).toContain('rotate(90)');
    expect(svg).toContain('stroke="#1e96eb"');
  });

  it('exports strokes above images like the live canvas', async () => {
    const root = document.createElement('div');
    root.style.setProperty('--vlaina-bg-primary', '#ffffff');
    document.body.appendChild(root);

    try {
      const blob = await createWhiteboardExportBlob({
        elements: [{ id: 'image-1', imageSrc: 'data:image/png;base64,demo', type: 'image', x: 0, y: 0, width: 100, height: 80, text: 'demo.png' }],
        paper: 'blank',
        root,
        strokes: [{
          color: '#111111', id: 'stroke-1', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 80, y: 40 }], size: 1, tool: 'pen',
        }],
      }, 'svg');
      const svg = await blob?.text() ?? '';

      expect(svg.indexOf('<image ')).toBeGreaterThan(-1);
      expect(svg.indexOf('<image ')).toBeLessThan(svg.indexOf('data-whiteboard-brush="pen"'));
    } finally {
      root.remove();
    }
  });

  it('shares whiteboard exports through the configured native runtime', async () => {
    const shareFile = vi.fn().mockResolvedValue(undefined);
    configureNativeFileShare(shareFile);

    await expect(exportWhiteboard({
      elements: [],
      paper: 'blank',
      root: null,
      strokes: [],
    }, 'svg')).resolves.toBe(true);

    expect(shareFile).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.any(Blob),
      fileName: expect.stringMatching(/^whiteboard-\d{4}-\d{2}-\d{2}\.svg$/),
      mimeType: 'image/svg+xml;charset=utf-8',
      title: 'Whiteboard',
    }));
  });

  it('times out stalled raster image loading and releases the Blob URL', async () => {
    vi.useFakeTimers();
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
    }
    globalThis.Image = MockImage as unknown as typeof Image;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:whiteboard-export');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const exportPromise = createWhiteboardExportBlob({
      elements: [],
      paper: 'blank',
      root: null,
      strokes: [],
    }, 'png');
    const rejection = expect(exportPromise).rejects.toThrow('Whiteboard export image load timed out');

    await vi.advanceTimersByTimeAsync(20);

    await rejection;
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:whiteboard-export');
  });

});
