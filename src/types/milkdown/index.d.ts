import type * as React from 'react';

type AnyRecord = Record<string, any>;
type AnyFn = (...args: any[]) => any;

interface MilkdownCtxToken<T = any> {
  readonly __milkdownType?: T;
  create(container: any, value?: T): any;
}

interface MilkdownSliceType<T = any, N extends string = string> extends MilkdownCtxToken<T> {
  readonly sliceName?: N;
  create(container: any, value?: T): any;
}

interface MilkdownMarkType {
  name: string;
  spec: AnyRecord;
  create(attrs?: AnyRecord | null): MilkdownMark;
  isInSet(marks: readonly MilkdownMark[] | null | undefined): MilkdownMark | undefined;
}

interface MilkdownMark {
  type: MilkdownMarkType;
  attrs: AnyRecord;
  [key: string]: any;
}

interface MilkdownNodeType {
  name: string;
  spec: AnyRecord;
  schema: MilkdownSchema;
  create(
    attrs?: AnyRecord | null,
    content?: MilkdownNode | readonly MilkdownNode[] | MilkdownFragmentLike | null,
    marks?: readonly MilkdownMark[] | null,
  ): MilkdownNode;
  createAndFill(
    attrs?: AnyRecord | null,
    content?: MilkdownNode | readonly MilkdownNode[] | MilkdownFragmentLike | null,
    marks?: readonly MilkdownMark[] | null,
  ): MilkdownNode | null;
  createChecked?(
    attrs?: AnyRecord | null,
    content?: MilkdownNode | readonly MilkdownNode[] | MilkdownFragmentLike | null,
    marks?: readonly MilkdownMark[] | null,
  ): MilkdownNode;
}

interface MilkdownResolvedPos {
  pos: number;
  doc: MilkdownNode;
  depth: number;
  parent: MilkdownNode;
  parentOffset: number;
  nodeBefore: MilkdownNode | null;
  nodeAfter: MilkdownNode | null;
  start(depth?: number): number;
  end(depth?: number): number;
  before(depth?: number): number;
  after(depth?: number): number;
  index(depth?: number): number;
  indexAfter(depth?: number): number;
  posAtIndex(index: number, depth?: number): number;
  node(depth?: number): MilkdownNode;
  blockRange(
    other?: MilkdownResolvedPos,
    pred?: (node: MilkdownNode) => boolean,
  ): any;
  marks(): MilkdownMark[];
}

interface MilkdownFragmentLike {
  size: number;
  childCount?: number;
  firstChild?: MilkdownNode | null;
  lastChild?: MilkdownNode | null;
  append?(other: MilkdownFragmentLike): MilkdownFragmentLike;
  cut(from: number, to?: number): MilkdownFragmentLike;
  findDiffStart(other: MilkdownFragmentLike): number | null;
  findDiffEnd(other: MilkdownFragmentLike): { a: number; b: number } | null;
  forEach(
    callback: (node: MilkdownNode, offset: number, index: number) => void,
  ): void;
}

interface MilkdownNode {
  type: MilkdownNodeType;
  attrs: AnyRecord;
  text?: string | null;
  textContent: string;
  content: MilkdownFragmentLike;
  marks: readonly MilkdownMark[];
  nodeSize: number;
  childCount: number;
  firstChild: MilkdownNode | null;
  lastChild: MilkdownNode | null;
  isLeaf: boolean;
  isText: boolean;
  isBlock: boolean;
  isTextblock: boolean;
  isInline: boolean;
  descendants(
    callback: (
      node: MilkdownNode,
      pos: number,
      parent?: MilkdownNode,
      index?: number,
    ) => boolean | void,
  ): void;
  nodesBetween(
    from: number,
    to: number,
    callback: (
      node: MilkdownNode,
      pos: number,
      parent?: MilkdownNode,
      index?: number,
    ) => boolean | void,
    startPos?: number,
  ): void;
  forEach(callback: (node: MilkdownNode, offset: number, index: number) => void): void;
  maybeChild(index: number): MilkdownNode | null;
  child(index: number): MilkdownNode;
  copy(content?: any): MilkdownNode;
  cut(from: number, to?: number): MilkdownNode;
  slice(from: number, to?: number, includeParents?: boolean): any;
  resolve(pos: number): MilkdownResolvedPos;
  nodeAt(pos: number): MilkdownNode | null;
  textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: string | null): string;
  rangeHasMark(from: number, to: number, markType: MilkdownMarkType): boolean;
  eq(other: MilkdownNode): boolean;
  [key: string]: any;
}

interface MilkdownSchema {
  nodes: Record<string, MilkdownNodeType>;
  marks: Record<string, MilkdownMarkType>;
  text(text: string, marks?: readonly MilkdownMark[] | null): MilkdownNode;
  [key: string]: any;
}

interface MilkdownMapping {
  map(pos: number, assoc?: number): number;
}

interface MilkdownSelectionInstance {
  from: number;
  to: number;
  empty: boolean;
  $from: MilkdownResolvedPos;
  $to: MilkdownResolvedPos;
  eq(other: MilkdownSelectionInstance): boolean;
  [key: string]: any;
}

interface MilkdownTransactionLike {
  doc: MilkdownNode;
  selection: MilkdownSelectionInstance;
  schema: MilkdownSchema;
  mapping: MilkdownMapping;
  docChanged: boolean;
  getMeta(key: any): any;
  setSelection(selection: MilkdownSelectionInstance): MilkdownTransactionLike;
  setMeta(key: any, value: any): MilkdownTransactionLike;
  setNodeMarkup(pos: number, type?: any, attrs?: AnyRecord, marks?: readonly MilkdownMark[] | null): MilkdownTransactionLike;
  replaceRange(from: number, to: number, slice: any): MilkdownTransactionLike;
  replaceRangeWith(from: number, to: number, node: MilkdownNode): MilkdownTransactionLike;
  replaceWith(from: number, to: number, content: any): MilkdownTransactionLike;
  replaceSelectionWith(node: MilkdownNode, inheritMarks?: boolean): MilkdownTransactionLike;
  replaceSelection(slice: any): MilkdownTransactionLike;
  insert(pos: number, content: any): MilkdownTransactionLike;
  insertText(text: string, from?: number, to?: number): MilkdownTransactionLike;
  delete(from: number, to: number): MilkdownTransactionLike;
  addMark(from: number, to: number, mark: MilkdownMark): MilkdownTransactionLike;
  removeMark(from: number, to?: number, mark?: any): MilkdownTransactionLike;
  removeStoredMark(mark: any): MilkdownTransactionLike;
  setStoredMarks(marks: readonly MilkdownMark[] | null): MilkdownTransactionLike;
  ensureMarks(marks: readonly MilkdownMark[]): MilkdownTransactionLike;
  setBlockType(from: number, to: number, nodeType: any, attrs?: AnyRecord | null): MilkdownTransactionLike;
  wrap(range: any, wrapping: readonly any[]): MilkdownTransactionLike;
  deleteRange(from: number, to: number): MilkdownTransactionLike;
  setTime(time: number): MilkdownTransactionLike;
  scrollIntoView(): MilkdownTransactionLike;
  [key: string]: any;
}

interface MilkdownEditorStateLike {
  doc: MilkdownNode;
  selection: MilkdownSelectionInstance;
  schema: MilkdownSchema;
  tr: MilkdownTransactionLike;
  storedMarks?: readonly MilkdownMark[] | null;
  [key: string]: any;
}

interface MilkdownRemarkPlugin<T = Record<string, unknown>> {
  plugin: AnyFn;
  options: T;
}

type MilkdownRemarkPluginRaw<T = any> = AnyFn;
type MilkdownCleanup = void | Promise<void> | (() => void | Promise<void>) | Promise<() => void | Promise<void>>;
type MilkdownNodeSchema = MilkdownNodeSpec & { priority?: number };
type MilkdownMarkSchema = MilkdownMarkSpec & { priority?: number };
interface MilkdownAstNode {
  type: string;
  children?: MilkdownAstNode[];
  value?: unknown;
  data?: AnyRecord;
  [key: string]: any;
}

interface MilkdownPluginStateField<T = any> {
  init(config: any, state: MilkdownEditorStateLike): T;
  apply(
    tr: MilkdownTransactionLike,
    value: T,
    oldState: MilkdownEditorStateLike,
    newState: MilkdownEditorStateLike,
  ): T;
}

interface MilkdownPluginView {
  update?(view: import('@milkdown/kit/prose/view').EditorView, prevState?: MilkdownEditorStateLike): void;
  destroy?(): void;
}

