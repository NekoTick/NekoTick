import type { TextControl } from './nativeCaretOverlayGeometry';

const CARET_GEOMETRY_TRANSITION_PROPERTIES = new Set([
  'transform',
  'translate',
  'scale',
  'rotate',
  'perspective',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'inset-inline',
  'inset-inline-start',
  'inset-inline-end',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-indent',
]);

function shouldTrackMotion(event: Event): boolean {
  if (!event.type.startsWith('transition')) return true;

  const propertyName = (event as TransitionEvent).propertyName;
  return !propertyName || CARET_GEOMETRY_TRANSITION_PROPERTIES.has(propertyName);
}

export function createNativeCaretOverlayMotionTracker() {
  const activeTargets = new Map<Element, number>();

  return {
    clear(): void {
      activeTargets.clear();
    },
    contains(control: TextControl): boolean {
      for (const [target, count] of activeTargets) {
        if (count > 0 && (target === control || target.contains(control))) {
          return true;
        }
      }
      return false;
    },
    end(event: Event): boolean {
      if (!shouldTrackMotion(event)) return false;

      const target = event.target;
      if (!(target instanceof Element)) return false;

      const count = activeTargets.get(target) ?? 0;
      if (count <= 0) return false;
      if (count === 1) {
        activeTargets.delete(target);
      } else {
        activeTargets.set(target, count - 1);
      }
      return true;
    },
    start(event: Event): Element | null {
      if (!shouldTrackMotion(event)) return null;

      const target = event.target;
      if (!(target instanceof Element)) return null;
      activeTargets.set(target, (activeTargets.get(target) ?? 0) + 1);
      return target;
    },
  };
}
