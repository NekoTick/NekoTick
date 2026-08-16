import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedGraphNode } from './graphLayout';

function isCombiningMark(codePoint: number): boolean {
  return (codePoint >= 0x300 && codePoint <= 0x36f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
    || codePoint === 0x200c
    || codePoint === 0x200d
    || codePoint === 0x20e3;
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function isWideCharacter(codePoint: number): boolean {
  return (codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2329 && codePoint <= 0x232a)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd);
}

function isNarrowLatinCharacter(codePoint: number): boolean {
  return codePoint === 0x27 || codePoint === 0x2c || codePoint === 0x2e
    || codePoint === 0x3a || codePoint === 0x3b || codePoint === 0x49
    || codePoint === 0x69 || codePoint === 0x6a || codePoint === 0x6c
    || codePoint === 0x72 || codePoint === 0x74 || codePoint === 0x66
    || codePoint === 0x20;
}

function isWideLatinCharacter(codePoint: number): boolean {
  return codePoint === 0x25 || codePoint === 0x26 || codePoint === 0x40
    || codePoint === 0x4d || codePoint === 0x57 || codePoint === 0x6d
    || codePoint === 0x77;
}

export function getGraphLabelWidth(label: string): number {
  let width = 0;
  let index = 0;
  let regionalIndicatorCount = 0;
  let joinNext = false;

  while (index < label.length) {
    const codePoint = label.codePointAt(index)!;
    index += codePoint > 0xffff ? 2 : 1;

    if (isCombiningMark(codePoint)) {
      if (codePoint === 0x200d) joinNext = true;
      if (codePoint === 0x20e3) {
        width += themeGraphTokens.labelWideCharacterWidthPx
          - themeGraphTokens.labelPunctuationCharacterWidthPx;
      }
      continue;
    }
    if (isRegionalIndicator(codePoint)) {
      if (regionalIndicatorCount % 2 === 0) {
        width += themeGraphTokens.labelWideCharacterWidthPx;
      }
      regionalIndicatorCount += 1;
      continue;
    }
    regionalIndicatorCount = 0;
    if (joinNext && isWideCharacter(codePoint)) {
      joinNext = false;
      continue;
    }
    joinNext = false;

    if (isWideCharacter(codePoint)) {
      width += themeGraphTokens.labelWideCharacterWidthPx;
    } else if (isNarrowLatinCharacter(codePoint)) {
      width += themeGraphTokens.labelNarrowCharacterWidthPx;
    } else if (isWideLatinCharacter(codePoint)) {
      width += themeGraphTokens.labelWideLatinCharacterWidthPx;
    } else if (codePoint >= 0x41 && codePoint <= 0x5a) {
      width += themeGraphTokens.labelUppercaseCharacterWidthPx;
    } else if (codePoint >= 0x30 && codePoint <= 0x39) {
      width += themeGraphTokens.labelAverageCharacterWidthPx;
    } else if (codePoint >= 0x61 && codePoint <= 0x7a) {
      width += themeGraphTokens.labelAverageCharacterWidthPx;
    } else if (codePoint < 0x80) {
      width += themeGraphTokens.labelPunctuationCharacterWidthPx;
    } else {
      width += themeGraphTokens.labelAverageCharacterWidthPx;
    }
  }

  return Math.max(
    themeGraphTokens.labelCollisionMinWidthPx,
    width + themeGraphTokens.labelCollisionPaddingXPx * 2,
  );
}

export function getGraphNodeRadius(node: PositionedGraphNode): number {
  return themeGraphTokens.nodeRadiusPx + Math.min(
    themeGraphTokens.nodeDegreeRadiusMaxBonusPx,
    Math.sqrt(node.degree) * themeGraphTokens.nodeDegreeRadiusScalePx,
  );
}

export function getGraphNodeVisualRadius(
  node: PositionedGraphNode,
  prominent = false,
): number {
  const radius = getGraphNodeRadius(node);
  if (!prominent) return radius;
  return Math.max(
    radius * themeGraphTokens.nodeActiveScale,
    themeGraphTokens.currentNodeRingRadiusPx,
  ) + themeGraphTokens.nodeRingWidthPx / 2;
}
