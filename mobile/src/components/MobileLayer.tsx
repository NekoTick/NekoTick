import {
  useEffect,
  useId,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DRAWER_SWIPE_CLOSE_DISTANCE_PX = 72;
const DRAWER_SWIPE_HORIZONTAL_DOMINANCE = 1.25;

interface MobileLayerProps {
  open: boolean;
  title: string;
  variant: 'drawer' | 'screen' | 'sheet';
  children: ReactNode;
  onClose: () => void;
  contentClassName?: string;
  headerTrailing?: ReactNode;
}

export function MobileLayer({
  open,
  title,
  variant,
  children,
  onClose,
  contentClassName,
  headerTrailing,
}: MobileLayerProps) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const drawerTouchRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const visibleDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
          .filter((dialog) => dialog.offsetParent !== null || dialog.getClientRects().length > 0);
        if (visibleDialogs.at(-1) !== panelRef.current) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (variant === 'drawer' && event.pointerType === 'touch') {
      drawerTouchRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    }
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drawerTouchRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    drawerTouchRef.current = null;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const isHorizontalLeftSwipe = deltaX <= -DRAWER_SWIPE_CLOSE_DISTANCE_PX
      && Math.abs(deltaX) >= Math.abs(deltaY) * DRAWER_SWIPE_HORIZONTAL_DOMINANCE;
    if (variant === 'drawer' && isHorizontalLeftSwipe) {
      onClose();
    }
  };
  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawerTouchRef.current?.pointerId === event.pointerId) {
      drawerTouchRef.current = null;
    }
  };

  return createPortal(
    <div
      className="mobile-layer"
      data-mobile-layer={variant}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`mobile-layer__panel mobile-layer__panel--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <header className="mobile-layer__header">
          <button
            type="button"
            className="mobile-icon-button"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <Icon name={variant === 'screen' ? 'nav.back' : 'common.close'} size="lg" />
          </button>
          <h1 id={titleId} className="mobile-layer__title">{title}</h1>
          <div className="mobile-layer__trailing">{headerTrailing}</div>
        </header>
        <div className={`mobile-layer__content ${contentClassName ?? ''}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
