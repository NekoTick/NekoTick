import { selectCodeBlockLineNumbersEnabled } from '@/stores/unified/settings/markdownSettings';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { themeLazyLoadTokens } from '@/styles/themeTokens';
import { EditorState, Prec } from '@codemirror/state';
import {
  EditorView as CodeMirror,
  keymap as codeMirrorKeymap,
  drawSelection,
  lineNumbers,
  type KeyBinding
} from '@codemirror/view';
import { Node } from '@milkdown/kit/prose/model';
import React from 'react';
import {
  codeMirrorFindHighlightExtensions
} from '../find/editorFindCodeMirrorHighlights';
import {
  LAZY_CODE_BLOCK_INITIALIZATION_DELAY_MS,
  MAX_LAZY_CODE_BLOCK_LINE_NUMBER_PLACEHOLDER_LINES,
} from './CodeBlockNodeViewConstants';
import { CodeBlockView } from './CodeBlockView';
import { subscribeCodeBlockSelectionSync } from './codeBlockSelectionSync';
import {
  bindCodeBlockFontMetricsSync,
  createCodeBlockEditorClipboardHandlers,
  createCodeBlockEditorKeymap,
  createCodeBlockEditorTheme,
  normalizeCodeBlockEditorText
} from './codemirror';
import {
  BLOCK_SELECTION_INTERACTION_CHANGE_EVENT,
  isBlockSelectionInteractionPending,
} from '../cursor/blockSelectionInteractionState';

class CodeBlockNodeViewInitializationMethods {
  shouldLazyInitializeCodeMirror(this: any) {
    return (
      Boolean(this.options.lazyCodeMirror) &&
      typeof window !== 'undefined' &&
      typeof IntersectionObserver !== 'undefined'
    );
  }

