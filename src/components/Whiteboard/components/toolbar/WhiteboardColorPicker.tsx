import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getElectronBridge } from '@/lib/electron/bridge';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clampRgbChannel, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '@/components/Whiteboard/model/core/whiteboardColor';
import { WhiteboardDockSlot, whiteboardFloatingPanelClassName } from './WhiteboardToolbarPrimitives';
import { ColorInput, HueField, SaturationValueField } from './WhiteboardColorFields';
import { sampleAppColor } from './whiteboardColorSampling';

interface WhiteboardColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onPreviewChange?: (color: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
  swatches: readonly string[];
}

type EyeDropperWindow = Window & {
  EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
};

export function WhiteboardColorPicker({ color, onChange, onPreviewChange, onClose, onOpen, swatches }: WhiteboardColorPickerProps) {
  const { t } = useI18n();
  const initialRgb = hexToRgb(color) ?? { r: 39, g: 39, b: 42 };
  const [open, setOpen] = useState(false);
  const [appColorPicking, setAppColorPicking] = useState(false);
  const [hsv, setHsv] = useState(() => rgbToHsv(initialRgb));
  const [hexInput, setHexInput] = useState(() => rgbToHex(initialRgb));
  const nativeColorInputRef = useRef<HTMLInputElement>(null);
  const colorPickingCleanupRef = useRef<(() => void) | null>(null);
  const colorPickingRequestRef = useRef(0);
  const previewStartedRef = useRef(false);
  const rgb = hsvToRgb(hsv);
  const resolvedHex = rgbToHex(rgb);

  useEffect(() => {
    if (!open) {
      previewStartedRef.current = false;
      return;
    }
    if (!previewStartedRef.current) {
      previewStartedRef.current = true;
      return;
    }
    onPreviewChange?.(resolvedHex);
  }, [onPreviewChange, open, resolvedHex]);

  const resetDraft = () => {
    const nextRgb = hexToRgb(color) ?? initialRgb;
    setHsv(rgbToHsv(nextRgb));
    setHexInput(rgbToHex(nextRgb));
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpen?.();
      resetDraft();
    } else onClose?.();
    setOpen(nextOpen);
  };
  const closePicker = () => {
    onClose?.();
    setOpen(false);
  };
  const updateFromRgb = (nextRgb: { r: number; g: number; b: number }) => {
    setHsv(rgbToHsv(nextRgb));
    setHexInput(rgbToHex(nextRgb));
  };
  const handleHexChange = (value: string) => {
    setHexInput(value);
    const nextRgb = hexToRgb(value);
    if (nextRgb) setHsv(rgbToHsv(nextRgb));
  };
  const updateChannel = (channel: 'r' | 'g' | 'b', value: string) => {
    updateFromRgb({ ...rgb, [channel]: clampRgbChannel(value) });
  };
  const chooseSwatch = (swatch: string) => {
    const nextRgb = hexToRgb(swatch);
    if (nextRgb) updateFromRgb(nextRgb);
  };
  const openNativeColorPicker = () => {
    const input = nativeColorInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {}
    }
    input.click();
  };
  const startAppColorPicker = () => {
    colorPickingCleanupRef.current?.();
    const requestId = colorPickingRequestRef.current + 1;
    colorPickingRequestRef.current = requestId;
    const draftBeforePicking = resolvedHex;
    document.documentElement.dataset.whiteboardColorPicking = 'true';
    setAppColorPicking(true);
    let picked = false;
    let samplingPreview = false;
    let previewFrame: number | null = null;
    let queuedPreviewPoint: { x: number; y: number } | null = null;
    const cleanup = () => {
      if (previewFrame !== null) {
        window.cancelAnimationFrame(previewFrame);
        previewFrame = null;
      }
      delete document.documentElement.dataset.whiteboardColorPicking;
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', blockPickedEvent, true);
      window.removeEventListener('click', blockPickedEvent, true);
      window.removeEventListener('blur', handleCancel, true);
      colorPickingCleanupRef.current = null;
      setAppColorPicking(false);
    };
    const handleCancel = () => {
      if (requestId !== colorPickingRequestRef.current) return;
      colorPickingRequestRef.current += 1;
      cleanup();
      chooseSwatch(draftBeforePicking);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleCancel();
    };
    const blockPickedEvent = (event: Event) => {
      if (!picked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'pointerup') window.setTimeout(cleanup, 0);
    };
    const sampleQueuedPreview = () => {
      if (samplingPreview || picked || !queuedPreviewPoint || previewFrame !== null) return;
      previewFrame = window.requestAnimationFrame(() => {
        previewFrame = null;
        if (picked || !queuedPreviewPoint) return;
        const point = queuedPreviewPoint;
        queuedPreviewPoint = null;
        samplingPreview = true;
        void sampleAppColor(point.x, point.y).then((sampledColor) => {
          if (requestId === colorPickingRequestRef.current && !picked && sampledColor) chooseSwatch(sampledColor);
        }).catch(() => {}).finally(() => {
          samplingPreview = false;
          if (requestId === colorPickingRequestRef.current && !picked) sampleQueuedPreview();
        });
      });
    };
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (picked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      queuedPreviewPoint = { x: event.clientX, y: event.clientY };
      sampleQueuedPreview();
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || picked) return;
      picked = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      void sampleAppColor(event.clientX, event.clientY).then((sampledColor) => {
        if (requestId !== colorPickingRequestRef.current) return;
        if (sampledColor) chooseSwatch(sampledColor);
      }).catch(() => {});
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', blockPickedEvent, true);
    window.addEventListener('click', blockPickedEvent, true);
    window.addEventListener('blur', handleCancel, true);
    colorPickingCleanupRef.current = cleanup;
  };
  useEffect(() => () => {
    colorPickingRequestRef.current += 1;
    colorPickingCleanupRef.current?.();
  }, []);
  const pickFromScreen = async () => {
    const EyeDropper = (window as EyeDropperWindow).EyeDropper;
    if (getElectronBridge()?.media?.capturePage) {
      startAppColorPicker();
      return;
    }
    if (!EyeDropper) {
      openNativeColorPicker();
      return;
    }
    try {
      const result = await new EyeDropper().open();
      chooseSwatch(result.sRGBHex);
    } catch {
      openNativeColorPicker();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <WhiteboardDockSlot size="compact">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('whiteboard.customColor')}
            aria-pressed={open}
            data-whiteboard-dock-visual="true"
            className="flex size-[var(--vlaina-size-36px)] shrink-0 items-center justify-center rounded-[var(--vlaina-radius-circle)]"
          >
            <span
              aria-hidden="true"
              data-whiteboard-color-trigger="true"
              className="flex size-[var(--vlaina-size-36px)] items-center justify-center rounded-[var(--vlaina-radius-circle)] shadow-[var(--vlaina-shadow-sm)]"
              style={{ backgroundImage: 'var(--vlaina-color-picker-trigger-outer)' }}
            >
              <span className="flex size-[var(--vlaina-size-28px)] items-center justify-center rounded-[var(--vlaina-radius-circle)] bg-[var(--vlaina-color-picker-white)]">
                <span
                  data-whiteboard-applied-color="true"
                  className="size-[var(--vlaina-size-22px)] rounded-[var(--vlaina-radius-circle)] shadow-[var(--vlaina-shadow-xs)]"
                  style={{ backgroundColor: color }}
                />
              </span>
            </span>
          </button>
        </PopoverTrigger>
      </WhiteboardDockSlot>

      <PopoverContent side="top" align="center" sideOffset={8} role="dialog" aria-busy={appColorPicking} aria-label={t('whiteboard.customColor')} className={cn('max-h-[var(--vlaina-whiteboard-color-picker-max-height)] w-[var(--vlaina-size-560px)] max-w-[var(--vlaina-whiteboard-panel-max-width)] overflow-y-auto rounded-[var(--vlaina-radius-26px)] p-3', whiteboardFloatingPanelClassName)}>

        <div className="grid gap-3 sm:h-[var(--vlaina-size-280px)] sm:grid-cols-[minmax(0,1fr)_var(--vlaina-size-28px)_var(--vlaina-size-160px)]">
          <SaturationValueField label={t('whiteboard.saturationAndBrightness')} hsv={hsv} onChange={setHsv} />
          <HueField label={t('whiteboard.hue')} hsv={hsv} onChange={setHsv} />

          <div className="grid content-start gap-2 sm:grid-cols-[var(--vlaina-size-24px)_minmax(0,1fr)]">
            <div aria-hidden="true" className="col-span-full h-[var(--vlaina-size-48px)] rounded-[var(--vlaina-radius-8px)]" style={{ backgroundColor: resolvedHex }} />
            <ColorInput label="HEX" value={hexInput} onBlur={() => setHexInput(resolvedHex)} onChange={handleHexChange} />
            <ColorInput label="R" type="number" value={String(Math.round(rgb.r))} onChange={(value) => updateChannel('r', value)} />
            <ColorInput label="G" type="number" value={String(Math.round(rgb.g))} onChange={(value) => updateChannel('g', value)} />
            <ColorInput label="B" type="number" value={String(Math.round(rgb.b))} onChange={(value) => updateChannel('b', value)} />
          </div>
        </div>

        <div data-whiteboard-common-colors="true" className="grid grid-cols-8 gap-1.5 py-1">
          {swatches.map((swatch) => {
            const selected = resolvedHex.toLowerCase() === swatch.toLowerCase();
            return (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={selected}
                onClick={() => chooseSwatch(swatch)}
                className="flex h-9 min-w-0 items-center justify-center rounded-[var(--vlaina-radius-8px)]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block size-full rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-subtle-border-strong)]',
                    selected && 'ring-2 ring-[var(--vlaina-color-whiteboard-selected)] app-ring-offset-1 ring-offset-[var(--vlaina-color-whiteboard-toolbar-bg)]',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" aria-label={t('whiteboard.pickColor')} onClick={pickFromScreen} className="flex size-9 items-center justify-center rounded-[var(--vlaina-radius-8px)] bg-[var(--vlaina-color-control-hover-bg)] text-[var(--vlaina-color-text-primary)]">
            <Icon name="whiteboard.pickColor" size="sm" />
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={closePicker} className="h-9 rounded-[var(--vlaina-radius-8px)] bg-[var(--vlaina-color-control-hover-bg)] px-4 text-[length:var(--vlaina-font-13)] font-medium">{t('common.cancel')}</button>
            <button type="button" onClick={() => { onChange(resolvedHex); closePicker(); }} className="h-9 rounded-[var(--vlaina-radius-8px)] bg-[var(--vlaina-color-control-hover-bg)] px-4 text-[length:var(--vlaina-font-13)] font-medium text-[color:var(--vlaina-color-accent)]">{t('common.apply')}</button>
          </div>
        </div>
        <input ref={nativeColorInputRef} type="color" value={resolvedHex} aria-label={t('whiteboard.pickColor')} onChange={(event) => chooseSwatch(event.target.value)} className="sr-only" />
      </PopoverContent>
    </Popover>
  );
}
