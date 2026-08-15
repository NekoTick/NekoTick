import { $mark, $remark, $inputRule } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { escapeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import { remarkUnderline } from '@/components/common/markdown/colorMarkdown';
import {
  createCustomInlineTextProtectionPlugin,
  createDelimitedMarkHandler,
} from '../customInlineMarkStringify';
import { remarkInlineColorHtmlPlugin, sanitizeCssColorValue } from './colorMarkdownHtml';
import {
  addMarkdownSyntax,
  applyDelimitedInputRule,
} from '../markdown-syntax/markdownSyntax';

type UndoableInputRule = InputRule & { undoable?: boolean };

function createHtmlContainerHandler(
  tag: string,
  getAttributes: (node: any) => string,
) {
  return (node: any, _: unknown, state: any, info: any) => {
    const exit = state.enter(node.type);
    const tracker = state.createTracker(info);
    const open = `<${tag}${getAttributes(node)}>`;
    const close = `</${tag}>`;
    let value = tracker.move(open);
    value += tracker.move(state.containerPhrasing(node, {
      before: value,
      after: close,
      ...tracker.current(),
    }));
    value += tracker.move(close);
    exit();
    return value;
  };
}

const textColorHandler = createHtmlContainerHandler(
  'span',
  (node) => ` style="color: ${sanitizeCssColorValue(node.color) ?? ''}"`,
);
const bgColorHandler = createHtmlContainerHandler(
  'mark',
  (node) => ` style="background-color: ${sanitizeCssColorValue(node.color) ?? ''}"`,
);
const htmlEmphasisHandler = createHtmlContainerHandler('em', () => '');
const htmlStrongHandler = createHtmlContainerHandler('strong', () => '');

export const textColorMark = $mark('textColor', () => ({
  markdownSyntaxDelimited: true,
  priority: 30,
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
      const color = sanitizeCssColorValue(node.color);
      if (!color) {
        state.next(node.children);
        return;
      }
      addMarkdownSyntax(state, `<span style="color: ${color}">`, 'textColor', 'open');
      state.openMark(markType, { color });
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '</span>', 'textColor', 'close');
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => {
      const color = sanitizeCssColorValue(mark.attrs.color);
      if (color) state.withMark(mark, 'textColor', undefined, { color });
    },
  },
}));
export const bgColorMark = $mark('bgColor', () => ({
  markdownSyntaxDelimited: true,
  priority: 30,
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
      const color = sanitizeCssColorValue(node.color);
      if (!color) {
        state.next(node.children);
        return;
      }
      addMarkdownSyntax(state, `<mark style="background-color: ${color}">`, 'bgColor', 'open');
      state.openMark(markType, { color });
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '</mark>', 'bgColor', 'close');
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'bgColor',
    runner: (state, mark) => {
      const color = sanitizeCssColorValue(mark.attrs.color);
      if (color) state.withMark(mark, 'bgColor', undefined, { color });
    },
  },
}));

export const htmlEmphasisMark = $mark('htmlEmphasis', () => ({
  markdownSyntaxDelimited: true,
  parseDOM: [{ tag: 'em[data-markdown-source-tag="em"]' }],
  toDOM: () => ['em', { 'data-markdown-source-tag': 'em' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'htmlEmphasis',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, '<em>', 'htmlEmphasis', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '</em>', 'htmlEmphasis', 'close');
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'htmlEmphasis',
    runner: (state, mark) => {
      state.withMark(mark, 'htmlEmphasis');
    },
  },
}));

export const htmlStrongMark = $mark('htmlStrong', () => ({
  markdownSyntaxDelimited: true,
  parseDOM: [{ tag: 'strong[data-markdown-source-tag="strong"]' }],
  toDOM: () => ['strong', { 'data-markdown-source-tag': 'strong' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'htmlStrong',
    runner: (state, node, markType) => {
      addMarkdownSyntax(state, '<strong>', 'htmlStrong', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '</strong>', 'htmlStrong', 'close');
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'htmlStrong',
    runner: (state, mark) => {
      state.withMark(mark, 'htmlStrong');
    },
  },
}));
export const underlineMark = $mark('underline', () => ({
  markdownSyntaxDelimited: true,
  priority: 40,
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
      addMarkdownSyntax(state, '++', 'underline', 'open');
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
      addMarkdownSyntax(state, '++', 'underline', 'close');
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

      return applyDelimitedInputRule(state, match, start, end, 'underline');
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});
export const remarkUnderlinePlugin = $remark('remarkUnderline', () => remarkUnderline);
export const underlineStringifyPlugin = createCustomInlineTextProtectionPlugin({
  bgColor: bgColorHandler,
  htmlEmphasis: htmlEmphasisHandler,
  htmlStrong: htmlStrongHandler,
  textColor: textColorHandler,
  underline: createDelimitedMarkHandler('++'),
});
export const colorMarksPlugin = [
  remarkInlineColorHtmlPlugin,
  textColorMark,
  bgColorMark,
  htmlEmphasisMark,
  htmlStrongMark,
  remarkUnderlinePlugin,
  underlineStringifyPlugin,
  underlineMark,
  underlineInputRule,
].flat();