  installLazyPlaceholder(this: any) {
    this.dom.dataset.cmLazy = 'true';
    this.editorDOM.classList.add('code-block-lazy-editable');

    if (this.getLineNumberExtensions(this.node).length > 0) {
      this.lineNumberPlaceholderDOM = this.createLineNumberPlaceholder(this.node.textContent);
      this.editorDOM.appendChild(this.lineNumberPlaceholderDOM);
    }

    this.placeholderDOM = document.createElement('pre');
    this.placeholderDOM.className = 'code-block-lazy-preview CodeMirror-code';
    this.placeholderDOM.textContent = this.node.textContent;
    this.editorDOM.appendChild(this.placeholderDOM);
    this.syncCollapsedState();

    this.dom.addEventListener('mousedown', this.activateCodeMirrorFromInteraction);
    this.dom.addEventListener('focusin', this.activateCodeMirrorFromInteraction);

    if (this.options.passiveLazyCodeMirror === false) {
      return;
    }
    this.view.dom.addEventListener(
      BLOCK_SELECTION_INTERACTION_CHANGE_EVENT,
      this.handleBlockSelectionInteractionChange,
    );
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.lazyCodeBlockIntersecting = entries.some((entry) => entry.isIntersecting);
      if (this.lazyCodeBlockIntersecting) {
        this.scheduleLazyCodeMirrorInitialization();
      } else {
        this.cancelPendingLazyCodeMirrorInitialization();
      }
    }, { rootMargin: themeLazyLoadTokens.codeBlockRootMargin });
    this.intersectionObserver.observe(this.dom);
  }

  cancelPendingLazyCodeMirrorInitialization(this: any) {
    const ownerWindow = this.getOwnerWindow();
    if (this.pendingLazyInitializationTimer !== null) {
      ownerWindow?.clearTimeout(this.pendingLazyInitializationTimer);
      this.pendingLazyInitializationTimer = null;
    }
    if (this.pendingLazyInitializationFrame !== null) {
      ownerWindow?.cancelAnimationFrame(this.pendingLazyInitializationFrame);
      this.pendingLazyInitializationFrame = null;
    }
  }

  scheduleLazyCodeMirrorInitialization(this: any) {
    if (
      this.cm
      || isBlockSelectionInteractionPending(this.view.dom)
      || this.pendingLazyInitializationTimer !== null
      || this.pendingLazyInitializationFrame !== null
    ) {
      return;
    }
    const ownerWindow = this.getOwnerWindow();
    if (!ownerWindow) {
      this.initializeCodeMirror();
      return;
    }
    this.pendingLazyInitializationTimer = ownerWindow.setTimeout(() => {
      this.pendingLazyInitializationTimer = null;
      const scrollRoot = this.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
      const scrollLeft = scrollRoot?.scrollLeft ?? ownerWindow.scrollX;
      const scrollTop = scrollRoot?.scrollTop ?? ownerWindow.scrollY;
      this.pendingLazyInitializationFrame = ownerWindow.requestAnimationFrame(() => {
        this.pendingLazyInitializationFrame = ownerWindow.requestAnimationFrame(() => {
          this.pendingLazyInitializationFrame = null;
          if (
            this.destroyed
            || !this.lazyCodeBlockIntersecting
            || isBlockSelectionInteractionPending(this.view.dom)
          ) return;
          const currentScrollLeft = scrollRoot?.scrollLeft ?? ownerWindow.scrollX;
          const currentScrollTop = scrollRoot?.scrollTop ?? ownerWindow.scrollY;
          if (currentScrollLeft !== scrollLeft || currentScrollTop !== scrollTop) {
            this.scheduleLazyCodeMirrorInitialization();
            return;
          }
          const blockRect = this.dom.getBoundingClientRect();
          const scrollRootRect = scrollRoot?.getBoundingClientRect();
          const viewportTop = scrollRootRect?.top ?? 0;
          const viewportBottom = scrollRootRect?.bottom ?? ownerWindow.innerHeight;
          const verticalRootMargin = Number.parseFloat(themeLazyLoadTokens.codeBlockRootMargin) || 0;
          if (
            blockRect.bottom >= viewportTop - verticalRootMargin
            && blockRect.top <= viewportBottom + verticalRootMargin
          ) {
            this.initializeCodeMirror();
          }
        });
      });
    }, LAZY_CODE_BLOCK_INITIALIZATION_DELAY_MS);
  }

  readonly activateCodeMirrorFromInteraction = () => this.initializeCodeMirror();

  initializeCodeMirror(this: any) {
    this.cancelPendingLazyCodeMirrorInitialization();
    if (this.cm) {
      return;
    }

    if (!this.headerRendered) {
      this.render();
    }

    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.view.dom.removeEventListener(
      BLOCK_SELECTION_INTERACTION_CHANGE_EVENT,
      this.handleBlockSelectionInteractionChange,
    );
    this.dom.removeEventListener('mousedown', this.activateCodeMirrorFromInteraction);
    this.dom.removeEventListener('focusin', this.activateCodeMirrorFromInteraction);
    this.placeholderDOM?.remove();
    this.placeholderDOM = null;
    this.lineNumberPlaceholderDOM?.remove();
    this.lineNumberPlaceholderDOM = null;
    this.editorDOM.classList.remove('code-block-lazy-editable');
    delete this.dom.dataset.cmLazy;

    this.cm = new CodeMirror({
      root: this.view.root,
      parent: this.editorDOM,
      state: EditorState.create({
        doc: normalizeCodeBlockEditorText(this.node.textContent),
        extensions: [
          this.readOnlyCompartment.of(EditorState.readOnly.of(!this.view.editable)),
          this.languageCompartment.of([]),
          this.lineNumbersCompartment.of(this.getLineNumberExtensions(this.node)),
          this.wrapCompartment.of(this.node.attrs.wrap ? [CodeMirror.lineWrapping] : []),
          drawSelection(),
          ...codeMirrorFindHighlightExtensions,
          ...createCodeBlockEditorTheme(),
          Prec.highest(CodeMirror.domEventHandlers({
            ...this.createClipboardHandlers(),
            keydown: (event, cm) => this.handleCodeMirrorKeydown(event, cm),
          })),
          codeMirrorKeymap.of(this.createKeymap()),
          EditorState.changeFilter.of(() => this.view.editable),
          EditorState.transactionFilter.of((transaction) => this.filterCodeMirrorSelectionEdgeLineBreaks(transaction)),
          CodeMirror.updateListener.of((update) => this.forwardUpdate(update)),
        ],
      }),
    });
    this.lineNumbersStateKey = this.getLineNumbersStateKey(this.node);
    this.wrapStateKey = this.getWrapStateKey(this.node);
    this.cm.dom.addEventListener('keydown', this.trackCodeMirrorSelectionKeydown, true);
    this.cm.dom.addEventListener('keyup', this.clearCodeMirrorClipboardCaptureOnKeyup, true);
    this.cm.dom.addEventListener('blur', this.clearEditorSelectionOnBlur, true);
    this.disposeFontMetricsSync = bindCodeBlockFontMetricsSync(
      this.dom.ownerDocument,
      () => this.scheduleMeasure()
    );
    this.unsubscribeSettings = useUnifiedStore.subscribe((state, previousState) => {
      const nextShowLineNumbers = selectCodeBlockLineNumbersEnabled(state);
      const previousShowLineNumbers = selectCodeBlockLineNumbersEnabled(previousState);

      if (nextShowLineNumbers === previousShowLineNumbers) {
        return;
      }

      this.showLineNumbers = nextShowLineNumbers;
      const nextLineNumbersStateKey = this.getLineNumbersStateKey(this.node);
      if (nextLineNumbersStateKey === this.lineNumbersStateKey) {
        return;
      }

      this.lineNumbersStateKey = nextLineNumbersStateKey;
      this.cm?.dispatch({
        effects: this.lineNumbersCompartment.reconfigure(this.getLineNumberExtensions(this.node)),
      });
      this.scheduleMeasure();
    });
    this.unsubscribeSelectionSync = subscribeCodeBlockSelectionSync(
      this.dom.ownerDocument,
      this.syncProseMirrorSelection
    );

    this.syncCollapsedState();
    this.syncFindHighlights();
    this.syncProseMirrorSelection();
    this.syncE2ECodeMirrorSelection();
    void this.syncLanguage();
  }

  getLineNumberExtensions(this: any, node: Node) {
    return this.showLineNumbers && node.attrs.lineNumbers !== false ? [lineNumbers()] : [];
  }

  createLineNumberPlaceholder(this: any, text: string) {
    const lineNumbers = document.createElement('pre');
    lineNumbers.className = 'code-block-lazy-line-numbers';
    let lineCount = 1;
    let searchFrom = 0;
    while (lineCount < MAX_LAZY_CODE_BLOCK_LINE_NUMBER_PLACEHOLDER_LINES) {
      const nextNewline = text.indexOf('\n', searchFrom);
      if (nextNewline === -1) {
        break;
      }
      lineCount += 1;
      searchFrom = nextNewline + 1;
    }
    lineNumbers.textContent = Array.from({ length: lineCount }, (_value, index) => String(index + 1)).join('\n');
    return lineNumbers;
  }

  getLineNumbersStateKey(this: any, node: Node) {
    return `${this.showLineNumbers ? '1' : '0'}:${node.attrs.lineNumbers !== false ? '1' : '0'}`;
  }

  getWrapStateKey(this: any, node: Node) {
    return node.attrs.wrap ? '1' : '0';
  }

  syncThemeCompatibilityAttrs(this: any) {
    const language = typeof this.node.attrs.language === 'string' ? this.node.attrs.language : '';
    this.dom.dataset.language = language;
    this.dom.setAttribute('lang', language);

    if (this.languageClassName) {
      this.dom.classList.remove(this.languageClassName);
      this.languageClassName = null;
    }

    if (language) {
      this.languageClassName = `language-${language}`;
      this.dom.classList.add(this.languageClassName);
    }
  }

  render(this: any) {
    this.headerStateKey = this.getHeaderStateKey(this.node);
    this.headerPlaceholderDOM = null;
    this.headerRendered = true;
    this.root.render(
      React.createElement(CodeBlockView, {
        node: this.node,
        view: this.view,
        getPos: this.getPos,
        getNode: () => this.node,
      })
    );
    this.scheduleMeasure();
  }

  getHeaderStateKey(this: any, node: Node) {
    return JSON.stringify({
      language: node.attrs.language ?? '',
      collapsed: Boolean(node.attrs.collapsed),
    });
  }

  createKeymap(this: any): KeyBinding[] {
    return createCodeBlockEditorKeymap({
      getCodeMirror: () => this.cm ?? undefined,
      view: this.view,
      getNode: () => this.node,
      getPos: this.getPos,
    });
  }

  createClipboardHandlers(this: any) {
    return createCodeBlockEditorClipboardHandlers({
      view: this.view,
      getNode: () => this.node,
      getPos: this.getPos,
      onCut: this.flushCodeMirrorClipboardCut,
    });
  }

}

function installMixinMethods(prototype: object, mixinPrototype: object): void {
  for (const key of Object.getOwnPropertyNames(mixinPrototype)) {
    if (key !== 'constructor') {
      Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(mixinPrototype, key)!);
    }
  }
}

export function installCodeBlockNodeViewInitializationMethods(prototype: object): void {
  installMixinMethods(prototype, CodeBlockNodeViewInitializationMethods.prototype);
}
