import { $node, $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import type { MermaidAttrs } from './types';
import { isMermaidFenceLanguage } from './mermaidLanguage';
import { normalizeMermaidFenceCode } from './mermaidFenceCode';
import { mermaidEnterPlugin } from './mermaidEnterPlugin';
import { createMermaidElement, getMermaidElementCode } from './mermaidDom';
import { MermaidNodeView } from './MermaidNodeView';

function normalizeMermaidCodeAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const mermaidSchema = $node('mermaid', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  marks: '',
  attrs: {
    code: { default: '' }
  },
  parseDOM: [{
    tag: 'div[data-type="mermaid"]',
    getAttrs: (dom) => ({
      code: getMermaidElementCode(dom as HTMLElement)
    })
  }],
  toDOM: (node) => {
    const attrs = node.attrs as MermaidAttrs;
    return createMermaidElement(normalizeMermaidCodeAttr(attrs.code), { render: false });
  },
  parseMarkdown: {
    match: (node) => {
      return node.type === 'code' && isMermaidFenceLanguage(node.lang as string | null | undefined);
    },
    runner: (state, node, type) => {
      const code = normalizeMermaidFenceCode(
        node.lang as string | null | undefined,
        normalizeMermaidCodeAttr(node.value)
      );
      state.addNode(type, { code });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'mermaid',
    runner: (state, node) => {
      state.addNode('code', undefined, normalizeMermaidCodeAttr(node.attrs.code), {
        lang: 'mermaid'
      });
    }
  }
}));

export const mermaidNodeViewPlugin = $prose(() => {
  return new Plugin({
    props: {
      nodeViews: {
        mermaid: (node, view, getPos) =>
          new MermaidNodeView(node, view, getPos as () => number | undefined),
      },
    },
  });
});

export const mermaidPlugin = [
  mermaidSchema,
  mermaidNodeViewPlugin,
  mermaidEnterPlugin,
];
