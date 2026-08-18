import type { Node as ProseNode } from '@milkdown/prose/model'
import type { EditorState, Transaction } from '@milkdown/prose/state'
import type {
  DecorationSource,
  EditorView,
  NodeView,
  NodeViewConstructor,
} from '@milkdown/prose/view'

import { AllSelection, Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import {
  destroyVirtualizedViewController,
  getVirtualizedViewController,
  type VirtualizedBlockTextMetrics,
} from './virtualized-editor-view-controller'

export type { VirtualizedBlockTextMetrics } from './virtualized-editor-view-controller'

export type VirtualizedBlockHeightEstimator = (
  node: ProseNode,
  metrics: VirtualizedBlockTextMetrics
) => number | null | undefined

const INITIAL_RENDERED_BLOCKS = 40
const MIN_VIRTUALIZED_BLOCKS = 200
const VIRTUAL_BLOCK_META = 'MILKDOWN_VIRTUAL_BLOCK_META'

type VirtualizedViewState = {
  decorations: DecorationSet
  enabled: boolean
  version: number
  visible: ReadonlySet<number>
}

type VirtualBlockMeta = {
  show: readonly number[]
}

export const virtualizedEditorViewKey = new PluginKey<VirtualizedViewState>(
  'MILKDOWN_VIRTUALIZED_EDITOR_VIEW'
)

function collectInitialVisibleBlocks(doc: ProseNode): Set<number> {
  const visible = new Set<number>()
  let pos = 0
  for (let index = 0; index < Math.min(doc.childCount, INITIAL_RENDERED_BLOCKS); index += 1) {
    visible.add(pos)
    pos += doc.child(index).nodeSize
  }
  return visible
}

function getTopLevelBlockPos(state: EditorState, pos: number): number | null {
  const resolved = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  if (resolved.depth === 0) {
    return resolved.nodeAfter?.isBlock ? resolved.pos : null
  }
  return resolved.before(1)
}

function addSelectionBoundaryBlocks(state: EditorState, visible: Set<number>): void {
  if (state.selection instanceof AllSelection) return
  const from = getTopLevelBlockPos(state, state.selection.from)
  const to = getTopLevelBlockPos(
    state,
    Math.max(state.selection.from, state.selection.to - 1)
  )
  if (from !== null) visible.add(from)
  if (to !== null) visible.add(to)
}

function mapVisibleBlocks(tr: Transaction, visible: ReadonlySet<number>): Set<number> {
  if (!tr.docChanged) return new Set(visible)
  const mapped = new Set<number>()
  for (const pos of visible) {
    const result = tr.mapping.mapResult(pos, 1)
    if (!result.deleted && tr.doc.nodeAt(result.pos)?.isBlock) mapped.add(result.pos)
  }
  return mapped
}

function hasSamePositions(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const pos of a) if (!b.has(pos)) return false
  return true
}

function createVisibleDecorations(
  doc: ProseNode,
  visible: ReadonlySet<number>,
  version: number
): DecorationSet {
  const decorations: Decoration[] = []
  for (const pos of visible) {
    const node = doc.nodeAt(pos)
    if (!node) continue
    decorations.push(Decoration.node(pos, pos + node.nodeSize, {
      'data-editor-virtual-visible': String(version),
    }))
  }
  return DecorationSet.create(doc, decorations)
}

export function createVirtualizedEditorViewPlugin(requested: boolean): Plugin<VirtualizedViewState> {
  return new Plugin<VirtualizedViewState>({
    key: virtualizedEditorViewKey,
    state: {
      init: (_, state) => {
        const enabled = requested && state.doc.childCount >= MIN_VIRTUALIZED_BLOCKS
        const visible = enabled ? collectInitialVisibleBlocks(state.doc) : new Set<number>()
        if (enabled) addSelectionBoundaryBlocks(state, visible)
        return {
          decorations: DecorationSet.empty,
          enabled,
          version: 0,
          visible,
        }
      },
      apply: (tr, previous, _oldState, newState) => {
        if (!previous.enabled) return previous
        const meta = tr.getMeta(VIRTUAL_BLOCK_META) as VirtualBlockMeta | undefined
        if (!tr.docChanged && !tr.selectionSet && !meta) return previous
        const visible = mapVisibleBlocks(tr, previous.visible)
        const previouslyVisible = new Set(visible)
        for (const pos of meta?.show ?? []) {
          if (newState.doc.nodeAt(pos)?.isBlock) visible.add(pos)
        }
        addSelectionBoundaryBlocks(newState, visible)
        const positionsChanged = !hasSamePositions(previous.visible, visible)
        if (!tr.docChanged && !positionsChanged) return previous
        const version = previous.version + (positionsChanged ? 1 : 0)
        const added = Array.from(visible).filter((pos) => !previouslyVisible.has(pos))
        return {
          decorations: added.length > 0
            ? createVisibleDecorations(newState.doc, new Set(added), version)
            : previous.decorations.map(tr.mapping, newState.doc),
          enabled: true,
          version,
          visible,
        }
      },
    },
    props: {
      decorations: (state) => {
        const pluginState = virtualizedEditorViewKey.getState(state)
        return pluginState?.enabled ? pluginState.decorations : null
      },
    },
  })
}

