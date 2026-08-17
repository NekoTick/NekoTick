import { useRef, type KeyboardEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { hsvToRgb, rgbToHex, type HsvColor } from '@/components/Whiteboard/model/core/whiteboardColor';
import { useFramePointerUpdate } from './useFramePointerUpdate';

interface ColorFieldProps {
  hsv: HsvColor;
  label: string;
  onChange: (color: HsvColor) => void;
}

export function SaturationValueField({ label, hsv, onChange }: ColorFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const update = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onChange({ ...hsv, s: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)), v: Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height)) });
  };
  const { flushPointerUpdate, schedulePointerUpdate, updatePointerNow } = useFramePointerUpdate(update);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = 0.01;
    const nextSaturation = hsv.s + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0);
    const nextValue = hsv.v + (event.key === 'ArrowUp' ? delta : event.key === 'ArrowDown' ? -delta : 0);
    onChange({ ...hsv, s: Math.min(1, Math.max(0, nextSaturation)), v: Math.min(1, Math.max(0, nextValue)) });
  };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuetext={`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`} onKeyDown={handleKeyDown} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePointerNow(event.clientX, event.clientY); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) schedulePointerUpdate(event.clientX, event.clientY); }} onPointerUp={flushPointerUpdate} onPointerCancel={flushPointerUpdate} onLostPointerCapture={flushPointerUpdate} className="relative min-h-[var(--vlaina-size-240px)] touch-none overflow-hidden rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-subtle-border-strong)] sm:min-h-0" style={{ backgroundColor: hueColor, backgroundImage: themeWhiteboardTokens.colorPickerSaturationValueGradient }}>
      <span aria-hidden="true" className="pointer-events-none absolute size-[var(--vlaina-size-18px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--vlaina-radius-circle)] border-2 border-[var(--vlaina-color-picker-white)] shadow-[var(--vlaina-shadow-sm)]" style={{ backgroundColor: rgbToHex(hsvToRgb(hsv)), left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
    </div>
  );
}

export function HueField({ label, hsv, onChange }: ColorFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const update = (_clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) onChange({ ...hsv, h: Math.min(359.999, Math.max(0, ((clientY - rect.top) / rect.height) * 360)) });
  };
  const { flushPointerUpdate, schedulePointerUpdate, updatePointerNow } = useFramePointerUpdate(update);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    onChange({ ...hsv, h: (hsv.h + (event.key === 'ArrowDown' ? 2 : 358)) % 360 });
  };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360} onKeyDown={handleKeyDown} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePointerNow(event.clientX, event.clientY); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) schedulePointerUpdate(event.clientX, event.clientY); }} onPointerUp={flushPointerUpdate} onPointerCancel={flushPointerUpdate} onLostPointerCapture={flushPointerUpdate} className="relative min-h-[var(--vlaina-size-48px)] touch-none rounded-[var(--vlaina-radius-8px)]" style={{ backgroundImage: themeWhiteboardTokens.colorPickerHueGradient }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-[-2px] h-[var(--vlaina-size-6px)] -translate-y-1/2 rounded-[var(--vlaina-radius-pill)] border-2 border-[var(--vlaina-color-picker-white)] shadow-[var(--vlaina-shadow-sm)]" style={{ backgroundColor: hueColor, top: `${hsv.h / 360 * 100}%` }} />
    </div>
  );
}

export function ColorInput({ label, onBlur, onChange, type = 'text', value }: { label: string; onBlur?: () => void; onChange: (value: string) => void; type?: 'text' | 'number'; value: string }) {
  return (
    <label className="contents">
      <span className="self-center text-[length:var(--vlaina-font-13)] text-[var(--vlaina-color-text-secondary)]">{label}</span>
      <input type={type} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 255 : undefined} value={value} onBlur={onBlur} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-subtle-border-strong)] bg-[var(--vlaina-color-control-hover-bg)] px-2 font-mono text-[length:var(--vlaina-font-13)] text-[var(--vlaina-color-text-primary)] outline-none focus:border-[var(--vlaina-color-whiteboard-selected)]" />
    </label>
  );
}
