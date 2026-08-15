import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardElementNode } from './WhiteboardElementNode';

const image = {
  height: 80,
  id: 'image-1',
  imageSrc: 'data:image/png;base64,demo',
  text: 'demo.png',
  type: 'image' as const,
  width: 100,
  x: 0,
  y: 0,
};

describe('WhiteboardElementNode', () => {
  it('renders a transformed AutoDraw icon as vector content', () => {
    const { container } = render(<WhiteboardElementNode
      element={{
        autoDrawIcon: 'house', color: '#1e96eb', flipX: true, height: 120,
        id: 'house', text: 'House', type: 'icon', width: 140, x: 10, y: 20,
      }}
      selected={false}
      showSelectionBorder={false}
      tool="select"
      onPointerDown={vi.fn()}
    />);

    const icon = container.querySelector('[data-whiteboard-autodraw-icon="house"]');
    expect(screen.getByLabelText('House')).toHaveStyle({ height: '120px', left: '20px', top: '20px', width: '120px' });
    expect(icon).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(icon).toHaveAttribute(
      'stroke-width',
      String(themeWhiteboardTokens.autoShapeStrokeWidthPx * themeWhiteboardTokens.autoDrawIconViewBoxSizePx / 120),
    );
    expect(icon?.querySelector('path')).not.toHaveAttribute('vector-effect');
    expect(icon?.parentElement).toHaveStyle({ transform: 'scale(-1, 1)' });
  });

  it('renders an imported image without a bottom-right resize control', () => {
    render(<WhiteboardElementNode element={image} selected showSelectionBorder tool="select" onPointerDown={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'demo.png' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('demo.png')).toHaveClass('cursor-grab');
  });

  it('dims an image selected by an active erase gesture', () => {
    render(<WhiteboardElementNode element={image} erasing selected showSelectionBorder tool="select" onPointerDown={vi.fn()} />);
    expect(screen.getByLabelText('demo.png')).toHaveStyle({ opacity: themeWhiteboardTokens.eraserTargetPreviewOpacity });
  });

  it('does not intercept drawing input above an image', () => {
    render(<WhiteboardElementNode element={image} selected={false} showSelectionBorder={false} tool="pen" onPointerDown={vi.fn()} />);

    expect(screen.getByLabelText('demo.png')).toHaveClass('pointer-events-none');
  });

  it('keeps an unselected image border transparent', () => {
    const { rerender } = render(
      <WhiteboardElementNode element={image} selected={false} showSelectionBorder={false} tool="select" onPointerDown={vi.fn()} />,
    );

    expect(screen.getByLabelText('demo.png').style.borderColor).toBe('transparent');

    rerender(<WhiteboardElementNode element={image} selected showSelectionBorder tool="select" onPointerDown={vi.fn()} />);
    expect(screen.getByLabelText('demo.png').style.borderColor).toBe('var(--vlaina-color-whiteboard-selected)');
  });

  it('renders persisted image flips', () => {
    render(
      <WhiteboardElementNode element={{ ...image, flipX: true }} selected={false} showSelectionBorder={false} tool="select" onPointerDown={vi.fn()} />,
    );

    expect(screen.getByRole('img', { name: 'demo.png' })).toHaveStyle({ transform: 'scale(-1, 1)' });
  });

  it('renders persisted image rotation', () => {
    render(
      <WhiteboardElementNode element={{ ...image, rotation: Math.PI / 2 }} selected={false} showSelectionBorder={false} tool="select" onPointerDown={vi.fn()} />,
    );

    expect(screen.getByLabelText('demo.png')).toHaveStyle({ rotate: `${Math.PI / 2}rad` });
  });

  it('renders text in the handwritten family without stretching it', () => {
    render(<WhiteboardElementNode
      element={{
        color: '#1e96eb', flipX: true, fontSize: 24, height: 60, id: 'text-1', lineHeight: 1.25,
        text: 'Hello', type: 'text', width: 80, x: 10, y: 20,
      }}
      selected={false} showSelectionBorder={false} tool="select" onPointerDown={vi.fn()}
    />);

    expect(screen.getByText('Hello')).toHaveAttribute('data-whiteboard-text', 'true');
    expect(screen.getByText('Hello')).toHaveStyle({
      fontFamily: themeWhiteboardTokens.whiteboardTextFontFamily,
      fontSize: '24px',
      transform: 'scale(-1, 1)',
      transformOrigin: themeWhiteboardTokens.elementTransformOrigin,
    });
    expect(screen.getByLabelText('Hello')).toHaveStyle({ height: '60px', width: '80px' });
  });
});
