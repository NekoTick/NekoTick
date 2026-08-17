import { describe, expect, it, vi } from 'vitest';
import { shouldLockPreviewToolbarPosition } from './floatingToolbarPluginView';
import { installFloatingToolbarPluginViewCore } from './floatingToolbarPluginViewCore';
import { installFloatingToolbarPluginViewEventMethods } from './floatingToolbarPluginViewEventMethods';
import {
  collectToolbarSubmenus,
  correctToolbarSubmenusToContentBounds,
} from './floatingToolbarSubmenus';
import { correctToolbarYToViewportBounds, createToolbarElement } from './floatingToolbarDom';
import type { FloatingToolbarState } from './types';

describe('floatingToolbarPluginView', () => {
  it('does not schedule hidden toolbar layout work during scrolling', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    let isVisible = false;
    const updateToolbar = vi.fn();
    const ctx: Record<string, any> = {
      editorView: {
        dom: document.createElement('div'),
        state: {},
      },
      layoutRaf: null,
      toolbarKey: {
        getState: () => ({
          aiReview: null,
          aiReviews: [],
          isVisible,
        }),
      },
      updateToolbar,
    };

    try {
      installFloatingToolbarPluginViewCore(ctx as never);
      ctx.scheduleToolbarUpdate();

      expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

      isVisible = true;
      ctx.scheduleToolbarUpdate();

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
      animationFrames[0]?.(0);
      expect(updateToolbar).toHaveBeenCalledOnce();
    } finally {
      requestAnimationFrameSpy.mockRestore();
    }
  });

  it('marks floating toolbar roots as non-editor chrome for blank-area pointer handling', () => {
    const toolbar = createToolbarElement();

    expect(toolbar.getAttribute('data-no-editor-drag-box')).toBe('true');
  });

  it('finishes text selection when editor mouseup stops bubbling', () => {
    const toolbar = createToolbarElement();
    const selectionToolbar = createToolbarElement();
    const editorBody = document.createElement('div');
    const interactionState = {
      isMouseDown: true,
      isPointerInsideToolbar: false,
      pendingShow: false,
    };
    const ctx: Record<string, any> = {
      bindGlobalListeners: vi.fn(),
      editorView: { dom: editorBody },
      handleClickOutside: vi.fn(),
      handleDocumentFormatShortcut: vi.fn(),
      handleDocumentToolbarPointerMove: vi.fn(),
      handleEscape: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseUp: vi.fn(),
      handleToolbarPointerEnter: vi.fn(),
      handleToolbarPointerLeave: vi.fn(),
      interactionState,
      scheduleToolbarUpdate: vi.fn(),
      scrollRoot: null,
      toolbarElement: toolbar,
      selectionToolbarElement: selectionToolbar,
      toolbarRoot: null,
      unbindGlobalListeners: vi.fn(),
    };

    installFloatingToolbarPluginViewEventMethods(ctx as never);
    ctx.bindGlobalListeners(null);
    editorBody.addEventListener('mouseup', (event) => event.stopPropagation());
    document.body.append(editorBody);

    try {
      editorBody.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(interactionState.isMouseDown).toBe(false);
    } finally {
      ctx.unbindGlobalListeners(null);
      editorBody.remove();
    }
  });

  it('does not collapse the editor selection when clicking an external text control', () => {
    const state = {
      doc: { content: { size: 18 } },
      selection: { empty: false, from: 1, to: 9 },
    };
    const toolbar = createToolbarElement();
    const selectionToolbar = createToolbarElement();
    const editorBody = document.createElement('div');
    const titleInput = document.createElement('textarea');
    const dispatch = vi.fn();
    const ctx: Record<string, any> = {
      bindGlobalListeners: vi.fn(),
      editorView: {
        dispatch,
        dom: editorBody,
        state,
      },
      handleClickOutside: vi.fn(),
      handleDocumentFormatShortcut: vi.fn(),
      handleDocumentToolbarPointerMove: vi.fn(),
      handleEscape: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseUp: vi.fn(),
      handleToolbarPointerEnter: vi.fn(),
      handleToolbarPointerLeave: vi.fn(),
      interactionState: {
        isMouseDown: false,
        isPointerInsideToolbar: false,
        pendingShow: false,
      },
      scheduleToolbarUpdate: vi.fn(),
      scrollRoot: null,
      toolbarElement: toolbar,
      selectionToolbarElement: selectionToolbar,
      toolbarKey: {
        getState: () => ({ isVisible: true, subMenu: null }),
      },
      toolbarRoot: null,
      unbindGlobalListeners: vi.fn(),
    };

    installFloatingToolbarPluginViewEventMethods(ctx as never);
    ctx.bindGlobalListeners(null);
    document.body.append(editorBody, titleInput);

    try {
      titleInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      ctx.unbindGlobalListeners(null);
      editorBody.remove();
      titleInput.remove();
    }
  });

  it('locks toolbar position while preview submenus are open', () => {
    const lockedSubMenus: Array<FloatingToolbarState['subMenu']> = [
      'block',
      'alignment',
      'color',
    ];

    lockedSubMenus.forEach((subMenu) => {
      expect(shouldLockPreviewToolbarPosition({ subMenu, hasActivePreview: false })).toBe(true);
    });
  });

  it('locks toolbar position while a direct-button preview is active', () => {
    expect(shouldLockPreviewToolbarPosition({
      subMenu: null,
      hasActivePreview: true,
    })).toBe(true);
  });

  it('does not lock toolbar position for non-preview submenus without an active preview', () => {
    const unlockedSubMenus: Array<FloatingToolbarState['subMenu']> = [
      null,
      'ai',
      'aiReview',
      'link',
    ];

    unlockedSubMenus.forEach((subMenu) => {
      expect(shouldLockPreviewToolbarPosition({ subMenu, hasActivePreview: false })).toBe(false);
    });
  });

  it('collects toolbar submenus without querySelectorAll materialization', () => {
    const toolbar = document.createElement('div');
    toolbar.innerHTML = [
      '<div><div class="toolbar-submenu" data-id="first"></div></div>',
      '<div class="toolbar-submenu" data-id="second"></div>',
    ].join('');
    const querySelectorAllSpy = vi.spyOn(toolbar, 'querySelectorAll').mockImplementation(() => {
      throw new Error('querySelectorAll should not be used for toolbar submenu scans');
    });

    try {
      const submenus = collectToolbarSubmenus(toolbar);

      expect(submenus.map((submenu) => submenu.dataset.id)).toEqual(['first', 'second']);
    } finally {
      querySelectorAllSpy.mockRestore();
    }
  });

  it('corrects visible submenu overflow against content bounds', () => {
    const toolbar = document.createElement('div');
    const submenu = document.createElement('div');
    submenu.className = 'toolbar-submenu';
    toolbar.append(submenu);
    Object.defineProperty(submenu, 'offsetParent', { configurable: true, value: toolbar });
    submenu.getBoundingClientRect = vi.fn(() => ({
      bottom: 0,
      height: 0,
      left: 80,
      right: 180,
      top: 0,
      width: 100,
      x: 80,
      y: 0,
      toJSON: () => {},
    }));

    correctToolbarSubmenusToContentBounds(toolbar, { left: 40, right: 160 });

    expect(submenu.style.getPropertyValue('--vlaina-toolbar-submenu-shift-x')).toBe('-20px');
  });

  it('keeps the toolbar vertically inside the visible viewport bounds', () => {
    const toolbar = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'floating-toolbar-inner';
    toolbar.append(inner);
    inner.getBoundingClientRect = vi.fn(() => ({
      bottom: 30,
      height: 40,
      left: 0,
      right: 100,
      top: -10,
      width: 100,
      x: 0,
      y: -10,
      toJSON: () => {},
    }));

    const correctedY = correctToolbarYToViewportBounds(toolbar, 20, { top: 0, bottom: 200 });

    expect(correctedY).toBeGreaterThan(20);
    expect(toolbar.style.top).toBe(`${correctedY}px`);
  });
});
