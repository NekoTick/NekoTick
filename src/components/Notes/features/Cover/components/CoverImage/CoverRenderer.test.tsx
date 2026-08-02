import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CoverRenderer, type CoverRendererProps } from './CoverRenderer';

function buildProps(overrides?: Partial<CoverRendererProps>): CoverRendererProps {
  return {
    displaySrc: '/cover.png',
    isImageReady: false,
    isResizing: false,
    isResizeSettling: false,
    mediaSize: { width: 1200, height: 600 },
    wrapperRef: createRef<HTMLDivElement>(),
    frozenImgRef: createRef<HTMLImageElement>(),
    frozenImageState: { top: 12, left: 22, width: 320, height: 180 },
    crop: { x: 10, y: 20 },
    zoom: 1.5,
    effectiveContainerSize: { width: 640, height: 240 },
    effectiveMinZoom: 1,
    effectiveMaxZoom: 10,
    objectFitMode: 'horizontal-cover',
    onCropperCropChange: vi.fn(),
    onCropperZoomChange: vi.fn(),
    onPointerIntent: vi.fn(),
    onPointerMoveIntent: vi.fn(),
    onNonPointerIntent: vi.fn(),
    onInteractionStart: vi.fn(),
    onInteractionEnd: vi.fn(),
    onMediaLoaded: vi.fn(),
    positionX: 40,
    positionY: 60,
    ...overrides,
  };
}