interface MilkdownPluginProps {
  decorations?(state: MilkdownEditorStateLike): any;
  attributes?: AnyRecord | ((state: MilkdownEditorStateLike) => AnyRecord);
  nodeViews?: Record<string, AnyFn>;
  handlePaste?(view: import('@milkdown/kit/prose/view').EditorView, event: ClipboardEvent): boolean;
  handleTextInput?(
    view: import('@milkdown/kit/prose/view').EditorView,
    from: number,
    to: number,
    text: string,
  ): boolean;
  handleKeyDown?(view: import('@milkdown/kit/prose/view').EditorView, event: KeyboardEvent): boolean;
  handleClick?(view: import('@milkdown/kit/prose/view').EditorView, pos: number, event: MouseEvent): boolean;
  handleDOMEvents?: Record<
    string,
    (view: import('@milkdown/kit/prose/view').EditorView, event: any) => boolean
  >;
  transformPastedHTML?(html: string): string;
  [key: string]: any;
}

interface MilkdownPluginSpec<T = any> {
  key?: import('@milkdown/kit/prose/state').PluginKey<T>;
  state?: MilkdownPluginStateField<T>;
  props?: MilkdownPluginProps;
  view?(view: import('@milkdown/kit/prose/view').EditorView): MilkdownPluginView | void;
  appendTransaction?(
    transactions: readonly MilkdownTransactionLike[],
    oldState: MilkdownEditorStateLike,
    newState: MilkdownEditorStateLike,
  ): MilkdownTransactionLike | null | undefined;
  filterTransaction?(tr: MilkdownTransactionLike, state: MilkdownEditorStateLike): boolean;
  [key: string]: any;
}

interface MilkdownParseDOMRule {
  tag?: string;
  style?: string;
  preserveWhitespace?: boolean | 'full';
  getAttrs?(value: unknown): AnyRecord | false | null | undefined;
  [key: string]: any;
}

interface MilkdownMarkdownState {
  openNode(type: any, attrs?: AnyRecord): this;
  closeNode(): this;
  openMark(type: any, attrs?: AnyRecord): this;
  closeMark(type?: any): this;
  withMark(mark: any, type: string, value?: string, props?: AnyRecord): this;
  addNode(type: string | any, attrs?: AnyRecord, value?: any, meta?: AnyRecord): this;
  addText(text: string): this;
  next(node: any): this;
  [key: string]: any;
}

interface MilkdownNodeSpec {
  content?: string;
  group?: string;
  inline?: boolean;
  atom?: boolean;
  code?: boolean;
  defining?: boolean;
  isolating?: boolean;
  marks?: string;
  attrs?: AnyRecord;
  parseDOM?: readonly MilkdownParseDOMRule[];
  toDOM?(node: MilkdownNode): any;
  parseMarkdown?: {
    match?(node: any): boolean;
    runner?(state: MilkdownMarkdownState, node: any, type: any): void;
  };
  toMarkdown?: {
    match?(node: MilkdownNode): boolean;
    runner?(state: MilkdownMarkdownState, node: MilkdownNode): void;
  };
  [key: string]: any;
}

interface MilkdownMarkSpec {
  attrs?: AnyRecord;
  inclusive?: boolean;
  excludes?: string;
  parseDOM?: readonly MilkdownParseDOMRule[];
  toDOM?(mark: MilkdownMark): any;
  parseMarkdown?: {
    match?(node: any): boolean;
    runner?(state: MilkdownMarkdownState, node: any, markType: any): void;
  };
  toMarkdown?: {
    match?(mark: MilkdownMark): boolean;
    runner?(state: MilkdownMarkdownState, mark: MilkdownMark, node: MilkdownNode): void;
  };
  [key: string]: any;
}

interface MilkdownNodeAttrSpec {
  default?: any;
  get?(dom: HTMLElement): any;
  set?(value: any): AnyRecord;
  [key: string]: any;
}

interface MilkdownCapturedValue {
  fullMatch: string;
  start: number;
  end?: number;
  [key: string]: any;
}

interface MilkdownMarkRuleConfig {
  getAttr?(match: RegExpMatchArray): AnyRecord;
  updateCaptured?(captured: MilkdownCapturedValue): Partial<MilkdownCapturedValue>;
  [key: string]: any;
}

interface MilkdownCtx {
  inject<T>(token: MilkdownCtxToken<T>, value?: T): MilkdownCtx;
  remove<T>(token: MilkdownCtxToken<T> | string): MilkdownCtx;
  record(timer: MilkdownTimerType): MilkdownCtx;
  clearTimer(timer: MilkdownTimerType): MilkdownCtx;
  set<T>(token: MilkdownCtxToken<T>, value: T): void;
  get<T>(token: MilkdownCtxToken<T>): T;
  update<T>(token: MilkdownCtxToken<T>, updater: (prev: T) => T): void;
  done(timer: MilkdownTimerType): void;
  wait(timer: MilkdownTimerType): Promise<void>;
  waitTimers(token: MilkdownCtxToken<MilkdownTimerType[]>): Promise<void>;
}

interface MilkdownEditorInstance {
  ctx: MilkdownCtx;
  create(): Promise<MilkdownEditorInstance>;
  destroy(clearPlugins?: boolean): Promise<MilkdownEditorInstance>;
  action<T>(action: (ctx: MilkdownCtx) => T): T;
  [key: string]: any;
}

interface MilkdownEditorBuilder extends MilkdownEditorInstance {
  config(fn: (ctx: MilkdownCtx) => void): MilkdownEditorBuilder;
  use(plugin: any): MilkdownEditorBuilder;
}

interface MilkdownCommandManager {
  call(key: any, ...args: any[]): boolean;
  [key: string]: any;
}

type MilkdownCommand = (
  state: MilkdownEditorStateLike,
  dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
  view?: import('@milkdown/kit/prose/view').EditorView,
) => boolean;

type MilkdownCommandFactory = (...args: any[]) => MilkdownCommand;
type MilkdownRunner = () => void | Promise<void> | (() => void | Promise<void>) | Promise<() => void | Promise<void>>;
type MilkdownPlugin = ((ctx: MilkdownCtx) => MilkdownRunner) & { meta?: Record<string, any> };
interface MilkdownMeta {
  displayName: string;
  package?: string;
  group?: string;
  [key: string]: any;
}

interface MilkdownTimerType {
  readonly id: symbol;
  readonly name: string;
  readonly timeout: number;
}

