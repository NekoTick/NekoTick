import { Plugin } from '@milkdown/kit/prose/state';
import { $mark, $prose, $remark } from '@milkdown/kit/utils';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { remarkWikiLinks, wikiLinkStringifyPlugin } from './wikiLinkMarkdown';
import { resolveWikiLinkNotePath } from './wikiLinkResolver';
import { wikiLinkExpansionPlugin } from './wikiLinkExpansionPlugin';
import { wikiLinkExpandedPointerPlugin } from './wikiLinkExpandedPointerPlugin';

export { wikiLinkExpansionPluginKey } from './wikiLinkExpansionPlugin';

export const remarkWikiLinkPlugin = $remark('remarkWikiLink', () => remarkWikiLinks);

export const wikiLinkMark = $mark('wiki_link', () => ({
  attrs: {
    target: { default: '' },
  },
  parseDOM: [{
    tag: '[data-wiki-link-target]',
    getAttrs: (dom) => ({
      target: (dom as HTMLElement).dataset.wikiLinkTarget ?? '',
    }),
  }],
  toDOM: (mark) => [
    'span',
    {
      class: 'internal-link wiki-link',
      'data-wiki-link-target': mark.attrs.target,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'wikiLink',
    runner: (state, node, markType) => {
      state.openMark(markType, { target: String(node.target ?? '') });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'wiki_link',
    runner: (state, mark) => {
      state.withMark(mark, 'wikiLink', undefined, { target: mark.attrs.target });
    },
  },
}));

export const wikiLinkSourceMark = $mark('wiki_link_source', () => ({
  parseDOM: [{ tag: '[data-wiki-link-source]' }],
  toDOM: () => ['span', { 'data-wiki-link-source': 'true' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'wikiLinkSource',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'wiki_link_source',
    runner: (state, mark) => {
      state.withMark(mark, 'wikiLinkSource');
    },
  },
}));

export const wikiLinkOpenPlugin = $prose(() => new Plugin({
  props: {
    handleDOMEvents: {
      mousedown(_view, event) {
        if (!(event instanceof MouseEvent) || event.button !== 0) return false;
        if (!(event.target instanceof Element)) return false;
        const link = event.target.closest('[data-wiki-link-target]') as HTMLElement | null;
        const target = link?.dataset.wikiLinkTarget;
        if (!target) return false;

        if (!event.metaKey && !event.ctrlKey) return false;

        const state = useNotesStore.getState();
        const notePath = resolveWikiLinkNotePath(
          target,
          state.rootFolder?.children ?? [],
          state.currentNote?.path,
        );
        if (!notePath) return false;

        event.preventDefault();
        void state.openNote(notePath);
        return true;
      },
    },
  },
}));

export const wikiLinkPlugin = [
  remarkWikiLinkPlugin,
  wikiLinkStringifyPlugin,
  wikiLinkMark,
  wikiLinkSourceMark,
  wikiLinkExpansionPlugin,
  wikiLinkExpandedPointerPlugin,
  wikiLinkOpenPlugin,
];
