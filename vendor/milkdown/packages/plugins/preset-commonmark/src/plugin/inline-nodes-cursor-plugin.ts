import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { $prose } from '@milkdown/utils'

import { withMeta } from '../__internal__'

function shouldShowInlineNodeCursor(pos: { parentOffset: number; parent: { content: { size: number } }; nodeBefore: any; nodeAfter: any }) {
  const left = pos.nodeBefore
  const right = pos.nodeAfter
  if (!left?.isInline || left.isText) return false

  if (
    right &&
    right.isInline &&
    !right.isText
  )
    return true

  return !right && pos.parentOffset === pos.parent.content.size
}

/// This plugin is to solve the [chrome 98 bug](https://discuss.prosemirror.net/t/cursor-jumps-at-the-end-of-line-when-it-betweens-two-inline-nodes/4641).
export const inlineNodesCursorPlugin = $prose(() => {
  let lock = false
  let compositionSession = 0
  let pendingCompositionFrame: number | null = null
  let preserveNativeCompositionOnEnter = false
  const inlineNodesCursorPluginKey = new PluginKey(
    'MILKDOWN_INLINE_NODES_CURSOR'
  )
  const inlineNodesCursorPlugin: Plugin = new Plugin({
    key: inlineNodesCursorPluginKey,
    state: {
      init() {
        return false
      },
      apply(tr) {
        if (!tr.selection.empty) return false

        const pos = tr.selection.$from
        return shouldShowInlineNodeCursor(pos)
      },
    },
    props: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (
            lock &&
            event.key === 'Enter' &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey
          ) {
            preserveNativeCompositionOnEnter = true
          }
          return false
        },
        compositionend: (view, e) => {
          if (lock) {
            lock = false
            const shouldPreserveNativeCommit = preserveNativeCompositionOnEnter
            preserveNativeCompositionOnEnter = false
            if (shouldPreserveNativeCommit) return false
            if (!e.data) return false
            const session = compositionSession
            const from = view.state.selection.from
            const data = e.data
            e.preventDefault()
            pendingCompositionFrame = requestAnimationFrame(() => {
              pendingCompositionFrame = null
              if (session !== compositionSession || lock) return
              const active = inlineNodesCursorPlugin.getState(view.state)
              if (active && view.state.selection.empty && view.state.selection.from === from) {
                view.dispatch(view.state.tr.insertText(data, from))
              }
            })

            return true
          }
          return false
        },
        compositionstart: (view) => {
          compositionSession += 1
          preserveNativeCompositionOnEnter = false
          if (pendingCompositionFrame !== null) {
            cancelAnimationFrame(pendingCompositionFrame)
            pendingCompositionFrame = null
          }
          const active = inlineNodesCursorPlugin.getState(view.state)
          lock = Boolean(active)

          return false
        },
        beforeinput: (view, e) => {
          const active = inlineNodesCursorPlugin.getState(view.state)
          if (active && e instanceof InputEvent && e.data && !lock) {
            const from = view.state.selection.from
            e.preventDefault()
            view.dispatch(view.state.tr.insertText(e.data || '', from))

            return true
          }

          return false
        },
      },
      decorations(state) {
        const active = inlineNodesCursorPlugin.getState(state)
        if (active) {
          const pos = state.selection.$from
          const position = pos.pos
          const left = document.createElement('span')
          const leftDec = Decoration.widget(position, left, {
            side: -1,
          })
          const right = document.createElement('span')
          const rightDec = Decoration.widget(position, right)
          setTimeout(() => {
            left.contentEditable = 'true'
            right.contentEditable = 'true'
          })
          return DecorationSet.create(state.doc, [leftDec, rightDec])
        }
        return DecorationSet.empty
      },
    },
    view: () => ({
      destroy: () => {
        compositionSession += 1
        lock = false
        preserveNativeCompositionOnEnter = false
        if (pendingCompositionFrame !== null) {
          cancelAnimationFrame(pendingCompositionFrame)
          pendingCompositionFrame = null
        }
      },
    }),
  })

  return inlineNodesCursorPlugin
})

withMeta(inlineNodesCursorPlugin, {
  displayName: 'Prose<inlineNodesCursorPlugin>',
  group: 'Prose',
})
