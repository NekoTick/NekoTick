import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { floatingToolbarKey } from '../../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../../floating-toolbar/types';
import {
  POINTER_NATIVE_SELECTION_META,
} from '../../selection/textSelectionOverlayState';
import { syncNativeSelectionToCaretTarget } from '../../selection/textSelectionOverlayCaret';
import { wikiLinkExpansionPluginKey } from './wikiLinkExpansionPlugin';
import { wikiLinkPointerSessionPluginKey } from './wikiLinkInteraction';
import {
  isInsideWikiLinkRange,
  resolveWikiLinkPointerPosition,
} from './wikiLinkPointerPosition';

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

function isShiftPrimaryMouseDown(event: MouseEvent): boolean {
  return event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.shiftKey;
}

function resolveDoubleClickRange(
  source: string,
  offset: number,
): { from: number; to: number } | null {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(source)];
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const segment = segments.find((candidate) => (
    candidate.isWordLike &&
    boundedOffset >= candidate.index &&
    boundedOffset <= candidate.index + candidate.segment.length
  )) ?? segments.find((candidate) => (
    boundedOffset >= candidate.index &&
    boundedOffset < candidate.index + candidate.segment.length
  ));
  return segment
    ? { from: segment.index, to: segment.index + segment.segment.length }
    : null;
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
        transaction = transaction
          .setSelection(TextSelection.create(view.state.doc, selection.anchor, selection.head))
          .setMeta(POINTER_NATIVE_SELECTION_META, false);
        if (selection.anchor === selection.head) {
          transaction = transaction.setMeta(floatingToolbarKey, {
            type: TOOLBAR_ACTIONS.HIDE,
          });
        }
      }
      view.dispatch(transaction.scrollIntoView());
      if (selection) {
        view.focus();
        if (selection.anchor === selection.head) {
          syncNativeSelectionToCaretTarget(view, {
            doc: view.state.doc,
            pos: selection.head,
          });
        }
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (isShiftPrimaryMouseDown(event)) {
        const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
        const position = expanded ? resolveWikiLinkPointerPosition(view, event, expanded) : null;
        if (!expanded || position === null || !isInsideWikiLinkRange(position, expanded)) return;
        session = null;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSessionActive(false, {
          anchor: view.state.selection.anchor,
          head: position,
        });
        return;
      }
      if (!isPlainPrimaryMouseDown(event)) return;
      const pluginState = wikiLinkExpansionPluginKey.getState(view.state);
      const expanded = pluginState?.expanded;
      const anchor = expanded ? resolveWikiLinkPointerPosition(view, event, expanded) : null;
      if (!expanded || anchor === null) return;

      if (event.detail === 2 && isInsideWikiLinkRange(anchor, expanded)) {
        const source = view.state.doc.textBetween(expanded.from, expanded.to, '');
        const range = resolveDoubleClickRange(source, anchor - expanded.from);
        if (!range) return;
        session = null;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSessionActive(false, {
          anchor: expanded.from + range.from,
          head: expanded.from + range.to,
        });
        return;
      }
      if (event.detail > 1) return;

      session = {
        anchor,
        doc: view.state.doc,
        moved: false,
        selecting: false,
        startX: event.clientX,
        startY: event.clientY,
      };
      if (isInsideWikiLinkRange(anchor, expanded)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSessionActive(true, { anchor, head: anchor });
        return;
      }
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
      const head = expanded ? resolveWikiLinkPointerPosition(view, event, expanded) : null;
      if (!expanded || head === null) return;
      if (
        !session.selecting &&
        !isInsideWikiLinkRange(session.anchor, expanded) &&
        !isInsideWikiLinkRange(head, expanded)
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
      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      const head = event && current.selecting && current.doc === view.state.doc
        && expanded
        ? resolveWikiLinkPointerPosition(view, event, expanded)
        : null;
      if (event && current.selecting) {
        event.preventDefault();
      }
      // ProseMirror and the selection overlay must receive mouseup to release their pointer sessions.
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
