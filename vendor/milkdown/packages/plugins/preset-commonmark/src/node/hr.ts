import { InputRule } from '@milkdown/prose/inputrules'
import { NodeSelection, Selection } from '@milkdown/prose/state'
import { $command, $inputRule, $nodeAttr, $nodeSchema } from '@milkdown/utils'

import { withMeta } from '../__internal__'
import { addMarkdownSyntax, markdownSyntaxSchema } from '../mark/markdown-syntax'
import { paragraphSchema } from './paragraph'

const HR_MARKDOWN_SOURCE = '---'

/// HTML attributes for the hr node.
export const hrAttr = $nodeAttr('hr')

withMeta(hrAttr, {
  displayName: 'Attr<hr>',
  group: 'Hr',
})

/// Hr node schema.
export const hrSchema = $nodeSchema('hr', (ctx) => ({
  content: 'text*',
  group: 'block',
  parseDOM: [
    { tag: 'div[data-type="hr"]', contentElement: '[data-hr-source]' },
    { tag: 'hr' },
  ],
  toDOM: (node) => [
    'div',
    { ...ctx.get(hrAttr.key)(node), 'data-type': 'hr' },
    ['span', { 'data-hr-source': 'true' }, 0],
    ['hr', { contenteditable: 'false' }],
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'thematicBreak',
    runner: (state, _, type) => {
      state.openNode(type)
      addMarkdownSyntax(
        state,
        markdownSyntaxSchema.type(ctx),
        HR_MARKDOWN_SOURCE,
        { edge: 'prefix', kind: 'hr' }
      )
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'hr',
    runner: (state) => {
      state.addNode('thematicBreak')
    },
  },
}))

withMeta(hrSchema.node, {
  displayName: 'NodeSchema<hr>',
  group: 'Hr',
})

withMeta(hrSchema.ctx, {
  displayName: 'NodeSchemaCtx<hr>',
  group: 'Hr',
})

function createHrNode(ctx: Parameters<typeof hrSchema.type>[0]) {
  const type = hrSchema.type(ctx)
  const syntax = markdownSyntaxSchema.type(ctx)
  return type.create(
    null,
    type.schema.text(HR_MARKDOWN_SOURCE, [
      syntax.create({ edge: 'prefix', kind: 'hr' }),
    ])
  )
}

/// Input rule to insert a hr.
/// For example, `---` will be converted to a hr.
export const insertHrInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /^(?:-{3,}|－{3,}|_{3,}|＿{3,}|\*{3,}|＊{3,})\s$/,
      (state, match, start, end) => {
      const { tr } = state

      if (match[0]) tr.replaceWith(start - 1, end, createHrNode(ctx))

      return tr
      }
    )
)

withMeta(insertHrInputRule, {
  displayName: 'InputRule<insertHrInputRule>',
  group: 'Hr',
})

/// Command to insert a hr.
export const insertHrCommand = $command(
  'InsertHr',
  (ctx) => () => (state, dispatch) => {
    if (!dispatch) return true

    const { tr, selection } = state
    const { from } = selection
    const node = createHrNode(ctx)
    if (!node) return true

    const _tr = tr.replaceSelectionWith(node)
    const nodePos = _tr.mapping.map(from, -1)
    const afterNodePos = nodePos + node.nodeSize
    let nextNode = _tr.doc.nodeAt(afterNodePos)
    if (!nextNode) {
      _tr.insert(afterNodePos, paragraphSchema.node.type(ctx).create())
      nextNode = _tr.doc.nodeAt(afterNodePos)
    }

    const sel = nextNode?.type.name === 'paragraph'
      ? Selection.findFrom(_tr.doc.resolve(afterNodePos), 1, true)
      : NodeSelection.create(_tr.doc, nodePos)
    if (!sel) return true

    dispatch(_tr.setSelection(sel).scrollIntoView())
    return true
  }
)

withMeta(insertHrCommand, {
  displayName: 'Command<insertHrCommand>',
  group: 'Hr',
})
