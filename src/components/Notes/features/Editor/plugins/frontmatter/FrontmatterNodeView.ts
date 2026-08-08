import { Node } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView as CodeMirror,
  drawSelection,
  type ViewUpdate,
} from '@codemirror/view';
import { translate } from '@/lib/i18n';
import { useUIStore } from '@/stores/uiSlice';
import { focusNoteTitleInputAtEnd } from '../../utils/titleInputDom';
import { codeBlockLanguageLoader } from '../code/codeBlockLanguageLoader';
import {
  bindCodeBlockFontMetricsSync,
  computeCodeBlockChange,
  createCodeBlockEditorTheme,
  mapCodeBlockEditorOffsetToDocumentOffset,
  mapDocumentOffsetToCodeBlockEditorOffset,
  normalizeCodeBlockEditorText,
} from '../code/codemirror';
import {
  codeMirrorFindHighlightExtensions,
} from '../find/editorFindCodeMirrorHighlights';
import { forwardCodeBlockUpdate } from '../code/codeBlockNodeViewUtils';
import { subscribeCodeBlockSelectionSync } from '../code/codeBlockSelectionSync';
import { markEditorUserInput } from '../shared/userInputEvents';
import { isLargeEditorSelection } from '../selection/textSelectionOverlayState';
import { buildFrontmatterFindHighlightRanges, clearMirroredFrontmatterSelection, createFrontmatterClipboardHandlers, createFrontmatterCodeMirrorKeymap, getFrontmatterOwnerWindow, getFrontmatterSelectionMirror, scheduleFrontmatterMeasure, shouldStopFrontmatterEvent, syncFrontmatterFindHighlightRanges } from './FrontmatterNodeViewUtils';
import { FrontmatterPropertiesSession } from './FrontmatterPropertiesSession';

const frontmatterLanguageSupport = codeBlockLanguageLoader.load('yaml');

