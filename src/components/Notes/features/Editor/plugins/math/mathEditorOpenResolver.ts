import {
  resolveTextEditorNodeOpenState,
  type TextEditorOpenStateView,
} from '../shared/textEditorOpenInteraction';
import { createOpenMathEditorState } from './mathEditorState';
import type { MathEditorState } from './types';

export function resolveMathEditorOpenState(args: {
  view: TextEditorOpenStateView;
  pos: number;
  getPosition: (nodePos: number) => { x: number; y: number };
}): MathEditorState | null {
  const { view, pos, getPosition } = args;
  return resolveTextEditorNodeOpenState({
    view,
    pos,
    resolveNode(node, nodePos) {
      const displayMode = node.type.name === 'math_block'
        ? true
        : node.type.name === 'math_inline'
          ? false
          : null;
      if (displayMode === null) return null;

      return createOpenMathEditorState({
        latex: node.attrs.latex || '',
        displayMode,
        position: getPosition(nodePos),
        nodePos,
        openSource: 'existing-node',
      });
    },
  });
}
