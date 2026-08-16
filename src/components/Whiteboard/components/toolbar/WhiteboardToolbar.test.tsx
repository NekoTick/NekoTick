import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { WHITEBOARD_DEFAULT_BRUSH_COLORS, WHITEBOARD_DEFAULT_BRUSH_SIZES } from '@/components/Whiteboard/model/core/whiteboardModel';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon-name={name} />,
}));

function renderToolbar(overrides: Partial<ComponentProps<typeof WhiteboardToolbar>> = {}) {
  const onBrushColorChange = vi.fn();
  const onBrushSizeSelect = vi.fn();
  const onToolChange = vi.fn();
  const rendered = render(
    <WhiteboardToolbar
        active
        brushColors={WHITEBOARD_DEFAULT_BRUSH_COLORS}
        brushSizes={WHITEBOARD_DEFAULT_BRUSH_SIZES}
        selectionColor={null}
        showBrushSizes
        spacePressed={false}
        tool="select"
        onBrushColorChange={onBrushColorChange}
        onBrushSizeSelect={onBrushSizeSelect}
        onImageAdd={vi.fn()}
        onSelectionColorCancel={vi.fn()}
        onSelectionColorChange={vi.fn()}
        onSelectionColorPreviewChange={vi.fn()}
        onToolChange={onToolChange}
        {...overrides}
    />,
  );
  return { onBrushColorChange, onBrushSizeSelect, onToolChange, ...rendered };
}

