import type { Mark, MarkType } from '../../model'
import type { Captured, Options } from './common'

import { InputRule } from '../../inputrules'

/// Create an input rule for a mark.
export function markRule(
  regexp: RegExp,
  markType: MarkType,
  options: Options = {}
): InputRule {
  const rule = new InputRule(regexp, (state, match, start, end) => {
    const { tr } = state
    const matchLength = match.length

    let group = match[matchLength - 1]
    let fullMatch = match[0]
    let initialStoredMarks = state.storedMarks ?? []

    let markEnd = end

    const captured: Captured = {
      group,
      fullMatch,
      start,
      end,
    }

    const result = options.updateCaptured?.(captured)
    Object.assign(captured, result)
    ;({ group, fullMatch, start, end } = captured)

    if (fullMatch === null) return null

    if (group?.trim() === '') return null

    if (group) {
      const startSpaces = fullMatch.search(/\S/)
      const textStart = start + fullMatch.indexOf(group)
      const textEnd = textStart + group.length
      const syntaxMarkType = state.schema.marks.markdownSyntax

      initialStoredMarks = tr.storedMarks ?? []

      const attrs = options.getAttr?.(match)
      if (syntaxMarkType && textStart > start + startSpaces && textEnd < end) {
        tr.addMark(
          start + startSpaces,
          textStart,
          syntaxMarkType.create({ edge: 'open', kind: markType.name })
        )
        tr.addMark(textStart, textEnd, markType.create(attrs))
        tr.addMark(
          textEnd,
          end,
          syntaxMarkType.create({ edge: 'close', kind: markType.name })
        )
      } else {
        if (textEnd < end) tr.delete(textEnd, end)
        if (textStart > start) tr.delete(start + startSpaces, textStart)
        markEnd = start + startSpaces + group.length
        tr.addMark(start, markEnd, markType.create(attrs))
      }
      tr.setStoredMarks(initialStoredMarks)

      options.beforeDispatch?.({ match, start, end, tr })
    }

    return tr
  })
  rule.undoable = false
  return rule
}
