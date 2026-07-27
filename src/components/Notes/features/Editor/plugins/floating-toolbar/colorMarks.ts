import { $mark, $remark, $inputRule } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { escapeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import { remarkUnderline } from '@/components/common/markdown/colorMarkdown';
import {
  createCustomInlineTextProtectionPlugin,
  createDelimitedMarkHandler,
} from '../customInlineMarkStringify';
import { remarkInlineColorHtmlPlugin, sanitizeCssColorValue } from './colorMarkdownHtml';

type UndoableInputRule = InputRule & { undoable?: boolean };

export const textColorMark = $mark('textColor', () => ({
  attrs: {
    color: { default: null },
  },
  parseDOM: [
    {
      style: 'color',
      getAttrs: (value) => {
        const color = sanitizeCssColorValue(value);
        if (color) {
          return { color };
        }
        return false;
      },
    },
    {
      tag: 'span[data-text-color]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          const color = sanitizeCssColorValue(dom.getAttribute('data-text-color'));
          return color ? { color } : false;
        }
        return false;
      },
    },
  ],
  toDOM: (mark) => {
    const color = sanitizeCssColorValue(mark.attrs.color);
    return [
      'span',
      {
        ...(color ? {
          'data-text-color': color,
          style: `color: ${color} !important; -webkit-text-fill-color: ${color} !important`,
        } : {}),
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'textColor',
    runner: (state, node, markType) => {
      state.openMark(markType, { color: node.color ?? null });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark, node) => {
      const color = sanitizeCssColorValue(mark.attrs.color);
      const text = node.text;
      if (!color || !text) return;
      state.addNode('html', undefined, `<span style="color: ${color}">${escapeMarkdownHtmlText(text)}</span>`);
      return true;
    },
  },
}));
export const bgColorMark = $mark('bgColor', () => ({
  attrs: {
    color: { default: null },
  },
  parseDOM: [
    {
      style: 'background-color',
      getAttrs: (value) => {
        const color = sanitizeCssColorValue(value);
        if (color && color !== 'transparent') {
          return { color };
        }
        return false;
      },
    },
    {
      tag: 'span[data-bg-color]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          const color = sanitizeCssColorValue(dom.getAttribute('data-bg-color'));
          return color ? { color } : false;
        }
        return false;
      },
    },
    {
      tag: 'mark[data-bg-color]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          const color = sanitizeCssColorValue(dom.getAttribute('data-bg-color'));
          return color ? { color } : false;
        }
        return false;
      },
    },
  ],
  toDOM: (mark) => {
    const color = sanitizeCssColorValue(mark.attrs.color);
    return [
      'mark',
      {
        ...(color
          ? {
              'data-bg-color': color,
              style: `--vlaina-bg-color-mark-bg: ${color}; background-color: var(--vlaina-bg-color-mark-bg) !important;`,
            }
          : {}),
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'bgColor',
    runner: (state, node, markType) => {
      state.openMark(markType, { color: node.color ?? null });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'bgColor',
    runner: (state, mark, node) => {
      const color = sanitizeCssColorValue(mark.attrs.color);
      const text = node.text;
      if (!color || !text) return;
      state.addNode('html', undefined, `<mark style="background-color: ${color}">${escapeMarkdownHtmlText(text)}</mark>`);
      return true;
    },
  },
}));
export const underlineMark = $mark('underline', () => ({
  parseDOM: [
    { tag: 'u' },
    { tag: 'span.underline' },
    {
      style: 'text-decoration',
      getAttrs: (value) => (value === 'underline' ? {} : false),
    },
  ],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, _mark, node) => {
      const text = node.text || '';
      if (text.includes('+') || /[<>&]/.test(text)) {
        state.addNode('html', undefined, `<u>${escapeMarkdownHtmlText(text)}</u>`);
        return true;
      } else {
        state.withMark(_mark, 'underline');
      }
    },
  },
}));
export const underlineInputRule = $inputRule(() => {
  const rule = new InputRule(
    /(?<!\+)\+\+([^+\s](?:[^+]*?[^+\s])?)\+\+$/,
    (state, match, start, end) => {
      const text = match[1];
      if (!text) return null;

      const { tr, schema } = state;
      const initialStoredMarks = state.storedMarks ?? [];
      const markType = schema.marks.underline;
      if (!markType) return null;

      return tr
        .delete(start, end)
        .insertText(text)
        .addMark(start, start + text.length, markType.create())
        .setStoredMarks(initialStoredMarks);
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});
export const remarkUnderlinePlugin = $remark('remarkUnderline', () => remarkUnderline);
export const underlineStringifyPlugin = createCustomInlineTextProtectionPlugin({
  underline: createDelimitedMarkHandler('++'),
});
export const colorMarksPlugin = [
  remarkInlineColorHtmlPlugin,
  textColorMark,
  bgColorMark,
  remarkUnderlinePlugin,
  underlineStringifyPlugin,
  underlineMark,
  underlineInputRule,
].flat();
