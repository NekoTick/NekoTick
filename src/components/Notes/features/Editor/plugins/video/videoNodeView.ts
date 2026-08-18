import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { useUIStore } from '@/stores/uiSlice';
import type { VideoAttrs } from './types';
import { selectVideoBlock } from './videoBlockSelection';
import { createVideoDom, refreshVideoDomI18n } from './videoDom';
import { shouldStopVideoNodeEvent } from './videoNodeViewEvents';

const PARKED_VIDEO_DOM_TTL_MS = 1000;
const MAX_PARKED_VIDEO_DOMS = 8;
const parkedVideoDomByKey = new Map<string, { dom: HTMLElement; timeout: number }>();

function createVideoDomParkingKey(attrs: VideoAttrs) {
  return JSON.stringify({
    src: attrs.src,
    title: attrs.title,
    width: attrs.width,
    height: attrs.height,
  });
}

function clearParkedVideoDom(key: string) {
  const parked = parkedVideoDomByKey.get(key);
  if (!parked) return;
  window.clearTimeout(parked.timeout);
  parkedVideoDomByKey.delete(key);
}

function takeParkedVideoDom(attrs: VideoAttrs) {
  const key = createVideoDomParkingKey(attrs);
  const parked = parkedVideoDomByKey.get(key);
  if (!parked) return null;

  clearParkedVideoDom(key);
  parked.dom.classList.remove(
    'ProseMirror-selectednode',
    'editor-block-selected',
    'editor-block-drag-source',
    'editor-block-drag-source-textlike',
    'editor-block-drag-source-has-next',
    'editor-block-drag-source-has-previous',
  );
  return parked.dom;
}

function parkVideoDom(attrs: VideoAttrs, dom: HTMLElement) {
  const key = createVideoDomParkingKey(attrs);
  clearParkedVideoDom(key);
  while (parkedVideoDomByKey.size >= MAX_PARKED_VIDEO_DOMS) {
    const oldestKey = parkedVideoDomByKey.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    clearParkedVideoDom(oldestKey);
  }

  const timeout = window.setTimeout(() => {
    parkedVideoDomByKey.delete(key);
  }, PARKED_VIDEO_DOM_TTL_MS);
  parkedVideoDomByKey.set(key, { dom, timeout });
}

export class VideoNodeView implements NodeView {
  dom: HTMLElement;
  private node: ProseMirrorNode;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;
  private readonly handleDoubleClick: (event: MouseEvent) => void;
  private readonly handleMouseDown: (event: MouseEvent) => void;
  private readonly handleWindowMouseMove: (event: MouseEvent) => void;
  private readonly handleWindowMouseUp: () => void;
  private readonly unsubscribeLanguagePreference: () => void;
  private readonly handleLanguageChange: () => void;
  private mouseDownState: {
    x: number;
    y: number;
    selected: boolean;
    timeout: number;
  } | null = null;
  private selectionShield: HTMLElement | null = null;
  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = takeParkedVideoDom(node.attrs as VideoAttrs) ?? createVideoDom(node.attrs as VideoAttrs);
    this.handleDoubleClick = (event) => this.handleNodeDoubleClick(event);
    this.handleMouseDown = (event) => this.handleNodeMouseDown(event);
    this.handleWindowMouseMove = (event) => this.handlePointerMove(event);
    this.handleWindowMouseUp = () => {
      this.clearMouseDownState();
    };
    this.handleLanguageChange = () => refreshVideoDomI18n(this.dom);
    this.unsubscribeLanguagePreference = useUIStore.subscribe((state, previousState) => {
      if (state.languagePreference !== previousState.languagePreference) {
        this.handleLanguageChange();
      }
    });
    this.dom.addEventListener('dblclick', this.handleDoubleClick);
    this.dom.addEventListener('mousedown', this.handleMouseDown, true);
    window.addEventListener('languagechange', this.handleLanguageChange);
  }
  private handleNodeDoubleClick(event: MouseEvent) {
    if (event.shiftKey) {
      return;
    }
    const pos = this.getPos();
    if (typeof pos !== 'number') {
      return;
    }
    event.preventDefault();
    selectVideoBlock(this.view, this.node, pos);
    this.view.focus();
  }
  private handleNodeMouseDown(event: MouseEvent) {
    if (event.button !== 0 || event.shiftKey) {
      return;
    }
    this.clearMouseDownState();
    this.mouseDownState = {
      x: event.clientX,
      y: event.clientY,
      selected: false,
      timeout: window.setTimeout(() => {
        this.selectVideoBlockFromPointerHold();
      }, 180),
    };
    window.addEventListener('mousemove', this.handleWindowMouseMove, true);
    window.addEventListener('mouseup', this.handleWindowMouseUp, true);
    window.addEventListener('blur', this.handleWindowMouseUp);
    this.selectVideoBlockFromPointerHold('mouse-down');
  }
  private handlePointerMove(event: MouseEvent) {
    const state = this.mouseDownState;
    if (!state || state.selected) return;
    if ((event.buttons & 1) === 0) {
      this.clearMouseDownState();
      return;
    }
    const dx = Math.abs(event.clientX - state.x);
    const dy = Math.abs(event.clientY - state.y);
    if (dx < 4 && dy < 4) return;
    this.selectVideoBlockFromPointerHold('move-threshold');
  }
  private selectVideoBlockFromPointerHold(_reason: 'mouse-down' | 'hold-timeout' | 'move-threshold' = 'hold-timeout') {
    const state = this.mouseDownState;
    if (!state || state.selected) return;
    const pos = this.getPos();
    if (typeof pos !== 'number') {
      return;
    }
    state.selected = true;
    selectVideoBlock(this.view, this.node, pos);
    this.view.focus();
  }
  private hideSelectionShield() {
    if (!this.selectionShield) return;
    this.selectionShield.remove();
    this.selectionShield = null;
  }
  private clearMouseDownState() {
    if (this.mouseDownState) {
      window.clearTimeout(this.mouseDownState.timeout);
      this.mouseDownState = null;
    }
    this.hideSelectionShield();
    window.removeEventListener('mousemove', this.handleWindowMouseMove, true);
    window.removeEventListener('mouseup', this.handleWindowMouseUp, true);
    window.removeEventListener('blur', this.handleWindowMouseUp);
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    if (JSON.stringify(node.attrs) === JSON.stringify(this.node.attrs)) {
      this.node = node;
      return true;
    }
    this.node = node;
    this.dom.removeEventListener('dblclick', this.handleDoubleClick);
    this.dom.removeEventListener('mousedown', this.handleMouseDown, true);
    const nextDom = createVideoDom(node.attrs as VideoAttrs);
    this.dom.replaceWith(nextDom);
    this.dom = nextDom;
    this.dom.addEventListener('dblclick', this.handleDoubleClick);
    this.dom.addEventListener('mousedown', this.handleMouseDown, true);
    this.selectionShield = null;
    return true;
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode');
    this.hideSelectionShield();
  }

  stopEvent(event: Event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return false;
    return shouldStopVideoNodeEvent({
      event,
      target,
      view: this.view,
      shieldVisible: Boolean(this.selectionShield),
    });
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.clearMouseDownState();
    this.dom.removeEventListener('dblclick', this.handleDoubleClick);
    this.dom.removeEventListener('mousedown', this.handleMouseDown, true);
    this.unsubscribeLanguagePreference();
    window.removeEventListener('languagechange', this.handleLanguageChange);
    parkVideoDom(this.node.attrs as VideoAttrs, this.dom);
  }
}