function showBlocks(view: EditorView, positions: readonly number[]): void {
  if (view.isDestroyed || positions.length === 0) return
  const state = virtualizedEditorViewKey.getState(view.state)
  const show = positions.filter((pos) => !state?.visible.has(pos))
  if (show.length === 0) return
  view.dispatch(
    view.state.tr
      .setMeta(VIRTUAL_BLOCK_META, { show } satisfies VirtualBlockMeta)
      .setMeta('addToHistory', false)
  )
}

export function materializeVirtualizedBlockAtPos(view: EditorView, pos: number): boolean {
  const blockPos = getTopLevelBlockPos(view.state, pos)
  if (blockPos === null) return false
  const state = virtualizedEditorViewKey.getState(view.state)
  if (!state?.enabled || state.visible.has(blockPos)) return false
  showBlocks(view, [blockPos])
  return true
}

function estimateTextLines(text: string): number {
  let lines = 1
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1
  }
  return Math.max(lines, Math.ceil(text.length / 100))
}

function estimateBlockLines(node: ProseNode): number {
  if (node.isTextblock) return estimateTextLines(node.textContent)
  let lines = 0
  node.descendants((child) => {
    if (child.isTextblock) lines += estimateTextLines(child.textContent)
    return true
  })
  return Math.max(1, lines)
}

function createPlaceholderNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
  placementRoot: Node | null,
  estimateHeight: VirtualizedBlockHeightEstimator | null
): NodeView {
  const dom = view.dom.ownerDocument.createElement('div')
  let currentNode = node
  dom.className = 'editor-virtual-block-placeholder'
  dom.contentEditable = 'false'
  dom.dataset.editorVirtualNodeType = node.type.name
  const controller = getVirtualizedViewController(view, placementRoot, showBlocks)

  const sync = (metrics: VirtualizedBlockTextMetrics | null = null) => {
    dom.style.setProperty('--vlaina-editor-virtual-block-lines', String(estimateBlockLines(currentNode)))
    let estimatedHeight: number | null | undefined
    if (estimateHeight && metrics) {
      try {
        estimatedHeight = estimateHeight(currentNode, metrics)
      } catch {
        estimatedHeight = null
      }
    }
    if (estimatedHeight && Number.isFinite(estimatedHeight) && estimatedHeight > 0) {
      dom.style.setProperty('--vlaina-editor-virtual-block-height', `${Math.ceil(estimatedHeight)}px`)
    } else {
      dom.style.removeProperty('--vlaina-editor-virtual-block-height')
    }
  }
  sync()
  const unobserve = controller.observe({ element: dom, getPos, refresh: sync })

  return {
    dom,
    destroy: unobserve,
    ignoreMutation: () => true,
    update: (nextNode) => {
      const pos = getPos()
      const state = virtualizedEditorViewKey.getState(view.state)
      if (pos === undefined || state?.visible.has(pos) || nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      controller.requestRefresh(dom)
      return true
    },
  }
}

function isTopLevelPosition(view: EditorView, getPos: () => number | undefined): boolean {
  const pos = getPos()
  if (pos === undefined) return false
  return view.state.doc.resolve(pos).depth === 0
}

export function createVirtualizedNodeViews(
  state: EditorState,
  directNodeViews: Record<string, NodeViewConstructor>,
  placementRoot: Node | null,
  estimateHeight: VirtualizedBlockHeightEstimator | null = null
): Record<string, NodeViewConstructor> {
  const baseNodeViews = { ...directNodeViews }
  for (const plugin of state.plugins) {
    const pluginNodeViews = plugin.props.nodeViews
    if (!pluginNodeViews) continue
    for (const [name, nodeView] of Object.entries(pluginNodeViews)) {
      if (!(name in baseNodeViews)) baseNodeViews[name] = nodeView
    }
  }

  return Object.fromEntries(Object.keys(state.schema.nodes).map((name) => {
    const base = baseNodeViews[name]
    const nodeView = ((node, view, getPos, decorations, innerDecorations: DecorationSource) => {
      const state = virtualizedEditorViewKey.getState(view.state)
      if (!state?.enabled || !isTopLevelPosition(view, getPos)) {
        return base?.(node, view, getPos, decorations, innerDecorations)
      }
      const pos = getPos()
      if (pos !== undefined && state.visible.has(pos)) {
        return base?.(node, view, getPos, decorations, innerDecorations)
      }
      return createPlaceholderNodeView(node, view, getPos, placementRoot, estimateHeight)
    }) as NodeViewConstructor
    return [name, nodeView]
  }))
}

export { destroyVirtualizedViewController }
