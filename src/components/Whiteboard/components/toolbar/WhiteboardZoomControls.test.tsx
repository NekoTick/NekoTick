import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardZoomControls } from './WhiteboardZoomControls';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon-name={name} />,
}));

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
}

describe('WhiteboardZoomControls', () => {
  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('moves above the main toolbar while their horizontal bounds overlap', () => {
    const { container } = render(
      <section data-whiteboard-active="true">
        <div data-whiteboard-main-toolbar="true" />
        <WhiteboardZoomControls
          active
          viewport={{ x: 0, y: 0, zoom: 1 }}
          onFitView={vi.fn()}
          onResetView={vi.fn()}
          onZoomChange={vi.fn()}
        />
      </section>,
    );
    const controls = container.querySelector<HTMLElement>('[data-whiteboard-zoom-controls="true"]')!;
    const toolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue(rect(12, 132));
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(rect(80, 600));

    act(() => {
      ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
    });
    expect(controls).toHaveClass('bottom-[var(--vlaina-space-96px)]');

    vi.mocked(toolbar.getBoundingClientRect).mockReturnValue(rect(200, 600));
    act(() => {
      ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
    });
    expect(controls).toHaveClass('bottom-4');
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

function rect(left: number, right: number): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}
