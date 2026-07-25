import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type UIEvent,
  type RefObject,
} from 'react';

const OVERSCROLL_OPEN_THRESHOLD = 56;
const ESCAPE_BLOCKING_LAYER_SELECTOR = [
  '[role="dialog"]',
  '[data-sidebar-context-menu-layer="true"]',
  '[data-radix-popper-content-wrapper]',
].join(',');

interface UseSidebarSearchControlsOptions {
  enabled?: boolean;
  isOpen: boolean;
  query: string;
  onOpen: () => void;
  onClose: () => void;
  interactionScopeRef?: RefObject<HTMLElement | null>;
}

function isEditableTargetOutsideSearchInput(
  target: EventTarget | null,
  searchInput: HTMLInputElement | null,
) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target === searchInput) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

function isWithinEscapeBlockingLayer(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(ESCAPE_BLOCKING_LAYER_SELECTOR));
}

export function useSidebarSearchControls({
  enabled = true,
  isOpen,
  query,
  onOpen,
  onClose,
  interactionScopeRef,
}: UseSidebarSearchControlsOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const overscrollDistanceRef = useRef(0);
  const shouldResetScrollTopOnCloseRef = useRef(false);
  const returnFocusElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const blurFocusedInput = useCallback(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      input.blur();
    }
  }, []);

  const captureReturnFocus = useCallback(() => {
    const activeElement = document.activeElement;
    if (
      !(activeElement instanceof HTMLElement)
      || activeElement === inputRef.current
      || activeElement === document.body
      || activeElement.closest('[aria-hidden="true"], [inert]')
    ) {
      returnFocusElementRef.current = null;
      return;
    }
    returnFocusElementRef.current = activeElement;
  }, []);

  const restoreReturnFocus = useCallback(() => {
    const target = returnFocusElementRef.current;
    returnFocusElementRef.current = null;
    if (
      !target
      || !target.isConnected
      || target.hasAttribute('disabled')
      || target.closest('[aria-hidden="true"], [inert]')
    ) {
      return;
    }
    target.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !isOpen) {
      blurFocusedInput();
      if (wasOpenRef.current && enabled) restoreReturnFocus();
      wasOpenRef.current = false;
      if (shouldResetScrollTopOnCloseRef.current) {
        const scrollRoot = scrollRootRef.current;
        if (scrollRoot) {
          scrollRoot.scrollTop = 0;
          window.requestAnimationFrame(() => {
            if (scrollRootRef.current) {
              scrollRootRef.current.scrollTop = 0;
            }
          });
        }
        shouldResetScrollTopOnCloseRef.current = false;
      }
      return;
    }

    if (!wasOpenRef.current) {
      captureReturnFocus();
      wasOpenRef.current = true;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [blurFocusedInput, captureReturnFocus, enabled, isOpen, restoreReturnFocus]);

  const hideSearch = useCallback(() => {
    overscrollDistanceRef.current = 0;
    blurFocusedInput();
    onClose();
  }, [blurFocusedInput, onClose]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop > 0) {
      overscrollDistanceRef.current = 0;
    }
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }

      if (
        event.key !== 'Escape'
      ) {
        return;
      }

      const target = event.target;
      const activeElement = document.activeElement;
      const interactionScope = interactionScopeRef?.current ?? scrollRootRef.current;
      const targetWithinScope = Boolean(
        interactionScope &&
        target instanceof Node &&
        interactionScope.contains(target),
      );
      const activeWithinScope = Boolean(
        interactionScope &&
        activeElement instanceof Node &&
        interactionScope.contains(activeElement),
      );

      if (
        isWithinEscapeBlockingLayer(target) ||
        isWithinEscapeBlockingLayer(activeElement)
      ) {
        return;
      }

      if (
        (targetWithinScope || activeWithinScope) &&
        (
          isEditableTargetOutsideSearchInput(target, inputRef.current) ||
          isEditableTargetOutsideSearchInput(activeElement, inputRef.current)
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      hideSearch();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, hideSearch, interactionScopeRef, isOpen]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interactionScope = interactionScopeRef?.current ?? scrollRootRef.current;
    const scrollRoot = scrollRootRef.current;
    if (!interactionScope || !scrollRoot) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (isOpen) {
        if (!query.trim() && event.deltaY > 0) {
          event.preventDefault();
          shouldResetScrollTopOnCloseRef.current = true;
          hideSearch();
          return;
        }

        if (scrollRoot.scrollTop === 0 && event.deltaY < 0) {
          event.preventDefault();
        }
        return;
      }

      if (scrollRoot.scrollTop > 0) {
        overscrollDistanceRef.current = 0;
        return;
      }
      if (event.deltaY >= 0) {
        overscrollDistanceRef.current = 0;
        return;
      }

      overscrollDistanceRef.current += Math.abs(event.deltaY);
      if (overscrollDistanceRef.current < OVERSCROLL_OPEN_THRESHOLD) {
        return;
      }

      event.preventDefault();
      onOpen();
    };

    interactionScope.addEventListener('wheel', handleWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      interactionScope.removeEventListener('wheel', handleWheel, true);
    };
  }, [enabled, hideSearch, interactionScopeRef, isOpen, onOpen, query]);

  return {
    inputRef,
    scrollRootRef,
    hideSearch,
    handleScroll,
  };
}
