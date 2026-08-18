import type { Ctx, MilkdownPlugin, TimerType } from '@milkdown/ctx'
import type { DirectEditorProps } from '@milkdown/prose/view'

import { createSlice, createTimer } from '@milkdown/ctx'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { EditorView } from '@milkdown/prose/view'

import { withMeta } from '../__internal__'
import {
  editorStateCtx,
  editorViewCtx,
  markViewCtx,
  nodeViewCtx,
  prosePluginsCtx,
} from './atoms'
import { EditorStateReady } from './editor-state'
import { InitReady } from './init'
import { pasteRulesCtx, PasteRulesReady } from './paste-rule'
import {
  createVirtualizedEditorViewPlugin,
  createVirtualizedNodeViews,
  destroyVirtualizedViewController,
} from './virtualized-editor-view'

export { materializeVirtualizedBlockAtPos } from './virtualized-editor-view'

type EditorOptions = Omit<DirectEditorProps, 'state'>

type RootType = Node | undefined | null | string

/// The timer which will be resolved when the editor view plugin is ready.
export const EditorViewReady = createTimer('EditorViewReady')

/// A slice which stores timers that need to be waited for before starting to run the plugin.
/// By default, it's `[EditorStateReady]`.
export const editorViewTimerCtx = createSlice(
  [] as TimerType[],
  'editorViewTimer'
)

/// A slice which contains the editor view options which will be passed to the editor view.
export const editorViewOptionsCtx = createSlice(
  {} as Partial<EditorOptions>,
  'editorViewOptions'
)

/// A slice which contains the value to get the root element.
/// Can be a selector string, a node or null.
/// If it's null, the editor will be created in the body.
export const rootCtx = createSlice(null as RootType, 'root')

/// A slice which contains the actually root element.
export const rootDOMCtx = createSlice(null as unknown as HTMLElement, 'rootDOM')

/// A slice which contains the root element attributes.
/// You can add attributes to the root element by this slice.
export const rootAttrsCtx = createSlice(
  {} as Record<string, string>,
  'rootAttrs'
)

/// Whether large documents should progressively materialize top-level block DOM.
export const virtualizeEditorViewCtx = createSlice(false, 'virtualizeEditorView')

function createViewContainer(root: Node, ctx: Ctx) {
  const container = document.createElement('div')
  container.className = 'milkdown'
  root.appendChild(container)
  ctx.set(rootDOMCtx, container)

  const attrs = ctx.get(rootAttrsCtx)
  Object.entries(attrs).forEach(([key, value]) =>
    container.setAttribute(key, value)
  )

  return container
}

function prepareViewDom(dom: Element) {
  dom.classList.add('editor')
  dom.setAttribute('role', 'textbox')
}

const key = new PluginKey('MILKDOWN_VIEW_CLEAR')

/// The editor view plugin.
/// This plugin will create an editor view.
///
/// This plugin will wait for the editor state plugin.
export const editorView: MilkdownPlugin = (ctx) => {
  ctx
    .inject(rootCtx, document.body)
    .inject(editorViewCtx, {} as EditorView)
    .inject(editorViewOptionsCtx, {})
    .inject(rootDOMCtx, null as unknown as HTMLElement)
    .inject(rootAttrsCtx, {})
    .inject(virtualizeEditorViewCtx, false)
    .inject(editorViewTimerCtx, [EditorStateReady, PasteRulesReady])
    .record(EditorViewReady)

  return async () => {
    await ctx.wait(InitReady)

    const root = ctx.get(rootCtx) || document.body
    const el = typeof root === 'string' ? document.querySelector(root) : root

    const virtualize = ctx.get(virtualizeEditorViewCtx)
    ctx.update(prosePluginsCtx, (xs) => [
      new Plugin({
        key,
        view: (editorView) => {
          const container = el ? createViewContainer(el, ctx) : undefined

          const handleDOM = () => {
            if (container && el) {
              const editor = editorView.dom
              if (editor.parentNode === el) el.replaceChild(container, editor)
              if (editor.parentNode !== container) container.appendChild(editor)
            }
          }
          handleDOM()
          return {
            destroy: () => {
              if (container?.parentNode)
                container?.parentNode.replaceChild(editorView.dom, container)

              container?.remove()
            },
          }
        },
      }),
      createVirtualizedEditorViewPlugin(virtualize),
      ...xs,
    ])

    await ctx.waitTimers(editorViewTimerCtx)

    const state = ctx.get(editorStateCtx)
    const options = ctx.get(editorViewOptionsCtx)
    const baseNodeViews = Object.fromEntries(ctx.get(nodeViewCtx))
    const markViews = Object.fromEntries(ctx.get(markViewCtx))
    const nodeViews = virtualize
      ? createVirtualizedNodeViews(
          state,
          options.nodeViews ?? baseNodeViews,
          el
        )
      : baseNodeViews
    const appliedOptions = virtualize ? { ...options, nodeViews } : options
    const view = new EditorView(null, {
      state,
      nodeViews,
      markViews,
      transformPasted: (slice, view, isPlainText) => {
        ctx
          .get(pasteRulesCtx)
          .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
          .map((rule) => rule.run)
          .forEach((runner) => {
            slice = runner(slice, view, isPlainText)
          })

        return slice
      },
      ...appliedOptions,
    })
    prepareViewDom(view.dom)
    ctx.set(editorViewCtx, view)
    ctx.done(EditorViewReady)

    return () => {
      destroyVirtualizedViewController(view)
      view?.destroy()
      ctx
        .remove(rootCtx)
        .remove(editorViewCtx)
        .remove(editorViewOptionsCtx)
        .remove(rootDOMCtx)
        .remove(rootAttrsCtx)
        .remove(virtualizeEditorViewCtx)
        .remove(editorViewTimerCtx)
        .clearTimer(EditorViewReady)
    }
  }
}

withMeta(editorView, {
  displayName: 'EditorView',
})
