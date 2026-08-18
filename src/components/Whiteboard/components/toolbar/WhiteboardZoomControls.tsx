import { memo, useLayoutEffect, useRef, useState, type WheelEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardViewport } from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  WhiteboardToolbarButton,
  WhiteboardToolbarGroup,
  whiteboardMainToolbarSurfaceClassName,
} from './WhiteboardToolbarPrimitives';

interface WhiteboardZoomControlsProps {
  active: boolean;
  viewport: WhiteboardViewport;
  onFitView: () => void;
  onResetView: () => void;
  onZoomChange: (delta: number) => void;
}

export const WhiteboardZoomControls = memo(function WhiteboardZoomControls({
  active,
  viewport,
  onFitView,
  onResetView,
  onZoomChange,
}: WhiteboardZoomControlsProps) {
  const { t } = useI18n();
  const controlsRef = useRef<HTMLDivElement>(null);
  const [avoidMainToolbar, setAvoidMainToolbar] = useState(false);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const whiteboard = controls?.closest('[data-whiteboard-active]');
    const toolbar = whiteboard?.querySelector<HTMLElement>('[data-whiteboard-main-toolbar="true"]');
    if (!controls || !toolbar) return undefined;

    const updatePosition = () => {
      const controlsRect = controls.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      setAvoidMainToolbar(controlsRect.right > toolbarRect.left && controlsRect.left < toolbarRect.right);
    };
    updatePosition();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    observer?.observe(controls);
    observer?.observe(toolbar);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [active]);

  if (!active) return null;

  const handleZoomWheel = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    onZoomChange(event.deltaY < 0 ? themeWhiteboardTokens.zoomStep : -themeWhiteboardTokens.zoomStep);
  };

  return (
    <div
      ref={controlsRef}
      data-whiteboard-zoom-controls="true"
      className={cn(
        'app-no-drag pointer-events-auto absolute left-3 z-[var(--vlaina-z-50)]',
        avoidMainToolbar ? 'bottom-[var(--vlaina-space-96px)]' : 'bottom-4',
      )}
    >
      <WhiteboardToolbarGroup
        className={cn(
          'h-10 gap-1 px-1',
          whiteboardMainToolbarSurfaceClassName,
        )}
      >
        <WhiteboardToolbarButton icon="nav.fullscreen" label={t('whiteboard.fitView')} onClick={onFitView} />
        <WhiteboardToolbarButton icon="common.remove" label={t('whiteboard.zoomOut')} onClick={() => onZoomChange(-themeWhiteboardTokens.zoomStep)} />
        <button
          type="button"
          data-whiteboard-zoom-percentage="true"
          aria-label={`${Math.round(viewport.zoom * 100)}%`}
          onClick={onResetView}
          onWheel={handleZoomWheel}
          className="h-8 min-w-[var(--vlaina-size-48px)] cursor-pointer rounded-[var(--vlaina-radius-8px)] px-1 text-center text-[length:var(--vlaina-font-13)] font-medium tabular-nums text-[var(--vlaina-color-text-secondary)] shadow-none transition-colors duration-[var(--vlaina-duration-150)] hover:bg-transparent hover:text-[var(--vlaina-color-control-hover-fg)] hover:shadow-none"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <WhiteboardToolbarButton icon="common.add" label={t('whiteboard.zoomIn')} onClick={() => onZoomChange(themeWhiteboardTokens.zoomStep)} />
      </WhiteboardToolbarGroup>
    </div>
  );
}, (previous, next) => (
  previous.active === next.active
  && previous.onFitView === next.onFitView
  && previous.onResetView === next.onResetView
  && previous.onZoomChange === next.onZoomChange
  && Math.round(previous.viewport.zoom * 100) === Math.round(next.viewport.zoom * 100)
));
