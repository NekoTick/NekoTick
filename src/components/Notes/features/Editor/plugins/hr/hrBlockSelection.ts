import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  blankAreaDragBoxPluginKey,
  CLEAR_BLOCKS_ACTION,
} from '../cursor/blockSelectionPluginState';

export function resolveHorizontalRuleNodePos(view: EditorView, target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;

  const hrType = view.state.schema.nodes.hr;
  if (!hrType) return null;

  const wrapper = target.closest('.md-hr') as HTMLElement | null;
  const directHr = target.closest('hr') as HTMLElement | null;
  const wrappedHr = wrapper?.querySelector('hr') ?? null;
  const candidates = [directHr, wrappedHr, wrapper].filter(
    (candidate, index, list): candidate is HTMLElement =>
      candidate instanceof HTMLElement && list.indexOf(candidate) === index
  );

  for (const candidate of candidates) {
    if (!view.dom.contains(candidate)) continue;

    try {
      const pos = view.posAtDOM(candidate, 0);
      if (view.state.doc.nodeAt(pos)?.type === hrType) {
        return pos;
      }
    } catch {
      // Fall through to the DOM-to-node scan below.
    }
  }

  let foundPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (foundPos !== null || node.type !== hrType) return false;
    const nodeDOM = view.nodeDOM(pos);
    if (!(nodeDOM instanceof HTMLElement)) return true;
    if (
      candidates.includes(nodeDOM)
      || candidates.some((candidate) => nodeDOM.contains(candidate) || candidate.contains(nodeDOM))
    ) {
      foundPos = pos;
      return false;
    }
    return true;
  });

  return foundPos;
}

export function focusHorizontalRuleSource(
  view: EditorView,
  hrPos: number,
  edge: 'end' | 'start' = 'end',
): boolean {
  const hrNode = view.state.doc.nodeAt(hrPos);
  if (!hrNode || hrNode.type !== view.state.schema.nodes.hr || !hrNode.isTextblock) return false;

  const offset = edge === 'end' ? hrNode.content.size : 0;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, hrPos + 1 + offset))
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      .scrollIntoView(),
  );
  view.focus();
  return true;
}
