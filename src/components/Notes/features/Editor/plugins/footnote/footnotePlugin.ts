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
import {
  FOOTNOTE_TOOLTIP_POSITIONED_CLASS,
  installFootnoteTooltipPositioning,
  resolveFootnoteRef,
  syncFootnoteTooltipPosition,
} from './footnoteTooltipPosition';
import type { FootnoteDefAttrs, FootnoteRefAttrs } from './types';

export const footnoteInteractionPluginKey = new PluginKey('footnoteInteraction');
export {
  handleEmptyFootnoteDefinitionDelete,
  handleFootnoteArrowNavigation,
  handleFootnoteModEnterExit, hasNonBlankFootnoteRefInputPrefix, MAX_FOOTNOTE_PREVIEW_SOURCE_TEXT_CHARS, MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS, readBoundedFootnotePreviewSource,
  FOOTNOTE_TOOLTIP_POSITIONED_CLASS, resolveFootnoteRef, syncFootnoteReferencePreviews, syncFootnoteTooltipPosition,
  transactionTouchesFootnoteContext
};

interface FootnoteInteractionPluginState {
  hasFootnotes: boolean;
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
      const editorDom = view.dom;
      const tooltipPositioning = installFootnoteTooltipPositioning(editorDom);

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
          tooltipPositioning.prune();
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
          tooltipPositioning.destroy();
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
