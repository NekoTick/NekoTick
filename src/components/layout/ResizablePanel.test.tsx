import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizablePanel } from './ResizablePanel';

function dispatchStorageChange(key: string, newValue: string): void {
  const event = new Event('storage') as StorageEvent;
  Object.defineProperties(event, {
    key: { value: key },
    newValue: { value: newValue },
    storageArea: { value: localStorage },
  });
  window.dispatchEvent(event);
}

describe('ResizablePanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads a persisted width clamped to the panel limits', () => {
    localStorage.setItem('panel-width', '9999');

    const { container } = render(
      <ResizablePanel storageKey="panel-width" minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    expect(container.querySelector('aside')).toHaveStyle({ width: '500px' });
  });

  it('clamps persisted width to the dynamic panel limit', () => {
    localStorage.setItem('panel-width', '760');

    const { container } = render(
      <ResizablePanel
        storageKey="panel-width"
        minWidth={300}
        maxWidth={760}
        getMaxWidth={() => 360}
      >
        content
      </ResizablePanel>
    );

    expect(container.querySelector('aside')).toHaveStyle({ width: '360px' });
  });

  it('updates width when another window changes the persisted storage key', () => {
    const onWidthChange = vi.fn();
    const { container } = render(
      <ResizablePanel
        storageKey="panel-width"
        defaultWidth={320}
        minWidth={300}
        maxWidth={500}
        onWidthChange={onWidthChange}
      >
        content
      </ResizablePanel>
    );

    act(() => {
      dispatchStorageChange('panel-width', '460');
    });

    expect(container.querySelector('aside')).toHaveStyle({ width: '460px' });
    expect(onWidthChange).toHaveBeenCalledWith(460);
  });

  it('ignores malformed external width changes', () => {
    const { container } = render(
      <ResizablePanel storageKey="panel-width" defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    act(() => {
      dispatchStorageChange('panel-width', 'wide');
    });

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });

    act(() => {
      dispatchStorageChange('panel-width', '460px');
    });

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });
  });

  it('ignores exponent-form persisted width values', () => {
    localStorage.setItem('panel-width', '1e3');

    const { container } = render(
      <ResizablePanel storageKey="panel-width" defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });
  });

  it('ignores oversized persisted width values', () => {
    localStorage.setItem('panel-width', '4'.repeat(1024));

    const { container } = render(
      <ResizablePanel storageKey="panel-width" defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });

    act(() => {
      dispatchStorageChange('panel-width', '4'.repeat(1024));
    });

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });
  });

  it('coalesces live width updates to the latest drag move in one frame', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });

    const { container } = render(
      <ResizablePanel defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    const panel = container.querySelector('aside')!;
    const handle = container.querySelector<HTMLElement>('.cursor-col-resize')!;

    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 480 });
    fireEvent.mouseMove(document, { clientX: 460 });
    fireEvent.mouseMove(document, { clientX: 440 });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(panel).toHaveStyle({ width: '320px' });

    act(() => {
      animationFrames[0]?.(0);
    });

    expect(panel).toHaveStyle({ width: '380px' });

    fireEvent.mouseUp(document);
  });

  it('resets and persists the default width on divider double click', () => {
    localStorage.setItem('panel-width', '460');
    const { container } = render(
      <ResizablePanel storageKey="panel-width" defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    fireEvent.doubleClick(container.querySelector<HTMLElement>('.cursor-col-resize')!);

    expect(container.querySelector('aside')).toHaveStyle({ width: '320px' });
    expect(localStorage.getItem('panel-width')).toBe('320');
  });

  it('keeps the settled width transition snappy', () => {
    const { container } = render(
      <ResizablePanel defaultWidth={320} minWidth={300} maxWidth={500}>
        content
      </ResizablePanel>
    );

    const panel = container.querySelector('aside')!;

    expect(panel.className).toContain('duration-[var(--vlaina-duration-100)]');
  });

  it('clamps drag width to the dynamic panel limit', () => {
    const { container } = render(
      <ResizablePanel
        defaultWidth={320}
        minWidth={300}
        maxWidth={500}
        getMaxWidth={() => 350}
      >
        content
      </ResizablePanel>
    );

    const panel = container.querySelector('aside')!;
    const handle = container.querySelector<HTMLElement>('.cursor-col-resize')!;

    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 420 });
    fireEvent.mouseUp(document);

    expect(panel).toHaveStyle({ width: '350px' });
  });
});
