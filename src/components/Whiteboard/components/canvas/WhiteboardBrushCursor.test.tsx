import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardDrawingTool } from '@/components/Whiteboard/model/core/whiteboardModel';
import { WhiteboardBrushCursor } from './WhiteboardBrushCursor';
import { WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';

describe('WhiteboardBrushCursor', () => {
  it('renders a standalone point for the pen cursor', () => {
    const { container } = render(<WhiteboardBrushCursor color="#111111" point={{ x: 20, y: 30 }} size={1} tool="pen" />);
    const cursor = container.querySelector('[data-whiteboard-brush-cursor="pen"]');
    const dab = cursor?.querySelector('[data-whiteboard-brush-dab="pen"]');

    expect(dab).toHaveAttribute('fill', '#111111');
    expect(dab).toHaveAttribute('opacity', '1');
    expect(dab).not.toHaveAttribute('stroke');
    expect(container.querySelector('svg')).toHaveClass(
      'pointer-events-none',
      'hidden',
      'group-hover/whiteboard-surface:block',
    );
  });

  it('previews marker and fountain nib geometry', () => {
    const marker = render(<WhiteboardBrushCursor color="#ffaa00" point={{ x: 20, y: 30 }} size={1} tool="marker" />);
    const fountain = render(<WhiteboardBrushCursor color="#111111" point={{ x: 20, y: 30 }} size={1} tool="fountain" />);

    expect(marker.container.querySelector('[data-whiteboard-brush-dab="marker"]')).toHaveAttribute('transform', 'rotate(90 20 30)');
    expect(fountain.container.querySelector('[data-whiteboard-brush-dab="fountain"]')).toHaveAttribute('transform', 'rotate(-42 20 30)');
  });

  it('previews every watercolor pigment layer', () => {
    const { container } = render(<WhiteboardBrushCursor color="#22aa88" point={{ x: 20, y: 30 }} size={1} tool="watercolor" />);

    expect(container.querySelector('[data-whiteboard-brush-dab="watercolor"]')?.querySelectorAll('ellipse')).toHaveLength(3);
  });

  it('uses the same material dab as a real single-point stroke', () => {
    const tools: WhiteboardDrawingTool[] = [
      'pen', 'pencil', 'marker', 'colored-pencil', 'fountain', 'watercolor', 'crayon',
    ];
    for (const tool of tools) {
      const cursor = render(<WhiteboardBrushCursor color="#336699" point={{ x: 20, y: 30 }} size={1} tool={tool} />);
      const stroke = render(<WhiteboardStrokeLayer strokes={[{
        color: '#336699',
        id: 'whiteboard-brush-cursor',
        points: [{ pressure: themeWhiteboardTokens.defaultPointerPressure, tilt: 0, velocity: 0, x: 20, y: 30 }],
        size: 1,
        tool,
      }]} />);

      expect(cursor.container.querySelector('[data-whiteboard-brush-dab]')?.outerHTML)
        .toBe(stroke.container.querySelector('[data-whiteboard-brush-dab]')?.outerHTML);
      cursor.unmount();
      stroke.unmount();
    }
  });
});
