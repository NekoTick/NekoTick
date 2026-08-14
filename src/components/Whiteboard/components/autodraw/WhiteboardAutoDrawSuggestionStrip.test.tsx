import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardAutoDrawSuggestion } from '../../model/autodraw/whiteboardAutoDrawRecognition';
import { WhiteboardAutoDrawSuggestionStrip } from './WhiteboardAutoDrawSuggestionStrip';

const suggestions: WhiteboardAutoDrawSuggestion[] = [
  { kind: 'icon', icon: 'house', label: 'House', score: 0.1 },
  { kind: 'shape', label: 'Rectangle', score: 0.2, shape: 'rectangle' },
];

describe('WhiteboardAutoDrawSuggestionStrip', () => {
  it('renders ranked candidates and applies the chosen item', () => {
    const onChoose = vi.fn();
    const { container } = render(<WhiteboardAutoDrawSuggestionStrip suggestions={suggestions} onChoose={onChoose} onDismiss={vi.fn()} />);

    expect(screen.getByRole('toolbar', { name: 'Auto shape' })).toBeInTheDocument();
    expect(container.querySelector('[data-whiteboard-autodraw-suggestions="true"]')).toHaveClass(
      '!bg-[var(--vlaina-color-pill-surface)]',
      'rounded-[var(--vlaina-radius-26px)]',
    );
    const strip = container.querySelector('[data-whiteboard-autodraw-suggestions="true"]');
    expect(strip).toHaveStyle({
      left: '50%',
      right: 'auto',
      transform: 'translateX(-50%)',
    });
    expect(container.querySelector('[data-lucide="wand-sparkles"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-whiteboard-autodraw-icon="house"]')).toHaveAttribute(
      'stroke-width',
      String(themeWhiteboardTokens.autoDrawSuggestionStrokeWidthPx
        * themeWhiteboardTokens.autoDrawIconViewBoxSizePx
        / themeWhiteboardTokens.autoDrawSuggestionGlyphSizePx),
    );
    fireEvent.click(screen.getByRole('button', { name: 'House' }));

    expect(onChoose).toHaveBeenCalledWith(suggestions[0]);
  });

  it('dismisses the strip without applying a candidate', () => {
    const onDismiss = vi.fn();
    render(<WhiteboardAutoDrawSuggestionStrip suggestions={suggestions} onChoose={vi.fn()} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('stays out of the layout when no sketch is pending', () => {
    const { container } = render(<WhiteboardAutoDrawSuggestionStrip suggestions={[]} onChoose={vi.fn()} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
