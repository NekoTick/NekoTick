import { selectCodeBlockLineNumbersEnabled } from '@/stores/unified/settings/markdownSettings';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { Compartment, Transaction } from '@codemirror/state';
import {
  EditorView as CodeMirror,
  type ViewUpdate
} from '@codemirror/view';
import { Node } from '@milkdown/kit/prose/model';
import { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { createRoot, Root } from 'react-dom/client';
import { OBSIDIAN_CODE_BLOCK_EDITOR_CLASS_NAME } from '../../theme-compatibility/obsidian/runtimeClasses';
import { installCodeBlockNodeViewInitializationMethods } from './CodeBlockNodeViewInitializationMethods';
import { installCodeBlockNodeViewKeyboardMethods } from './CodeBlockNodeViewKeyboardMethods';
import { installCodeBlockNodeViewLifecycleMethods } from './CodeBlockNodeViewLifecycleMethods';
import { installCodeBlockNodeViewSelectionGeometryMethods } from './CodeBlockNodeViewSelectionGeometryMethods';
import { installCodeBlockNodeViewSelectionSyncMethods } from './CodeBlockNodeViewSelectionSyncMethods';
import { installCodeBlockNodeViewStateMethods } from './CodeBlockNodeViewStateMethods';
import {
  mapDocumentOffsetToCodeBlockEditorOffset
} from './codemirror';
import {
  clearCodeBlockEditorClipboardCapture,
  trackCodeBlockEditorClipboardKeydown,
} from './codemirror/codeBlockEditorClipboard';
import {
  isBlockSelectionInteractionPending,
} from '../cursor/blockSelectionInteractionState';
import { isLargeEditorSelection } from '../selection/textSelectionOverlayState';
type CodeBlockNodeViewOptions = {
  lazyCodeMirror?: boolean;
  passiveLazyCodeMirror?: boolean;
};

type CodeMirrorSelectionArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export { MAX_LAZY_CODE_BLOCK_LINE_NUMBER_PLACEHOLDER_LINES } from './CodeBlockNodeViewConstants';

export class CodeBlockNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  node: Node;
  view: EditorView;
  getPos: () => number | undefined;
  root: Root;
  headerDOM: HTMLElement;
  headerPlaceholderDOM: HTMLElement | null = null;
  headerRendered = false;
  declare update: (node: Node) => boolean;
  declare selectNode: () => void;
  declare deselectNode: () => void;
  declare setSelection: (anchor: number, head: number) => void;
  declare stopEvent: (event: Event) => boolean;
  declare ignoreMutation: (mutation: MutationRecord | { type: 'selection'; target: globalThis.Node }) => boolean;
  declare destroy: () => void;
  declare shouldLazyInitializeCodeMirror: () => boolean;
  declare installLazyPlaceholder: () => void;
  declare cancelPendingLazyCodeMirrorInitialization: () => void;
  declare scheduleLazyCodeMirrorInitialization: () => void;
  declare initializeCodeMirror: () => void;
  declare getHeaderStateKey: (node: Node) => string;
  declare syncThemeCompatibilityAttrs: () => void;
  declare render: () => void;
  declare clearPendingForwardUpdate: () => void;
  declare forwardFocusedCodeMirrorSnapshot: () => void;
  declare rememberCodeMirrorSelectionArrowKey: (event: KeyboardEvent) => void;
  declare clearMirroredOuterSelection: () => void;

  readonly editorDOM: HTMLElement;
  placeholderDOM: HTMLPreElement | null = null;
  lineNumberPlaceholderDOM: HTMLPreElement | null = null;
  cm: CodeMirror | null = null;
  intersectionObserver: IntersectionObserver | null = null;
  readonly languageCompartment = new Compartment();
  readonly readOnlyCompartment = new Compartment();
  readonly lineNumbersCompartment = new Compartment();
  readonly wrapCompartment = new Compartment();
  updating = false;
  language = '';
  pendingLanguage: string | null = null;
  selected = false;
  headerStateKey = '';
  pendingMeasureFrame: number | null = null;
  pendingForwardTimer: number | null = null;
  pendingLazyInitializationTimer: number | null = null;
  pendingLazyInitializationFrame: number | null = null;
  lazyCodeBlockIntersecting = false;
  disposeFontMetricsSync: () => void = () => { };
  unsubscribeSettings: () => void = () => { };
  unsubscribeSelectionSync: () => void = () => { };
  destroyed = false;
  showLineNumbers = selectCodeBlockLineNumbersEnabled(useUnifiedStore.getState());
  lineNumbersStateKey = '';
  wrapStateKey = '';
  collapsedState: boolean | null = null;
  findHighlightStateKey = '[]';
  mirroredOuterSelection = false;
  languageClassName: string | null = null;
  codeMirrorSelectionArrowKey: CodeMirrorSelectionArrowKey | null = null;
  codeMirrorSelectionArrowResetTimer: number | null = null;
  disposeCrossBoundarySelection: () => void = () => { };

  isPasteUpdate(update: ViewUpdate) {
    return update.transactions.some((transaction) => {
      const userEvent = transaction.annotation(Transaction.userEvent);
      return userEvent === 'input.paste' || userEvent?.startsWith('input.paste.');
    });
  }

  readonly clearEditorSelectionOnBlur = (event: FocusEvent) => {
    if (!this.cm) {
      return;
    }
    clearCodeBlockEditorClipboardCapture(this.cm);

    if (this.pendingForwardTimer !== null) {
      this.clearPendingForwardUpdate();
      this.forwardFocusedCodeMirrorSnapshot();
    }

    if (!(event.relatedTarget instanceof globalThis.Node)) {
      return;
    }

    const { main } = this.cm.state.selection;
    if (main.empty) {
      return;
    }

    this.updating = true;
    this.cm.dispatch({
      selection: {
        anchor: main.head,
        head: main.head,
      },
    });
    this.updating = false;
  };

  getOwnerDocument(): Document | null {
    return (
      this.dom.ownerDocument ??
      this.editorDOM.ownerDocument ??
      (this.view.root instanceof Document ? this.view.root : this.view.root.ownerDocument) ??
      null
    );
  }

  getOwnerWindow(): Window | null {
    return this.getOwnerDocument()?.defaultView ?? null;
  }

  constructor(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
    readonly options: CodeBlockNodeViewOptions = {},
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.classList.add(
      'code-block-container',
      'code-block-chrome',
      'el-pre',
      'editor-code-block',
      'md-fences',
      'HyperMD-codeblock',
      'HyperMD-codeblock-bg',
      'cm-line',
      'my-4',
      'rounded-2xl',
      'overflow-hidden',
      'group/code'
    );
    this.syncThemeCompatibilityAttrs();

    this.headerDOM = document.createElement('div');
    this.headerDOM.contentEditable = 'false';
    this.headerDOM.setAttribute('data-no-editor-drag-box', 'true');
    this.dom.appendChild(this.headerDOM);

    this.editorDOM = document.createElement('div');
    this.editorDOM.className = OBSIDIAN_CODE_BLOCK_EDITOR_CLASS_NAME;
    this.dom.appendChild(this.editorDOM);

    this.root = createRoot(this.headerDOM);
    if (this.options.passiveLazyCodeMirror === false) {
      this.installPassiveHeaderPlaceholder();
    } else {
      this.render();
    }
    if (this.shouldLazyInitializeCodeMirror()) {
      this.installLazyPlaceholder();
      return;
    }

    this.initializeCodeMirror();
  }

  readonly activateCodeMirrorFromInteraction = () => {
    this.initializeCodeMirror();
  };

  installPassiveHeaderPlaceholder() {
    this.headerDOM.className = 'code-block-chrome-header';
    this.headerDOM.setAttribute('data-chat-selection-excluded', 'true');
    const language = document.createElement('span');
    language.className = 'code-block-chrome-language code-block-chrome-language-label';
    language.textContent = typeof this.node.attrs.language === 'string'
      ? this.node.attrs.language
      : '';
    this.headerDOM.appendChild(language);
    this.headerPlaceholderDOM = language;
    this.headerStateKey = this.getHeaderStateKey(this.node);
  }

  syncPassiveHeaderPlaceholder() {
    if (!this.headerPlaceholderDOM) return;
    this.headerPlaceholderDOM.textContent = typeof this.node.attrs.language === 'string'
      ? this.node.attrs.language
      : '';
    this.headerStateKey = this.getHeaderStateKey(this.node);
  }

  readonly handleBlockSelectionInteractionChange = () => {
    if (isBlockSelectionInteractionPending(this.view.dom)) {
      this.cancelPendingLazyCodeMirrorInitialization();
      return;
    }
    if (this.lazyCodeBlockIntersecting) {
      this.scheduleLazyCodeMirrorInitialization();
    }
  };

  readonly trackCodeMirrorSelectionKeydown = (event: KeyboardEvent) => {
    if (this.cm) {
      trackCodeBlockEditorClipboardKeydown(event, this.cm);
    }
    this.rememberCodeMirrorSelectionArrowKey(event);
  };

  readonly clearCodeMirrorClipboardCaptureOnKeyup = (event: KeyboardEvent) => {
    if (this.cm && (event.key === 'Control' || event.key === 'Meta')) {
      clearCodeBlockEditorClipboardCapture(this.cm);
    }
  };

  readonly flushCodeMirrorClipboardCut = () => {
    this.clearPendingForwardUpdate();
    this.forwardFocusedCodeMirrorSnapshot();
  };

  readonly syncProseMirrorSelection = () => {
    const nodePos = this.getPos();
    if (nodePos === undefined) {
      this.dom.dataset.pmSelected = 'false';
      this.clearMirroredOuterSelection();
      return;
    }

    const contentFrom = nodePos + 1;
    const contentTo = nodePos + this.node.nodeSize - 1;
    const selectionFrom = Math.max(this.view.state.selection.from, contentFrom);
    const selectionTo = Math.min(this.view.state.selection.to, contentTo);
    const hasSelection = selectionTo > selectionFrom;
    const shouldMirrorOuterSelection = (
      hasSelection
      && !this.cm?.hasFocus
      && !isLargeEditorSelection(this.view.state)
    );

    this.dom.dataset.pmSelected = shouldMirrorOuterSelection ? 'true' : 'false';

    if (!shouldMirrorOuterSelection || this.node.attrs.collapsed) {
      this.clearMirroredOuterSelection();
      return;
    }
    this.initializeCodeMirror();
    if (!this.cm) {
      return;
    }

    const rawText = this.node.textContent ?? '';
    const nextAnchor = mapDocumentOffsetToCodeBlockEditorOffset(rawText, selectionFrom - contentFrom);
    const nextHead = mapDocumentOffsetToCodeBlockEditorOffset(rawText, selectionTo - contentFrom);

    this.updating = true;
    this.cm.dispatch({
      selection: {
        anchor: nextAnchor,
        head: nextHead,
      },
    });
    this.updating = false;
    this.mirroredOuterSelection = true;
  };
}

installCodeBlockNodeViewInitializationMethods(CodeBlockNodeView.prototype);
installCodeBlockNodeViewKeyboardMethods(CodeBlockNodeView.prototype);
installCodeBlockNodeViewLifecycleMethods(CodeBlockNodeView.prototype);
installCodeBlockNodeViewSelectionGeometryMethods(CodeBlockNodeView.prototype);
installCodeBlockNodeViewSelectionSyncMethods(CodeBlockNodeView.prototype);
installCodeBlockNodeViewStateMethods(CodeBlockNodeView.prototype);
