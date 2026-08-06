import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShellSidebarResize } from './useShellSidebarResize';

function SidebarResizeHarness({ onWidthChange }: { onWidthChange: (width: number) => void }) {
  const { handleDoubleClick, handleDragStart } = useShellSidebarResize({
    width: 500,
    onWidthChange,
  });

  return (
    <div
      data-testid="handle"
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleDragStart}
    />
  );
}

describe('useShellSidebarResize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resets to the capped 28 percent default on divider double click', () => {
    vi.stubGlobal('innerWidth', 1280);
    const onWidthChange = vi.fn();
    render(<SidebarResizeHarness onWidthChange={onWidthChange} />);

    fireEvent.doubleClick(screen.getByTestId('handle'));

    expect(onWidthChange).toHaveBeenCalledWith(358);
  });

  it('coalesces live width changes to one update per animation frame', () => {
    let flushFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      flushFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onWidthChange = vi.fn();
    render(<SidebarResizeHarness onWidthChange={onWidthChange} />);

    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 110 });
    fireEvent.mouseMove(document, { clientX: 120 });

    expect(onWidthChange).not.toHaveBeenCalled();
    flushFrame?.(0);
    expect(onWidthChange).toHaveBeenCalledTimes(1);
    expect(onWidthChange).toHaveBeenCalledWith(520);
    fireEvent.mouseUp(document);
  });
});
