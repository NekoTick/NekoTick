import {
  resolveTextEditorNodeOpenState,
  type TextEditorOpenStateView,
} from '../shared/textEditorOpenInteraction';
import { createOpenMermaidEditorState } from './mermaidEditorState';
import type { MermaidEditorState } from './types';

export function resolveMermaidEditorOpenState(args: {
  view: TextEditorOpenStateView;
  pos: number;
  getPosition: (nodePos: number) => { x: number; y: number };
}): MermaidEditorState | null {
  const { view, pos, getPosition } = args;
  return resolveTextEditorNodeOpenState({
    view,
    pos,
    resolveNode(node, nodePos) {
      if (node.type.name !== 'mermaid') return null;
      return createOpenMermaidEditorState({
        code: node.attrs.code || '',
        position: getPosition(nodePos),
        nodePos,
        openSource: 'existing-node',
      });
    },
  });
}
