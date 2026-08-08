import {
  Plugin,
  PluginKey,
} from '@milkdown/kit/prose/state';
import { $node, $prose } from '@milkdown/kit/utils';
import {
  footnoteRefInputRule,
  handleFootnoteDefinitionShortcutEnter,
  handleFootnoteReferenceTextInput,
  hasNonBlankFootnoteRefInputPrefix,
  MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS,
} from './footnoteInputRule';
import {
  handleEmptyFootnoteDefinitionDelete,
  handleFootnoteArrowNavigation,
  handleFootnoteModEnterExit,
} from './footnoteInteractionHandlers';
import { normalizeFootnoteLabel } from './footnoteLabels';
import {
  MAX_FOOTNOTE_PREVIEW_SOURCE_TEXT_CHARS,
  readBoundedFootnotePreviewSource,
  syncFootnoteReferencePreviews,
} from './footnotePreviewSync';
import {
  collectFootnoteElements,
  docHasFootnoteNodes,
  isFootnoteDefinitionElement,
} from './footnoteScan';
import {
  transactionMayInsertFootnote,
  transactionTouchesFootnoteContext,
} from './footnoteTransactionContext';
import type { FootnoteDefAttrs, FootnoteRefAttrs } from './types';

export const footnoteInteractionPluginKey = new PluginKey('footnoteInteraction');
export {
  handleEmptyFootnoteDefinitionDelete,
  handleFootnoteArrowNavigation,
  handleFootnoteModEnterExit, hasNonBlankFootnoteRefInputPrefix, MAX_FOOTNOTE_PREVIEW_SOURCE_TEXT_CHARS, MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS, readBoundedFootnotePreviewSource,
  syncFootnoteReferencePreviews,
  transactionTouchesFootnoteContext
};

interface FootnoteInteractionPluginState {
  hasFootnotes: boolean;
}

export const FOOTNOTE_TOOLTIP_POSITIONED_CLASS = 'editor-footnote-tooltip-positioned';
const FOOTNOTE_TOOLTIP_LEFT_STYLE = '--vlaina-footnote-tooltip-left';
const FOOTNOTE_TOOLTIP_TOP_STYLE = '--vlaina-footnote-tooltip-top';

export function syncFootnoteTooltipPosition(ref: HTMLElement): void {
  const rect = ref.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return;

  ref.style.setProperty(FOOTNOTE_TOOLTIP_LEFT_STYLE, `${rect.left + rect.width / 2}px`);
  ref.style.setProperty(FOOTNOTE_TOOLTIP_TOP_STYLE, `${rect.top}px`);
  ref.classList.add(FOOTNOTE_TOOLTIP_POSITIONED_CLASS);
}

function resolveFootnoteRef(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const ref = target.closest('.footnote-ref[data-id], .footnote-ref[data-label]');
  return ref instanceof HTMLElement ? ref : null;
}

function findFootnoteDefinition(editorDom: HTMLElement, id: string): HTMLElement | null {
  id = normalizeFootnoteLabel(id);
  if (!id) return null;

  return collectFootnoteElements(
    editorDom,
    (definition) => isFootnoteDefinitionElement(definition)
      && (
        normalizeFootnoteLabel(definition.dataset.id) === id
        || normalizeFootnoteLabel(definition.dataset.label) === id
      ),
    1
  )[0] ?? null;
}

