import { $mark, $inputRule } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { toggleMark } from '@milkdown/kit/prose/commands';
import { $command, $remark } from '@milkdown/kit/utils';
import {
  escapeMarkdownHtmlText,
} from '@/lib/notes/markdown/markdownHtmlText';
import {
  createCustomInlineTextProtectionPlugin,
  createDelimitedMarkHandler,
} from '../customInlineMarkStringify';
import { remarkHighlight } from './highlightMarkdownTransforms';
import {
  addMarkdownSyntax,
  applyDelimitedInputRule,
} from '../markdown-syntax/markdownSyntax';

type UndoableInputRule = InputRule & { undoable?: boolean };

export const remarkHighlightPlugin = $remark('remarkHighlight', () => remarkHighlight);

function shouldUseHtmlFallback(text: string, delimiter: string): boolean {
  return text.includes(delimiter) || /[<>&]/.test(text);
}

export const highlightStringifyPlugin = createCustomInlineTextProtectionPlugin({
  highlight: createDelimitedMarkHandler('=='),
  superscript: createDelimitedMarkHandler('^'),
  subscript: createDelimitedMarkHandler('~'),
});

export const highlightMark = $mark('highlight', () => ({
  markdownSyntaxDelimited: true,
  priority: 40,
  parseDOM: [
    { tag: 'mark' },
    { tag: 'span.highlight' },
    { style: 'background-color', getAttrs: (value) => value === 'yellow' ? {} : false }
  ],
  toDOM: () => ['mark', { class: 'highlight' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'highlight',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, '==', 'highlight', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '==', 'highlight', 'close');
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, _mark, node) => {
      const text = node.text || '';
      if (shouldUseHtmlFallback(text, '=')) {
        state.addNode('html', undefined, `<mark>${escapeMarkdownHtmlText(text)}</mark>`);
        return true;
      } else {
        state.withMark(_mark, 'highlight');
      }
    }
  }
}));

export const highlightInputRule = $inputRule(() => {
  const rule = new InputRule(
    /(?<!=)==([^=]+)==$/,
    (state, match, start, end) => {
      const text = match[1];
      if (!text) return null;
      
      return applyDelimitedInputRule(state, match, start, end, 'highlight');
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});

export const toggleHighlightCommand = $command('toggleHighlight', () => () => {
  return (state: any, dispatch?: ((tr: any) => void) | null) => {
    const markType = state.schema.marks.highlight;
    if (!markType) return false;
    return toggleMark(markType)(state, dispatch);
  };
});

export const superscriptMark = $mark('superscript', () => ({
  markdownSyntaxDelimited: true,
  priority: 40,
  parseDOM: [
    { tag: 'sup' },
    { tag: 'span.superscript' }
  ],
  toDOM: () => ['sup', { class: 'superscript' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'superscript',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, '^', 'superscript', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '^', 'superscript', 'close');
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'superscript',
    runner: (state, _mark, node) => {
      const text = node.text || '';
      if (shouldUseHtmlFallback(text, '^')) {
        state.addNode('html', undefined, `<sup>${escapeMarkdownHtmlText(text)}</sup>`);
        return true;
      } else {
        state.withMark(_mark, 'superscript');
      }
    }
  }
}));

export const superscriptInputRule = $inputRule(() => {
  const rule = new InputRule(
    /(?<!\^)\^([^^]+)\^$/,
    (state, match, start, end) => {
      const text = match[1];
      if (!text) return null;
      
      return applyDelimitedInputRule(state, match, start, end, 'superscript');
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});

export const toggleSuperscriptCommand = $command('toggleSuperscript', () => () => {
  return (state: any, dispatch?: ((tr: any) => void) | null) => {
    const markType = state.schema.marks.superscript;
    if (!markType) return false;
    return toggleMark(markType)(state, dispatch);
  };
});

export const subscriptMark = $mark('subscript', () => ({
  markdownSyntaxDelimited: true,
  priority: 40,
  parseDOM: [
    { tag: 'sub' },
    { tag: 'span.subscript' }
  ],
  toDOM: () => ['sub', { class: 'subscript' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'subscript',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, '~', 'subscript', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '~', 'subscript', 'close');
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'subscript',
    runner: (state, _mark, node) => {
      const text = node.text || '';
      if (shouldUseHtmlFallback(text, '~')) {
        state.addNode('html', undefined, `<sub>${escapeMarkdownHtmlText(text)}</sub>`);
        return true;
      } else {
        state.withMark(_mark, 'subscript');
      }
    }
  }
}));

export const subscriptInputRule = $inputRule(() => {
  const rule = new InputRule(
    /(?<!~)~([^~\s][^~]*[^~\s]|[^~\s])~(?!~)$/,
    (state, match, start, end) => {
      const text = match[1];
      if (!text) return null;
      
      return applyDelimitedInputRule(state, match, start, end, 'subscript');
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});

export const toggleSubscriptCommand = $command('toggleSubscript', () => () => {
  return (state: any, dispatch?: ((tr: any) => void) | null) => {
    const markType = state.schema.marks.subscript;
    if (!markType) return false;
    return toggleMark(markType)(state, dispatch);
  };
});

export const highlightPlugin = [
  remarkHighlightPlugin,
  highlightStringifyPlugin,
  highlightMark,
  highlightInputRule,
  toggleHighlightCommand,
  superscriptMark,
  superscriptInputRule,
  toggleSuperscriptCommand,
  subscriptMark,
  subscriptInputRule,
  toggleSubscriptCommand
];