describe('WhiteboardToolbar', () => {
  it('places the text tool between the brush and line tools', () => {
    const { container, onToolChange } = renderToolbar();

    const labels = within(container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels.indexOf('whiteboard.tool.pen')).toBeLessThan(labels.indexOf('whiteboard.tool.text'));
    expect(labels.indexOf('whiteboard.tool.text')).toBeLessThan(labels.indexOf('whiteboard.tool.line'));
    expect(labels.indexOf('whiteboard.tool.line')).toBeLessThan(labels.indexOf('whiteboard.tool.arrow'));
    expect(labels.indexOf('whiteboard.tool.arrow')).toBeLessThan(labels.indexOf('whiteboard.tool.autoshape'));
    expect(labels.indexOf('whiteboard.tool.autoshape')).toBeLessThan(labels.indexOf('whiteboard.addImage'));

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.line' }));
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.arrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.autoshape' }));
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.text' }));

    expect(onToolChange).toHaveBeenNthCalledWith(1, 'line');
    expect(onToolChange).toHaveBeenNthCalledWith(2, 'arrow');
    expect(onToolChange).toHaveBeenNthCalledWith(3, 'autoshape');
    expect(onToolChange).toHaveBeenNthCalledWith(4, 'text');
  });
  it('renders only while the whiteboard is active', () => {
    const props = {
      active: true,
      brushColors: WHITEBOARD_DEFAULT_BRUSH_COLORS,
      brushSizes: WHITEBOARD_DEFAULT_BRUSH_SIZES,
      selectionColor: null,
      showBrushSizes: true,
      spacePressed: false,
      tool: 'select' as const,
      onBrushColorChange: vi.fn(),
      onBrushSizeSelect: vi.fn(),
      onImageAdd: vi.fn(),
      onSelectionColorCancel: vi.fn(),
      onSelectionColorChange: vi.fn(),
      onSelectionColorPreviewChange: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { rerender } = render(<WhiteboardToolbar {...props} active={false} />);
    expect(screen.queryByRole('button', { name: 'whiteboard.tool.select' })).not.toBeInTheDocument();
    rerender(<WhiteboardToolbar {...props} />);
    expect(screen.getAllByRole('button', { name: 'whiteboard.tool.select' }).length).toBeGreaterThan(0);
  });

  it('initializes Dock motion when activated after mounting', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
    const props = {
      active: false,
      brushColors: WHITEBOARD_DEFAULT_BRUSH_COLORS,
      brushSizes: WHITEBOARD_DEFAULT_BRUSH_SIZES,
      selectionColor: null,
      showBrushSizes: true,
      spacePressed: false,
      tool: 'select' as const,
      onBrushColorChange: vi.fn(),
      onBrushSizeSelect: vi.fn(),
      onImageAdd: vi.fn(),
      onSelectionColorCancel: vi.fn(),
      onSelectionColorChange: vi.fn(),
      onSelectionColorPreviewChange: vi.fn(),
      onToolChange: vi.fn(),
    };
    const rendered = render(<WhiteboardToolbar {...props} />);
    try {
      expect(matchMedia).not.toHaveBeenCalled();
      rendered.rerender(<WhiteboardToolbar {...props} active />);
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      rendered.unmount();
      restoreProperty(window, 'matchMedia', originalMatchMedia);
    }
  });

  it('renders lasso and object eraser as standalone tools', () => {
    const { onToolChange } = renderToolbar();
    expect(screen.getByRole('button', { name: 'whiteboard.tool.eraser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'whiteboard.tool.strokeEraser' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.eraser' }));
    expect(onToolChange).toHaveBeenCalledWith('eraser');
  });

  it('keeps auto shape outside the material brush panel', () => {
    const { container } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const toolLabels = within(panel).getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('whiteboard.tool.'));

    expect(toolLabels).toEqual([
      'whiteboard.tool.pen',
      'whiteboard.tool.pencil',
      'whiteboard.tool.marker',
      'whiteboard.tool.coloredPencil',
      'whiteboard.tool.watercolor',
      'whiteboard.tool.crayon',
    ]);
    expect(screen.queryByRole('button', { name: 'whiteboard.tool.fountain' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'whiteboard.tool.autoshape' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whiteboard.tool.autoshape' }).querySelector('[data-icon-name="whiteboard.autoshape"]')).not.toBeNull();
  });

  it('closes the brush panel when drawing starts without selecting another brush', () => {
    const { container, onToolChange } = renderToolbar({ tool: 'pen' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const pencil = within(panel).getByRole('button', { name: 'whiteboard.tool.pencil' });

    fireEvent.pointerDown(pencil);
    expect(container.querySelector('[data-whiteboard-tool-panel="true"]')).toBeInTheDocument();

    const drawingStart = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    act(() => document.body.dispatchEvent(drawingStart));

    expect(drawingStart.defaultPrevented).toBe(false);
    expect(container.querySelector('[data-whiteboard-tool-panel="true"]')).not.toBeInTheDocument();
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it('shows the Apple-style instrument images for every brush option', () => {
    const { container } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const expectedImages = [
      ['whiteboard.tool.pen', 'pen.png'],
      ['whiteboard.tool.pencil', 'pencil.png'],
      ['whiteboard.tool.marker', 'marker.png'],
      ['whiteboard.tool.coloredPencil', 'colored-pencil.png'],
      ['whiteboard.tool.watercolor', 'watercolor.png'],
      ['whiteboard.tool.crayon', 'crayon.png'],
    ] as const;

    expectedImages.forEach(([label, filename]) => {
      expect(within(panel).getByRole('button', { name: label }).querySelector('img'))
        .toHaveAttribute('src', expect.stringContaining(filename));
    });
  });

  it('partially reveals brush instruments themselves and lifts the selected one', () => {
    const { container } = renderToolbar({ tool: 'pen' });

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const selectedPen = within(panel).getByRole('button', { name: 'whiteboard.tool.pen' });
    const pencil = within(panel).getByRole('button', { name: 'whiteboard.tool.pencil' });
    const selectedReveal = selectedPen.querySelector('[data-whiteboard-instrument-reveal="true"]');
    const pencilReveal = pencil.querySelector('[data-whiteboard-instrument-reveal="true"]');

    expect(container.querySelector('[data-whiteboard-instrument-shelf="true"]')).not.toBeInTheDocument();
    expect(selectedReveal).toHaveClass('h-[var(--vlaina-size-72px)]', 'overflow-hidden');
    expect(pencilReveal).toHaveClass(
      'h-[var(--vlaina-size-48px)]',
      'group-hover/instrument:h-[var(--vlaina-size-72px)]',
      'overflow-hidden',
    );
    expect(selectedPen).toHaveClass('-translate-y-[var(--vlaina-size-12px)]');
    expect(pencil).toHaveClass('group-hover/instrument:-translate-y-[var(--vlaina-size-12px)]');
    expect(pencil).not.toHaveClass('hover:-translate-y-[var(--vlaina-size-12px)]');
    expect(pencil.parentElement).toHaveClass('group/instrument');
    expect(selectedPen.parentElement).toHaveClass('h-[var(--vlaina-size-100px)]');
  });

  it('keeps standalone lasso and eraser controls in the main toolbar', () => {
    const { container } = renderToolbar({ tool: 'select' });
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;

    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.select' })).toBeInTheDocument();
    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.eraser' })).toBeInTheDocument();
    expect(container.querySelector('[data-whiteboard-tool-panel="true"]')).not.toBeInTheDocument();
  });

  it('keeps the eraser partially covered until it becomes active', () => {
    const inactive = renderToolbar({ tool: 'select' });
    const inactiveEraser = screen.getByRole('button', { name: 'whiteboard.tool.eraser' });
    expect(inactiveEraser.querySelector('[data-whiteboard-instrument-reveal="true"]'))
      .toHaveClass('h-[var(--vlaina-size-48px)]', 'overflow-hidden');
    expect(inactiveEraser).not.toHaveClass('-translate-y-[var(--vlaina-size-12px)]');
    inactive.unmount();

    renderToolbar({ tool: 'eraser' });
    const activeEraser = screen.getByRole('button', { name: 'whiteboard.tool.eraser' });
    expect(activeEraser.querySelector('[data-whiteboard-instrument-reveal="true"]'))
      .toHaveClass('h-[var(--vlaina-size-72px)]', 'overflow-hidden');
    expect(activeEraser).toHaveClass('-translate-y-[var(--vlaina-size-12px)]');
  });

  it('keeps the selected brush panel separate from standalone selection', () => {
    const { container } = renderToolbar({ tool: 'pen' });
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    const selectedPen = within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.pen' });
    const selectionTool = within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.select' });

    expect(selectedPen.querySelector('[data-whiteboard-instrument-reveal="true"]'))
      .toHaveClass('h-[var(--vlaina-size-72px)]', 'overflow-hidden');
    expect(selectedPen).toHaveClass('-translate-y-[var(--vlaina-size-12px)]');
    expect(selectionTool.querySelector('[data-whiteboard-instrument-reveal="true"]'))
      .toHaveClass('h-[var(--vlaina-size-48px)]', 'overflow-hidden');
  });

  it('uses the lasso and eraser images in the main toolbar', () => {
    const { container } = renderToolbar();
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;

    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.select' }).querySelector('img'))
      .toHaveAttribute('src', expect.stringContaining('select.png'));
    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.tool.eraser' }).querySelector('img'))
      .toHaveAttribute('src', expect.stringContaining('eraser.png'));
  });

  it('shows one persistent toolbar and keeps tool details closed initially', () => {
    const { container } = renderToolbar();

    expect(container.querySelector('[data-whiteboard-tool-panel="true"]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whiteboard.tool.select' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'whiteboard.customColor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#000000' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whiteboard.brushSize 100%' })).toBeInTheDocument();
  });

  it('hides brush size choices until pen input is detected', () => {
    renderToolbar({ showBrushSizes: false });

    expect(screen.queryByRole('button', { name: 'whiteboard.brushSize 100%' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-whiteboard-size-preview]')).not.toBeInTheDocument();
  });

  it('lifts the active tool without adding a colored background', () => {
    const { container } = renderToolbar();
    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const activeTool = mainToolbar?.querySelector('[aria-label="whiteboard.tool.select"]');

    expect(activeTool).toHaveClass('-translate-y-[var(--vlaina-size-12px)]', 'scale-[var(--vlaina-scale-105)]', 'border-transparent', 'bg-transparent');
    expect(activeTool).toHaveClass('shadow-none', 'hover:shadow-none');
    expect(activeTool?.querySelector('img')).toHaveClass('filter-none');
    expect(activeTool).not.toHaveClass('bg-[var(--vlaina-accent-light)]');
    expect(activeTool).not.toHaveClass('border-[var(--vlaina-color-accent-border-muted)]', 'shadow-[var(--vlaina-shadow-selection-soft)]');
    expect(screen.getByRole('button', { name: 'whiteboard.addImage' })).toHaveClass('hover:bg-transparent');
  });

  it('magnifies bottom toolbar items by pointer distance like a Dock', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const { container } = renderToolbar();
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    const dockItems = Array.from(mainToolbar.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]'));
    dockItems.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
        bottom: 44,
        height: 44,
        left: index * 44,
        right: (index + 1) * 44,
        top: 0,
        width: 44,
        x: index * 44,
        y: 0,
        toJSON: () => ({}),
      });
    });
    vi.spyOn(mainToolbar, 'getBoundingClientRect').mockReturnValue({
      bottom: 56,
      height: 56,
      left: 0,
      right: 190,
      top: 0,
      width: 190,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(mainToolbar, { clientX: 66, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 12);

    expect(readDockZoom(dockItems[1]!)).toBeCloseTo(1.32, 2);
    expect(readDockZoom(dockItems[0]!)).toBeGreaterThan(1);
    expect(readDockZoom(dockItems[0]!)).toBeLessThan(1.32);
    expect(readDockTranslateX(dockItems[0]!)).toBeLessThan(0);
    expect(readDockTranslateX(dockItems.at(-1)!)).toBeGreaterThan(0);
    fireEvent.pointerMove(mainToolbar, { clientX: 74, pointerType: 'mouse' });
    fireEvent.pointerMove(mainToolbar, { clientX: 80, pointerType: 'mouse' });
    fireEvent.pointerMove(mainToolbar, { clientX: 88, pointerType: 'mouse' });
    expect(animationFrames).toHaveLength(1);
    advanceAnimationFrames(animationFrames, 1);
    expect(dockItems.every((item) => vi.mocked(item.getBoundingClientRect).mock.calls.length === 1)).toBe(true);
    expect(vi.mocked(mainToolbar.getBoundingClientRect).mock.calls.length).toBe(1);
    fireEvent.pointerLeave(mainToolbar);
    advanceAnimationFrames(animationFrames, 12, 300);
    expect(dockItems.every((item) => readDockTranslateX(item) === 0)).toBe(true);
    expect(dockItems.every((item) => readDockZoom(item) === 1)).toBe(true);
  });

  it('keeps Dock magnification idle while the color picker is open', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const { container } = renderToolbar({ tool: 'pen' });
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    const dockItems = Array.from(mainToolbar.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]'));
    dockItems.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
        bottom: 44,
        height: 44,
        left: index * 44,
        right: (index + 1) * 44,
        top: 0,
        width: 44,
        x: index * 44,
        y: 0,
        toJSON: () => ({}),
      });
    });
    vi.spyOn(mainToolbar, 'getBoundingClientRect').mockReturnValue({
      bottom: 56,
      height: 56,
      left: 0,
      right: 190,
      top: 0,
      width: 190,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(mainToolbar, { clientX: 66, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 12);
    expect(readDockZoom(dockItems[1]!)).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
    advanceAnimationFrames(animationFrames, 12, 300);
    expect(dockItems.every((item) => readDockZoom(item) === 1)).toBe(true);

    fireEvent.pointerEnter(mainToolbar, { clientX: 110, pointerType: 'mouse' });
    fireEvent.pointerMove(mainToolbar, { clientX: 120, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 12, 600);
    expect(dockItems.every((item) => readDockZoom(item) === 1)).toBe(true);
  });

  it('applies Dock magnification to every brush panel option while keeping color and size controls in the main toolbar', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const { container } = renderToolbar({ tool: 'pen' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const options = Array.from(panel.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]'));
    options.forEach((option, index) => {
      vi.spyOn(option, 'getBoundingClientRect').mockReturnValue({
        bottom: 36,
        height: 28,
        left: index * 32,
        right: index * 32 + 28,
        top: 8,
        width: 28,
        x: index * 32,
        y: 8,
        toJSON: () => ({}),
      });
    });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      bottom: 56,
      height: 56,
      left: 0,
      right: options.length * 32,
      top: 0,
      width: options.length * 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(panel, { clientX: 14, pointerType: 'pen' });
    advanceAnimationFrames(animationFrames, 12);

    expect(readDockZoom(options[0]!)).toBeCloseTo(1.2, 2);
    expect(within(panel).queryByRole('button', { name: 'whiteboard.customColor' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'whiteboard.brushSize 100%' })).not.toBeInTheDocument();
    const mainToolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.customColor' }).parentElement).toHaveAttribute('data-whiteboard-dock-item', 'true');
    expect(within(mainToolbar).getByRole('button', { name: 'whiteboard.brushSize 100%' }).parentElement).toHaveAttribute('data-whiteboard-dock-item', 'true');
  });

  it('keeps brush panel magnification aligned while the panel scrolls', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const { container } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    const options = Array.from(panel.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]'));
    options.forEach((option, index) => {
      vi.spyOn(option, 'getBoundingClientRect').mockReturnValue({
        bottom: 36,
        height: 28,
        left: index * 32,
        right: index * 32 + 28,
        top: 8,
        width: 28,
        x: index * 32,
        y: 8,
        toJSON: () => ({}),
      });
    });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      bottom: 56,
      height: 56,
      left: 0,
      right: 160,
      top: 0,
      width: 160,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(panel, { clientX: 14, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 12);
    panel.scrollLeft = 64;
    fireEvent.scroll(panel);
    advanceAnimationFrames(animationFrames, 12, 300);

    expect(readDockZoom(options[2]!)).toBeCloseTo(1.2, 2);
    expect(readDockZoom(options[2]!)).toBeGreaterThan(readDockZoom(options[0]!));
    expect(options.every((option) => vi.mocked(option.getBoundingClientRect).mock.calls.length === 1)).toBe(true);
  });

  it('tracks rapid reversals without remeasuring the dock geometry', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const { container } = renderToolbar();
    const toolbar = container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
    const slots = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-whiteboard-dock-item="true"]'));
    slots.forEach((slot, index) => {
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({
        bottom: 44,
        height: 44,
        left: index * 44,
        right: (index + 1) * 44,
        top: 0,
        width: 44,
        x: index * 44,
        y: 0,
        toJSON: () => ({}),
      });
    });
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({
      bottom: 56,
      height: 56,
      left: 0,
      right: 190,
      top: 0,
      width: 190,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(toolbar, { clientX: 20, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 12);
    fireEvent.pointerMove(toolbar, { clientX: 160, pointerType: 'mouse' });
    fireEvent.pointerMove(toolbar, { clientX: 24, pointerType: 'mouse' });
    fireEvent.pointerMove(toolbar, { clientX: 128, pointerType: 'mouse' });
    advanceAnimationFrames(animationFrames, 1);

    expect(vi.mocked(toolbar.getBoundingClientRect).mock.calls).toHaveLength(1);
    expect(slots.every((slot) => vi.mocked(slot.getBoundingClientRect).mock.calls.length === 1)).toBe(true);
    expect(readDockZoom(slots[2]!)).toBeGreaterThan(readDockZoom(slots[0]!));
  });

  it('disables magnification animation when reduced motion is requested', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const matchMedia = vi.fn(() => ({ matches: true } as MediaQueryList));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    });
    const rendered = renderToolbar();
    try {
      const toolbar = rendered.container.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]')!;
      const slot = toolbar.querySelector<HTMLElement>('[data-whiteboard-dock-item="true"]')!;
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({
        bottom: 44,
        height: 44,
        left: 0,
        right: 44,
        top: 0,
        width: 44,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({
        bottom: 56,
        height: 56,
        left: 0,
        right: 190,
        top: 0,
        width: 190,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent.pointerEnter(toolbar, { clientX: 22, pointerType: 'mouse' });

      expect(readDockZoom(slot)).toBeCloseTo(1.32, 2);
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      rendered.unmount();
      restoreProperty(window, 'matchMedia', originalMatchMedia);
    }
  });

  it('keeps the color picker and preset sizes in the main toolbar and closes the type panel after selection', () => {
    const { onToolChange } = renderToolbar({ tool: 'pen' });

    expect(screen.getByRole('button', { name: 'whiteboard.customColor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#000000' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whiteboard.brushSize 100%' })).toBeInTheDocument();
    const sizePreviews = document.querySelectorAll('[data-whiteboard-size-preview]');
    expect(sizePreviews).toHaveLength(5);
    expect(sizePreviews[0]).toHaveStyle({ height: '3px', width: '3px' });
    expect(sizePreviews[4]).toHaveStyle({ height: '12px', width: '12px' });

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = document.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;
    expect(within(panel).getByRole('button', { name: 'whiteboard.tool.pencil' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '#000000' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'whiteboard.brushSize 100%' })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'whiteboard.tool.marker' }));
    expect(onToolChange).toHaveBeenCalledWith('marker');
    expect(document.querySelector('[data-whiteboard-tool-panel="true"]')).not.toBeInTheDocument();
  });

  it('keeps a preset color selected when its stored hex uses uppercase letters', () => {
    renderToolbar({
      brushColors: { ...WHITEBOARD_DEFAULT_BRUSH_COLORS, pen: '#F2A3B1' },
      tool: 'pen',
    });

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
    expect(screen.getByRole('button', { name: '#f2a3b1' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-whiteboard-common-colors="true"]')).toContainElement(
      screen.getByRole('button', { name: '#f2a3b1' }),
    );
  });

  it('applies a custom brush color only after confirmation', () => {
    const { onBrushColorChange } = renderToolbar({ tool: 'pen' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const customColor = screen.getByRole('button', { name: 'whiteboard.customColor' });
    expect(customColor.firstElementChild).toHaveAttribute('data-whiteboard-color-trigger', 'true');
    expect(customColor.firstElementChild).toHaveStyle({
      backgroundImage: 'var(--vlaina-color-picker-trigger-outer)',
    });
    const appliedColor = customColor.querySelector('[data-whiteboard-applied-color="true"]');
    expect(appliedColor).toHaveStyle({ backgroundColor: '#000000' });
    fireEvent.click(customColor);

    expect(document.querySelector('[data-whiteboard-tool-panel="true"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-whiteboard-common-colors="true"]')?.children).toHaveLength(10);
    expect(screen.getByLabelText('HEX')).toHaveValue('#000000');
    fireEvent.change(screen.getByLabelText('HEX'), { target: { value: '#43a555' } });
    expect(appliedColor).toHaveStyle({ backgroundColor: '#000000' });
    expect(onBrushColorChange).not.toHaveBeenCalled();

    const applyButton = screen.getByRole('button', { name: 'common.apply' });
    expect(applyButton).toHaveClass(
      'bg-[var(--vlaina-color-control-hover-bg)]',
      'text-[length:var(--vlaina-font-13)]',
      'text-[color:var(--vlaina-color-accent)]',
    );
    fireEvent.click(applyButton);
    expect(onBrushColorChange).toHaveBeenCalledWith('pen', '#43A555');
  });

  it('shows the selected content color in the bottom toolbar', () => {
    const onSelectionColorChange = vi.fn();
    const onSelectionColorPreviewChange = vi.fn();
    const { container } = renderToolbar({
      onSelectionColorChange,
      onSelectionColorPreviewChange,
      selectionColor: '#111111',
    });

    const selectionColor = container.querySelector('[data-whiteboard-selection-color-control="true"]');
    expect(selectionColor).not.toBeNull();
    fireEvent.click(selectionColor!.querySelector('[data-whiteboard-color-trigger="true"]')!);
    fireEvent.click(screen.getByRole('button', { name: '#ff5b61' }));
    expect(onSelectionColorChange).not.toHaveBeenCalled();
    expect(onSelectionColorPreviewChange).toHaveBeenCalledTimes(1);
    expect(onSelectionColorPreviewChange).toHaveBeenLastCalledWith('#FF5B61');
    fireEvent.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onSelectionColorChange).toHaveBeenCalledTimes(1);
    expect(onSelectionColorChange).toHaveBeenCalledWith('#FF5B61');
  });

  it('restores the selected content color when the picker closes without applying', () => {
    const onSelectionColorChange = vi.fn();
    const onSelectionColorPreviewChange = vi.fn();
    const onSelectionColorCancel = vi.fn();
    const { container } = renderToolbar({ onSelectionColorCancel, onSelectionColorChange, onSelectionColorPreviewChange, selectionColor: '#111111' });

    fireEvent.click(container.querySelector('[data-whiteboard-color-trigger="true"]')!);
    fireEvent.click(screen.getByRole('button', { name: '#ff5b61' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(onSelectionColorPreviewChange).toHaveBeenLastCalledWith('#FF5B61');
    expect(onSelectionColorCancel).toHaveBeenCalledOnce();
  });

  it('keeps common colors in the picker until confirmation', () => {
    const { onBrushColorChange } = renderToolbar({ tool: 'pen' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
    fireEvent.click(screen.getByRole('button', { name: '#f39a06' }));

    expect(onBrushColorChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onBrushColorChange).toHaveBeenCalledWith('pen', '#F39A06');
  });

  it('discards a custom brush color when cancelled', () => {
    const { onBrushColorChange } = renderToolbar({ tool: 'pen' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
    fireEvent.change(screen.getByLabelText('HEX'), { target: { value: '#43a555' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(onBrushColorChange).not.toHaveBeenCalled();
  });

  it('opens the native color picker when EyeDropper is unavailable', () => {
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
    const showPicker = vi.fn();
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: showPicker });
    try {
      renderToolbar({ tool: 'pen' });
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.pickColor' }));

      expect(showPicker).toHaveBeenCalledTimes(1);
      const nativeColorInput = screen.getAllByLabelText('whiteboard.pickColor').find((element) => element.tagName === 'INPUT');
      fireEvent.change(nativeColorInput!, { target: { value: '#ff8c38' } });
      expect(screen.getByLabelText('HEX')).toHaveValue('#FF8C38');
    } finally {
      restoreProperty(window, 'EyeDropper', originalEyeDropper);
      restoreProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
    }
  });

  it('falls back to the native color picker when EyeDropper fails', async () => {
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
    const showPicker = vi.fn();
    const open = vi.fn().mockRejectedValue(new Error('EyeDropper unavailable'));
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: class { open = open; } });
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: showPicker });
    try {
      renderToolbar({ tool: 'pen' });
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.pickColor' }));

      await waitFor(() => expect(showPicker).toHaveBeenCalledTimes(1));
    } finally {
      restoreProperty(window, 'EyeDropper', originalEyeDropper);
      restoreProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
    }
  });

  it('samples the selected app pixel through Electron without forwarding the click', async () => {
    const originalBridge = Object.getOwnPropertyDescriptor(window, 'vlainaDesktop');
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const capturePage = vi.fn().mockRejectedValue(new Error('capture stopped after assertion'));
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
    Object.defineProperty(window, 'vlainaDesktop', {
      configurable: true,
      value: { media: { capturePage }, platform: 'electron' },
    });
    try {
      renderToolbar({ tool: 'pen' });
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.pickColor' }));

      expect(document.documentElement).toHaveAttribute('data-whiteboard-color-picking', 'true');
      expect(screen.getByRole('dialog', { name: 'whiteboard.customColor' })).toBeInTheDocument();
      fireEvent.pointerDown(window, { button: 0, clientX: 25, clientY: 40 });

      await waitFor(() => expect(capturePage).toHaveBeenCalledWith({ x: 25, y: 40, width: 1, height: 1 }));
      fireEvent.pointerUp(window, { button: 0, clientX: 25, clientY: 40 });
      await waitFor(() => expect(document.documentElement).not.toHaveAttribute('data-whiteboard-color-picking'));
    } finally {
      restoreProperty(window, 'vlainaDesktop', originalBridge);
      restoreProperty(window, 'EyeDropper', originalEyeDropper);
      delete document.documentElement.dataset.whiteboardColorPicking;
    }
  });

  it('previews Electron sampled colors while moving and keeps the picker open until a click', async () => {
    const originalBridge = Object.getOwnPropertyDescriptor(window, 'vlainaDesktop');
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const capturePage = vi.fn().mockRejectedValue(new Error('capture stopped after assertion'));
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
    Object.defineProperty(window, 'vlainaDesktop', {
      configurable: true,
      value: { media: { capturePage }, platform: 'electron' },
    });
    try {
      renderToolbar({ tool: 'pen' });
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.pickColor' }));

      expect(screen.getByRole('dialog', { name: 'whiteboard.customColor' })).toHaveAttribute('aria-busy', 'true');
      fireEvent.pointerMove(window, { clientX: 25, clientY: 40 });

      await waitFor(() => expect(capturePage).toHaveBeenCalledWith({ x: 25, y: 40, width: 1, height: 1 }));
      expect(screen.getByRole('dialog', { name: 'whiteboard.customColor' })).toBeInTheDocument();
      expect(document.documentElement).toHaveAttribute('data-whiteboard-color-picking', 'true');
    } finally {
      restoreProperty(window, 'vlainaDesktop', originalBridge);
      restoreProperty(window, 'EyeDropper', originalEyeDropper);
      delete document.documentElement.dataset.whiteboardColorPicking;
    }
  });

  it('updates the color draft from the latest Electron hover sample before confirmation', async () => {
    const originalBridge = Object.getOwnPropertyDescriptor(window, 'vlainaDesktop');
    const originalEyeDropper = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
    const originalCreateElement = document.createElement.bind(document);
    const capturePage = vi.fn().mockResolvedValue('data:image/png;base64,preview');
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
    Object.defineProperty(window, 'vlainaDesktop', {
      configurable: true,
      value: { media: { capturePage }, platform: 'electron' },
    });
    vi.stubGlobal('Image', class {
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {}
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
            getImageData: () => ({ data: new Uint8ClampedArray([33, 196, 93, 255]) }),
          }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    }) as typeof document.createElement);
    try {
      renderToolbar({ tool: 'pen' });
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.customColor' }));
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.pickColor' }));
      fireEvent.pointerMove(window, { clientX: 25, clientY: 40 });

      await waitFor(() => expect(screen.getByLabelText('HEX')).toHaveValue('#21C45D'));
      expect(document.documentElement).toHaveAttribute('data-whiteboard-color-picking', 'true');
    } finally {
      restoreProperty(window, 'vlainaDesktop', originalBridge);
      restoreProperty(window, 'EyeDropper', originalEyeDropper);
      delete document.documentElement.dataset.whiteboardColorPicking;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('renders enlarged controls at the bottom center and opens details above them', () => {
    const { container } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const panel = container.querySelector('[data-whiteboard-tool-panel="true"]');
    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const interactionRegion = mainToolbar?.parentElement;
    const placementRegion = interactionRegion?.parentElement;
    expect(mainToolbar?.closest('[data-whiteboard-titlebar-slot="true"]')).not.toBeInTheDocument();
    expect(interactionRegion).toHaveClass('app-no-drag', 'pointer-events-auto', 'max-w-full');
    expect(interactionRegion).not.toHaveClass('w-full');
    expect(placementRegion).toHaveClass('inset-x-0', 'bottom-4', 'justify-center');
    expect(panel?.parentElement).toHaveClass('w-max', 'max-w-full');
    expect(panel?.parentElement?.parentElement).toHaveClass('bottom-full', 'left-1/2', '-translate-x-1/2', 'w-max');
    expect(panel?.parentElement?.parentElement).not.toHaveClass('inset-x-2');
    expect(mainToolbar).toHaveClass('h-[var(--vlaina-size-72px)]', 'gap-1', 'px-2', 'rounded-[var(--vlaina-radius-26px)]');
    expect(mainToolbar).toHaveClass('!bg-[var(--vlaina-color-pill-surface)]');
    expect(mainToolbar).toHaveClass('hover:!shadow-[var(--vlaina-shadow-raised-soft)]');
    expect(mainToolbar).not.toHaveClass('hover:!shadow-[var(--vlaina-shadow-menu-hover)]');
    expect(panel).not.toHaveClass('bg-[var(--vlaina-color-whiteboard-tool-panel)]');
    expect(container.querySelector('[data-whiteboard-instrument-shelf="true"]')).not.toBeInTheDocument();
  });

  it('keeps the image action in the drawing tools group without a ruler action', () => {
    const { container } = renderToolbar();

    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const buttons = Array.from(mainToolbar?.querySelectorAll('button') ?? []);
    expect(buttons.some((button) => button.getAttribute('aria-label') === 'whiteboard.tool.ruler')).toBe(false);
    expect(buttons.some((button) => button.getAttribute('aria-label') === 'whiteboard.addImage')).toBe(true);
  });

  it('places the hand tool first in the main toolbar', () => {
    const { container } = renderToolbar();
    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const firstButton = mainToolbar?.querySelector('button');

    expect(firstButton).toHaveAccessibleName('whiteboard.tool.hand');
    expect(screen.queryByText('whiteboard.tool.hand')).not.toBeInTheDocument();
  });

  it('highlights the hand tool while space temporarily enables panning', () => {
    renderToolbar({ spacePressed: true, tool: 'select' });

    const handTool = screen.getByRole('button', { name: 'whiteboard.tool.hand' });
    expect(handTool).toHaveAttribute('aria-pressed', 'true');
    expect(handTool).toHaveClass('-translate-y-[var(--vlaina-size-4px)]', 'bg-transparent');
    expect(handTool).not.toHaveClass('bg-[var(--vlaina-accent-light)]');
    expect(screen.getAllByRole('button', { name: 'whiteboard.tool.select' }).every(
      (button) => button.getAttribute('aria-pressed') !== 'true',
    )).toBe(true);
  });

  it('opens the native image picker from the add image action', () => {
    const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: showPicker });
    try {
      renderToolbar();
      fireEvent.click(screen.getByRole('button', { name: 'whiteboard.addImage' }));
      expect(showPicker).toHaveBeenCalledTimes(1);
    } finally {
      if (originalShowPicker) Object.defineProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
      else Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker');
    }
  });

});

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function advanceAnimationFrames(callbacks: FrameRequestCallback[], count: number, startTime = 0) {
  let time = startTime;
  for (let index = 0; index < count; index += 1) {
    const callback = callbacks.shift();
    if (!callback) break;
    callback(time);
    time += 1000 / 60;
  }
}

function readDockZoom(element: HTMLElement): number {
  return Number(element.querySelector<HTMLElement>('[data-whiteboard-dock-visual="true"]')?.style.zoom);
}

function readDockTranslateX(element: HTMLElement): number {
  return Number(element.style.transform.match(/translate3d\(([-\d.]+)px/)?.[1]);
}
