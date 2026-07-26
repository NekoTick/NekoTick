import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { resolveEditorTextPositionAtPointer } from '../../shared/pointerTextPosition';
import { wikiLinkExpansionPluginKey } from './wikiLinkExpansionPlugin';
import { wikiLinkPointerSessionPluginKey } from './wikiLinkInteraction';

type PointerSession = {
  anchor: number;
  doc: EditorView['state']['doc'];
  moved: boolean;
  selecting: boolean;
  startX: number;
  startY: number;
};

function isPlainPrimaryMouseDown(event: MouseEvent): boolean {
  return event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey;
}

function isInsideExpandedRange(position: number, range: { from: number; to: number }): boolean {
  return position >= range.from && position <= range.to;
}

function resolvePointerPosition(view: EditorView, event: MouseEvent): number | null {
  return resolveEditorTextPositionAtPointer(view, event.clientX, event.clientY);
}

export const wikiLinkExpandedPointerPlugin = $prose(() => new Plugin<boolean>({
  key: wikiLinkPointerSessionPluginKey,
  state: {
    init: () => false,
    apply: (transaction, active) => (
      transaction.getMeta(wikiLinkPointerSessionPluginKey) as boolean | undefined
    ) ?? active,
  },
  view: (view) => {
    let session: PointerSession | null = null;
    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;

    const setSessionActive = (active: boolean, selection?: { anchor: number; head: number }) => {
      let transaction = view.state.tr
        .setMeta(wikiLinkPointerSessionPluginKey, active)
        .setMeta('addToHistory', false);
      if (selection) {
        transaction = transaction.setSelection(
          TextSelection.create(view.state.doc, selection.anchor, selection.head),
        );
      }
      view.dispatch(transaction.scrollIntoView());
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (!isPlainPrimaryMouseDown(event)) return;
      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      const anchor = expanded ? resolvePointerPosition(view, event) : null;
      if (!expanded || anchor === null || isInsideExpandedRange(anchor, expanded)) return;

      session = {
        anchor,
        doc: view.state.doc,
        moved: false,
        selecting: false,
        startX: event.clientX,
        startY: event.clientY,
      };
      setSessionActive(true);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!session || session.doc !== view.state.doc || (event.buttons & 1) === 0) return;
      if (!session.moved) {
        session.moved = Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        ) > 4;
      }
      if (!session.moved) return;

      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      const head = expanded ? resolvePointerPosition(view, event) : null;
      if (!expanded || head === null) return;
      if (
        !session.selecting &&
        !isInsideExpandedRange(session.anchor, expanded) &&
        !isInsideExpandedRange(head, expanded)
      ) {
        return;
      }

      session.selecting = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSessionActive(true, { anchor: session.anchor, head });
    };

    const finishSession = (event?: MouseEvent) => {
      if (!session) return;
      const current = session;
      session = null;
      const head = event && current.selecting && current.doc === view.state.doc
        ? resolvePointerPosition(view, event)
        : null;
      if (event && current.selecting) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      setSessionActive(false, head === null ? undefined : { anchor: current.anchor, head });
    };

    const handleBlur = () => finishSession();

    view.dom.addEventListener('mousedown', handleMouseDown, true);
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', finishSession, true);
    ownerWindow?.addEventListener('blur', handleBlur);

    return {
      destroy: () => {
        view.dom.removeEventListener('mousedown', handleMouseDown, true);
        ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
        ownerDocument.removeEventListener('mouseup', finishSession, true);
        ownerWindow?.removeEventListener('blur', handleBlur);
      },
    };
  },
}));
