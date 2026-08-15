import type {
  Fragment,
  MarkType,
  Node,
  NodeType,
  Schema,
} from '@milkdown/prose/model'

import { serializerMatchError } from '@milkdown/exception'
import { Mark } from '@milkdown/prose/model'

import type {
  JSONRecord,
  MarkSchema,
  MarkdownNode,
  NodeSchema,
  RemarkParser,
  Root,
} from '../utility'
import type { Serializer } from './types'

import { Stack } from '../utility'
import { SerializerStackElement } from './stack-element'

const isFragment = (x: Node | Fragment): x is Fragment =>
  Object.prototype.hasOwnProperty.call(x, 'size')

export const MAX_SERIALIZER_MARK_PROP_DEPTH = 8
export const MAX_SERIALIZER_MARK_PROP_KEYS = 64
export const MAX_SERIALIZER_MARK_PROP_ARRAY_ITEMS = 256
export const MAX_SERIALIZER_MARK_PROP_VALUES = 1024
export const MAX_SERIALIZER_MARK_PROP_STRING_CHARS = 8192
export const MAX_SERIALIZER_MARK_SEARCH_DEPTH = 200

interface MarkPropCompareBudget {
  values: number
  stringChars: number
}

const isNonFiniteJsonNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isFinite(value)

const compareSerializerMarkPropValue = (
  left: unknown,
  right: unknown,
  depth: number,
  budget: MarkPropCompareBudget,
  leftSeen: WeakSet<object>,
  rightSeen: WeakSet<object>
): boolean => {
  budget.values += 1
  if (budget.values > MAX_SERIALIZER_MARK_PROP_VALUES) return false

  if (left === right) {
    if (typeof left === 'string') {
      budget.stringChars += left.length
      return budget.stringChars <= MAX_SERIALIZER_MARK_PROP_STRING_CHARS
    }
    return true
  }

  if (isNonFiniteJsonNumber(left) && isNonFiniteJsonNumber(right)) {
    return true
  }

  if (left === null || right === null) return false

  const leftType = typeof left
  if (leftType !== typeof right) return false

  if (leftType === 'string') {
    const leftString = left as string
    const rightString = right as string
    budget.stringChars += leftString.length + rightString.length
    return (
      budget.stringChars <= MAX_SERIALIZER_MARK_PROP_STRING_CHARS &&
      leftString === rightString
    )
  }

  if (leftType === 'number' || leftType === 'boolean') return left === right
  if (leftType !== 'object') return false
  if (depth >= MAX_SERIALIZER_MARK_PROP_DEPTH) return false

  const leftObject = left as Record<string, unknown>
  const rightObject = right as Record<string, unknown>
  if (
    typeof leftObject.toJSON === 'function' ||
    typeof rightObject.toJSON === 'function'
  ) {
    return false
  }

  if (leftSeen.has(leftObject) || rightSeen.has(rightObject)) return false
  leftSeen.add(leftObject)
  rightSeen.add(rightObject)

  const leftIsArray = Array.isArray(left)
  if (leftIsArray !== Array.isArray(right)) return false

  if (leftIsArray) {
    const leftArray = left as unknown[]
    const rightArray = right as unknown[]
    if (
      leftArray.length !== rightArray.length ||
      leftArray.length > MAX_SERIALIZER_MARK_PROP_ARRAY_ITEMS
    ) {
      return false
    }

    for (let index = 0; index < leftArray.length; index += 1) {
      if (
        !compareSerializerMarkPropValue(
          leftArray[index],
          rightArray[index],
          depth + 1,
          budget,
          leftSeen,
          rightSeen
        )
      ) {
        return false
      }
    }
    return true
  }

  const leftKeys = Object.keys(leftObject)
  const rightKeys = Object.keys(rightObject)
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.length > MAX_SERIALIZER_MARK_PROP_KEYS
  ) {
    return false
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index]
    if (key !== rightKeys[index]) return false
    if (
      !compareSerializerMarkPropValue(
        leftObject[key],
        rightObject[key],
        depth + 1,
        budget,
        leftSeen,
        rightSeen
      )
    ) {
      return false
    }
  }

  return true
}

