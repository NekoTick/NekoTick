import { EditorSelection, Transaction, type TransactionSpec } from '@codemirror/state';
import {
  EditorView as CodeMirror
} from '@codemirror/view';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import {
  copyCodeMirrorSelection,
  cutCodeMirrorSelection,
} from './codemirror/codeBlockEditorClipboard';

type CodeMirrorSelectionArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

class CodeBlockNodeViewKeyboardMethods {
  getArrowKey(this: any, key: string): CodeMirrorSelectionArrowKey | null {
    return key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight'
      ? key
      : null;
  }

  clearCodeMirrorSelectionArrowKey(this: any) {
    const ownerWindow = this.getOwnerWindow();
    if (ownerWindow && this.codeMirrorSelectionArrowResetTimer !== null) {
      ownerWindow.clearTimeout(this.codeMirrorSelectionArrowResetTimer);
    }
    this.codeMirrorSelectionArrowResetTimer = null;
    this.codeMirrorSelectionArrowKey = null;
  }

  rememberCodeMirrorSelectionArrowKey(this: any, event: KeyboardEvent) {
    const arrowKey = this.getArrowKey(event.key);
    if (!arrowKey) {
      return;
    }

    this.codeMirrorSelectionArrowKey = event.shiftKey ? arrowKey : null;
    const ownerWindow = this.getOwnerWindow();
    if (!ownerWindow || this.codeMirrorSelectionArrowKey === null) {
      return;
    }

    if (this.codeMirrorSelectionArrowResetTimer !== null) {
      ownerWindow.clearTimeout(this.codeMirrorSelectionArrowResetTimer);
    }
    this.codeMirrorSelectionArrowResetTimer = ownerWindow.setTimeout(() => {
      this.codeMirrorSelectionArrowResetTimer = null;
      this.codeMirrorSelectionArrowKey = null;
    }, 750);
  }

  shouldNormalizeCodeMirrorSelectionEdgeLineBreaks(this: any) {
    return this.codeMirrorSelectionArrowKey === 'ArrowUp' ||
      this.codeMirrorSelectionArrowKey === 'ArrowDown';
  }

  filterCodeMirrorSelectionEdgeLineBreaks(this: any,
    transaction: Transaction
  ): Transaction | readonly TransactionSpec[] {
    if (!transaction.selection || !transaction.isUserEvent('select')) {
      return transaction;
    }
    if (!this.shouldNormalizeCodeMirrorSelectionEdgeLineBreaks()) {
      return transaction;
    }

    const selection = transaction.newSelection.main;
    const normalizedSelection = this.normalizeCodeMirrorSelectionEdgeLineBreaks(
      transaction.newDoc,
      selection,
      transaction.startState.selection.main
    );
    if (!normalizedSelection) {
      return transaction;
    }

    const { anchor, head } = normalizedSelection;

    return [
      transaction,
      {
        selection: EditorSelection.single(anchor, head),
        sequential: true,
      },
    ];
  }

  handleCodeMirrorKeydown(this: any, event: KeyboardEvent, cm: CodeMirror) {
    if (!event.isComposing && !event.altKey) {
      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const isCopyShortcut =
        (hasPrimaryModifier && !event.shiftKey && key === 'c') ||
        (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'insert');
      const isCutShortcut =
        (hasPrimaryModifier && !event.shiftKey && key === 'x') ||
        (!event.ctrlKey && !event.metaKey && event.shiftKey && key === 'delete');

      if (isCopyShortcut) {
        return copyCodeMirrorSelection(() => cm, this.view, () => this.node, this.getPos);
      }
      if (isCutShortcut) {
        const didCut = cutCodeMirrorSelection(() => cm, this.view);
        if (didCut) {
          this.flushCodeMirrorClipboardCut();
        }
        return didCut;
      }
    }

    if (
      !event.defaultPrevented &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      cm.state.selection.main.empty
    ) {
      const toolbarState = floatingToolbarKey.getState(this.view.state);
      if (toolbarState?.isVisible) {
        this.view.dispatch(this.view.state.tr.setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE }));
      }
    }

    return false;
  }

}

function installMixinMethods(prototype: object, mixinPrototype: object): void {
  for (const key of Object.getOwnPropertyNames(mixinPrototype)) {
    if (key !== 'constructor') {
      Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(mixinPrototype, key)!);
    }
  }
}

export function installCodeBlockNodeViewKeyboardMethods(prototype: object): void {
  installMixinMethods(prototype, CodeBlockNodeViewKeyboardMethods.prototype);
}