export const footnoteInteractionPlugin = $prose(() => {
  return new Plugin<FootnoteInteractionPluginState>({
    key: footnoteInteractionPluginKey,
    state: {
      init(_config, state) {
        return { hasFootnotes: docHasFootnoteNodes(state.doc) };
      },
      apply(tr, previous, oldState) {
        if (!tr.docChanged) {
          return previous;
        }
        if (
          !transactionMayInsertFootnote(tr)
          && !transactionTouchesFootnoteContext(oldState.doc, tr.doc, tr)
        ) {
          return previous;
        }
        return { hasFootnotes: docHasFootnoteNodes(tr.doc) };
      },
    },
    view(view) {
      let activeRef: HTMLElement | null = null;
      const editorDom = view.dom;
      const ownerWindow = editorDom.ownerDocument.defaultView;
      const syncActiveRef = () => {
        if (activeRef && editorDom.contains(activeRef)) {
          syncFootnoteTooltipPosition(activeRef);
        }
      };
      const handlePointerOver = (event: Event) => {
        activeRef = resolveFootnoteRef(event.target);
        if (activeRef) syncFootnoteTooltipPosition(activeRef);
      };
      const handleFocusIn = (event: Event) => {
        activeRef = resolveFootnoteRef(event.target);
        if (activeRef) syncFootnoteTooltipPosition(activeRef);
      };
      editorDom.addEventListener('mouseover', handlePointerOver);
      editorDom.addEventListener('focusin', handleFocusIn);
      editorDom.addEventListener('scroll', syncActiveRef, true);
      ownerWindow?.addEventListener('scroll', syncActiveRef, true);
      ownerWindow?.addEventListener('resize', syncActiveRef);

      let lastSyncedDoc: object | null = null;
      let lastSyncedState: FootnoteInteractionPluginState | null = null;
      const initialPluginState = footnoteInteractionPluginKey.getState(view.state) ?? null;
      if (initialPluginState?.hasFootnotes) {
        syncFootnoteReferencePreviews(view.dom);
        lastSyncedDoc = view.state.doc;
        lastSyncedState = initialPluginState;
      }
      return {
        update(nextView) {
          if (activeRef && !nextView.dom.contains(activeRef)) activeRef = null;
          const pluginState = footnoteInteractionPluginKey.getState(nextView.state) ?? null;
          if (!pluginState?.hasFootnotes) {
            lastSyncedDoc = null;
            lastSyncedState = pluginState;
            return;
          }
          if (lastSyncedDoc === nextView.state.doc || lastSyncedState === pluginState) {
            return;
          }
          syncFootnoteReferencePreviews(nextView.dom);
          lastSyncedDoc = nextView.state.doc;
          lastSyncedState = pluginState;
        },
        destroy() {
          editorDom.removeEventListener('mouseover', handlePointerOver);
          editorDom.removeEventListener('focusin', handleFocusIn);
          editorDom.removeEventListener('scroll', syncActiveRef, true);
          ownerWindow?.removeEventListener('scroll', syncActiveRef, true);
          ownerWindow?.removeEventListener('resize', syncActiveRef);
        },
      };
    },
    props: {
      handleTextInput(view, from, to, text) {
        return handleFootnoteReferenceTextInput(view, from, to, text);
      },
      handleKeyDown(view, event) {
        if (handleEmptyFootnoteDefinitionDelete(view, event)) {
          return true;
        }

        if (handleFootnoteArrowNavigation(view, event)) {
          return true;
        }

        if (
          event.key === 'Enter'
          && !event.ctrlKey
          && !event.metaKey
          && !event.altKey
          && !event.shiftKey
          && !event.isComposing
          && handleFootnoteDefinitionShortcutEnter(view)
        ) {
          event.preventDefault();
          return true;
        }

        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey || event.isComposing) {
          return false;
        }

        if (!handleFootnoteModEnterExit(view)) {
          return false;
        }

        event.preventDefault();
        return true;
      },
      handleDOMEvents: {
        click(view, event) {
          const ref = resolveFootnoteRef(event.target);
          if (!ref) return false;

          const id = ref.dataset.id || ref.dataset.label;
          if (!id) return false;

          const definition = findFootnoteDefinition(view.dom, id);
          if (!definition) return false;

          event.preventDefault();
          event.stopPropagation();
          definition.scrollIntoView({ block: 'center', behavior: 'auto' });
          return true;
        },
      },
    },
  });
});

export const footnoteRefSchema = $node('footnote_ref', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    id: { default: '' }
  },
  parseDOM: [{
    tag: 'sup.footnote-ref',
    getAttrs: (dom) => ({
      id: normalizeFootnoteLabel((dom as HTMLElement).dataset.id)
    })
  }],
  toDOM: (node) => {
    const attrs = node.attrs as FootnoteRefAttrs;
    const id = normalizeFootnoteLabel(attrs.id);
    const label = `[${id}]`;
    return [
      'sup',
      {
        class: 'footnote-ref md-footnote',
        'data-id': id,
        'data-footnote-value': label,
        'aria-label': `Footnote ${id}`,
        contenteditable: 'false'
      },
      ['span', { class: 'footnote-ref-label', contenteditable: 'false' }, label]
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'footnoteReference',
    runner: (state, node, type) => {
      const id = normalizeFootnoteLabel((node.identifier as string) || (node.label as string));
      if (!id) return;
      state.addNode(type, { id });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'footnote_ref',
    runner: (state, node) => {
      const id = normalizeFootnoteLabel(node.attrs.id);
      if (!id) return;
      state.addNode('text', undefined, `[^${id}]`);
    }
  }
}));

export const footnoteDefSchema = $node('footnote_def', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: {
    id: { default: '' }
  },
  parseDOM: [{
    tag: 'div.footnote-def',
    getAttrs: (dom) => ({
      id: normalizeFootnoteLabel((dom as HTMLElement).dataset.id)
    })
  }],
  toDOM: (node) => {
    const attrs = node.attrs as FootnoteDefAttrs;
    const id = normalizeFootnoteLabel(attrs.id);
    return [
      'div',
      {
        class: 'footnote-def footnote-line',
        'data-id': id,
        id: `fn-${id}`
      },
      ['span', { class: 'footnote-def-label', contenteditable: 'false' }, `[${id}]:`],
      ['div', { class: 'footnote-def-content' }, 0]
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'footnoteDefinition',
    runner: (state, node, type) => {
      const id = normalizeFootnoteLabel((node.identifier as string) || (node.label as string));
      if (!id) return;
      state.openNode(type, { id });
      state.next(node.children);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'footnote_def',
    runner: (state, node) => serializeFootnoteDefinitionToMarkdown(state, node)
  }
}));

export const footnotePlugin = [
  footnoteRefSchema,
  footnoteDefSchema,
  footnoteRefInputRule,
  footnoteInteractionPlugin
];

export function serializeFootnoteDefinitionToMarkdown(
  state: {
    openNode: (...args: any[]) => any;
    next: (...args: any[]) => any;
    closeNode: (...args: any[]) => any;
  },
  node: {
    attrs: { id?: string };
    content: unknown;
  }
): void {
  const id = normalizeFootnoteLabel(node.attrs.id);
  if (!id) return;

  state.openNode('footnoteDefinition', undefined, {
    label: id,
    identifier: id,
  });
  state.next(node.content);
  state.closeNode();
}
