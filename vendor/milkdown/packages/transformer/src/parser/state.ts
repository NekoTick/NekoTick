import type {
  Attrs,
  MarkType,
  Node,
  NodeType,
  Schema,
} from '@milkdown/prose/model'

import {
  createNodeInParserFail,
  parserMatchError,
  stackOverFlow,
} from '@milkdown/exception'
import { Mark } from '@milkdown/prose/model'

import type {
  MarkSchema,
  MarkdownNode,
  NodeSchema,
  RemarkParser,
} from '../utility'
import type { Parser } from './types'

import { Stack } from '../utility'
import { mergePairedInlineHtml } from './html'
import { ParserStackElement } from './stack-element'

const TASK_LIST_TEXT_MARKER_PATTERN =
  /^(?:\[|【)(\s|x|X|✓)(?:\]|】)(?=[ \t\r\n])/
const MAX_PARSER_REMARK_AST_DEPTH = 200
const MAX_PARSER_REMARK_AST_NODES = 250_000

function normalizeTaskListItem(node: MarkdownNode): void {
  if (node.type !== 'listItem' || node.checked != null) return

  const paragraph = getMarkdownNodeChildren(node)[0]
  if (paragraph?.type !== 'paragraph') return

  const children = getMarkdownNodeChildren(paragraph)
  const firstChild = children[0]
  if (firstChild?.type !== 'text' || typeof firstChild.value !== 'string') return

  const match = firstChild.value.match(TASK_LIST_TEXT_MARKER_PATTERN)
  if (!match) return

  node.checked = match[1] !== ' '
  const value = firstChild.value.slice(match[0].length).replace(/^[ \t\r\n]/, '')
  if (value) firstChild.value = value
  else children.shift()
}

function getMarkdownNodeChildren(node: MarkdownNode): MarkdownNode[] {
  const children = (node as MarkdownNode & { children?: unknown }).children
  return Array.isArray(children) ? children as MarkdownNode[] : []
}

function assertRemarkAstWithinParserBudget(tree: MarkdownNode): void {
  const stack = [{ depth: 0, node: tree }]
  let scheduledNodes = 1
  let visitedNodes = 0

  while (stack.length > 0) {
    const { depth, node } = stack.pop()!
    visitedNodes += 1
    if (visitedNodes > MAX_PARSER_REMARK_AST_NODES || depth > MAX_PARSER_REMARK_AST_DEPTH)
      throw new Error('Markdown document is too complex to parse safely.')

    // Remark has already classified protected blocks, so only real list items are normalized.
    normalizeTaskListItem(node)
    const children = getMarkdownNodeChildren(node)
    scheduledNodes += children.length
    if (scheduledNodes > MAX_PARSER_REMARK_AST_NODES)
      throw new Error('Markdown document is too complex to parse safely.')

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child) stack.push({ depth: depth + 1, node: child })
    }
  }
}

/// A state machine for parser. Transform remark AST into prosemirror state.
export class ParserState extends Stack<Node, ParserStackElement> {
  /// The schema in current editor.
  readonly schema: Schema

  /// @internal
  #marks: readonly Mark[] = Mark.none
  /// @internal
  readonly #schemaTypes: readonly (NodeType | MarkType)[]

  /// Create a parser from schema and remark instance.
  ///
  /// ```typescript
  /// const parser = ParserState.create(schema, remark)
  /// const prosemirrorNode = parser(SomeMarkdownText)
  /// ```
  static create = (schema: Schema, remark: RemarkParser): Parser => {
    return (text) => {
      const state = new this(schema)
      state.run(remark, text)
      return state.toDoc()
    }
  }