declare module '@milkdown/kit/core' {
  export type Attrs = AnyRecord;
  export type MarkType = import('@milkdown/kit/prose/model').MarkType;
  export type NodeType = import('@milkdown/kit/prose/model').NodeType;
  export type ResolvedPos = import('@milkdown/kit/prose/model').ResolvedPos;
  export type Schema = import('@milkdown/kit/prose/model').Schema;
  export type Cmd<T = undefined> = (payload?: T) => import('@milkdown/kit/prose/state').Command;
  export type CmdKey<T = undefined> = import('@milkdown/ctx').SliceType<Cmd<T>>;
  export type Cleanup = MilkdownCleanup;
  export type Command = import('@milkdown/kit/prose/state').Command;
  export type KeymapItem = {
    key: string;
    onRun: (ctx: MilkdownCtx) => Command;
    priority?: number;
  };
  export type PasteRule = {
    run: (
      slice: import('@milkdown/kit/prose/model').Slice,
      view: import('@milkdown/kit/prose/view').EditorView,
      isPlainText: boolean,
    ) => import('@milkdown/kit/prose/model').Slice;
    priority?: number;
  };
  export type NodeSchema = MilkdownNodeSchema;
  export type MarkSchema = MilkdownMarkSchema;
  export type RemarkPlugin<T = Record<string, unknown>> = MilkdownRemarkPlugin<T>;
  export type RemarkPluginRaw<T = any> = MilkdownRemarkPluginRaw<T>;
  export const rootCtx: MilkdownCtxToken<HTMLElement>;
  export const defaultValueCtx: MilkdownCtxToken<string>;
  export const editorStateCtx: MilkdownCtxToken<import('@milkdown/kit/prose/state').EditorState>;
  export const editorStateOptionsCtx: MilkdownCtxToken<(prev: AnyRecord) => AnyRecord>;
  export const editorStateTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const editorViewCtx: MilkdownCtxToken<import('@milkdown/kit/prose/view').EditorView>;
  export const virtualizeEditorViewCtx: MilkdownCtxToken<boolean>;
  export function materializeVirtualizedBlockAtPos(
    view: import('@milkdown/kit/prose/view').EditorView,
    pos: number,
  ): boolean;
  export const editorViewOptionsCtx: MilkdownCtxToken<AnyRecord>;
  export const editorViewTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const inputRulesCtx: MilkdownCtxToken<import('@milkdown/kit/prose/inputrules').InputRule[]>;
  export const prosePluginsCtx: MilkdownCtxToken<import('@milkdown/kit/prose/state').Plugin[]>;
  export const remarkPluginsCtx: MilkdownCtxToken<RemarkPlugin[]>;
  export const remarkStringifyOptionsCtx: MilkdownCtxToken<Record<string, unknown>>;
  export const keymapCtx: MilkdownCtxToken<any>;
  export const keymapTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const commandsTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const pasteRulesCtx: MilkdownCtxToken<PasteRule[]>;
  export const pasteRulesTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const parserCtx: MilkdownCtxToken<import('@milkdown/kit/transformer').Parser>;
  export const serializerCtx: MilkdownCtxToken<import('@milkdown/kit/transformer').Serializer>;
  export const commandsCtx: MilkdownCtxToken<MilkdownCommandManager>;
  export const schemaCtx: MilkdownCtxToken<import('@milkdown/kit/prose/model').Schema>;
  export const nodesCtx: MilkdownCtxToken<Array<[string, NodeSchema]>>;
  export const marksCtx: MilkdownCtxToken<Array<[string, MarkSchema]>>;
  export const nodeViewCtx: MilkdownCtxToken<Array<[string, import('@milkdown/kit/prose/view').NodeViewConstructor]>>;
  export const markViewCtx: MilkdownCtxToken<Array<[string, import('@milkdown/kit/prose/view').MarkViewConstructor]>>;
  export const InitReady: MilkdownTimerType;
  export const SchemaReady: MilkdownTimerType;
  export const CommandsReady: MilkdownTimerType;
  export const KeymapReady: MilkdownTimerType;
  export const PasteRulesReady: MilkdownTimerType;
  export const EditorStateReady: MilkdownTimerType;
  export const EditorViewReady: MilkdownTimerType;
  export function createCmdKey<T = undefined>(key?: string): CmdKey<T>;
  export function expectDomTypeError(value: unknown): Error;
  export function wrappingInputRule(...args: any[]): any;
  export function textblockTypeInputRule(...args: any[]): any;
  export function liftEmptyBlock(...args: any[]): import('@milkdown/kit/prose/state').Command;
  export function joinBackward(...args: any[]): import('@milkdown/kit/prose/state').Command;
  export function canSplit(...args: any[]): boolean;
  export function findTable(...args: any[]): any;
  export function findParentNodeType(...args: any[]): any;
  export function findSelectedNodeOfType(...args: any[]): any;
  export function goToNextCell(...args: any[]): any;
  export function isInTable(...args: any[]): boolean;
  export function selectedRect(...args: any[]): any;
  export function setCellAttr(...args: any[]): any;
  export function moveTableRow(...args: any[]): any;
  export function moveTableColumn(...args: any[]): any;
  export function cloneTr<T = import('@milkdown/kit/prose/state').Transaction>(tr: T): T;
  export function findParentNodeClosestToPos(
    predicate: (node: import('@milkdown/kit/prose/model').Node) => boolean,
  ): (pos: import('@milkdown/kit/prose/model').ResolvedPos) => any;
  export function isTextOnlySlice(
    slice: import('@milkdown/kit/prose/model').Slice,
  ): import('@milkdown/kit/prose/model').Node | false;
  export const DOMParser: {
    fromSchema(schema: import('@milkdown/kit/prose/model').Schema): any;
  };
  export const DOMSerializer: {
    fromSchema(schema: import('@milkdown/kit/prose/model').Schema): any;
  };
  export const AddMarkStep: any;
  export const ReplaceStep: any;
  export class CellSelection extends import('@milkdown/kit/prose/state').Selection {
    $anchorCell: { pos: number };
    $headCell: { pos: number };
    constructor(anchorCell: { pos: number }, headCell?: { pos: number });
    static colSelection(anchorCell: { pos: number }, headCell?: { pos: number }): CellSelection;
    static rowSelection(anchorCell: { pos: number }, headCell?: { pos: number }): CellSelection;
    isColSelection(): boolean;
    isRowSelection(): boolean;
  }
  export type TableRect = AnyRecord;
  export type MarkdownNode = MilkdownAstNode;
  export function tableNodes(...args: any[]): any;
  export function missingMarkInSchema(name: string): Error;
  export function missingNodeInSchema(name: string): Error;
  export function $ctx<T, N extends string>(
    value: T,
    name: N,
  ): import('@milkdown/ctx').MilkdownPlugin & { key: import('@milkdown/ctx').SliceType<T, N> };
  export function $nodeSchema<T extends string>(
    id: T,
    schema: (ctx: MilkdownCtx) => NodeSchema,
  ): any;
  export type $NodeSchema<T extends string = string> = any;
  export function $markSchema<T extends string>(
    id: T,
    schema: (ctx: MilkdownCtx) => MarkSchema,
  ): any;
  export function $markAttr(
    name: string,
    value?: (mark: import('@milkdown/kit/prose/model').Mark) => Record<string, any>,
  ): any;
  export function $nodeAttr(
    name: string,
    value?: (node: import('@milkdown/kit/prose/model').Node) => Record<string, any>,
  ): any;
  export function $useKeymap(name: string, userKeymap: Record<string, any>): any;
  export type $Remark<N extends string = string, T = any> = any;
  export function $remark(name: string, remark: (ctx: MilkdownCtx) => MilkdownRemarkPluginRaw<any>): any;
  export function $pasteRule(factory: (ctx: MilkdownCtx) => PasteRule): any;

  export const Editor: {
    make(): MilkdownEditorBuilder;
  };
}

declare module '@milkdown/kit/ctx' {
  export type Ctx = MilkdownCtx;
}

