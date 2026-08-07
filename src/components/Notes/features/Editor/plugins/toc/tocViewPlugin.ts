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
import { collectTocBlocks, countTocNodes, stepSliceContainsToc } from './tocScan';

type TocViewState = {
  hasToc: boolean;
  tocCount: number;
};

const tocViewPluginKey = new PluginKey<TocViewState>('tocView');

function transactionMayInsertToc(tr: unknown): boolean {
  const steps = (tr as { steps?: readonly unknown[] }).steps ?? [];
  return steps.some(stepSliceContainsToc);
}

export function shouldRenderTocContentUpdate(input: {
  force: boolean;
  headingSignature: string;
  lastHeadingSignature: string;
  lastTocCount: number;
  tocCount: number;
}): boolean {
  return input.force
    || input.lastHeadingSignature !== input.headingSignature
    || input.lastTocCount !== input.tocCount;
}

export const tocViewPlugin = $prose(() => {
  let lastDoc: object | null = null;
  let lastHeadingSignature = '';
  let lastTocCount = -1;

  return new Plugin({
    key: tocViewPluginKey,
    state: {
      init(_config, state) {
        const tocCount = countTocNodes(state.doc);
        return { hasToc: tocCount > 0, tocCount };
      },
      apply(tr, previous) {
        if (!tr.docChanged) {
          return previous;
        }
        if (!previous.hasToc && !transactionMayInsertToc(tr)) {
          return previous;
        }
        const tocCount = countTocNodes(tr.doc);
        return { hasToc: tocCount > 0, tocCount };
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
        const safePos = Math.max(0, Math.min(headingPos + heading.nodeSize - 1, doc.content.size));
        const tr = editorView.state.tr
          .setSelection(TextSelection.create(doc, safePos))
          .scrollIntoView();
        editorView.dispatch(tr);
        const headingDom = editorView.nodeDOM(headingPos);
        if (headingDom instanceof HTMLElement) {
          headingDom.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        editorView.focus();
      };

      editorView.dom.addEventListener('click', handleTocClick);

      const syncTocBlocks = (view: EditorView, force = false) => {
        const tocState = tocViewPluginKey.getState(view.state);
        if (!tocState?.hasToc) {
          lastDoc = view.state.doc;
          lastHeadingSignature = '';
          lastTocCount = 0;
          return;
        }

        const { doc } = view.state;
        if (!force && lastDoc === doc) {
          return;
        }
        const headings = extractHeadings(doc, 6);
        const headingSignature = createHeadingsSignature(headings);
        if (!shouldRenderTocContentUpdate({
          force,
          headingSignature,
          lastHeadingSignature,
          lastTocCount,
          tocCount: tocState.tocCount,
        })) {
          lastDoc = doc;
          return;
        }

        const tocElements = collectTocBlocks(view.dom);
        if (tocElements.length === 0) {
          lastDoc = doc;
          lastHeadingSignature = '';
          lastTocCount = 0;
          return;
        }

        lastDoc = doc;
        lastHeadingSignature = headingSignature;
        lastTocCount = tocState.tocCount;

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