  /// @internal
  constructor(schema: Schema) {
    super()
    this.schema = schema
    this.#schemaTypes = Object.values({
      ...schema.nodes,
      ...schema.marks,
    })
  }

  /// @internal
  #hasText = (node: Node): node is Node & { text: string } => node.isText

  /// @internal
  #maybeMerge = (a: Node, b: Node): Node | undefined => {
    if (this.#hasText(a) && this.#hasText(b) && Mark.sameSet(a.marks, b.marks))
      return this.schema.text(a.text + b.text, a.marks)

    return undefined
  }

  /// @internal
  #matchTarget = (node: MarkdownNode): NodeType | MarkType => {
    const result = this.#schemaTypes.find((x): x is NodeType | MarkType => {
      const spec = x.spec as NodeSchema | MarkSchema
      return spec.parseMarkdown.match(node)
    })

    if (!result) throw parserMatchError(node)

    return result
  }

  /// @internal
  #runNode = (node: MarkdownNode) => {
    const type = this.#matchTarget(node)
    const spec = type.spec as NodeSchema | MarkSchema

    spec.parseMarkdown.runner(this, node, type as NodeType & MarkType)
  }

  /// Inject root node for prosemirror state.
  injectRoot = (node: MarkdownNode, nodeType: NodeType, attrs?: Attrs) => {
    this.openNode(nodeType, attrs)
    this.next(node.children)

    return this
  }

  /// Open a new node, the next operations will
  /// add nodes into that new node until `closeNode` is called.
  openNode = (nodeType: NodeType, attrs?: Attrs) => {
    this.open(ParserStackElement.create(nodeType, [], attrs))
    return this
  }

  /// @internal
  #closeNodeAndPush = (): Node => {
    this.#marks = Mark.none
    const element = this.close()

    return this.#addNodeAndPush(element.type, element.attrs, element.content)
  }

  /// Close the current node and push it into the parent node.
  closeNode = () => {
    try {
      this.#closeNodeAndPush()
    } catch (e) {
      console.error(e)
    }
    return this
  }

  /// @internal
  #addNodeAndPush = (
    nodeType: NodeType,
    attrs?: Attrs,
    content?: Node[]
  ): Node => {
    const node = nodeType.createAndFill(attrs, content, this.#marks)
    if (!node) throw createNodeInParserFail(nodeType, attrs, content)

    this.push(node)

    return node
  }

  /// Add a node into current node.
  addNode = (nodeType: NodeType, attrs?: Attrs, content?: Node[]) => {
    try {
      this.#addNodeAndPush(nodeType, attrs, content)
    } catch (e) {
      console.error(e)
    }
    return this
  }

  /// Open a new mark, the next nodes added will have that mark.
  openMark = (markType: MarkType, attrs?: Attrs) => {
    const mark = markType.create(attrs)

    this.#marks = mark.addToSet(this.#marks)
    return this
  }

  /// Close a opened mark.
  closeMark = (markType: MarkType) => {
    this.#marks = markType.removeFromSet(this.#marks)
    return this
  }

  /// Add a text node into current node.
  addText = (text: string) => {
    try {
      const topElement = this.top()
      if (!topElement) throw stackOverFlow()

      const prevNode = topElement.pop()
      const currNode = this.schema.text(text, this.#marks)

      if (!prevNode) {
        topElement.push(currNode)
        return this
      }

      const merged = this.#maybeMerge(prevNode, currNode)
      if (merged) {
        topElement.push(merged)
        return this
      }
      topElement.push(prevNode, currNode)
      return this
    } catch (e) {
      console.error(e)
      return this
    }
  }

  /// @internal
  build = (): Node => {
    let doc: Node | undefined

    do doc = this.#closeNodeAndPush()
    while (this.size())

    return doc
  }

  /// Give the node or node list back to the state and
  /// the state will find a proper runner (by `match` method in parser spec) to handle it.
  next = (nodes: MarkdownNode | MarkdownNode[] = []) => {
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        this.#runNode(node)
      }
      return this
    }

    this.#runNode(nodes)
    return this
  }

  /// Build the current state into a [prosemirror document](https://prosemirror.net/docs/ref/#model.Document_Structure).
  toDoc = () => this.build()

  /// Transform a markdown string into prosemirror state.
  run = (remark: RemarkParser, markdown: string) => {
    const rawTree = remark.runSync(
      remark.parse(markdown),
      markdown
    ) as MarkdownNode
    assertRemarkAstWithinParserBudget(rawTree)

    const tree = mergePairedInlineHtml(rawTree, markdown)
    this.next(tree)

    return this
  }
}