declare module '@milkdown/core' {
  export type Attrs = AnyRecord;
  export type MarkType = import('@milkdown/prose/model').MarkType;
  export type NodeType = import('@milkdown/prose/model').NodeType;
  export type ResolvedPos = import('@milkdown/prose/model').ResolvedPos;
  export type Schema = import('@milkdown/prose/model').Schema;
  export type Cmd<T = undefined> = (payload?: T) => import('@milkdown/prose/state').Command;
  export type CmdKey<T = undefined> = import('@milkdown/ctx').SliceType<Cmd<T>>;
  export type Cleanup = MilkdownCleanup;
  export type Command = import('@milkdown/prose/state').Command;
  export type KeymapItem = {
    key: string;
    onRun: (ctx: MilkdownCtx) => Command;
    priority?: number;
  };
  export type PasteRule = {
    run: (
      slice: import('@milkdown/prose/model').Slice,
      view: import('@milkdown/prose/view').EditorView,
      isPlainText: boolean,
    ) => import('@milkdown/prose/model').Slice;
    priority?: number;
  };
  export type NodeSchema = MilkdownNodeSchema;
  export type MarkSchema = MilkdownMarkSchema;
  export type RemarkPlugin<T = Record<string, unknown>> = MilkdownRemarkPlugin<T>;
  export type RemarkPluginRaw<T = any> = MilkdownRemarkPluginRaw<T>;
  export const defaultValueCtx: MilkdownCtxToken<string>;
  export const editorStateCtx: MilkdownCtxToken<import('@milkdown/prose/state').EditorState>;
  export const editorStateOptionsCtx: MilkdownCtxToken<(prev: AnyRecord) => AnyRecord>;
  export const editorStateTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const editorViewCtx: MilkdownCtxToken<import('@milkdown/prose/view').EditorView>;
  export const virtualizeEditorViewCtx: MilkdownCtxToken<boolean>;
  export const editorViewOptionsCtx: MilkdownCtxToken<AnyRecord>;
  export const editorViewTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const inputRulesCtx: MilkdownCtxToken<import('@milkdown/prose/inputrules').InputRule[]>;
  export const prosePluginsCtx: MilkdownCtxToken<import('@milkdown/prose/state').Plugin[]>;
  export const remarkPluginsCtx: MilkdownCtxToken<RemarkPlugin[]>;
  export const remarkStringifyOptionsCtx: MilkdownCtxToken<Record<string, unknown>>;
  export const parserCtx: MilkdownCtxToken<import('@milkdown/transformer').Parser>;
  export const serializerCtx: MilkdownCtxToken<import('@milkdown/transformer').Serializer>;
  export const commandsCtx: MilkdownCtxToken<MilkdownCommandManager>;
  export const keymapCtx: MilkdownCtxToken<any>;
  export const keymapTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const commandsTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const pasteRulesCtx: MilkdownCtxToken<PasteRule[]>;
  export const pasteRulesTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const schemaTimerCtx: MilkdownCtxToken<MilkdownTimerType[]>;
  export const schemaCtx: MilkdownCtxToken<import('@milkdown/prose/model').Schema>;
  export const nodesCtx: MilkdownCtxToken<Array<[string, NodeSchema]>>;
  export const marksCtx: MilkdownCtxToken<Array<[string, MarkSchema]>>;
  export const nodeViewCtx: MilkdownCtxToken<Array<[string, import('@milkdown/prose/view').NodeViewConstructor]>>;
  export const markViewCtx: MilkdownCtxToken<Array<[string, import('@milkdown/prose/view').MarkViewConstructor]>>;
  export const rootCtx: MilkdownCtxToken<any>;
  export const rootDOMCtx: MilkdownCtxToken<HTMLElement>;
  export const rootAttrsCtx: MilkdownCtxToken<Record<string, string>>;
  export const remarkCtx: MilkdownCtxToken<any>;
  export const InitReady: MilkdownTimerType;
  export const SchemaReady: MilkdownTimerType;
  export const CommandsReady: MilkdownTimerType;
  export const KeymapReady: MilkdownTimerType;
  export const PasteRulesReady: MilkdownTimerType;
  export const EditorStateReady: MilkdownTimerType;
  export const EditorViewReady: MilkdownTimerType;
  export function createCmdKey<T = undefined>(key?: string): CmdKey<T>;
  export function expectDomTypeError(value: unknown): Error;
  export function wrappingInputRule(...args: any[]): any;
  export function textblockTypeInputRule(...args: any[]): any;
  export function liftEmptyBlock(...args: any[]): import('@milkdown/prose/state').Command;
  export function joinBackward(...args: any[]): import('@milkdown/prose/state').Command;
  export function canSplit(...args: any[]): boolean;
  export function findTable(...args: any[]): any;
  export function findParentNodeType(...args: any[]): any;
  export function findSelectedNodeOfType(...args: any[]): any;
  export function goToNextCell(...args: any[]): any;
  export function isInTable(...args: any[]): boolean;
  export function selectedRect(...args: any[]): any;
  export function setCellAttr(...args: any[]): any;
  export function moveTableRow(...args: any[]): any;
  export function moveTableColumn(...args: any[]): any;
  export function cloneTr<T = import('@milkdown/prose/state').Transaction>(tr: T): T;
  export function findParentNodeClosestToPos(
    predicate: (node: import('@milkdown/prose/model').Node) => boolean,
  ): (pos: import('@milkdown/prose/model').ResolvedPos) => any;
  export function isTextOnlySlice(
    slice: import('@milkdown/prose/model').Slice,
  ): import('@milkdown/prose/model').Node | false;
  export const DOMParser: {
    fromSchema(schema: import('@milkdown/prose/model').Schema): any;
  };
  export const DOMSerializer: {
    fromSchema(schema: import('@milkdown/prose/model').Schema): any;
  };
  export const AddMarkStep: any;
  export const ReplaceStep: any;
  export class CellSelection extends import('@milkdown/prose/state').Selection {
    $anchorCell: { pos: number };
    $headCell: { pos: number };
    constructor(anchorCell: { pos: number }, headCell?: { pos: number });
    static colSelection(anchorCell: { pos: number }, headCell?: { pos: number }): CellSelection;
    static rowSelection(anchorCell: { pos: number }, headCell?: { pos: number }): CellSelection;
    isColSelection(): boolean;
    isRowSelection(): boolean;
  }
  export type TableRect = AnyRecord;
  export type MarkdownNode = MilkdownAstNode;
  export function tableNodes(...args: any[]): any;
  export function missingMarkInSchema(name: string): Error;
  export function missingNodeInSchema(name: string): Error;
  export function $ctx<T, N extends string>(
    value: T,
    name: N,
  ): import('@milkdown/ctx').MilkdownPlugin & { key: import('@milkdown/ctx').SliceType<T, N> };
  export function $nodeSchema<T extends string>(
    id: T,
    schema: (ctx: MilkdownCtx) => NodeSchema,
  ): any;
  export type $NodeSchema<T extends string = string> = any;
  export function $markSchema<T extends string>(
    id: T,
    schema: (ctx: MilkdownCtx) => MarkSchema,
  ): any;
  export function $markAttr(
    name: string,
    value?: (mark: import('@milkdown/prose/model').Mark) => Record<string, any>,
  ): any;
  export function $nodeAttr(
    name: string,
    value?: (node: import('@milkdown/prose/model').Node) => Record<string, any>,
  ): any;
  export function $useKeymap(name: string, userKeymap: Record<string, any>): any;
  export type $Remark<N extends string = string, T = any> = any;
  export function $remark(name: string, remark: (ctx: MilkdownCtx) => MilkdownRemarkPluginRaw<any>): any;
  export function $pasteRule(factory: (ctx: MilkdownCtx) => PasteRule): any;
  export const Editor: {
    make(): MilkdownEditorBuilder;
  };
}

declare module '@milkdown/ctx' {
  export type Ctx = MilkdownCtx;
  export type Meta = globalThis.MilkdownMeta;
  export type MilkdownPlugin = globalThis.MilkdownPlugin;
  export type TimerType = MilkdownTimerType;
  export type SliceType<T = any, N extends string = string> = MilkdownSliceType<T, N>;
  export function createSlice<T, N extends string = string>(
    value: T,
    name: N,
  ): SliceType<T, N>;
  export function createTimer(name: string, timeout?: number): MilkdownTimerType;
}

declare module '@milkdown/kit/plugin/history' {
  export const history: any;
}

declare module '@milkdown/kit/plugin/cursor' {
  export const gapCursorPlugin: MilkdownPlugin;
}

declare module '@milkdown/kit/plugin/listener' {
  interface ListenerApi {
    markdownUpdated(callback: (ctx: MilkdownCtx, markdown: string) => void): void;
  }

  export const listener: any;
  export const listenerCtx: MilkdownCtxToken<ListenerApi>;
}

declare module '@milkdown/kit/preset/commonmark' {
  interface CommandKeyLike {
    key: any;
    [key: string]: any;
  }

  export const commonmark: any;
  export const headingSchema: any;
  export const paragraphSchema: any;
  export const strongSchema: any;
  export const emphasisSchema: any;
  export const inlineCodeSchema: any;
  export const linkSchema: any;
  export function sanitizeImageSrc(value: unknown, options?: { allowEmpty?: boolean }): string | null;
  export const blockquoteSchema: any;
  export const hrSchema: any;
  export const imageSchema: any;
  export const listItemSchema: any;
  export const bulletListSchema: any;
  export const orderedListSchema: any;
  export const codeBlockSchema: any;
  export const htmlSchema: any;
  export const htmlBlockSchema: any;
  export function createSetextHeadingFromDelimiter(headingType: any, paragraphType: any): any;
  export const wrapInHeadingCommand: CommandKeyLike;
  export const createCodeBlockCommand: CommandKeyLike;
  export const insertHrCommand: CommandKeyLike;
}

declare module '@milkdown/kit/preset/gfm' {
  interface CommandKeyLike {
    key: any;
    [key: string]: any;
  }

  interface MilkdownPluginWithOptions {
    options: { key: any };
    plugin?: any;
    key?: any;
    [key: string]: any;
  }

  export const gfm: any;
  export const remarkGFMPlugin: MilkdownPluginWithOptions;
  export const tableSchema: any;
  export const tableRowSchema: any;
  export const tableHeaderSchema: any;
  export const tableCellSchema: any;
  export const footnoteReferenceSchema: any;
  export const footnoteDefinitionSchema: any;
  export const insertTableCommand: CommandKeyLike;
}

declare module '@milkdown/kit/component/table-block' {
  export const tableBlock: any;
  export const tableBlockConfig: MilkdownCtxToken<{
    renderButton: (renderType: string) => string;
  }>;
}

declare module '@milkdown/kit/prose/commands' {
  export function exitCode(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/kit/prose/view').EditorView,
  ): boolean;
  export function setBlockType(nodeType: any, attrs?: AnyRecord): MilkdownCommand;
  export function wrapIn(nodeType: any, attrs?: AnyRecord): MilkdownCommand;
  export function lift(state: MilkdownEditorStateLike, dispatch?: ((tr: MilkdownTransactionLike) => void) | null): boolean;
  export function toggleMark(markType: any, attrs?: AnyRecord): MilkdownCommand;
  export function liftEmptyBlock(...args: any[]): MilkdownCommand;
  export function chainCommands(...commands: MilkdownCommand[]): MilkdownCommand;
  export const baseKeymap: Record<string, MilkdownCommand>;
  export function deleteSelection(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/kit/prose/view').EditorView,
  ): boolean;
  export function joinTextblockBackward(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/kit/prose/view').EditorView,
  ): boolean;
  export function selectNodeBackward(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/kit/prose/view').EditorView,
  ): boolean;
}

