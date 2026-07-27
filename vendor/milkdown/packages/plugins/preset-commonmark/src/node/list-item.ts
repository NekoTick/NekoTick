import type { Ctx } from '@milkdown/ctx'

import { commandsCtx } from '@milkdown/core'
import { expectDomTypeError } from '@milkdown/exception'
import { joinBackward } from '@milkdown/prose/commands'
import { Fragment, type Node as ProseNode, type ResolvedPos, Slice } from '@milkdown/prose/model'
import { canSplit } from '@milkdown/prose/transform'
import {
  liftListItem,
  sinkListItem,
} from '@milkdown/prose/schema-list'
import { type Command, Selection, TextSelection } from '@milkdown/prose/state'
import { $command, $nodeAttr, $nodeSchema, $useKeymap } from '@milkdown/utils'

import { withMeta } from '../__internal__'

export const MAX_SPLIT_LIST_ITEM_SELECTION_SCAN_NODES = 2_000
export const MAX_LIST_ITEM_LABEL_ATTR_CHARS = 64
export const MAX_LIST_ITEM_TYPE_ATTR_CHARS = 32

export function normalizeListItemStringAttr(value: unknown, fallback: string, maxChars: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars
    ? value
    : fallback
}

/// HTML attributes for list item node.
export const listItemAttr = $nodeAttr('listItem')

withMeta(listItemAttr, {
  displayName: 'Attr<listItem>',
  group: 'ListItem',
})

/// Schema for list item node.
export const listItemSchema = $nodeSchema('list_item', (ctx) => ({
  group: 'listItem',
  content: 'paragraph block*',
  attrs: {
    label: {
      default: '•',
      validate: 'string',
    },
    listType: {
      default: 'bullet',
      validate: 'string',
    },
    spread: {
      default: true,
      validate: 'boolean',
    },
    sourceTightFirstBlock: {
      default: false,
      validate: 'boolean',
    },
  },
  defining: true,
  parseDOM: [
    {
      tag: 'li',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom)

        return {
          label: normalizeListItemStringAttr(dom.dataset.label, '•', MAX_LIST_ITEM_LABEL_ATTR_CHARS),
          listType: normalizeListItemStringAttr(dom.dataset.listType, 'bullet', MAX_LIST_ITEM_TYPE_ATTR_CHARS),
          spread: dom.dataset.spread === 'true',
        }
      },
    },
  ],
  toDOM: (node) => [
    'li',
    {
      ...ctx.get(listItemAttr.key)(node),
      'data-label': node.attrs.label,
      'data-list-type': node.attrs.listType,
      'data-spread': node.attrs.spread,
    },
    0,
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'listItem',
    runner: (state, node, type) => {
      const label = node.label != null ? `${node.label}.` : '•'
      const listType = node.label != null ? 'ordered' : 'bullet'
      const spread = node.spread != null ? `${node.spread}` : 'true'
      const sourceTightFirstBlock = node.sourceTightFirstBlock === true
      state.openNode(type, { label, listType, sourceTightFirstBlock, spread })
      state.next(node.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'list_item',
    runner: (state, node) => {
      state.openNode('listItem', undefined, {
        sourceTightFirstBlock: node.attrs.sourceTightFirstBlock,
        spread: node.attrs.spread,
      })
      const firstChild = node.firstChild
      if (
        node.attrs.sourceTightFirstBlock === true
        && firstChild?.type.name === 'paragraph'
        && firstChild.content.size === 0
      ) {
        for (let index = 1; index < node.childCount; index += 1)
          state.next(node.child(index))
      }
      else {
        state.next(node.content)
      }
      state.closeNode()
    },
  },
}))

withMeta(listItemSchema.node, {
  displayName: 'NodeSchema<listItem>',
  group: 'ListItem',
})

withMeta(listItemSchema.ctx, {
  displayName: 'NodeSchemaCtx<listItem>',
  group: 'ListItem',
})

/// The command to sink list item.
///
/// For example:
/// ```md
/// * List item 1
/// * List item 2 <- cursor here
/// ```
/// Will get:
/// ```md
/// * List item 1
///   * List item 2
/// ```
export const sinkListItemCommand = $command(
  'SinkListItem',
  (ctx) => () => sinkListItem(listItemSchema.type(ctx))
)

