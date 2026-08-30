import { EditorState } from '@codemirror/state';
import {
  EditorView as CodeMirror
} from '@codemirror/view';
import { Node } from '@milkdown/kit/prose/model';
import {
  computeCodeBlockChange,
  mapDocumentOffsetToCodeBlockEditorOffset,
  normalizeCodeBlockEditorText
} from './codemirror';
import { BLOCK_SELECTION_INTERACTION_CHANGE_EVENT } from '../cursor/blockSelectionInteractionState';

class CodeBlockNodeViewLifecycleMethods {
  update(this: any, node: Node) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.clearPendingForwardUpdate();
    this.node = node;
    this.syncThemeCompatibilityAttrs();
    if (!this.cm && this.placeholderDOM) {
      this.placeholderDOM.textContent = node.textContent;
      if (this.lineNumberPlaceholderDOM) {
        this.lineNumberPlaceholderDOM.textContent = this.createLineNumberPlaceholder(node.textContent).textContent;
      }
    }
    this.syncCollapsedState();
    if (!this.headerRendered) {
      this.syncPassiveHeaderPlaceholder();
    } else if (this.getHeaderStateKey(node) !== this.headerStateKey) {
      this.render();
    }
    void this.syncLanguage();

    if (!this.cm) {
      return true;
    }

    const effects = [];
    if (this.view.editable === this.cm.state.readOnly) {
      effects.push(this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(!this.view.editable)));
    }
    const nextLineNumbersStateKey = this.getLineNumbersStateKey(node);
    if (nextLineNumbersStateKey !== this.lineNumbersStateKey) {
      this.lineNumbersStateKey = nextLineNumbersStateKey;
      effects.push(this.lineNumbersCompartment.reconfigure(this.getLineNumberExtensions(node)));
    }

    const nextWrapStateKey = this.getWrapStateKey(node);
    if (nextWrapStateKey !== this.wrapStateKey) {
      this.wrapStateKey = nextWrapStateKey;
      effects.push(this.wrapCompartment.reconfigure(node.attrs.wrap ? [CodeMirror.lineWrapping] : []));
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

    this.syncFindHighlights();
    this.syncProseMirrorSelection();

    if (this.selected) {
      this.cm?.focus();
    }

    return true;
  }

  selectNode(this: any) {
    this.selected = true;
    this.dom.classList.add('ProseMirror-selectednode', 'md-focus');
    if (!this.node.attrs.collapsed) {
      this.initializeCodeMirror();
      this.cm?.focus();
    }
  }

  deselectNode(this: any) {
    this.selected = false;
    this.dom.classList.remove('ProseMirror-selectednode', 'md-focus');
  }

  setSelection(this: any, anchor: number, head: number) {
    this.initializeCodeMirror();
    if (!this.cm || !this.cm.dom.isConnected || this.node.attrs.collapsed) {
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

  stopEvent(this: any, event: Event) {
    const target = event.target;
    if (this.dom.dataset.pmSelected === 'true' || this.dom.classList.contains('editor-block-selected')) {
      if (event.type === 'copy' || event.type === 'cut' || event.type === 'paste') {
        return false;
      }

      if (event instanceof KeyboardEvent) {
        if (event.isComposing) {
          return true;
        }

        const key = event.key.toLowerCase();
        if (
          key === 'delete' ||
          key === 'backspace' ||
          ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === 'insert') ||
          (!(event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && key === 'insert') ||
          key === 'x' ||
          key === 'c'
        ) {
          return false;
        }
      }
    }

    return target instanceof globalThis.Node && this.dom.contains(target);
  }

  ignoreMutation(this: any, mutation: MutationRecord | { type: 'selection'; target: globalThis.Node }) {
    return mutation.type !== 'selection';
  }

  destroy(this: any) {
    this.destroyed = true;
    this.cancelPendingLazyCodeMirrorInitialization();
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.view.dom.removeEventListener(
      BLOCK_SELECTION_INTERACTION_CHANGE_EVENT,
      this.handleBlockSelectionInteractionChange,
    );
    this.clearCodeMirrorSelectionArrowKey();
    this.disposeCrossBoundarySelection();
    this.disposeCrossBoundarySelection = () => { };
    const window = this.getOwnerWindow();
    if (window && this.pendingMeasureFrame !== null) {
      window.cancelAnimationFrame(this.pendingMeasureFrame);
      this.pendingMeasureFrame = null;
    }
    this.clearPendingForwardUpdate();
    this.unsubscribeSettings();
    this.unsubscribeSelectionSync();
    this.disposeFontMetricsSync();
    const root = this.root;
    (this.getOwnerWindow() ?? globalThis).setTimeout(() => root.unmount(), 0);
    if (this.cm) {
      this.cm.dom.removeEventListener('keydown', this.trackCodeMirrorSelectionKeydown, true);
      this.cm.dom.removeEventListener('keyup', this.clearCodeMirrorClipboardCaptureOnKeyup, true);
      this.cm.dom.removeEventListener('blur', this.clearEditorSelectionOnBlur, true);
      this.cm.destroy();
    }
    this.dom.remove();
  }

}

function installMixinMethods(prototype: object, mixinPrototype: object): void {
  for (const key of Object.getOwnPropertyNames(mixinPrototype)) {
    if (key !== 'constructor') {
      Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(mixinPrototype, key)!);
    }
  }
}

export function installCodeBlockNodeViewLifecycleMethods(prototype: object): void {
  installMixinMethods(prototype, CodeBlockNodeViewLifecycleMethods.prototype);
}