declare module '@milkdown/prose/commands' {
  export function exitCode(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/prose/view').EditorView,
  ): boolean;
  export function setBlockType(nodeType: any, attrs?: AnyRecord): MilkdownCommand;
  export function wrapIn(nodeType: any, attrs?: AnyRecord): MilkdownCommand;
  export function lift(state: MilkdownEditorStateLike, dispatch?: ((tr: MilkdownTransactionLike) => void) | null): boolean;
  export function toggleMark(markType: any, attrs?: AnyRecord): MilkdownCommand;
  export function liftEmptyBlock(...args: any[]): MilkdownCommand;
  export function chainCommands(...commands: MilkdownCommand[]): MilkdownCommand;
  export const baseKeymap: Record<string, MilkdownCommand>;
  export function deleteSelection(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/prose/view').EditorView,
  ): boolean;
  export function joinTextblockBackward(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/prose/view').EditorView,
  ): boolean;
  export function selectNodeBackward(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/prose/view').EditorView,
  ): boolean;
}

declare module '@milkdown/kit/prose/history' {
  export function closeHistory(
    tr: MilkdownTransactionLike,
  ): MilkdownTransactionLike;
  export function undo(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
  ): boolean;
  export function redo(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
  ): boolean;
  export function undoDepth(state: MilkdownEditorStateLike): number;
  export function redoDepth(state: MilkdownEditorStateLike): number;
}

declare module '@milkdown/kit/prose/inputrules' {
  export class InputRule {
    constructor(
      match: RegExp,
      handler: (
        state: MilkdownEditorStateLike,
        match: RegExpMatchArray,
        start: number,
        end: number,
      ) => MilkdownTransactionLike | null | undefined,
      options?: AnyRecord,
    );
  }

  export function wrappingInputRule(...args: any[]): InputRule;
  export function textblockTypeInputRule(...args: any[]): InputRule;
  export function undoInputRule(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/kit/prose/view').EditorView,
  ): boolean;
}

declare module '@milkdown/kit/prose/keymap' {
  export function keymap(bindings: Record<string, MilkdownCommand>): any;
}

declare module '@milkdown/prose/inputrules' {
  export class InputRule {
    constructor(
      match: RegExp,
      handler: (
        state: MilkdownEditorStateLike,
        match: RegExpMatchArray,
        start: number,
        end: number,
      ) => MilkdownTransactionLike | null | undefined,
      options?: AnyRecord,
    );
  }

  export function wrappingInputRule(...args: any[]): InputRule;
  export function textblockTypeInputRule(...args: any[]): InputRule;
  export function undoInputRule(
    state: MilkdownEditorStateLike,
    dispatch?: ((tr: MilkdownTransactionLike) => void) | null,
    view?: import('@milkdown/prose/view').EditorView,
  ): boolean;
  export function customInputRules(options: { rules: InputRule[] }): import('@milkdown/prose/state').Plugin;
}

declare module '@milkdown/prose/keymap' {
  export function keymap(bindings: Record<string, MilkdownCommand>): any;
}

declare module '@milkdown/kit/prose/gapcursor' {
  export class GapCursor extends import('@milkdown/kit/prose/state').Selection {
    from: number;
    to: number;
    empty: boolean;
    $from: import('@milkdown/kit/prose/model').ResolvedPos;
    $to: import('@milkdown/kit/prose/model').ResolvedPos;
    constructor($pos: import('@milkdown/kit/prose/model').ResolvedPos);
    eq(other: import('@milkdown/kit/prose/state').Selection): boolean;
    static valid($pos: import('@milkdown/kit/prose/model').ResolvedPos): boolean;
  }

  export function gapCursor(): import('@milkdown/kit/prose/state').Plugin;
}

declare module '@milkdown/kit/prose/model' {
  export type Attrs = AnyRecord;
  export type MarkType = MilkdownMarkType;
  export type NodeType = MilkdownNodeType;
  export type ResolvedPos = MilkdownResolvedPos;

  export class Mark implements MilkdownMark {
    type: MarkType;
    attrs: AnyRecord;
    static none: readonly Mark[];
    [key: string]: any;
  }

  export class MarkType implements MilkdownMarkType {
    name: string;
    spec: AnyRecord;
    create(attrs?: AnyRecord | null): Mark;
    isInSet(marks: readonly Mark[] | null | undefined): Mark | undefined;
  }

  export class Node implements MilkdownNode {
    type: MilkdownNodeType;
    attrs: AnyRecord;
    text?: string | null;
    textContent: string;
    content: MilkdownFragmentLike;
    marks: readonly MilkdownMark[];
    nodeSize: number;
    childCount: number;
    firstChild: Node | null;
    lastChild: Node | null;
    isLeaf: boolean;
    isText: boolean;
    isBlock: boolean;
    isTextblock: boolean;
    isInline: boolean;
    descendants(
      callback: (node: Node, pos: number, parent?: Node, index?: number) => boolean | void,
    ): void;
    nodesBetween(
      from: number,
      to: number,
      callback: (node: Node, pos: number, parent?: Node, index?: number) => boolean | void,
      startPos?: number,
    ): void;
    forEach(callback: (node: Node, offset: number, index: number) => void): void;
    maybeChild(index: number): Node | null;
    child(index: number): Node;
    copy(content?: any): Node;
    cut(from: number, to?: number): Node;
    slice(from: number, to?: number, includeParents?: boolean): Slice;
    resolve(pos: number): MilkdownResolvedPos;
    nodeAt(pos: number): Node | null;
    textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: string | null): string;
    rangeHasMark(from: number, to: number, markType: MilkdownMarkType): boolean;
    eq(other: Node): boolean;
    [key: string]: any;
  }

  export class NodeType implements MilkdownNodeType {
    name: string;
    spec: AnyRecord;
    schema: MilkdownSchema;
    create(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | Fragment | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node;
    createAndFill(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | Fragment | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node | null;
    createChecked?(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | Fragment | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node;
    [key: string]: any;
  }

  export class Schema implements MilkdownSchema {
    nodes: Record<string, NodeType>;
    marks: Record<string, MarkType>;
    constructor(spec: { nodes: Record<string, any>; marks?: Record<string, any> });
    text(text: string, marks?: readonly Mark[] | null): Node;
    [key: string]: any;
  }

  export class DOMParser {
    static fromSchema(schema: Schema): DOMParser;
    parse(dom: Node | globalThis.Node): Node;
  }

  export class DOMSerializer {
    static fromSchema(schema: Schema): DOMSerializer;
    serializeFragment(fragment: Fragment, options?: AnyRecord, target?: globalThis.Node): globalThis.DocumentFragment;
  }

  export class Fragment {
    size: number;
    static from(content: Node | readonly Node[] | Fragment | null): Fragment;
    static fromArray(nodes: readonly Node[]): Fragment;
    static empty: Fragment;
    append(other: Fragment): Fragment;
    cut(from: number, to?: number): Fragment;
    findDiffStart(other: Fragment): number | null;
    findDiffEnd(other: Fragment): { a: number; b: number } | null;
    forEach(callback: (node: Node, offset: number, index: number) => void): void;
    [key: string]: any;
  }

  export class Slice {
    static empty: Slice;
    content: Fragment;
    openStart: number;
    openEnd: number;
    constructor(content: Fragment, openStart: number, openEnd: number);
    [key: string]: any;
  }

  export type DOMOutputSpec = any;
}

declare module '@milkdown/kit/prose/schema-list' {
  export function sinkListItem(nodeType: any): MilkdownCommand;
  export function liftListItem(nodeType: any): MilkdownCommand;
}

declare module '@milkdown/kit/prose/state' {
  export type Transaction = MilkdownTransactionLike;
  export type Command = MilkdownCommand;

  export class EditorState {
    static create(options: AnyRecord): EditorState;
    doc: MilkdownNode;
    selection: Selection;
    schema: MilkdownSchema;
    tr: Transaction;
    [key: string]: any;
  }

  export class Plugin<T = any> {
    constructor(spec?: MilkdownPluginSpec<T>);
    key: string;
    spec: MilkdownPluginSpec<T>;
    getState(state: EditorState): T | undefined;
    [key: string]: any;
  }

  export class PluginKey<T = any> {
    constructor(name?: string);
    getState(state: EditorState): T | undefined;
    [key: string]: any;
  }

  export class Selection implements MilkdownSelectionInstance {
    from: number;
    to: number;
    empty: boolean;
    $from: MilkdownResolvedPos;
    $to: MilkdownResolvedPos;
    eq(other: Selection): boolean;
    static findFrom(
      $pos: MilkdownResolvedPos,
      dir: number,
      textOnly?: boolean,
    ): Selection | null;
    static near($pos: MilkdownResolvedPos, bias?: number): Selection;
    static create(doc: MilkdownNode, anchor: number, head?: number): Selection;
    static atStart(doc: MilkdownNode): Selection;
    static atEnd(doc: MilkdownNode): Selection;
    [key: string]: any;
  }

  export class TextSelection extends Selection {
    constructor($anchor: any, $head?: any);
    static create(doc: MilkdownNode, anchor: number, head?: number): TextSelection;
  }

  export class AllSelection extends Selection {
    constructor(doc: MilkdownNode);
    static create(doc: MilkdownNode): AllSelection;
  }

  export class NodeSelection extends Selection {
    node: MilkdownNode;
    static create(doc: MilkdownNode, from: number): NodeSelection;
  }
}

declare module '@milkdown/kit/prose/tables' {
  export class CellSelection extends import('@milkdown/kit/prose/state').Selection {
    from: number;
    to: number;
    empty: boolean;
    $from: import('@milkdown/kit/prose/model').ResolvedPos;
    $to: import('@milkdown/kit/prose/model').ResolvedPos;
    $anchorCell: { pos: number };
    $headCell: { pos: number };
    constructor(anchorCell: { pos: number }, headCell?: { pos: number });
    static colSelection(
      anchorCell: { pos: number },
      headCell?: { pos: number },
    ): CellSelection;
    static rowSelection(
      anchorCell: { pos: number },
      headCell?: { pos: number },
    ): CellSelection;
    isColSelection(): boolean;
    isRowSelection(): boolean;
  }

  export const addColumnAfter: MilkdownCommand;
  export const addColumnBefore: MilkdownCommand;
  export const addRowAfter: MilkdownCommand;
  export const addRowBefore: MilkdownCommand;
  export const deleteColumn: MilkdownCommand;
  export const deleteRow: MilkdownCommand;
  export const deleteTable: MilkdownCommand;
  export const TableMap: {
    get(table: MilkdownNode): {
      width: number;
      height: number;
      positionAt(row: number, col: number, table: MilkdownNode): number;
      cellsInRect(rect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }): number[];
    };
  };
}

declare module '@milkdown/kit/prose/view' {
  export class EditorView {
    dom: HTMLElement;
    state: MilkdownEditorStateLike;
    dispatch: (tr: MilkdownTransactionLike) => void;
    focus(): void;
    hasFocus(): boolean;
    posAtCoords(coords: { left: number; top: number }): { pos: number; inside: number } | null;
    posAtDOM(node: globalThis.Node, offset: number, bias?: number): number;
    coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number };
    domAtPos(pos: number, side?: number): { node: globalThis.Node; offset: number };
    nodeDOM(pos: number): globalThis.Node | null;
    endOfTextblock(dir?: string, state?: MilkdownEditorStateLike): boolean;
    [key: string]: any;
  }

  export class Decoration {
    static widget(
      pos: number,
      toDOM: AnyFn | globalThis.Node,
      spec?: AnyRecord & { stopEvent?: (event: any) => boolean },
    ): Decoration;
    static node(from: number, to: number, attrs?: AnyRecord, spec?: AnyRecord): Decoration;
    static inline(from: number, to: number, attrs?: AnyRecord, spec?: AnyRecord): Decoration;
    [key: string]: any;
  }

  export class DecorationSet {
    static create(doc: MilkdownNode, decorations: readonly Decoration[]): DecorationSet;
    static empty: DecorationSet;
    find(start?: number, end?: number, predicate?: (spec: AnyRecord) => boolean): Decoration[];
    map(mapping: MilkdownMapping, doc: MilkdownNode): DecorationSet;
    add(doc: MilkdownNode, decorations: readonly Decoration[]): DecorationSet;
    remove(decorations: readonly Decoration[]): DecorationSet;
    [key: string]: any;
  }

  export class NodeView {
    [key: string]: any;
  }

  export type NodeViewConstructor = (
    node: import('@milkdown/kit/prose/model').Node,
    view: EditorView,
    getPos: () => number | undefined,
    decorations?: readonly any[],
    innerDecorations?: any,
  ) => NodeView;

  export type MarkViewConstructor = (
    mark: import('@milkdown/kit/prose/model').Mark,
    view: EditorView,
    inline: boolean,
  ) => NodeView;
}