withMeta(sinkListItemCommand, {
  displayName: 'Command<sinkListItemCommand>',
  group: 'ListItem',
})

/// The command to lift list item.
///
/// For example:
/// ```md
/// * List item 1
///   * List item 2 <- cursor here
/// ```
/// Will get:
/// ```md
/// * List item 1
/// * List item 2
/// ```
export const liftListItemCommand = $command(
  'LiftListItem',
  (ctx) => () => liftListItem(listItemSchema.type(ctx))
)

withMeta(liftListItemCommand, {
  displayName: 'Command<liftListItemCommand>',
  group: 'ListItem',
})

/// The command to split a list item.
///
/// For example:
/// ```md
/// * List item 1
/// * List item 2 <- cursor here
/// ```
/// Will get:
/// ```md
/// * List item 1
/// * List item 2
/// * <- cursor here
/// ```
export const splitListItemCommand = $command(
  'SplitListItem',
  (ctx) => () => splitListItemPreservingAttrs(ctx)
)

withMeta(splitListItemCommand, {
  displayName: 'Command<splitListItemCommand>',
  group: 'ListItem',
})

function liftFirstListItem(ctx: Ctx): Command {
  return (state, dispatch, view) => {
    const { selection } = state
    if (!(selection instanceof TextSelection)) return false

    const { empty, $from } = selection

    // selection should be empty and at the start of the node
    if (!empty || $from.parentOffset !== 0) return false

    const parentItem = $from.node(-1)
    // selection should be in list item
    if (parentItem.type !== listItemSchema.type(ctx)) return false

    const listDepth = $from.depth - 2
    if (
      $from.parent.content.size === 0 &&
      parentItem.childCount === 1 &&
      listDepth >= 0 &&
      $from.node(listDepth).childCount > 1
    ) {
      if (dispatch) {
        const listItemDepth = $from.depth - 1
        const itemIndex = $from.index(listDepth)
        const deleteFrom = $from.before(listItemDepth)
        const deleteTo = $from.after(listItemDepth)
        let tr = state.tr.delete(deleteFrom, deleteTo)

        if (itemIndex === 0) {
          tr = tr.setSelection(TextSelection.create(tr.doc, deleteFrom + 2))
        } else {
          const selectionPos = Math.max(0, Math.min(deleteFrom, tr.doc.content.size))
          tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), -1))
        }

        dispatch(tr.scrollIntoView())
      }

      return true
    }

    return joinBackward(state, dispatch, view)
  }
}

function getNextListItemAttrs(attrs: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(attrs, 'checked')) {
    return attrs
  }

  return {
    ...attrs,
    checked: attrs.checked == null ? null : false,
  }
}

function isAtNonEmptyListItemHead($from: ResolvedPos) {
  const listItemDepth = $from.depth - 1
  return (
    $from.parent.isTextblock &&
    $from.parentOffset === 0 &&
    $from.parent.content.size > 0 &&
    $from.index(listItemDepth) === 0
  )
}

export function findNextEmptyTextblockSelectionPos(
  doc: ProseNode,
  start: number,
  maxScanNodes = MAX_SPLIT_LIST_ITEM_SELECTION_SCAN_NODES
) {
  let scannedNodes = 0
  const stack: Array<{ node: ProseNode; pos: number }> = []

  let docOffset = doc.content.size
  for (let index = doc.childCount - 1; index >= 0; index -= 1) {
    const child = doc.child(index)
    docOffset -= child.nodeSize
    stack.push({ node: child, pos: docOffset })
  }

  while (stack.length > 0 && scannedNodes < maxScanNodes) {
    const { node, pos } = stack.pop()!
    if (pos + node.nodeSize < start) continue
    scannedNodes += 1

    if (node.isTextblock && node.content.size === 0) {
      return pos + 1
    }
    if (node.isTextblock) continue

    let childOffset = node.content.size
    for (let index = node.childCount - 1; index >= 0; index -= 1) {
      const child = node.child(index)
      childOffset -= child.nodeSize
      stack.push({ node: child, pos: pos + 1 + childOffset })
    }
  }

  return -1
}

