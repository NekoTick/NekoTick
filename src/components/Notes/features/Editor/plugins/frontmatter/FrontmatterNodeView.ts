import { Node } from '@milkdown/kit/prose/model';
import { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView as CodeMirror,
  drawSelection,
  type ViewUpdate,
} from '@codemirror/view';
import { translate } from '@/lib/i18n';
import { useUIStore } from '@/stores/uiSlice';
import { codeBlockLanguageLoader } from '../code/codeBlockLanguageLoader';
import {
  bindCodeBlockFontMetricsSync,
  computeCodeBlockChange,
  createCodeBlockEditorTheme,
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

export class FrontmatterNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  node: Node;
  view: EditorView;
  getPos: () => number | undefined;

  private readonly editorDOM: HTMLElement;
  private readonly cm: CodeMirror;
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
  private readonly handleLanguageChange = () => {
    this.updatePlaceholder();
  };

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.classList.add('frontmatter-block-container', 'md-meta-block', 'my-4');

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
    const hasSelection = selectionMirror !== null && !isLargeEditorSelection(this.view.state);

    this.dom.dataset.pmSelected = hasSelection ? 'true' : 'false';

    if (!hasSelection) {
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
    const support = await codeBlockLanguageLoader.load('yaml');
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

    this.updatePlaceholder();
    this.syncFindHighlights();
    this.syncProseMirrorSelection();

    if (this.selected) {
      this.cm.focus();
    }

    return true;
  }

  selectNode() {
    this.selected = true;
    this.dom.classList.add('ProseMirror-selectednode', 'md-focus');
    this.cm.focus();
  }

  deselectNode() {
    this.selected = false;
    this.dom.classList.remove('ProseMirror-selectednode', 'md-focus');
  }

  setSelection(anchor: number, head: number) {
    if (!this.cm.dom.isConnected) {
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
    this.cm.destroy();
    this.dom.remove();
  }
}
