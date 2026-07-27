import { Fragment, type NodeType } from '@milkdown/prose/model'
import { TextSelection, type Command } from '@milkdown/prose/state'

const MAX_SETEXT_HEADING_DELIMITER_CHARS = 256
const setextHeadingDelimiterPattern = /^\s{0,3}(=+|-+)\s*$/

export function createSetextHeadingFromDelimiter(
  headingType: NodeType,
  paragraphType: NodeType
): Command {
  return (state, dispatch, view) => {
    if (view?.composing) return false

    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.empty) return false

    const { $from } = selection
    if ($from.parent.type !== paragraphType) return false
    if ($from.parentOffset !== $from.parent.content.size || $from.depth < 1)
      return false
    if ($from.parent.content.size > MAX_SETEXT_HEADING_DELIMITER_CHARS)
      return false

    const delimiter = $from.parent.textBetween(
      0,
      $from.parent.content.size,
      '',
      ''
    )
    const match = setextHeadingDelimiterPattern.exec(delimiter)
    if (!match) return false

    const parentDepth = $from.depth - 1
    const parent = $from.node(parentDepth)
    const currentIndex = $from.index(parentDepth)
    if (currentIndex < 1) return false

    const headingSource = parent.child(currentIndex - 1)
    if (headingSource.type !== paragraphType || headingSource.content.size === 0)
      return false

    const level = match[1]?.startsWith('=') ? 1 : 2
    const heading = headingType.create(
      { level },
      headingSource.content
    )
    const trailingParagraph = paragraphType.create()
    const hasFollowingSibling = currentIndex + 1 < parent.childCount
    const replacement = Fragment.fromArray(
      hasFollowingSibling ? [heading] : [heading, trailingParagraph]
    )
    if (!parent.canReplace(currentIndex - 1, currentIndex + 1, replacement))
      return false

    const delimiterFrom = $from.before($from.depth)
    const from = delimiterFrom - headingSource.nodeSize
    const to = $from.after($from.depth)
    const tr = state.tr.replaceWith(from, to, replacement)
    const afterHeadingPos = from + heading.nodeSize
    const selectionPos = hasFollowingSibling
      && tr.doc.nodeAt(afterHeadingPos)?.type !== paragraphType
      ? afterHeadingPos - 1
      : afterHeadingPos + 1

    dispatch?.(
      tr
        .setSelection(TextSelection.create(tr.doc, selectionPos))
        .scrollIntoView()
    )
    return true
  }
}
