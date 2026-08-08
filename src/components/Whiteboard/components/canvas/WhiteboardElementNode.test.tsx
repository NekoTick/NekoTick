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
});
