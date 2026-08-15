import type { MarkType } from '@milkdown/prose/model'
import type { ParserState } from '@milkdown/transformer'

import { $markSchema } from '@milkdown/utils'

import { withMeta } from '../__internal__'

export type MarkdownSyntaxEdge = 'close' | 'open' | 'prefix'

export interface MarkdownSyntaxAttrs {
  edge: MarkdownSyntaxEdge
  kind: string
}

export function addMarkdownSyntax(
  state: ParserState,
  markType: MarkType,
  text: string,
  attrs: MarkdownSyntaxAttrs
) {
  if (!text) return

  state.openMark(markType, attrs)
  state.addText(text)
  state.closeMark(markType)
}

/// Source punctuation that remains addressable by ProseMirror while hidden in live preview.
export const markdownSyntaxSchema = $markSchema('markdownSyntax', () => ({
  priority: 0,
  inclusive: false,
  spanning: false,
  attrs: {
    edge: { default: 'prefix', validate: 'string' },
    kind: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[data-markdown-syntax]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false
        return {
          edge: dom.dataset.markdownSyntaxEdge || 'prefix',
          kind: dom.dataset.markdownSyntax || '',
        }
      },
    },
  ],
  toDOM: (mark) => [
    'span',
    {
      class: 'markdown-syntax',
      'data-markdown-syntax': mark.attrs.kind,
      'data-markdown-syntax-edge': mark.attrs.edge,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'markdownSyntax',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, markType, String(node.value ?? ''), {
        edge: (node.edge as MarkdownSyntaxEdge) || 'prefix',
        kind: String(node.kind ?? ''),
      })
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'markdownSyntax',
    runner: () => true,
  },
}))

withMeta(markdownSyntaxSchema.mark, {
  displayName: 'MarkSchema<markdownSyntax>',
  group: 'MarkdownSyntax',
})

withMeta(markdownSyntaxSchema.ctx, {
  displayName: 'MarkSchemaCtx<markdownSyntax>',
  group: 'MarkdownSyntax',
})