declare module '@milkdown/preset-gfm' {
  interface CommandKeyLike {
    key: any;
    [key: string]: any;
  }

  interface MilkdownPluginWithOptions {
    options: { key: any };
    plugin?: any;
    key?: any;
    [key: string]: any;
  }

  export const gfm: any;
  export const remarkGFMPlugin: MilkdownPluginWithOptions;
  export const tableSchema: any;
  export const addColAfterCommand: CommandKeyLike;
  export const addColBeforeCommand: CommandKeyLike;
  export const addRowAfterCommand: CommandKeyLike;
  export const addRowBeforeCommand: CommandKeyLike;
  export const deleteSelectedCellsCommand: CommandKeyLike;
  export const moveColCommand: CommandKeyLike;
  export const moveRowCommand: CommandKeyLike;
  export const selectColCommand: CommandKeyLike;
  export const selectRowCommand: CommandKeyLike;
}

declare module '@milkdown/prose/model' {
  export type Attrs = AnyRecord;
  export type MarkType = MilkdownMarkType;
  export type NodeType = MilkdownNodeType;
  export type ResolvedPos = MilkdownResolvedPos;

  export class Mark implements MilkdownMark {
    type: MarkType;
    attrs: AnyRecord;
    static none: readonly Mark[];
  }

  export class MarkType implements MilkdownMarkType {
    name: string;
    spec: AnyRecord;
    create(attrs?: AnyRecord | null): Mark;
    isInSet(marks: readonly Mark[] | null | undefined): Mark | undefined;
  }

  export class NodeType implements MilkdownNodeType {
    name: string;
    spec: AnyRecord;
    schema: MilkdownSchema;
    create(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node;
    createAndFill(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node | null;
    createChecked?(
      attrs?: AnyRecord | null,
      content?: Node | readonly Node[] | null,
      marks?: readonly MilkdownMark[] | null,
    ): Node;
  }

  export class Node implements MilkdownNode {
    type: MilkdownNodeType;
    attrs: AnyRecord;
    text?: string | null;
    textContent: string;
    content: MilkdownFragmentLike;
    marks: readonly MilkdownMark[];
    nodeSize: number;
    childCount: number;
    firstChild: Node | null;
    lastChild: Node | null;
    isLeaf: boolean;
    isText: boolean;
    isBlock: boolean;
    isTextblock: boolean;
    isInline: boolean;
    descendants(
      callback: (
        node: Node,
        pos: number,
        parent?: Node,
        index?: number,
      ) => boolean | void,
    ): void;
    nodesBetween(
      from: number,
      to: number,
      callback: (
        node: Node,
        pos: number,
        parent?: Node,
        index?: number,
      ) => boolean | void,
      startPos?: number,
    ): void;
    forEach(callback: (node: Node, offset: number, index: number) => void): void;
    maybeChild(index: number): Node | null;
    child(index: number): Node;
    copy(content?: any): Node;
    cut(from: number, to?: number): Node;
    slice(from: number, to?: number, includeParents?: boolean): any;
    resolve(pos: number): MilkdownResolvedPos;
    nodeAt(pos: number): Node | null;
    textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: string | null): string;
    rangeHasMark(from: number, to: number, markType: MilkdownMarkType): boolean;
    eq(other: Node): boolean;
    static fromJSON(schema: Schema, json: AnyRecord): Node;
  }

  export class Schema implements MilkdownSchema {
    nodes: Record<string, NodeType>;
    marks: Record<string, MarkType>;
    constructor(spec: { nodes: Record<string, any>; marks?: Record<string, any> });
    text(text: string, marks?: readonly Mark[] | null): Node;
    [key: string]: any;
  }

  export class DOMParser {
    static fromSchema(schema: Schema): DOMParser;
    parse(dom: Node | globalThis.Node): Node;
  }

  export class DOMSerializer {
    static fromSchema(schema: Schema): DOMSerializer;
    serializeFragment(fragment: import('@milkdown/prose/model').Fragment, options?: AnyRecord, target?: globalThis.Node): globalThis.DocumentFragment;
  }

  export class Fragment {
    size: number;
    childCount: number;
    firstChild: Node | null;
    lastChild: Node | null;
    static from(content: Node | readonly Node[] | Fragment | null): Fragment;
    static fromArray(nodes: readonly Node[]): Fragment;
    static empty: Fragment;
    append(other: Fragment): Fragment;
    findDiffStart(other: Fragment): number | null;
    findDiffEnd(other: Fragment): { a: number; b: number } | null;
    forEach(callback: (node: Node, offset: number, index: number) => void): void;
    [key: string]: any;
  }

  export class Slice {
    static empty: Slice;
    content: Fragment;
    openStart: number;
    openEnd: number;
    constructor(content: Fragment, openStart: number, openEnd: number);
    [key: string]: any;
  }
}

declare module '@milkdown/prose/state' {
  export type Transaction = MilkdownTransactionLike;
  export type Command = MilkdownCommand;

