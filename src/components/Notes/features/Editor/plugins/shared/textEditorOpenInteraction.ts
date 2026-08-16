import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { themeDomStyleTokens } from '@/styles/themeTokens';

export interface TextEditorOpenStateView {
  state: {
    doc: {
      resolve: (pos: number) => {
        depth: number;
        node: (depth: number) => ProseNode;
        before: (depth: number) => number;
      };
      nodeAt: (pos: number) => ProseNode | null;
    };
  };
}

export interface TextEditorOpenInteractionView extends TextEditorOpenStateView {
  dom: HTMLElement;
  posAtDOM: (node: Node, offset: number) => number;
  nodeDOM?: (pos: number) => Node | null;
}

export function resolveTextEditorNodeOpenState<TState>(args: {
  view: TextEditorOpenStateView;
  pos: number;
  resolveNode: (node: ProseNode, nodePos: number) => TState | null;
}): TState | null {
  const { view, pos, resolveNode } = args;
  const $pos = view.state.doc.resolve(pos);
  const directNode = view.state.doc.nodeAt(pos);
  const directState = directNode ? resolveNode(directNode, pos) : null;
  if (directState) return directState;

  for (let depth = $pos.depth; depth > 0; depth--) {
    const parentPos = $pos.before(depth);
    const parentState = resolveNode($pos.node(depth), parentPos);
    if (parentState) return parentState;
  }

  return null;
}

export function createTextEditorOpenInteraction<TState>(args: {
  nodeSelector: string;
  resolveOpenState: (args: {
    view: TextEditorOpenStateView;
    pos: number;
    getPosition: (nodePos: number) => { x: number; y: number };
  }) => TState | null;
}) {
  const resolveAnchorElement = (target: EventTarget | null, fallback: Node | null) => {
    const targetElement = target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
    const closestNodeElement = targetElement?.closest(args.nodeSelector);
    if (closestNodeElement instanceof HTMLElement) return closestNodeElement;
    if (fallback instanceof HTMLElement) return fallback;
    return targetElement instanceof HTMLElement ? targetElement : null;
  };

  const getAnchorViewportPosition = (anchorElement: HTMLElement | null) => {
    if (!anchorElement) {
      return {
        x: themeDomStyleTokens.editorPopupFallbackX,
        y: themeDomStyleTokens.editorPopupFallbackY,
      };
    }

    const rect = anchorElement.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.bottom + themeDomStyleTokens.editorPopupAnchorOffsetPx,
    };
  };

  const findTargetElement = (view: { dom: HTMLElement }, target: EventTarget | null) => {
    const targetElement = target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
    const nodeElement = targetElement?.closest(args.nodeSelector);
    return nodeElement instanceof HTMLElement && view.dom.contains(nodeElement)
      ? nodeElement
      : null;
  };

  const resolveOpenMeta = (openArgs: {
    view: TextEditorOpenInteractionView;
    pos: number;
    target: EventTarget | null;
  }) => args.resolveOpenState({
    view: openArgs.view,
    pos: openArgs.pos,
    getPosition(nodePos) {
      const fallback = openArgs.view.nodeDOM?.(nodePos) ?? null;
      return getAnchorViewportPosition(resolveAnchorElement(openArgs.target, fallback));
    },
  });

  const resolvePointerOpen = (openArgs: {
    view: TextEditorOpenInteractionView;
    target: EventTarget | null;
  }) => {
    const targetElement = findTargetElement(openArgs.view, openArgs.target);
    if (!targetElement) return null;

    try {
      const meta = resolveOpenMeta({
        ...openArgs,
        pos: openArgs.view.posAtDOM(targetElement, 0),
      });
      return meta ? { targetElement, meta } : null;
    } catch {
      return null;
    }
  };

  return {
    findTargetElement,
    getAnchorViewportPosition,
    resolveAnchorElement,
    resolveOpenMeta,
    resolvePointerOpen,
  };
}
