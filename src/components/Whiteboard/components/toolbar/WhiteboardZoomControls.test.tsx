import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardZoomControls } from './WhiteboardZoomControls';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon-name={name} />,
}));

describe('WhiteboardZoomControls', () => {
  it('renders as a standalone bottom-left control', () => {
    const { container } = render(
      <WhiteboardZoomControls
        active
        viewport={{ x: 0, y: 0, zoom: 1 }}
        onFitView={vi.fn()}
        onResetView={vi.fn()}
        onZoomChange={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass('absolute', 'bottom-4', 'left-3');
    expect(screen.getByRole('button', { name: 'whiteboard.fitView' })).toBeInTheDocument();
    const percentage = screen.getByRole('button', { name: '100%' });
    expect(percentage.parentElement).toHaveClass(
      'rounded-[var(--vlaina-radius-26px)]',
      '!bg-[var(--vlaina-color-pill-surface)]',
      '!shadow-[var(--vlaina-shadow-raised-soft)]',
    );
    expect(percentage).toHaveClass(
      'shadow-none',
      'text-[length:var(--vlaina-font-13)]',
      'hover:bg-transparent',
      'hover:text-[var(--vlaina-color-control-hover-fg)]',
      'hover:shadow-none',
    );
    expect(percentage.parentElement).not.toHaveClass(
      '[&:has([data-whiteboard-zoom-percentage]:hover)]:!shadow-[var(--vlaina-shadow-raised-soft)]',
    );
    expect(screen.queryByText('whiteboard.fitView')).not.toBeInTheDocument();
  });

  it('adjusts zoom by one step when the percentage is scrolled', () => {
    const onZoomChange = vi.fn();
    const onParentWheel = vi.fn();
    render(
      <div onWheel={onParentWheel}>
        <WhiteboardZoomControls
          active
          viewport={{ x: 0, y: 0, zoom: 1 }}
          onFitView={vi.fn()}
          onResetView={vi.fn()}
          onZoomChange={onZoomChange}
        />
      </div>,
    );
    const percentage = screen.getByRole('button', { name: '100%' });

    fireEvent.wheel(percentage, { deltaY: -1 });
    fireEvent.wheel(percentage, { deltaY: 1 });

    expect(onZoomChange).toHaveBeenNthCalledWith(1, themeWhiteboardTokens.zoomStep);
    expect(onZoomChange).toHaveBeenNthCalledWith(2, -themeWhiteboardTokens.zoomStep);
    expect(onParentWheel).not.toHaveBeenCalled();
  });
});