export const areSerializerMarkPropsEqual = (
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean =>
  compareSerializerMarkPropValue(
    left,
    right,
    0,
    { values: 0, stringChars: 0 },
    new WeakSet(),
    new WeakSet()
  )

/// State for serializer.
/// Transform prosemirror state into remark AST.
export class SerializerState extends Stack<
  MarkdownNode,
  SerializerStackElement
> {
  /// @internal
  #marks: readonly Mark[] = Mark.none
  /// @internal
  readonly #schemaTypes: readonly (NodeType | MarkType)[]
  /// Get the schema of state.
  readonly schema: Schema

  /// Create a serializer from schema and remark instance.
  ///
  /// ```typescript
  /// const serializer = SerializerState.create(schema, remark)
  /// const markdown = parser(prosemirrorDoc)
  /// ```
  static create = (schema: Schema, remark: RemarkParser): Serializer => {
    return (content: Node) => {
      const state = new this(schema)
      state.run(content)
      return state.toString(remark)
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
  #matchTarget = (node: Node | Mark): NodeType | MarkType => {
    const directType = node.type as NodeType | MarkType
    if (typeof directType === 'object' && directType !== null) {
      const directSpec = directType.spec as NodeSchema | MarkSchema
      if (directSpec.toMarkdown?.match(node as Node & Mark)) return directType
    }

    const result = this.#schemaTypes.find((x): x is NodeType | MarkType => {
      if (x === directType) return false
      const spec = x.spec as NodeSchema | MarkSchema
      return spec.toMarkdown.match(node as Node & Mark)
    })

    if (!result) throw serializerMatchError(node.type)

    return result
  }

  /// @internal
  #runProseNode = (node: Node) => {
    const type = this.#matchTarget(node)
    const spec = type.spec as NodeSchema
    return spec.toMarkdown.runner(this, node)
  }

  /// @internal
  #runProseMark = (mark: Mark, node: Node) => {
    const type = this.#matchTarget(mark)
    const spec = type.spec as MarkSchema
    return spec.toMarkdown.runner(this, mark, node)
  }

  /// @internal
  #runNode = (node: Node, nextNode?: Node) => {
    const { marks } = node
    const getPriority = (x: Mark) => x.type.spec.priority ?? 50
    const tmp = [...marks].sort((a, b) => getPriority(a) - getPriority(b))
    const unPreventNext = tmp.every((mark) => !this.#runProseMark(mark, node))
    if (unPreventNext) this.#runProseNode(node)

    marks.forEach((mark) => {
      if (!nextNode || !mark.isInSet(nextNode.marks)) this.#closeMark(mark)
    })
  }

  /// @internal
  #searchType = (child: MarkdownNode, type: string): MarkdownNode => {
    if (child.type === type) return child

    if (child.children?.length !== 1) return child

    let target: MarkdownNode | null = null
    let current: MarkdownNode | undefined = child
    for (let depth = 0; current && depth <= MAX_SERIALIZER_MARK_SEARCH_DEPTH; depth += 1) {
      if (current.type === type) {
        target = current
        break
      }
      if (current.children?.length !== 1) break
      current = current.children[0]
    }

    if (!target) return child

    const tmp = target.children ? [...target.children] : undefined
    const node = { ...child, children: tmp }
    node.children = tmp
    target.children = [node]

    return target
  }

  /// @internal
  #maybeMergeChildren = (node: MarkdownNode): MarkdownNode => {
    const { children } = node
    if (!children) return node

    const nextChildren: MarkdownNode[] = []
    for (let index = 0; index < children.length; index += 1) {
      let child = children[index]
      if (index === 0) {
        nextChildren.push(child)
        continue
      }

      const last = nextChildren.at(-1)
      if (last && last.isMark && child.isMark) {
        child = this.#searchType(child, last.type)
        const { children: currChildren, ...currRest } = child
        const { children: prevChildren, ...prevRest } = last
        if (
          child.type === last.type &&
          currChildren &&
          prevChildren &&
          areSerializerMarkPropsEqual(currRest, prevRest)
        ) {
          const next = {
            ...prevRest,
            children: [...prevChildren, ...currChildren],
          }
          nextChildren[nextChildren.length - 1] = this.#maybeMergeChildren(next)
          continue
        }
      }
      nextChildren.push(child)
    }
    node.children = nextChildren

    return node
  }

  /// @internal
  #createMarkdownNode = (element: SerializerStackElement) => {
    const node: MarkdownNode = {
      ...element.props,
      type: element.type,
    }

    if (element.children) node.children = element.children

    if (element.value) node.value = element.value

    return node
  }

  /// Open a new node, the next operations will
  /// add nodes into that new node until `closeNode` is called.
  openNode = (type: string, value?: string, props?: JSONRecord) => {
    this.open(SerializerStackElement.create(type, undefined, value, props))
    return this
  }

  #moveSpaces = (
    element: SerializerStackElement,
    onPush: () => MarkdownNode
  ) => {
    let startSpaces = ''
    let endSpaces = ''
    const children = element.children
    const findBoundaryText = (
      nodes: MarkdownNode[] | undefined,
      edge: 'first' | 'last',
      depth = 0
    ): (MarkdownNode & { value: string }) | undefined => {
      if (!nodes?.length || depth > MAX_SERIALIZER_MARK_SEARCH_DEPTH) {
        return undefined
      }

      for (let offset = 0; offset < nodes.length; offset += 1) {
        const index = edge === 'first' ? offset : nodes.length - offset - 1
        const child = nodes[index]
        if (child.type === 'text' && child.value) {
          return child as MarkdownNode & { value: string }
        }
        const nested = findBoundaryText(child.children, edge, depth + 1)
        if (nested) return nested
      }
      return undefined
    }

    if (children) {
      const lastChild = findBoundaryText(children, 'last')
      const firstChild = findBoundaryText(children, 'first')
      if (lastChild && lastChild.value.endsWith(' ')) {
        const text = lastChild.value
        const trimmed = text.trimEnd()
        endSpaces = text.slice(trimmed.length)
        lastChild.value = trimmed
      }
      if (firstChild && firstChild.value.startsWith(' ')) {
        const text = firstChild.value
        const trimmed = text.trimStart()
        startSpaces = text.slice(0, text.length - trimmed.length)
        firstChild.value = trimmed
      }
    }

    if (startSpaces.length) this.#addNodeAndPush('text', undefined, startSpaces)

    const result = onPush()

    if (endSpaces.length) this.#addNodeAndPush('text', undefined, endSpaces)

    return result
  }

  /// @internal
  #closeNodeAndPush = (trim: boolean = false): MarkdownNode => {
    const element = this.close()

    const onPush = () =>
      this.#addNodeAndPush(
        element.type,
        element.children,
        element.value,
        element.props
      )

    if (trim) return this.#moveSpaces(element, onPush)

    return onPush()
  }

  /// Close the current node and push it into the parent node.
  closeNode = () => {
    this.#closeNodeAndPush()
    return this
  }

  /// @internal
  #addNodeAndPush = (
    type: string,
    children?: MarkdownNode[],
    value?: string,
    props?: JSONRecord
  ): MarkdownNode => {
    const element = SerializerStackElement.create(type, children, value, props)
    const node: MarkdownNode = this.#maybeMergeChildren(
      this.#createMarkdownNode(element)
    )
    this.push(node)
    return node
  }

  /// Add a node into current node.
  addNode = (
    type: string,
    children?: MarkdownNode[],
    value?: string,
    props?: JSONRecord
  ) => {
    this.#addNodeAndPush(type, children, value, props)
    return this
  }

  /// @internal
  #openMark = (
    mark: Mark,
    type: string,
    value?: string,
    props?: JSONRecord
  ) => {
    const isIn = mark.isInSet(this.#marks)

    if (isIn) return this

    this.#marks = mark.addToSet(this.#marks)
    return this.openNode(type, value, { ...props, isMark: true })
  }

  /// @internal
  #closeMark = (mark: Mark): void => {
    const isIn = mark.isInSet(this.#marks)

    if (!isIn) return

    this.#marks = mark.type.removeFromSet(this.#marks)
    this.#closeNodeAndPush(true)
  }

  /// Open a new mark, the next nodes added will have that mark.
  /// The mark will be closed automatically.
  withMark = (mark: Mark, type: string, value?: string, props?: JSONRecord) => {
    this.#openMark(mark, type, value, props)
    return this
  }

  /// Close a opened mark.
  /// In most cases you don't need this because
  /// marks will be closed automatically.
  closeMark = (mark: Mark) => {
    this.#closeMark(mark)
    return this
  }

  /// @internal
  build = (): MarkdownNode => {
    let doc: MarkdownNode | null = null
    do doc = this.#closeNodeAndPush()
    while (this.size())

    return doc
  }

  /// Give the node or node list back to the state and
  /// the state will find a proper runner (by `match` method in serializer spec) to handle it.
  next = (nodes: Node | Fragment) => {
    if (isFragment(nodes)) {
      nodes.forEach((node, _offset, index) => {
        this.#runNode(node, nodes.maybeChild(index + 1) ?? undefined)
      })
      return this
    }
    this.#runNode(nodes)
    return this
  }

  /// Use a remark parser to serialize current AST stored.
  override toString = (remark: RemarkParser): string =>
    remark.stringify(this.build() as Root)

  /// Transform a prosemirror node tree into remark AST.
  run = (tree: Node) => {
    this.next(tree)

    return this
  }
}