export class FrontmatterNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  node: Node;
  view: EditorView;
  getPos: () => number | undefined;

  private readonly editorDOM: HTMLElement;
  private readonly cm: CodeMirror;
  private readonly propertiesSession: FrontmatterPropertiesSession;
  private readonly languageCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private updating = false;
  private selected = false;
  private pendingMeasureFrame: number | null = null;
  private readonly disposeFontMetricsSync: () => void;
  private readonly unsubscribeSelectionSync: () => void;
  private readonly unsubscribeLanguagePreference: () => void;
  private destroyed = false;
  private findHighlightStateKey = '[]';
  private mirroredOuterSelection = false;
  private windowBlurSelection: { anchor: number; head: number } | null = null;
  private windowBlurSelectionRestorePending = false;
  private readonly handleLanguageChange = () => {
    this.updatePlaceholder();
  };
  private readonly handleOwnerWindowBlur = () => {
    if (!this.propertiesSession.isSourceMode()) return;
    const { anchor, head } = this.cm.state.selection.main;
    this.windowBlurSelection = { anchor, head };
  };
  private readonly handleOwnerWindowFocus = () => {
    this.windowBlurSelection = null;
  };
  private readonly handleVisualPropertiesMouseDown = (event: MouseEvent) => {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || event.shiftKey
      || this.propertiesSession.isSourceMode()
    ) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element
      && target.closest('button, input, label, .frontmatter-property-chip')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusNoteTitleInputAtEnd(this.dom.ownerDocument);
  };
  private readonly handleVisualPropertiesBlankMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || event.shiftKey
      || this.propertiesSession.isSourceMode()
      || !(target instanceof Element && target.contains(this.dom))
    ) {
      return;
    }

    const blockRect = this.dom.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    let gapBottom = blockRect.bottom;
    for (
      let sibling = this.dom.nextElementSibling;
      sibling;
      sibling = sibling.nextElementSibling
    ) {
      const siblingRect = sibling.getBoundingClientRect();
      if (siblingRect.height > 0 && siblingRect.top > blockRect.bottom + 1) {
        gapBottom = siblingRect.top;
        break;
      }
    }
    const isInsideBottomGap = (
      event.clientY >= blockRect.bottom
      && event.clientY < gapBottom
    );
    const isInsideLeftGutter = (
      event.clientX >= targetRect.left
      && event.clientX < blockRect.left
      && event.clientY >= blockRect.top
      && event.clientY <= blockRect.bottom
    );
    if (!isInsideBottomGap && !isInsideLeftGutter) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    focusNoteTitleInputAtEnd(this.dom.ownerDocument);
  };

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.classList.add('frontmatter-block-container', 'md-meta-block');

    this.editorDOM = document.createElement('div');
    this.editorDOM.className = 'frontmatter-block-editor';
    this.dom.appendChild(this.editorDOM);

    this.cm = new CodeMirror({
      root: this.view.root,
      parent: this.editorDOM,
      state: EditorState.create({
        doc: normalizeCodeBlockEditorText(this.node.textContent),
        extensions: [
          this.readOnlyCompartment.of(EditorState.readOnly.of(!this.view.editable)),
          this.languageCompartment.of([]),
          CodeMirror.lineWrapping,
          drawSelection(),
          ...codeMirrorFindHighlightExtensions,
          ...createCodeBlockEditorTheme(),
          createFrontmatterCodeMirrorKeymap({
            getCodeMirror: () => this.cm,
            getNode: () => this.node,
            getPos: this.getPos,
            view: this.view,
          }),
          CodeMirror.domEventHandlers(createFrontmatterClipboardHandlers({
            getNode: () => this.node,
            getPos: this.getPos,
            view: this.view,
          })),
          EditorState.changeFilter.of(() => this.view.editable),
          CodeMirror.updateListener.of(this.handleUpdate),
        ],
      }),
    });
    this.propertiesSession = new FrontmatterPropertiesSession({
      dom: this.dom,
      editorDOM: this.editorDOM,
      editable: this.view.editable,
      rawText: normalizeCodeBlockEditorText(this.node.textContent),
      onChange: this.handlePropertiesChange,
      onSourceModeShown: () => {
        this.scheduleMeasure();
        this.updating = true;
        const end = this.cm.state.doc.length;
        this.cm.dispatch({
          selection: {
            anchor: end,
            head: end,
          },
        });
        this.updating = false;
        this.mirroredOuterSelection = false;
        this.cm.focus();
        const ownerWindow = getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view);
        ownerWindow?.queueMicrotask(() => {
          if (!this.destroyed && this.propertiesSession.isSourceMode()) this.cm.focus();
        });

        const nodePos = this.getPos();
        if (nodePos === undefined) return;
        const documentEnd = nodePos + 1 + mapCodeBlockEditorOffsetToDocumentOffset(
          this.node.textContent ?? '',
          end,
        );
        if (
          this.view.state.selection.from === documentEnd
          && this.view.state.selection.to === documentEnd
        ) return;
        const tr = this.view.state.tr.setSelection(
          TextSelection.create(this.view.state.doc, documentEnd),
        );
        this.view.dispatch(tr);
      },
    });
    this.dom.addEventListener('mousedown', this.handleVisualPropertiesMouseDown);
    this.dom.ownerDocument.defaultView?.addEventListener(
      'mousedown',
      this.handleVisualPropertiesBlankMouseDown,
      true,
    );

    this.disposeFontMetricsSync = bindCodeBlockFontMetricsSync(
      this.dom.ownerDocument,
      () => this.scheduleMeasure()
    );
    this.unsubscribeSelectionSync = subscribeCodeBlockSelectionSync(
      this.dom.ownerDocument,
      this.syncProseMirrorSelection
    );
    this.unsubscribeLanguagePreference = useUIStore.subscribe((state, previousState) => {
      if (state.languagePreference !== previousState.languagePreference) {
        this.updatePlaceholder();
      }
    });
    getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view)?.addEventListener(
      'languagechange',
      this.handleLanguageChange
    );
    getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view)?.addEventListener(
      'blur',
      this.handleOwnerWindowBlur,
    );
    getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view)?.addEventListener(
      'focus',
      this.handleOwnerWindowFocus,
    );

    this.updatePlaceholder();
    this.syncFindHighlights();
    void this.syncLanguage();
  }

  private syncFindHighlights() {
    this.syncFindHighlightRanges(
      buildFrontmatterFindHighlightRanges(this.view, this.node, this.getPos()),
    );
  }

  private syncFindHighlightRanges(ranges: ReturnType<typeof buildFrontmatterFindHighlightRanges>) {
    const nextFindHighlightStateKey = JSON.stringify(ranges);
    if (nextFindHighlightStateKey === this.findHighlightStateKey) {
      return;
    }

    this.findHighlightStateKey = nextFindHighlightStateKey;
    syncFrontmatterFindHighlightRanges(this.cm, ranges);
  }

  private readonly syncProseMirrorSelection = () => {
    const nodePos = this.getPos();
    const selectionMirror = getFrontmatterSelectionMirror(this.view, this.node, nodePos);
    const shouldMirrorOuterSelection = (
      selectionMirror !== null
      && !this.cm.hasFocus
      && !isLargeEditorSelection(this.view.state)
    );

    this.dom.dataset.pmSelected = shouldMirrorOuterSelection ? 'true' : 'false';

    if (!shouldMirrorOuterSelection) {
      this.clearMirroredOuterSelection();
      return;
    }

    if (this.cm.hasFocus) {
      return;
    }

    this.updating = true;
    this.cm.dispatch({
      selection: {
        anchor: selectionMirror.anchor,
        head: selectionMirror.head,
      },
    });
    this.updating = false;
    this.mirroredOuterSelection = true;
  };

  private clearMirroredOuterSelection() {
    this.updating = true;
    this.mirroredOuterSelection = clearMirroredFrontmatterSelection(this.cm, this.mirroredOuterSelection);
    this.updating = false;
  }

  private handleUpdate = (update: ViewUpdate) => {
    this.updatePlaceholder();

    if (
      this.windowBlurSelection
      && update.selectionSet
      && !update.docChanged
      && !this.updating
    ) {
      if (!this.windowBlurSelectionRestorePending) {
        this.windowBlurSelectionRestorePending = true;
        const selection = this.windowBlurSelection;
        const restoreSelection = () => {
          this.windowBlurSelectionRestorePending = false;
          if (this.destroyed || this.windowBlurSelection !== selection) return;
          const length = this.cm.state.doc.length;
          const anchor = Math.max(0, Math.min(selection.anchor, length));
          const head = Math.max(0, Math.min(selection.head, length));
          const current = this.cm.state.selection.main;
          if (current.anchor === anchor && current.head === head) return;
          this.updating = true;
          this.cm.dispatch({ selection: { anchor, head } });
          this.updating = false;
        };
        const ownerWindow = getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view);
        if (ownerWindow) ownerWindow.queueMicrotask(restoreSelection);
        else queueMicrotask(restoreSelection);
      }
      return;
    }

    if (
      this.updating ||
      (!this.cm.hasFocus && !(this.mirroredOuterSelection && update.docChanged))
    ) {
      return;
    }

    const tr = forwardCodeBlockUpdate(update, this.view, this.getPos);
    if (tr) {
      if (update.docChanged) {
        markEditorUserInput(this.view);
      }
      this.view.dispatch(tr);
      if (update.docChanged) {
        this.mirroredOuterSelection = false;
      }
    }
  };

  private readonly handlePropertiesChange = (nextText: string) => {
    const nodePos = this.getPos();
    if (nodePos === undefined || !this.view.editable) return;
    const from = nodePos + 1;
    const to = nodePos + this.node.nodeSize - 1;
    const tr = nextText
      ? this.view.state.tr.replaceWith(from, to, this.view.state.schema.text(nextText))
      : this.view.state.tr.delete(from, to);
    markEditorUserInput(this.view);
    this.view.dispatch(tr);
  };

  private updatePlaceholder() {
    this.dom.dataset.empty = this.cm.state.doc.length === 0 ? 'true' : 'false';
    this.dom.dataset.placeholder = translate('editor.frontmatterPlaceholder');
  }

  private scheduleMeasure() {
    if (this.destroyed) {
      return;
    }

    scheduleFrontmatterMeasure({
      cm: this.cm,
      dom: this.dom,
      editorDOM: this.editorDOM,
      pendingMeasureFrame: this.pendingMeasureFrame,
      setPendingMeasureFrame: (frame) => {
        this.pendingMeasureFrame = frame;
      },
      view: this.view,
    });
  }

  private async syncLanguage() {
    const support = await frontmatterLanguageSupport;
    if (this.destroyed) {
      return;
    }

    this.cm.dispatch({
      effects: this.languageCompartment.reconfigure(support ? [support] : []),
    });
    this.scheduleMeasure();
  }

  update(node: Node) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;

    const effects = [];
    if (this.view.editable === this.cm.state.readOnly) {
      effects.push(this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(!this.view.editable)));
    }
    if (effects.length > 0) {
      this.cm.dispatch({ effects });
      this.scheduleMeasure();
    }

    const nextText = normalizeCodeBlockEditorText(node.textContent);
    const change = computeCodeBlockChange(this.cm.state.doc.toString(), nextText);
    if (change) {
      this.updating = true;
      this.cm.dispatch({
        changes: {
          from: change.from,
          to: change.to,
          insert: change.text,
        },
      });
      this.updating = false;
      this.scheduleMeasure();
    }
    this.propertiesSession.update(nextText, this.view.editable);

    this.updatePlaceholder();
    this.syncFindHighlights();
    this.syncProseMirrorSelection();

    if (this.selected && this.propertiesSession.isSourceMode()) {
      this.cm.focus();
    }

    return true;
  }

  selectNode() {
    this.selected = true;
    this.dom.classList.add('ProseMirror-selectednode', 'md-focus');
    if (this.propertiesSession.isSourceMode()) this.cm.focus();
  }

  deselectNode() {
    this.selected = false;
    this.dom.classList.remove('ProseMirror-selectednode', 'md-focus');
  }

  setSelection(anchor: number, head: number) {
    if (!this.cm.dom.isConnected || !this.propertiesSession.isSourceMode()) {
      return;
    }

    const rawText = this.node.textContent ?? '';
    const nextAnchor = mapDocumentOffsetToCodeBlockEditorOffset(rawText, anchor);
    const nextHead = mapDocumentOffsetToCodeBlockEditorOffset(rawText, head);

    this.updating = true;
    this.cm.focus();
    this.cm.dispatch({
      selection: {
        anchor: nextAnchor,
        head: nextHead,
      },
    });
    this.updating = false;
  }

  stopEvent(event: Event) {
    return shouldStopFrontmatterEvent(this.dom, event);
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: globalThis.Node }) {
    return mutation.type !== 'selection';
  }

  destroy() {
    this.destroyed = true;
    const window = getFrontmatterOwnerWindow(this.dom, this.editorDOM, this.view);
    if (window && this.pendingMeasureFrame !== null) {
      window.cancelAnimationFrame(this.pendingMeasureFrame);
      this.pendingMeasureFrame = null;
    }
    this.disposeFontMetricsSync();
    this.unsubscribeSelectionSync();
    this.unsubscribeLanguagePreference();
    window?.removeEventListener('languagechange', this.handleLanguageChange);
    window?.removeEventListener('blur', this.handleOwnerWindowBlur);
    window?.removeEventListener('focus', this.handleOwnerWindowFocus);
    this.dom.removeEventListener('mousedown', this.handleVisualPropertiesMouseDown);
    this.dom.ownerDocument.defaultView?.removeEventListener(
      'mousedown',
      this.handleVisualPropertiesBlankMouseDown,
      true,
    );
    this.propertiesSession.destroy();
    this.cm.destroy();
    this.dom.remove();
  }
}