  export class EditorState {
    static create(options: AnyRecord): EditorState;
    doc: MilkdownNode;
    selection: Selection;
    schema: MilkdownSchema;
    tr: Transaction;
    [key: string]: any;
  }

  export class Selection implements MilkdownSelectionInstance {
    from: number;
    to: number;
    empty: boolean;
    $from: MilkdownResolvedPos;
    $to: MilkdownResolvedPos;
    eq(other: Selection): boolean;
    static findFrom(
      $pos: MilkdownResolvedPos,
      dir: number,
      textOnly?: boolean,
    ): Selection | null;
    static near($pos: MilkdownResolvedPos, bias?: number): Selection;
    static create(doc: MilkdownNode, anchor: number, head?: number): Selection;
    static atStart(doc: MilkdownNode): Selection;
    static atEnd(doc: MilkdownNode): Selection;
    [key: string]: any;
  }

  export class TextSelection extends Selection {
    static create(doc: MilkdownNode, anchor: number, head?: number): TextSelection;
  }

  export class AllSelection extends Selection {
    constructor(doc: MilkdownNode);
    static create(doc: MilkdownNode): AllSelection;
  }

  export class NodeSelection extends Selection {
    node: MilkdownNode;
    static create(doc: MilkdownNode, from: number): NodeSelection;
  }

  export class Plugin<T = any> {
    constructor(spec?: MilkdownPluginSpec<T>);
    spec: MilkdownPluginSpec<T>;
    [key: string]: any;
  }

  export class PluginKey<T = any> {
    constructor(name?: string);
    getState(state: EditorState): T | undefined;
    [key: string]: any;
  }
}

declare module '@milkdown/prose' {
  export function findNodeInSelection(
    state: import('@milkdown/prose/state').EditorState,
    node: import('@milkdown/prose/model').NodeType,
  ): {
    hasNode: boolean;
    pos: number;
    target: import('@milkdown/prose/model').Node | null;
  };

  export function markRule(
    regexp: RegExp,
    markType: import('@milkdown/prose/model').MarkType,
    config?: MilkdownMarkRuleConfig,
  ): any;

  export function cloneTr<T = import('@milkdown/prose/state').Transaction>(tr: T): T;
  export function isTextOnlySlice(
    slice: import('@milkdown/prose/model').Slice,
  ): import('@milkdown/prose/model').Node | false;
  export function findParentNodeClosestToPos(
    predicate: (node: import('@milkdown/prose/model').Node) => boolean,
  ): (pos: import('@milkdown/prose/model').ResolvedPos) => any;
  export function customInputRules(options: {
    rules: import('@milkdown/prose/inputrules').InputRule[];
  }): import('@milkdown/prose/state').Plugin;
}

declare module '@milkdown/prose/transform' {
  export function findWrapping(
    range: any,
    nodeType: import('@milkdown/prose/model').NodeType,
    attrs?: import('@milkdown/prose/model').Attrs | null,
    innerRange?: any,
  ): any[] | null;
}

declare module '@milkdown/prose/tables' {
  export class CellSelection extends import('@milkdown/prose/state').Selection {
    from: number;
    to: number;
    empty: boolean;
    $from: import('@milkdown/prose/model').ResolvedPos;
    $to: import('@milkdown/prose/model').ResolvedPos;
    $anchorCell: { pos: number };
    $headCell: { pos: number };
    constructor(anchorCell: { pos: number }, headCell?: { pos: number });
    static colSelection(
      anchorCell: { pos: number },
      headCell?: { pos: number },
    ): CellSelection;
    static rowSelection(
      anchorCell: { pos: number },
      headCell?: { pos: number },
    ): CellSelection;
    isColSelection(): boolean;
    isRowSelection(): boolean;
  }

  export const TableMap: {
    get(table: MilkdownNode): {
      width: number;
      height: number;
      positionAt(row: number, col: number, table: MilkdownNode): number;
      cellsInRect(rect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }): number[];
    };
  };

  export function columnResizing(options?: AnyRecord): any;
  export function tableEditing(options?: AnyRecord): any;
  export function findTable(...args: any[]): any;
}

declare module '@milkdown/prose/view' {
  export class EditorView {
    dom: HTMLElement;
    state: MilkdownEditorStateLike;
    editable: boolean;
    dispatch: (tr: MilkdownTransactionLike) => void;
    focus(): void;
    hasFocus(): boolean;
    posAtCoords(coords: { left: number; top: number }): { pos: number; inside: number } | null;
    posAtDOM(node: globalThis.Node, offset: number, bias?: number): number;
    coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number };
    domAtPos(pos: number, side?: number): { node: globalThis.Node; offset: number };
    nodeDOM(pos: number): globalThis.Node | null;
    endOfTextblock(dir?: string, state?: MilkdownEditorStateLike): boolean;
    [key: string]: any;
  }

  export interface NodeView {
    dom?: HTMLElement;
    contentDOM?: HTMLElement | null;
    update?(node: MilkdownNode): boolean;
    stopEvent?(event: Event): boolean;
    ignoreMutation?(mutation: ViewMutationRecord): boolean;
    destroy?(): void;
    [key: string]: any;
  }

  export type NodeViewConstructor = (
    node: import('@milkdown/prose/model').Node,
    view: EditorView,
    getPos: () => number | undefined,
    decorations?: readonly any[],
    innerDecorations?: any,
  ) => NodeView;

  export type MarkViewConstructor = (
    mark: import('@milkdown/prose/model').Mark,
    view: EditorView,
    inline: boolean,
  ) => NodeView;

  export interface DirectEditorProps {
    state: import('@milkdown/prose/state').EditorState;
    nodeViews?: Record<string, NodeViewConstructor>;
    markViews?: Record<string, MarkViewConstructor>;
    transformPasted?(slice: import('@milkdown/prose/model').Slice, view: EditorView, isPlainText: boolean): import('@milkdown/prose/model').Slice;
    [key: string]: any;
  }

  export type ViewMutationRecord =
    | MutationRecord
    | { type: 'selection'; target: globalThis.Node };
}

declare module '@milkdown/kit/transformer' {
  export type Parser = ((markdown: string) => import('@milkdown/kit/prose/model').Node) & AnyRecord;
  export type Serializer = ((node: any) => string) & AnyRecord;
  export type Node = MilkdownAstNode;
  export type MarkdownNode = MilkdownAstNode;
  export type Root = MilkdownAstNode;
  export type RemarkPluginRaw<T = any> = MilkdownRemarkPluginRaw<T>;
  export type RemarkPlugin<T = Record<string, unknown>> = MilkdownRemarkPlugin<T>;
  export type NodeSchema = MilkdownNodeSchema;
  export type MarkSchema = MilkdownMarkSchema;
}

declare module '@milkdown/transformer' {
  export type Parser = ((markdown: string) => import('@milkdown/prose/model').Node) & AnyRecord;
  export type Serializer = ((node: any) => string) & AnyRecord;
  export type Node = MilkdownAstNode;
  export type MarkdownNode = MilkdownAstNode;
  export type Root = MilkdownAstNode;
  export type RemarkPluginRaw<T = any> = MilkdownRemarkPluginRaw<T>;
  export type RemarkPlugin<T = Record<string, unknown>> = MilkdownRemarkPlugin<T>;
  export type NodeSchema = MilkdownNodeSchema;
  export type MarkSchema = MilkdownMarkSchema;

  export class SerializerState {
    readonly schema: import('@milkdown/prose/model').Schema;
    static create(
      schema: import('@milkdown/prose/model').Schema,
      remark: any,
    ): Serializer;
    constructor(schema: import('@milkdown/prose/model').Schema);
    next(node: any): this;
    openNode(type: string, value?: string, props?: AnyRecord): this;
    closeNode(): this;
    withMark(
      mark: import('@milkdown/prose/model').Mark,
      type: string,
      value?: string,
      props?: AnyRecord,
    ): this;
    [key: string]: any;
  }
}

