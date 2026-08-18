import type { VirtualizedBlockHeightEstimator } from '@milkdown/kit/core';
import { layout, prepare, type PreparedText } from '@/lib/text-layout';

interface PreparedVirtualizedParagraph {
  font: string;
  letterSpacing: number;
  prepared: PreparedText;
  text: string;
  whiteSpace: 'normal' | 'pre-wrap';
  wordBreak: 'normal' | 'keep-all';
}

const preparedParagraphs = new WeakMap<object, PreparedVirtualizedParagraph>();

function getPlainParagraphText(node: Parameters<VirtualizedBlockHeightEstimator>[0]): string | null {
  if (node.type.name !== 'paragraph') return null;

  let text = '';
  let supported = true;
  node.forEach((child) => {
    if (child.isText) {
      if (child.marks.length > 0) supported = false;
      text += child.text ?? '';
    } else if (child.type.name === 'hard_break') {
      text += '\n';
    } else {
      supported = false;
    }
  });
  return supported ? text : null;
}

export const estimateNativeVirtualizedBlockHeight: VirtualizedBlockHeightEstimator = (
  node,
  metrics,
) => {
  if (!metrics.editor.closest('[data-markdown-compat-layer="native"]')) return null;
  const text = getPlainParagraphText(node);
  if (text === null) return null;

  const whiteSpace = metrics.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal';
  const wordBreak = metrics.wordBreak === 'keep-all' ? 'keep-all' : 'normal';
  const cached = preparedParagraphs.get(node);
  const prepared = cached
    && cached.text === text
    && cached.font === metrics.font
    && cached.letterSpacing === metrics.letterSpacing
    && cached.whiteSpace === whiteSpace
    && cached.wordBreak === wordBreak
    ? cached.prepared
    : prepare(text || ' ', metrics.font, {
        letterSpacing: metrics.letterSpacing,
        whiteSpace,
        wordBreak,
      });

  if (prepared !== cached?.prepared) {
    preparedParagraphs.set(node, {
      font: metrics.font,
      letterSpacing: metrics.letterSpacing,
      prepared,
      text,
      whiteSpace,
      wordBreak,
    });
  }

  return Math.max(1, layout(
    prepared,
    metrics.availableWidth,
    metrics.lineHeight,
  ).lineCount) * metrics.lineHeight;
};
