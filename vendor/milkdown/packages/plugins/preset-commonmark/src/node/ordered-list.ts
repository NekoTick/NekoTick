import { commandsCtx } from '@milkdown/core'
import { expectDomTypeError } from '@milkdown/exception'
import { wrapIn } from '@milkdown/prose/commands'
import { wrappingInputRule } from '@milkdown/prose/inputrules'
import {
  $command,
  $inputRule,
  $nodeAttr,
  $nodeSchema,
  $useKeymap,
} from '@milkdown/utils'

import { withMeta } from '../__internal__'

/// HTML attributes for ordered list node.
export const orderedListAttr = $nodeAttr('orderedList')

withMeta(orderedListAttr, {
  displayName: 'Attr<orderedList>',
  group: 'OrderedList',
})

/// Schema for ordered list node.
export const orderedListSchema = $nodeSchema('ordered_list', (ctx) => ({
  content: 'listItem+',
  group: 'block',
  attrs: {
    order: {
      default: 1,
      validate: 'number',
    },
    spread: {
      default: false,
      validate: 'boolean',
    },
  },
  parseDOM: [
    {
      tag: 'ol',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom)

        return {
          spread: dom.dataset.spread === 'true',
          order: dom.hasAttribute('start')
            ? Number(dom.getAttribute('start'))
            : 1,
        }
      },
    },
  ],
  toDOM: (node) => [
    'ol',
    {
      ...ctx.get(orderedListAttr.key)(node),
      ...(node.attrs.order === 1 ? {} : { start: node.attrs.order }),
      'data-spread': node.attrs.spread,
    },
    0,
  ],
  parseMarkdown: {
    match: ({ type, ordered }) => type === 'list' && !!ordered,
    runner: (state, node, type) => {
      state
        .openNode(type, {
          order: node.start ?? 1,
          spread: node.spread ?? true,
        })
        .next(node.children)
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'ordered_list',
    runner: (state, node) => {
      state.openNode('list', undefined, {
        ordered: true,
        start: node.attrs.order,
        spread: node.attrs.spread,
      })
      state.next(node.content)
      state.closeNode()
    },
  },
}))

withMeta(orderedListSchema.node, {
  displayName: 'NodeSchema<orderedList>',
  group: 'OrderedList',
})

withMeta(orderedListSchema.ctx, {
  displayName: 'NodeSchemaCtx<orderedList>',
  group: 'OrderedList',
})

const normalizeOrderedListMarker = (value: string) =>
  value.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  )

/// Input rule for wrapping a block in ordered list node.
export const wrapInOrderedListInputRule = $inputRule((ctx) =>
  wrappingInputRule(
    /^\s*([0-9０-９]{1,9})[.．]\s$/,
    orderedListSchema.type(ctx),
    (match) => ({ order: Number(normalizeOrderedListMarker(match[1])) }),
    (match, node) =>
      node.childCount + node.attrs.order ===
      Number(normalizeOrderedListMarker(match[1]))
  )
)

withMeta(wrapInOrderedListInputRule, {
  displayName: 'InputRule<wrapInOrderedListInputRule>',
  group: 'OrderedList',
})

/// Command for wrapping a block in ordered list node.
export const wrapInOrderedListCommand = $command(
  'WrapInOrderedList',
  (ctx) => () => wrapIn(orderedListSchema.type(ctx))
)

withMeta(wrapInOrderedListCommand, {
  displayName: 'Command<wrapInOrderedListCommand>',
  group: 'OrderedList',
})

/// Keymap for ordered list node.
/// - `Mod-Alt-7`: Wrap a block in ordered list.
export const orderedListKeymap = $useKeymap('orderedListKeymap', {
  WrapInOrderedList: {
    shortcuts: 'Mod-Alt-7',
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(wrapInOrderedListCommand.key)
    },
  },
})

withMeta(orderedListKeymap.ctx, {
  displayName: 'KeymapCtx<orderedList>',
  group: 'OrderedList',
})

withMeta(orderedListKeymap.shortcuts, {
  displayName: 'Keymap<orderedList>',
  group: 'OrderedList',
})
