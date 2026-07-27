import { InputRule } from '@milkdown/prose/inputrules'
import { NodeSelection, Selection } from '@milkdown/prose/state'
import { $command, $inputRule, $nodeAttr, $nodeSchema } from '@milkdown/utils'

import { withMeta } from '../__internal__'
import { paragraphSchema } from './paragraph'

/// HTML attributes for the hr node.
export const hrAttr = $nodeAttr('hr')

withMeta(hrAttr, {
  displayName: 'Attr<hr>',
  group: 'Hr',
})

/// Hr node schema.
export const hrSchema = $nodeSchema('hr', (ctx) => ({
  group: 'block',
  parseDOM: [{ tag: 'hr' }],
  toDOM: (node) => ['hr', ctx.get(hrAttr.key)(node)],
  parseMarkdown: {
    match: ({ type }) => type === 'thematicBreak',
    runner: (state, _, type) => {
      state.addNode(type)
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

/// Input rule to insert a hr.
/// For example, `---` will be converted to a hr.
export const insertHrInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /^(?:-{3,}|－{3,}|_{3,}|＿{3,}|\*{3,}|＊{3,})\s$/,
      (state, match, start, end) => {
      const { tr } = state

      if (match[0]) tr.replaceWith(start - 1, end, hrSchema.type(ctx).create())

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
    const node = hrSchema.type(ctx).create()
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
