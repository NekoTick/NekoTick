import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { WHITEBOARD_DEFAULT_BRUSH_COLORS, WHITEBOARD_DEFAULT_BRUSH_SIZES } from '../../model/whiteboardModel';

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
        spacePressed={false}
        tool="select"
        onBrushColorChange={onBrushColorChange}
        onBrushSizeSelect={onBrushSizeSelect}
        onImageAdd={vi.fn()}
        onToolChange={onToolChange}
        {...overrides}
    />,
  );
  return { onBrushColorChange, onBrushSizeSelect, onToolChange, ...rendered };
}

describe('WhiteboardToolbar', () => {
  it('renders only while the whiteboard is active', () => {
    const props = {
      active: true,
      brushColors: WHITEBOARD_DEFAULT_BRUSH_COLORS,
      brushSizes: WHITEBOARD_DEFAULT_BRUSH_SIZES,
      spacePressed: false,
      tool: 'select' as const,
      onBrushColorChange: vi.fn(),
      onBrushSizeSelect: vi.fn(),
      onImageAdd: vi.fn(),
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
      spacePressed: false,
      tool: 'select' as const,
      onBrushColorChange: vi.fn(),
      onBrushSizeSelect: vi.fn(),
      onImageAdd: vi.fn(),
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

  it('groups lasso and both erasers in one panel', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: 'whiteboard.tool.eraser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whiteboard.tool.strokeEraser' })).toBeInTheDocument();
  });

  it('shows colored pencil fourth and keeps crayon sixth in the brush panel', () => {
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

  it('uses the lasso and eraser images in the selection panel', () => {
    const { container } = renderToolbar();
    const panel = container.querySelector<HTMLElement>('[data-whiteboard-tool-panel="true"]')!;

    expect(within(panel).getByRole('button', { name: 'whiteboard.tool.select' }).querySelector('img'))
      .toHaveAttribute('src', expect.stringContaining('select.png'));
    expect(within(panel).getByRole('button', { name: 'whiteboard.tool.eraser' }).querySelector('img'))
      .toHaveAttribute('src', expect.stringContaining('eraser.png'));
    expect(within(panel).getByRole('button', { name: 'whiteboard.tool.strokeEraser' }).querySelector('img'))
      .toHaveAttribute('src', expect.stringContaining('eraser.png'));
  });

  it('opens the active lasso details when the whiteboard first appears', () => {
    const { container } = renderToolbar();

    expect(container.querySelector('[data-whiteboard-tool-panel="true"]')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'whiteboard.tool.select' }).some(
      (button) => button.getAttribute('aria-pressed') === 'true',
    )).toBe(true);
  });

  it('lifts the active tool without adding a colored background', () => {
    const { container } = renderToolbar();
    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const activeTool = mainToolbar?.querySelector('[aria-label="whiteboard.tool.select"]');

    expect(activeTool).toHaveClass('-translate-y-[var(--vlaina-size-8px)]', 'border-transparent', 'bg-transparent');
    expect(activeTool).not.toHaveClass('bg-[var(--vlaina-accent-light)]');
    expect(activeTool).not.toHaveClass('border-[var(--vlaina-color-accent-border-muted)]', 'shadow-[var(--vlaina-shadow-selection-soft)]');
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

  it('applies Dock magnification to every brush panel option for a hovering pen', () => {
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
    expect(screen.getByRole('button', { name: 'whiteboard.customColor' }).parentElement).toHaveAttribute('data-whiteboard-dock-item', 'true');
    expect(screen.getByRole('button', { name: 'whiteboard.brushSize 100%' }).parentElement).toHaveAttribute('data-whiteboard-dock-item', 'true');
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

  it('opens one brush panel with types, colors, and preset sizes', () => {
    const { onToolChange } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));

    expect(screen.getByRole('button', { name: 'whiteboard.tool.pencil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#000000' })).toContainElement(
      document.querySelector('[data-whiteboard-color-selection-ring="true"]'),
    );
    expect(screen.getByRole('button', { name: 'whiteboard.brushSize 100%' })).toBeInTheDocument();
    const sizePreviews = document.querySelectorAll('[data-whiteboard-size-preview]');
    expect(sizePreviews).toHaveLength(5);
    expect(sizePreviews[0]).toHaveStyle({ height: '3px', width: '3px' });
    expect(sizePreviews[4]).toHaveStyle({ height: '12px', width: '12px' });
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.marker' }));
    expect(onToolChange).toHaveBeenCalledWith('marker');
  });

  it('keeps a preset color selected when its stored hex uses uppercase letters', () => {
    renderToolbar({
      brushColors: { ...WHITEBOARD_DEFAULT_BRUSH_COLORS, pen: '#F0A0B5' },
      tool: 'pen',
    });

    expect(screen.getByRole('button', { name: '#f0a0b5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '#f0a0b5' })).toContainElement(
      document.querySelector('[data-whiteboard-color-selection-ring="true"]'),
    );
  });

  it('applies a custom brush color only after confirmation', () => {
    const { onBrushColorChange } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'whiteboard.tool.pen' }));
    const customColor = screen.getByRole('button', { name: 'whiteboard.customColor' });
    expect(customColor).toHaveStyle({ backgroundImage: 'var(--vlaina-color-picker-rainbow)' });
    fireEvent.click(customColor);

    expect(document.querySelector('[data-slot="popover-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText('HEX')).toHaveValue('#000000');
    fireEvent.change(screen.getByLabelText('HEX'), { target: { value: '#43a555' } });
    expect(onBrushColorChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'common.apply' }));
    expect(onBrushColorChange).toHaveBeenCalledWith('pen', '#43A555');
  });

  it('discards a custom brush color when cancelled', () => {
    const { onBrushColorChange } = renderToolbar();
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
      renderToolbar();
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
      renderToolbar();
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
      renderToolbar();
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
      renderToolbar();
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
      renderToolbar();
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
    expect(mainToolbar).toHaveClass('h-[var(--vlaina-size-56px)]', 'gap-1', 'px-1.5');
  });

  it('keeps the image action in the drawing tools group without a ruler action', () => {
    const { container } = renderToolbar();

    const mainToolbar = container.querySelector('[data-whiteboard-main-toolbar="true"]');
    const buttons = Array.from(mainToolbar?.querySelectorAll('button') ?? []);
    expect(buttons.some((button) => button.getAttribute('aria-label') === 'whiteboard.tool.ruler')).toBe(false);
    expect(buttons.at(-1)).toHaveAccessibleName('whiteboard.addImage');
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

    expect(screen.getByRole('button', { name: 'whiteboard.tool.hand' })).toHaveAttribute('aria-pressed', 'true');
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
