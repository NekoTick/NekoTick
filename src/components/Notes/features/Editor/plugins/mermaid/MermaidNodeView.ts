import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { attachPreviewContextMenu, type PreviewContextMenuSession } from '../shared/previewContextMenu';
import {
  createMermaidElement,
  cancelMermaidElementRender,
  disposeMermaidElement,
  getMermaidElementCode,
  renderMermaidEditorLivePreview,
  updateMermaidElementCode,
} from './mermaidDom';
import { normalizeMermaidEditorCodeInput } from './mermaidFenceCode';

export function shouldRefreshMermaidElementCode(element: HTMLElement, code: string) {
  return getMermaidElementCode(element) !== normalizeMermaidEditorCodeInput(code);
}

function getMermaidNodeCode(node: Node): string {
  return typeof node.attrs.code === 'string' ? node.attrs.code : '';
}

function shouldPreloadMermaidBackground(view: EditorView): boolean {
  return !view.dom?.closest('[data-note-lazy-block-visibility="true"]');
}

export class MermaidNodeView implements NodeView {
  dom: HTMLElement;
  private node: Node;
  private contextMenu: PreviewContextMenuSession;
  private previewTimer: number | null = null;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    const code = getMermaidNodeCode(node);
    this.dom = createMermaidElement(code, {
      preloadBackground: shouldPreloadMermaidBackground(view),
      render: typeof view.hasFocus === 'function' ? !view.hasFocus() : undefined,
    });
    this.contextMenu = attachPreviewContextMenu({
      element: this.dom,
      fileBaseName: 'mermaid-diagram',
      getPos,
      node,
      view,
    });
    if (typeof view.hasFocus === 'function' && view.hasFocus() && code.trim()) {
      this.schedulePreview(code);
    }
  }

  private schedulePreview(code: string) {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
    }
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      void renderMermaidEditorLivePreview({
        anchor: this.dom,
        code,
      }).catch(() => undefined);
    }, themeUiFeedbackTokens.editorTextEditorLivePreviewDebounceMs);
  }

  update(node: Node) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.contextMenu.updateNode(node);
    const code = getMermaidNodeCode(node);
    if (shouldRefreshMermaidElementCode(this.dom, code)) {
      cancelMermaidElementRender(this.dom);
      updateMermaidElementCode(this.dom, code);
      this.schedulePreview(code);
    }

    return true;
  }

  ignoreMutation() {
    return true;
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode', 'md-focus');
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode', 'md-focus');
  }

  destroy() {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    disposeMermaidElement(this.dom);
    this.contextMenu.destroy();
  }
}
