import { useEffect } from 'react';
import { isInsideMenuLayer, SIDEBAR_SCROLL_ROOT_SELECTOR } from './shared';

interface UseMenuDismissOptions {
  isOpen: boolean;
  onClose: () => void;
}

export function useMenuDismiss({ isOpen, onClose }: UseMenuDismissOptions) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isComposing = false;
    const handleCompositionStart = () => {
      isComposing = true;
    };
    const handleCompositionEnd = () => {
      isComposing = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (isInsideMenuLayer(event.target)) {
        return;
      }

      onClose();
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isInsideMenuLayer(event.target)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isComposing) {
        return;
      }

      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleSidebarScroll = () => {
      onClose();
    };

    const scrollRoots = Array.from(
      document.querySelectorAll<HTMLElement>(SIDEBAR_SCROLL_ROOT_SELECTOR),
    );

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('compositionstart', handleCompositionStart, true);
    document.addEventListener('compositionend', handleCompositionEnd, true);
    document.addEventListener('keydown', handleKeyDown, true);
    scrollRoots.forEach((root) => {
      root.addEventListener('wheel', handleSidebarScroll, { passive: true });
      root.addEventListener('scroll', handleSidebarScroll, { passive: true });
    });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('compositionstart', handleCompositionStart, true);
      document.removeEventListener('compositionend', handleCompositionEnd, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      scrollRoots.forEach((root) => {
        root.removeEventListener('wheel', handleSidebarScroll);
        root.removeEventListener('scroll', handleSidebarScroll);
      });
    };
  }, [isOpen, onClose]);
}