describe('CoverRenderer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reveals the placeholder only after its image loads', () => {
    const { container } = render(<CoverRenderer {...buildProps()} />);

    const placeholder = container.querySelector('img[alt="Cover"]') as HTMLImageElement | null;
    expect(placeholder).not.toBeNull();
    expect(placeholder?.className.includes('opacity-[var(--vlaina-opacity-0)]')).toBe(true);

    if (placeholder) fireEvent.load(placeholder);

    expect(placeholder?.className.includes('opacity-[var(--vlaina-opacity-100)]')).toBe(true);
    expect(placeholder?.className.includes('placeholder-active')).toBe(true);

    const cropper = container.querySelector('[data-testid="cover-cropper"]');
    expect(cropper).not.toBeNull();
    expect(cropper?.getAttribute('data-object-fit')).toBe('horizontal-cover');
    expect(cropper?.className.includes('cursor-move')).toBe(true);
    expect(cropper?.getAttribute('style')).toContain('overscroll-behavior: none');
    expect(cropper?.getAttribute('style')).toContain('overflow-anchor: none');
  });

  it('keeps a failed placeholder image hidden', () => {
    const { container } = render(<CoverRenderer {...buildProps()} />);
    const placeholder = container.querySelector('img[alt="Cover"]') as HTMLImageElement | null;

    expect(placeholder).not.toBeNull();
    if (placeholder) fireEvent.error(placeholder);

    expect(placeholder?.className.includes('opacity-[var(--vlaina-opacity-0)]')).toBe(true);
    expect(placeholder?.className.includes('placeholder-active')).toBe(false);
  });

  it('hides cropper and shows frozen layer during resize', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          isResizing: true,
          isImageReady: true,
        })}
      />
    );

    const cropper = container.querySelector('[data-testid="cover-cropper"]');
    expect(cropper).not.toBeNull();
    expect(cropper?.className.includes('opacity-[var(--vlaina-opacity-0)]')).toBe(true);
    expect(cropper?.className.includes('pointer-events-none')).toBe(true);

    const frozen = container.querySelector('img[alt="Frozen Cover"]');
    expect(frozen).not.toBeNull();
    expect(frozen?.getAttribute('style')?.includes('top: 12px')).toBe(true);
    expect(frozen?.getAttribute('style')?.includes('left: 22px')).toBe(true);
    expect(frozen?.parentElement?.classList.contains('visible')).toBe(true);
    expect(frozen?.parentElement?.classList.contains('invisible')).toBe(false);
  });

  it('keeps frozen layer visible for one settle frame after resize', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          isResizeSettling: true,
          isImageReady: true,
        })}
      />
    );

    const cropper = container.querySelector('[data-testid="cover-cropper"]');
    const frozen = container.querySelector('img[alt="Frozen Cover"]');

    expect(cropper).not.toBeNull();
    expect(frozen).not.toBeNull();
    expect(frozen?.parentElement?.classList.contains('visible')).toBe(true);
  });

  it('passes undefined image to cropper when source is empty', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          displaySrc: '',
        })}
      />
    );

    expect(container.querySelector('img[alt="Cover"]')).toBeNull();
    expect(container.querySelector('img[alt="Frozen Cover"]')).toBeNull();
    expect(container.querySelector('[data-testid="cover-cropper"]')).not.toBeNull();
    expect(container.querySelector('img[alt="Cover Cropper"]')).toBeNull();
  });

  it('emits media loaded and pointer interaction through local cropper layer', () => {
    const props = buildProps();
    const { container } = render(<CoverRenderer {...props} />);

    const cropper = container.querySelector('[data-testid="cover-cropper"]') as HTMLDivElement | null;
    const image = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;

    expect(cropper).not.toBeNull();
    expect(image).not.toBeNull();

    if (!image || !cropper) return;

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 600, configurable: true });
    Object.defineProperty(image, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'clientHeight', { value: 400, configurable: true });

    fireEvent.load(image);
    expect(props.onMediaLoaded).toHaveBeenCalledWith({
      width: 800,
      height: 400,
      naturalWidth: 1200,
      naturalHeight: 600,
    });
    expect(props.onMediaLoaded).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(cropper, { clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(cropper, { clientX: 25, clientY: 45, pointerId: 1 });
    fireEvent.pointerUp(cropper, { clientX: 25, clientY: 45, pointerId: 1 });

    expect(props.onInteractionStart).toHaveBeenCalled();
    expect(props.onCropperCropChange).toHaveBeenCalledWith({ x: 25, y: 45 });
    expect(props.onInteractionEnd).toHaveBeenCalled();
  });

  it('does not emit duplicate media loaded payloads for the same image state', () => {
    const props = buildProps();
    const { container } = render(<CoverRenderer {...props} />);
    const image = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;

    expect(image).not.toBeNull();
    if (!image) return;

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 600, configurable: true });
    Object.defineProperty(image, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'clientHeight', { value: 400, configurable: true });

    fireEvent.load(image);
    fireEvent.load(image);

    expect(props.onMediaLoaded).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the previous image dimensions immediately after switching sources', () => {
    const onMediaLoaded = vi.fn();
    const baseProps = buildProps({
      displaySrc: '/cover-a.png',
      onMediaLoaded,
    });
    const { container, rerender } = render(<CoverRenderer {...baseProps} />);
    const image = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;

    expect(image).not.toBeNull();
    if (!image) return;

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 600, configurable: true });
    Object.defineProperty(image, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'clientHeight', { value: 400, configurable: true });

    fireEvent.load(image);

    expect(onMediaLoaded).toHaveBeenCalledTimes(1);
    expect(onMediaLoaded).toHaveBeenLastCalledWith({
      width: 800,
      height: 400,
      naturalWidth: 1200,
      naturalHeight: 600,
    });

    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 600, configurable: true });

    rerender(
      <CoverRenderer
        {...buildProps({
          displaySrc: '/cover-b.png',
          onMediaLoaded,
        })}
      />
    );

    expect(onMediaLoaded).toHaveBeenCalledTimes(1);

    const switchedImage = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;
    expect(switchedImage).not.toBe(image);
    if (!switchedImage) return;

    Object.defineProperty(switchedImage, 'complete', { value: true, configurable: true });
    Object.defineProperty(switchedImage, 'naturalWidth', { value: 1500, configurable: true });
    Object.defineProperty(switchedImage, 'naturalHeight', { value: 969, configurable: true });
    Object.defineProperty(switchedImage, 'clientWidth', { value: 699, configurable: true });
    Object.defineProperty(switchedImage, 'clientHeight', { value: 452, configurable: true });

    fireEvent.load(switchedImage);

    expect(onMediaLoaded).toHaveBeenCalledTimes(2);
    expect(onMediaLoaded).toHaveBeenLastCalledWith({
      width: 699,
      height: 452,
      naturalWidth: 1500,
      naturalHeight: 969,
    });
  });

  it('uses wheel to zoom through a native non-passive listener', () => {
    const props = buildProps({
      zoom: 1,
    });
    const { container } = render(<CoverRenderer {...props} />);
    const cropper = container.querySelector('[data-testid="cover-cropper"]') as HTMLDivElement | null;

    expect(cropper).not.toBeNull();
    if (!cropper) return;

    fireEvent.wheel(cropper, { deltaY: -100 });

    expect(props.onInteractionStart).toHaveBeenCalled();
    expect(props.onNonPointerIntent).toHaveBeenCalled();
    expect(props.onCropperZoomChange).toHaveBeenCalledTimes(1);
    expect(props.onCropperZoomChange).toHaveBeenCalledWith(expect.any(Number), expect.any(Object));
  });

  it('leaves composing cropper keydown to the input method', () => {
    const props = buildProps();
    const { container } = render(<CoverRenderer {...props} />);
    const cropper = container.querySelector('[data-testid="cover-cropper"]') as HTMLDivElement | null;

    expect(cropper).not.toBeNull();
    if (!cropper) return;

    const composingKey = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingKey, 'isComposing', { value: true });
    fireEvent(cropper, composingKey);

    expect(props.onNonPointerIntent).not.toHaveBeenCalled();

    fireEvent.keyDown(cropper, { key: 'ArrowLeft' });

    expect(props.onNonPointerIntent).toHaveBeenCalledTimes(1);
  });

  it('applies zoom through transform', () => {
    const props = buildProps({
      zoom: 2,
    });
    const { container } = render(<CoverRenderer {...props} />);
    const image = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;

    expect(image).not.toBeNull();
    if (!image) return;

    expect(image.style.transform).toContain('scale(2)');
  });

  it('keeps a responsive backdrop behind the cropper during layout resizing', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          isImageReady: true,
          layoutPanelDragging: true,
          positionX: 33,
          positionY: 67,
        })}
      />
    );

    const backdrop = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;
    const cropper = container.querySelector('[data-testid="cover-cropper"]') as HTMLDivElement | null;

    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain('object-cover');
    expect(backdrop?.style.objectPosition).toBe('33% 67%');
    expect(cropper?.className.includes('opacity-[var(--vlaina-opacity-0)]')).toBe(true);
    expect(cropper?.className.includes('pointer-events-none')).toBe(true);
  });

  it('does not show a static layout backdrop during ordinary rendering', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          isImageReady: true,
        })}
      />
    );

    expect(container.querySelector('img[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('[data-testid="cover-cropper"]')).not.toBeNull();
  });

  it('keeps placeholder geometry aligned with the cropper when dimensions are known', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          isImageReady: false,
          crop: { x: 18, y: -12 },
          zoom: 1.35,
          positionX: 35,
          positionY: 70,
          mediaSize: { width: 1600, height: 900 },
          effectiveContainerSize: { width: 900, height: 240 },
        })}
      />
    );

    const placeholder = container.querySelector('img[alt="Cover"]') as HTMLImageElement | null;

    expect(placeholder).not.toBeNull();
    if (!placeholder) return;

    expect(placeholder.style.width).toBe('900px');
    expect(placeholder.style.height).toBe('506.25px');
    expect(placeholder.style.transform).toContain('translate(');
    expect(placeholder.style.transform).toContain('18px');
    expect(placeholder.style.transform).toContain('-12px');
    expect(placeholder.style.transform).toContain('scale(1.35)');
  });

  it('keeps fallback sizing aspect-safe before media dimensions are ready', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          mediaSize: null,
          objectFitMode: 'horizontal-cover',
        })}
      />
    );
    const image = container.querySelector('img[alt="Cover Cropper"]') as HTMLImageElement | null;

    expect(image).not.toBeNull();
    if (!image) return;

    expect(image.style.width).toBe('100%');
    expect(image.style.height).toBe('auto');
  });

  it('keeps placeholder fallback sizing aligned with the cropper before media dimensions are ready', () => {
    const { container } = render(
      <CoverRenderer
        {...buildProps({
          mediaSize: null,
          crop: { x: 14, y: -8 },
          objectFitMode: 'vertical-cover',
        })}
      />
    );

    const placeholder = container.querySelector('img[alt="Cover"]') as HTMLImageElement | null;

    expect(placeholder).not.toBeNull();
    if (!placeholder) return;

    expect(placeholder.style.width).toBe('auto');
    expect(placeholder.style.height).toBe('100%');
    expect(placeholder.style.transform).toContain('translate(');
    expect(placeholder.style.transform).toContain('14px');
    expect(placeholder.style.transform).toContain('-8px');
  });
});
