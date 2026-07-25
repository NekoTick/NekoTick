import type { ReactNode } from 'react';
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

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
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
    expect(percentage).toHaveClass('shadow-none', 'hover:shadow-none');
    expect(percentage.parentElement).toHaveClass(
      '[&:has([data-whiteboard-zoom-percentage]:hover)]:!shadow-none',
      '[&:has([data-whiteboard-zoom-percentage]:hover)]:!transition-none',
    );
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