declare module '@milkdown/kit/utils' {
  export type $Ctx<T = any, N extends string = string> = import('@milkdown/ctx').MilkdownPlugin & {
    key: import('@milkdown/ctx').SliceType<T, N>;
  };
  export type $Node = import('@milkdown/ctx').MilkdownPlugin & {
    id: string;
    schema: import('@milkdown/transformer').NodeSchema;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').NodeType;
  };
  export type $Mark = import('@milkdown/ctx').MilkdownPlugin & {
    id: string;
    schema: import('@milkdown/transformer').MarkSchema;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').MarkType;
  };
  export type $Prose = import('@milkdown/ctx').MilkdownPlugin & {
    plugin: () => any;
    key: () => any;
  };
  export type $InputRule = import('@milkdown/ctx').MilkdownPlugin & {
    inputRule: import('@milkdown/prose/inputrules').InputRule;
  };
  export type $PasteRule = import('@milkdown/ctx').MilkdownPlugin & {
    pasteRule: import('@milkdown/core').PasteRule;
  };
  export type $Shortcut = import('@milkdown/ctx').MilkdownPlugin & {
    keymap: Record<string, import('@milkdown/prose/state').Command | import('@milkdown/core').KeymapItem>;
  };
  export type $Remark<N extends string = string, T = any> = [
    plugin: import('@milkdown/ctx').MilkdownPlugin,
    options: $Ctx<T, N>,
  ] & {
    plugin: import('@milkdown/ctx').MilkdownPlugin;
    options: $Ctx<T, N>;
    key: import('@milkdown/ctx').SliceType<T, N>;
  };
  export function $ctx<T, N extends string>(value: T, name: N): $Ctx<T, N>;
  export function $prose(factory: (ctx: MilkdownCtx) => any): $Prose;
  export function $node(name: string, factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema): $Node;
  export type $Command<T = any> = import('@milkdown/ctx').MilkdownPlugin & {
    run: (payload?: T) => boolean;
    key: import('@milkdown/core').CmdKey<T>;
  };
  export function $command<T = any, K extends string = string>(
    name: K,
    factory: (ctx: MilkdownCtx) => import('@milkdown/core').Cmd<T>,
  ): $Command<T>;
  export function $mark(name: string, factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema): $Mark;
  export function $markAttr(
    name: string,
    value?: (mark: import('@milkdown/prose/model').Mark) => Record<string, any>,
  ): $Ctx<(mark: import('@milkdown/prose/model').Mark) => Record<string, any>, `${string}Attr`>;
  export function $nodeAttr(
    name: string,
    value?: (node: import('@milkdown/prose/model').Node) => Record<string, any>,
  ): $Ctx<(node: import('@milkdown/prose/model').Node) => Record<string, any>, `${string}Attr`>;
  export function $markSchema<T extends string>(
    name: T,
    factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema,
  ): [$Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>, $Mark] & {
    mark: $Mark;
    ctx: $Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>;
    key: import('@milkdown/ctx').SliceType<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').MarkType;
  };
  export function $nodeSchema<T extends string>(
    name: T,
    factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema,
  ): [$Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>, $Node] & {
    node: $Node;
    ctx: $Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>;
    key: import('@milkdown/ctx').SliceType<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').NodeType;
  };
  export function $inputRule(factory: (ctx: MilkdownCtx) => import('@milkdown/prose/inputrules').InputRule): $InputRule;
  export function $pasteRule(factory: (ctx: MilkdownCtx) => import('@milkdown/core').PasteRule): $PasteRule;
  export function $useKeymap(
    name: string,
    shortcuts: Record<
      string,
      {
        shortcuts: string | readonly string[];
        priority?: number;
        command: (ctx: MilkdownCtx) => import('@milkdown/prose/state').Command;
      }
    >,
  ): [$Ctx<any, `${string}Keymap`>, $Shortcut] & {
    ctx: $Ctx<any, `${string}Keymap`>;
    shortcuts: $Shortcut;
    key: import('@milkdown/ctx').SliceType<any, `${string}Keymap`>;
    keymap: Record<string, import('@milkdown/prose/state').Command | import('@milkdown/core').KeymapItem>;
  };
  export function $remark<N extends string = string, T = any>(
    name: N,
    factory: (ctx: MilkdownCtx) => MilkdownRemarkPluginRaw<T>,
  ): $Remark<N, T>;
  export function getMarkdown(range?: { from: number; to: number }): (ctx: MilkdownCtx) => string;
  export function $view(node: any, factory: (ctx: MilkdownCtx) => any): any;
}

declare module '@milkdown/utils' {
  export type $Ctx<T = any, N extends string = string> = import('@milkdown/ctx').MilkdownPlugin & {
    key: import('@milkdown/ctx').SliceType<T, N>;
  };
  export type $Node = import('@milkdown/ctx').MilkdownPlugin & {
    id: string;
    schema: import('@milkdown/transformer').NodeSchema;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').NodeType;
  };
  export type $Mark = import('@milkdown/ctx').MilkdownPlugin & {
    id: string;
    schema: import('@milkdown/transformer').MarkSchema;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').MarkType;
  };
  export type $Prose = import('@milkdown/ctx').MilkdownPlugin & {
    plugin: () => any;
    key: () => any;
  };
  export type $InputRule = import('@milkdown/ctx').MilkdownPlugin & {
    inputRule: import('@milkdown/prose/inputrules').InputRule;
  };
  export type $PasteRule = import('@milkdown/ctx').MilkdownPlugin & {
    pasteRule: import('@milkdown/core').PasteRule;
  };
  export type $Shortcut = import('@milkdown/ctx').MilkdownPlugin & {
    keymap: Record<string, import('@milkdown/prose/state').Command | import('@milkdown/core').KeymapItem>;
  };
  export type $Remark<N extends string = string, T = any> = [
    plugin: import('@milkdown/ctx').MilkdownPlugin,
    options: $Ctx<T, N>,
  ] & {
    plugin: import('@milkdown/ctx').MilkdownPlugin;
    options: $Ctx<T, N>;
    key: import('@milkdown/ctx').SliceType<T, N>;
  };
  export function $ctx<T, N extends string>(value: T, name: N): $Ctx<T, N>;
  export function $prose(factory: (ctx: MilkdownCtx) => any): $Prose;
  export function $node(name: string, factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema): $Node;
  export type $Command<T = any> = import('@milkdown/ctx').MilkdownPlugin & {
    run: (payload?: T) => boolean;
    key: import('@milkdown/core').CmdKey<T>;
  };
  export function $command<T = any, K extends string = string>(
    name: K,
    factory: (ctx: MilkdownCtx) => import('@milkdown/core').Cmd<T>,
  ): $Command<T>;
  export function $mark(name: string, factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema): $Mark;
  export function $markAttr(
    name: string,
    value?: (mark: import('@milkdown/prose/model').Mark) => Record<string, any>,
  ): $Ctx<(mark: import('@milkdown/prose/model').Mark) => Record<string, any>, `${string}Attr`>;
  export function $nodeAttr(
    name: string,
    value?: (node: import('@milkdown/prose/model').Node) => Record<string, any>,
  ): $Ctx<(node: import('@milkdown/prose/model').Node) => Record<string, any>, `${string}Attr`>;
  export function $markSchema<T extends string>(
    name: T,
    factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema,
  ): [$Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>, $Mark] & {
    mark: $Mark;
    ctx: $Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>;
    key: import('@milkdown/ctx').SliceType<(ctx: MilkdownCtx) => import('@milkdown/transformer').MarkSchema, T>;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').MarkType;
  };
  export function $nodeSchema<T extends string>(
    name: T,
    factory: (ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema,
  ): [$Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>, $Node] & {
    node: $Node;
    ctx: $Ctx<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>;
    key: import('@milkdown/ctx').SliceType<(ctx: MilkdownCtx) => import('@milkdown/transformer').NodeSchema, T>;
    type: (ctx: MilkdownCtx) => import('@milkdown/prose/model').NodeType;
  };
  export function $inputRule(factory: (ctx: MilkdownCtx) => import('@milkdown/prose/inputrules').InputRule): $InputRule;
  export function $pasteRule(factory: (ctx: MilkdownCtx) => import('@milkdown/core').PasteRule): $PasteRule;
  export function $useKeymap(
    name: string,
    shortcuts: Record<
      string,
      {
        shortcuts: string | readonly string[];
        priority?: number;
        command: (ctx: MilkdownCtx) => import('@milkdown/prose/state').Command;
      }
    >,
  ): [$Ctx<any, `${string}Keymap`>, $Shortcut] & {
    ctx: $Ctx<any, `${string}Keymap`>;
    shortcuts: $Shortcut;
    key: import('@milkdown/ctx').SliceType<any, `${string}Keymap`>;
    keymap: Record<string, import('@milkdown/prose/state').Command | import('@milkdown/core').KeymapItem>;
  };
  export function $remark<N extends string = string, T = any>(
    name: N,
    factory: (ctx: MilkdownCtx) => MilkdownRemarkPluginRaw<T>,
  ): $Remark<N, T>;
  export function $view(node: any, factory: (ctx: MilkdownCtx) => any): any;
}

declare module '@milkdown/react' {
  export const Milkdown: (props?: any) => React.ReactElement | null;
  export const MilkdownProvider: (props: {
    children?: React.ReactNode;
  }) => React.ReactElement | null;
  export function useEditor(
    factory: (root: HTMLElement) => any,
    deps?: readonly unknown[],
  ): {
    get?: () => MilkdownEditorInstance | null;
  };
}
