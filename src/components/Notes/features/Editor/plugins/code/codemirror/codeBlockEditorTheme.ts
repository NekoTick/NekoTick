import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, Prec, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, EditorView as CodeMirror, highlightSpecialChars } from '@codemirror/view';
import {
  holdCaretBlink,
  isCaretNavigationKey,
  releaseCaretBlink,
} from '@/lib/ui/caretOverlayStyles';
import { codeBlockHighlightStyle } from './codeBlockHighlightStyle';
import { codeBlockCompatibilityHighlightStyle } from './codeBlockCompatibilityHighlightStyle';
import {
  codeBlockPointerSelectionPlugin,
  resolveCodeBlockCaretPositionAtPointer,
  resolveCodeBlockBlankContentClickPosition,
} from './codeBlockPointerSelection';
import { createCodeBlockEditorBaseTheme } from './codeBlockEditorThemeStyles';
import { codeBlockCaretGeometryPlugin } from './codeBlockCaretGeometry';

export { resolveCodeBlockBlankContentClickPosition } from './codeBlockPointerSelection';

const selectedTextDecoration = Decoration.mark({
  class: 'editor-code-selection-text',
});

const CODE_BLOCK_SELECTION_ACTIVE_CLASS = 'editor-code-selection-active';
const CODE_BLOCK_LINE_CLASS = 'HyperMD-codeblock HyperMD-codeblock-bg cm-hmd-codeblock';
const CODE_BLOCK_BEGIN_LINE_CLASS = `${CODE_BLOCK_LINE_CLASS} HyperMD-codeblock-begin HyperMD-codeblock-begin-bg`;
const CODE_BLOCK_END_LINE_CLASS = `${CODE_BLOCK_LINE_CLASS} HyperMD-codeblock-end HyperMD-codeblock-end-bg`;
const CODE_BLOCK_SINGLE_LINE_CLASS = `${CODE_BLOCK_BEGIN_LINE_CLASS} HyperMD-codeblock-end HyperMD-codeblock-end-bg`;

const codeBlockCaretNavigationActiveViews = new WeakSet<CodeMirror>();

function hasNonEmptySelection(view: CodeMirror): boolean {
  return view.state.selection.ranges.some((range) => !range.empty);
}

function holdCodeBlockCaretBlink(view: CodeMirror): void {
  if (hasNonEmptySelection(view)) {
    releaseCaretBlink(view.dom);
    return;
  }

  holdCaretBlink(view.dom, codeBlockCaretNavigationActiveViews.has(view) ? null : undefined);
}

function syncCodeBlockSelectionActiveClass(view: CodeMirror): void {
  view.dom.classList.toggle(
    CODE_BLOCK_SELECTION_ACTIVE_CLASS,
    hasNonEmptySelection(view)
  );
}

function buildSelectedTextDecorations(selection: EditorSelection) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of selection.ranges) {
    if (range.empty) {
      continue;
    }

    builder.add(range.from, range.to, selectedTextDecoration);
  }

  return builder.finish();
}

const codeBlockSelectedTextField = StateField.define({
  create(state) {
    return buildSelectedTextDecorations(state.selection);
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) {
      return value;
    }

    return buildSelectedTextDecorations(tr.state.selection);
  },
  provide: (field) => CodeMirror.decorations.from(field),
});

function buildCodeBlockLineDecorations(state: { doc: { lines: number; line: (lineNumber: number) => { from: number } } }) {
  const builder = new RangeSetBuilder<Decoration>();
  const lineCount = Math.max(1, state.doc.lines);

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const isFirst = lineNumber === 1;
    const isLast = lineNumber === lineCount;
    const className = isFirst && isLast
      ? CODE_BLOCK_SINGLE_LINE_CLASS
      : isFirst
        ? CODE_BLOCK_BEGIN_LINE_CLASS
        : isLast
          ? CODE_BLOCK_END_LINE_CLASS
          : CODE_BLOCK_LINE_CLASS;

    builder.add(line.from, line.from, Decoration.line({ class: className }));
  }

  return builder.finish();
}

const codeBlockCompatibilityLineField = StateField.define({
  create: buildCodeBlockLineDecorations,
  update(value, tr) {
    if (!tr.docChanged) return value;
    return buildCodeBlockLineDecorations(tr.state);
  },
  provide: (field) => CodeMirror.decorations.from(field),
});

export function createCodeBlockEditorTheme() {
  return [
    syntaxHighlighting(codeBlockHighlightStyle),
    syntaxHighlighting(codeBlockCompatibilityHighlightStyle),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    highlightSpecialChars(),
    Prec.highest(codeBlockSelectedTextField),
    Prec.highest(codeBlockCompatibilityLineField),
    Prec.highest(codeBlockPointerSelectionPlugin),
    Prec.highest(codeBlockCaretGeometryPlugin),
    Prec.highest(CodeMirror.mouseSelectionStyle.of((view, event) => {
      const position = resolveCodeBlockBlankContentClickPosition(view, event);
      if (position === null) {
        return null;
      }

      const startX = event.clientX;
      const startY = event.clientY;

      return {
        get: (nextEvent: MouseEvent) => {
          if (nextEvent.clientX === startX && nextEvent.clientY === startY) {
            return EditorSelection.single(position);
          }

          const currentPosition = resolveCodeBlockCaretPositionAtPointer(view, nextEvent);
          return currentPosition === null
            ? EditorSelection.single(position)
            : EditorSelection.single(position, currentPosition);
        },
        update: () => false,
      };
    })),
    CodeMirror.domEventHandlers({
      keydown(event, view) {
        if (event.isComposing) {
          return false;
        }

        if (isCaretNavigationKey(event)) {
          codeBlockCaretNavigationActiveViews.add(view);
          holdCodeBlockCaretBlink(view);
        }
        return false;
      },
      keyup(event, view) {
        if (event.isComposing) {
          return false;
        }

        if (isCaretNavigationKey(event)) {
          codeBlockCaretNavigationActiveViews.delete(view);
          holdCodeBlockCaretBlink(view);
        }
        return false;
      },
    }),
    CodeMirror.updateListener.of((update) => {
      if (update.focusChanged && !update.view.hasFocus) {
        codeBlockCaretNavigationActiveViews.delete(update.view);
      }
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        holdCodeBlockCaretBlink(update.view);
        syncCodeBlockSelectionActiveClass(update.view);
      }
    }),
    createCodeBlockEditorBaseTheme(CODE_BLOCK_SELECTION_ACTIVE_CLASS),
  ];
}
