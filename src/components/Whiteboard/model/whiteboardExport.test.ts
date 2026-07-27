import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhiteboardExportBlob } from './whiteboardExport';

describe('whiteboard export appearance', () => {
  const originalImage = globalThis.Image;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
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
