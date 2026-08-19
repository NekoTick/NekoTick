import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { themeDomStyleTokens, themeRenderingTokens } from '@/styles/themeTokens';

interface FrozenMainLayout {
  main: HTMLElement;
  overflow: string;
  children: Array<{
    element: HTMLElement;
    minWidth: string;
    width: string;
  }>;
  rightAnchors: Array<{
    element: HTMLElement;
    position: string;
    right: string;
    top: string;
    translate: string;
  }>;
}

export function useFrozenMainLayout(mainRef: RefObject<HTMLElement | null>) {
  const frozenRef = useRef<FrozenMainLayout | null>(null);

  const restore = useCallback(() => {
    const frozen = frozenRef.current;
    if (!frozen) return;

    frozen.main.style.overflow = frozen.overflow;
    for (const child of frozen.children) {
      child.element.style.width = child.width;
      child.element.style.minWidth = child.minWidth;
    }
    for (const anchor of frozen.rightAnchors) {
      anchor.element.style.position = anchor.position;
      anchor.element.style.right = anchor.right;
      anchor.element.style.top = anchor.top;
      anchor.element.style.translate = anchor.translate;
    }
    frozenRef.current = null;
  }, []);

  const freeze = useCallback((): number | null => {
    restore();
    const main = mainRef.current;
    if (!main) return null;

    const mainWidth = main.clientWidth;
    const width = `${mainWidth}px`;
    const overflow = main.style.overflow;
    const children = Array.from(main.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((element) => ({
        element,
        minWidth: element.style.minWidth,
        width: element.style.width,
      }));
    const rightAnchors = Array.from(
      main.querySelectorAll<HTMLElement>('[data-layout-resize-right-anchor="true"]'),
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        element,
        position: element.style.position,
        right: element.style.right,
        top: element.style.top,
        translate: element.style.translate,
        viewportRight: window.innerWidth - rect.right,
        viewportTop: rect.top,
      };
    });

    main.style.overflow = themeDomStyleTokens.overflowHidden;
    for (const child of children) {
      child.element.style.width = width;
      child.element.style.minWidth = width;
    }
    for (const anchor of rightAnchors) {
      anchor.element.style.position = themeDomStyleTokens.positionFixed;
      anchor.element.style.right = `${anchor.viewportRight}px`;
      anchor.element.style.top = `${anchor.viewportTop}px`;
      anchor.element.style.translate = themeRenderingTokens.transformNone;
    }
    frozenRef.current = { main, overflow, children, rightAnchors };
    return mainWidth;
  }, [mainRef, restore]);

  useEffect(() => restore, [restore]);

  return { freeze, restore };
}
