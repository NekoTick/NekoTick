import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { useUIStore } from '@/stores/uiSlice';
import {
  createHeadingsSignature,
  extractHeadings,
  normalizeTocMaxLevel,
  renderTocContent,
} from './tocViewUtils';
import { collectTocBlocks, docHasTocNode, stepSliceContainsToc } from './tocScan';

const tocViewPluginKey = new PluginKey<{ hasToc: boolean }>('tocView');

function transactionMayInsertToc(tr: unknown): boolean {
  const steps = (tr as { steps?: readonly unknown[] }).steps ?? [];
  return steps.some(stepSliceContainsToc);
}

export const tocViewPlugin = $prose(() => {
  let lastDoc: object | null = null;
  let lastHeadingSignature = '';
  let lastTocCount = -1;

  return new Plugin({
    key: tocViewPluginKey,
    state: {
      init(_config, state) {
        return { hasToc: docHasTocNode(state.doc) };
      },
      apply(tr, previous) {
        if (!tr.docChanged) {
          return previous;
        }
        if (!previous.hasToc && !transactionMayInsertToc(tr)) {
          return previous;
        }
        return { hasToc: docHasTocNode(tr.doc) };
      },
    },
    view(editorView) {
      const handleTocClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const link = target.closest('.toc-link[data-heading-pos]') as HTMLElement | null;
        if (!link || !editorView.dom.contains(link)) return;

        event.preventDefault();
        event.stopPropagation();

        const headingPos = Number(link.dataset.headingPos);
        if (!Number.isFinite(headingPos)) return;

        const { doc } = editorView.state;
        const heading = doc.nodeAt(headingPos);
        if (!heading || heading.type.name !== 'heading' || !heading.inlineContent) return;
        const safePos = Math.max(0, Math.min(headingPos + 1, doc.content.size));
        const tr = editorView.state.tr
          .setSelection(TextSelection.create(doc, safePos))
          .scrollIntoView();
        editorView.dispatch(tr);
        editorView.focus();
      };

      editorView.dom.addEventListener('click', handleTocClick);

      const syncTocBlocks = (view: EditorView, force = false) => {
        if (!tocViewPluginKey.getState(view.state)?.hasToc) {
          lastDoc = view.state.doc;
          lastHeadingSignature = '';
          lastTocCount = 0;
          return;
        }

        const { doc } = view.state;
        if (!force && lastDoc === doc) {
          return;
        }
        const tocElements = collectTocBlocks(view.dom);
        if (tocElements.length === 0) {
          lastDoc = doc;
          lastHeadingSignature = '';
          lastTocCount = 0;
          return;
        }

        const headings = extractHeadings(doc, 6);
        const headingSignature = createHeadingsSignature(headings);
        if (
          !force &&
          lastDoc === doc
          && lastHeadingSignature === headingSignature
          && lastTocCount === tocElements.length
        ) {
          return;
        }

        lastDoc = doc;
        lastHeadingSignature = headingSignature;
        lastTocCount = tocElements.length;

        for (const el of tocElements) {
          const maxLevel = normalizeTocMaxLevel(el.getAttribute('data-max-level') || '6');
          const contentEl = el.querySelector<HTMLElement>('.toc-content');
          if (!contentEl) continue;
          renderTocContent(contentEl, headings, maxLevel);
        }
      };

      syncTocBlocks(editorView);
      const refreshLocalizedToc = () => syncTocBlocks(editorView, true);
      const unsubscribeLanguagePreference = useUIStore.subscribe((state, previousState) => {
        if (state.languagePreference !== previousState.languagePreference) {
          refreshLocalizedToc();
        }
      });
      const ownerWindow = editorView.dom.ownerDocument.defaultView;
      ownerWindow?.addEventListener('languagechange', refreshLocalizedToc);

      return {
        update(view) {
          syncTocBlocks(view);
        },
        destroy() {
          editorView.dom.removeEventListener('click', handleTocClick);
          unsubscribeLanguagePreference();
          ownerWindow?.removeEventListener('languagechange', refreshLocalizedToc);
        },
      };
    },
  });
});