function splitListItemPreservingAttrs(ctx: Ctx): Command {
  return (state, dispatch) => {
    const { $from, $to, node } = state.selection as typeof state.selection & {
      node?: { isBlock?: boolean }
    }

    if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to)) return false

    const itemType = listItemSchema.type(ctx)
    const grandParent = $from.node(-1)
    if (grandParent.type !== itemType) return false

    const nextItemAttrs = getNextListItemAttrs(grandParent.attrs as Record<string, unknown>)

    if (state.selection.empty && isAtNonEmptyListItemHead($from)) {
      if (dispatch) {
        const listItemDepth = $from.depth - 1
        const insertPos = $from.before(listItemDepth)
        const emptyItem = itemType.create(
          nextItemAttrs as never,
          [$from.parent.type.create()]
        )
        let tr = state.tr.insert(insertPos, emptyItem)
        tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 2))
        dispatch(tr.scrollIntoView())
      }

      return true
    }

    if (
      $from.parent.content.size === 0 &&
      $from.node(-1).childCount === $from.indexAfter(-1)
    ) {
      if (
        $from.depth === 3 ||
        $from.node(-3).type !== itemType ||
        $from.index(-2) !== $from.node(-2).childCount - 1
      ) {
        return false
      }

      if (dispatch) {
        let wrap = Fragment.empty
        const depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3

        for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d -= 1) {
          wrap = Fragment.from($from.node(d).copy(wrap))
        }

        const depthAfter =
          $from.indexAfter(-1) < $from.node(-2).childCount
            ? 1
            : $from.indexAfter(-2) < $from.node(-3).childCount
              ? 2
              : 3

        wrap = wrap.append(
          Fragment.from(itemType.createAndFill(nextItemAttrs as never))
        )

        const start = $from.before($from.depth - (depthBefore - 1))
        const tr = state.tr.replace(
          start,
          $from.after(-depthAfter),
          new Slice(wrap, 4 - depthBefore, 0)
        )

        const sel = findNextEmptyTextblockSelectionPos(tr.doc, start)

        if (sel > -1) tr.setSelection(Selection.near(tr.doc.resolve(sel)))
        dispatch(tr.scrollIntoView())
      }

      return true
    }

    const nextType =
      $to.pos === $from.end() ? grandParent.contentMatchAt(0).defaultType : null
    const tr = state.tr.delete($from.pos, $to.pos)
    const types = nextType
      ? [{ type: itemType, attrs: nextItemAttrs }, { type: nextType }]
      : undefined

    if (!canSplit(tr.doc, $from.pos, 2, types)) return false
    if (dispatch) dispatch(tr.split($from.pos, 2, types).scrollIntoView())
    return true
  }
}

export const liftFirstListItemCommand = $command(
  'LiftFirstListItem',
  (ctx) => () => liftFirstListItem(ctx)
)

withMeta(liftFirstListItemCommand, {
  displayName: 'Command<liftFirstListItemCommand>',
  group: 'ListItem',
})

/// Keymap for list item node.
/// - `<Enter>`: Split the current list item.
/// - `<Tab>/<Mod-]>`: Sink the current list item.
/// - `<Shift-Tab>/<Mod-[>`: Lift the current list item.
export const listItemKeymap = $useKeymap('listItemKeymap', {
  NextListItem: {
    shortcuts: 'Enter',
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(splitListItemCommand.key)
    },
  },
  SinkListItem: {
    shortcuts: ['Tab', 'Mod-]'],
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(sinkListItemCommand.key)
    },
  },
  LiftListItem: {
    shortcuts: ['Shift-Tab', 'Mod-['],
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(liftListItemCommand.key)
    },
  },
  LiftFirstListItem: {
    shortcuts: ['Backspace', 'Delete'],
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(liftFirstListItemCommand.key)
    },
  },
})

withMeta(listItemKeymap.ctx, {
  displayName: 'KeymapCtx<listItem>',
  group: 'ListItem',
})

withMeta(listItemKeymap.shortcuts, {
  displayName: 'Keymap<listItem>',
  group: 'ListItem',
})
