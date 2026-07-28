import { expect, test, type Page } from "@playwright/test";
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  clearSelectedNoteBlocks,
  getBlankAreaDragTarget,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByIndexes,
} from "./notesE2E";

type TextClip = {
  height: number;
  label: string;
  left: number;
  top: number;
  width: number;
};

type BlockSelectionLayoutAuditBlock = {
  className: string;
  height: number;
  index: number;
  tagName: string;
  text: string;
  top: number;
};

type BlockSelectionLayoutAuditSnapshot = {
  blocks: BlockSelectionLayoutAuditBlock[];
  selectedControlPositions: Array<{
    className: string;
    position: string;
    selectedText: string;
    tagName: string;
  }>;
};

type SelectedBlockVisualAudit = {
  active: boolean;
  invalidPaintRows: Array<{
    className: string;
    paintHeight: number;
    paintWidth: number;
    tagName: string;
    text: string;
  }>;
  pairGaps: Array<{
    currentClassName: string;
    currentText: string;
    gap: number;
    nextClassName: string;
    nextText: string;
  }>;
  selectedCount: number;
};

const TYPORA_COMPAT_BLOCK_SELECTION_AUDIT_MARKDOWN = [
  '1. YAML Front Matter only partly supported sentinel',
  '',
  '   frontmatter/project metadata can be handled, but generic Typora metadata blocks and block editing are not identical.',
  '',
  '2. Source code mode missing sentinel',
  '',
  '   !Typora one-click source mode sentinel.',
  '',
  '3. span source expansion sentinel',
  '',
  '   We have t*ooltip, node view* and editor behavior, but this is not the same as unified Typora source expansion.',
  '',
  '4. Indented code behavior sentinel',
  '',
  '   Typora documents GFM fenced code only, while CommonMark indented code may still parse.',
  '',
  '<p> HTML paragraph block selection sentinel',
  '                  1. copied recognition sentinel</p>',
  '',
  '连续空格类似于单行换行符，大多数Markdown引擎都会忽略它们。',
  '',
  '默认情况下，Typora将**在编辑视图中保留连续的空格，并在打印或导出时将其忽略。**您可以在首选项面板中更改此选项。',
  '',
  '如果您确实想插入其他Markdown引擎支持的连续空格，则可以',
  '',
  '- 转义空格，`\\`在每个空格之前输入',
  '',
  '- 使用HTML实体                                                                                        ` &nbsp;`。',
  '',
  '**换行**',
  '',
  '',
  '',
  'Markdown提供了插入单个强行换行符的方法：',
  '',
  '- 插入两个空格和一个换行符。',
  '',
  '- `<br/>`直接插入HTML标签。',
  '',
  '几乎所有Markdown引擎都++会将其解析为++输出中的强行换行。',
  '',
  '**段落**',
  '',
  '',
  '',
  '在Markdown中，**两个换行符**表示创建一个新段落，在Typora中~~，当您`Enter`按键时~~，将创建一个新段落。',
  '',
  '',
  '',
  '## 常用快捷键',
  '',
  '',
  '',
  '没有macOS系统的电脑，所以暂未收集。',
  '',
  '<!--vlaina-markdown-blank-l',
  '',
  '<!--vlaina-markdown-blank-line-->',
  '',
  '',
  '',
  '| 功能     | 操作步骤        | Windows       | macOS     |   |',
  '| ------ | ----------- | ------------- | --------- | :----- |',
  '| 一级标题   | 段落→一级标题     | Ctrl+1        | command+1 |   |',
  '| 二级标题   | 段落→二级标题     | Ctrl+2        | command+2 |   |',
  '| 插入表格   | 段落→表格→插入表格  | Ctrl+T        |           |   |',
  '| 代码块    | 段落→代码块      | Ctrl+Shift+K  |           |   |',
  '| 减少缩进   | 段落→缩进→减少缩进  | Ctrl+[        |           |   |',
  '',
  '',
  '',
  '**格式**',
  '',
  '',
  '',
  '| 功能   | 操作步骤    | Windows       | macOS  |',
  '| ---- | ------- | ------------- | ------ |',
  '| 加粗   | 格式→加粗   | Ctrl+B        |        |',
  '| 斜体   | 格式→斜体   | Ctrl+I        |        |',
  '| 代码   | 格式→代码   | Ctrl+Shift+`  |        |',
  '| 清除格式 | 格式→清除格式 | Ctrl+\\\\       |        |',
  '',
  '',
  '',
  '**视图**',
  '',
  '| 功能       | 操作步骤        | Windows      | macOS  |',
  '| -------- | ----------- | ------------ | ------ |',
  '| 显示/隐藏侧边栏 | 视图→显示/隐藏侧边栏 | Ctrl+Shift+L |        |',
  '| 源代码模式    | 视图→源代码模式    | Ctrl+/       |        |',
  '| 放大       | 视图→放大       | Ctrl+Shift+= |        |',
  '',
  '# 概述',
  '',
  '1',
  '',
  '据 GitHub Flavored Markdown（GFM）官方文档介绍，Markdown是由约翰·格鲁伯（John Gruber）在亚伦·斯沃茨（Aaron Swartz）的帮助下开发，并在2004年发布的标记语言。\\\\',
  '其`设计灵感主要来源于纯文本电子邮件的格式，目标是让人们能够使用易读、易写的纯文本格式编写文档。\\\\',
  '简单点说，Markdown就是由一些简单的符号（如*/-> [] （）#）组成的用于排版的标记语言，其最重要的特点就是可读性强。',
  '',
  '',
  '',
  '目前最流行的扩展语法是GitHub Flavored Markdown，简称GFM。',
  '',
  '# 标题',
  '',
  '标题支持使用两种标记：**底线（-/=）和**左侧#',
  '',
  '底线方式 sentinel',
  '---------',
  '',
  '```markdown',
  '一级标题',
  '=========',
  '',
  '二级标题',
  '---------',
  '```',
  '',
  '# 一级标题',
  '',
  '二级标题',
  '',
  '---',
  '',
  '```java',
  'String name = "Tom";',
  'int age = 18;',
  '```',
  '',
  '#方式（**推荐**）\\\\',
  '语法说明如下。\\\\',
  '',
  '1. 在行首插入#可标记出标题。\\\\',
  '2. #的个数表示了标题的等级。\\\\',
  '',
  '```markdown',
  '# 一级标题',
  '## 二级标题',
  '####### 七级标题（不支持）',
  '```',
  '',
  '# 段落',
  '',
  '1）**段落内换行**，在结尾使用两个及以上空格加回车。',
  '',
  '```markdown',
  '我就是一段普通的文字。',
  '这段文字需要段内换行，这后面是两个空格  ',
  '这一句话是跟上面属于同一段落。',
  '```',
  '',
  '我就是一段普通的文字。',
  '',
  '这段文字需要段内换行，这后面是两个空格\\\\',
  '这一句话是跟上面属于同一段落。',
  '',
  '- [x] 吃',
  '',
  '- [ ] 玩',
  '  - [x] 吃鱼',
  '  - [ ] 吃瓜',
  '- [x] 睡',
  '',
  '- List direct code audit item',
  '  ```ts',
  '  const typoraCompatDirectCodeSentinel = true;',
  '  ```',
  '- List item after direct code audit.',
  '',
  '> 我是引用的句子。',
  '>',
  '> 引用中使用其他 Markdown 标记[百度](https://baidu.com)',
  '> 第二行，**加粗**和*斜体*也是支持的。',
  '',
  '普通表格',
  '',
  '| 序号 | 标题 | 网址 |',
  '| -- | -- | --- |',
  '| 01 | 博客 | https://cnblogs.com |',
  '| 02 | 百度 | https://baidu.com |',
  '',
  '<ruby>漢<rt>han</rt></ruby> and <kbd>Ctrl</kbd> inline html sentinel.',
  '',
  '[TOC]',
].join('\n');

async function measureBrightTextPixels(page: Page, clip: TextClip) {
  const screenshot = await page.screenshot({
    clip: {
      x: Math.max(0, clip.left),
      y: Math.max(0, clip.top),
      width: Math.max(1, clip.width),
      height: Math.max(1, clip.height),
    },
  });

  return page.evaluate(async ({ imageUrl, label }) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load sampled text screenshot'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create text sample canvas');
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    let blueSelection = 0;
    const total = imageData.width * imageData.height;
    for (let offset = 0; offset < imageData.data.length; offset += 4) {
      const red = imageData.data[offset] ?? 0;
      const green = imageData.data[offset + 1] ?? 0;
      const blue = imageData.data[offset + 2] ?? 0;
      if (red >= 235 && green >= 235 && blue >= 230) bright += 1;
      if (red >= 175 && red <= 205 && green >= 210 && green <= 235 && blue >= 240) blueSelection += 1;
    }
    return {
      label,
      brightRatio: bright / total,
      blueSelectionRatio: blueSelection / total,
      height: imageData.height,
      width: imageData.width,
    };
  }, {
    imageUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
    label: clip.label,
  });
}

async function measureSelectedAtomicBlock(page: Page, selector: string) {
  return page.evaluate(async (targetSelector) => {
    const element = document.querySelector<HTMLElement>(targetSelector);
    if (!element) return null;

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const parsePx = (value: string, fallback = 0) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const afterStyle = getComputedStyle(element, '::after');
    const hasAfterPaint = afterStyle.content !== 'none' &&
      afterStyle.display !== 'none' &&
      afterStyle.position === 'absolute';
    const afterLeft = hasAfterPaint ? parsePx(afterStyle.left) : null;
    const afterRight = hasAfterPaint ? parsePx(afterStyle.right) : null;
    const afterTop = hasAfterPaint ? parsePx(afterStyle.top) : null;
    const afterBottom = hasAfterPaint ? parsePx(afterStyle.bottom) : null;

    return {
      boxShadow: style.boxShadow,
      className: element.className,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      contain: style.getPropertyValue('contain'),
      contentVisibility: style.getPropertyValue('content-visibility'),
      dataValue: element.dataset.value ?? '',
      hasAfterPaint,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      outline: style.outline,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      position: style.position,
      rect: {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      },
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      scrollbarHeight: element.offsetHeight - element.clientHeight,
      text: element.textContent?.trim() ?? '',
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      zIndex: style.zIndex,
      after: hasAfterPaint
        ? {
          bottom: afterBottom,
          left: afterLeft,
          right: afterRight,
          top: afterTop,
          viewportBottom: rect.bottom - (afterBottom ?? 0),
          viewportLeft: rect.left + (afterLeft ?? 0),
          viewportRight: rect.right - (afterRight ?? 0),
          viewportTop: rect.top + (afterTop ?? 0),
        }
        : null,
    };
  }, selector);
}

type AtomicBlockMetrics = NonNullable<Awaited<ReturnType<typeof measureSelectedAtomicBlock>>>;

function expectNoComputedTransition(
  value: { transitionDuration: string; transitionProperty: string },
  label: string
) {
  const durations = value.transitionDuration
    .split(',')
    .map((duration) => duration.trim())
    .filter(Boolean);

  expect(durations.length, JSON.stringify({ label, value }, null, 2)).toBeGreaterThan(0);
  for (const duration of durations) {
    expect(duration, JSON.stringify({ label, value }, null, 2)).toMatch(/^(?:0s|0ms)$/);
  }
  expect(value.transitionProperty, JSON.stringify({ label, value }, null, 2)).not.toContain('background');
  expect(value.transitionProperty, JSON.stringify({ label, value }, null, 2)).not.toContain('box-shadow');
}

function expectSelectedAtomicOutline(metrics: AtomicBlockMetrics, label: string) {
  const outlineWidth = Number.parseFloat(metrics.outlineWidth);
  const outlineOffset = Number.parseFloat(metrics.outlineOffset);
  expect(metrics.outlineStyle, JSON.stringify({ label, metrics }, null, 2)).toBe('solid');
  expect(outlineWidth, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(0);
  expect(outlineOffset, JSON.stringify({ label, metrics }, null, 2)).toBeLessThanOrEqual(0);
  expect(metrics.outlineColor, JSON.stringify({ label, metrics }, null, 2)).not.toBe('rgba(0, 0, 0, 0)');
}

async function expectSelectedAtomicBleedPixels(page: Page, metrics: AtomicBlockMetrics, label: string) {
  expect(metrics.after, `${label} selection fill geometry`).not.toBeNull();
  const after = metrics.after!;
  const leftBleed = metrics.rect.left - after.viewportLeft;
  const rightBleed = after.viewportRight - metrics.rect.right;
  const topBleed = metrics.rect.top - after.viewportTop;
  const bottomBleed = after.viewportBottom - metrics.rect.bottom;
  expect(leftBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);
  expect(rightBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);
  expect(topBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);
  expect(bottomBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);

  const verticalInset = Math.min(8, Math.max(2, (metrics.rect.bottom - metrics.rect.top) / 4));
  const top = Math.max(after.viewportTop + 2, metrics.rect.top + verticalInset);
  const bottom = Math.min(after.viewportBottom - 2, metrics.rect.bottom - verticalInset);
  const height = Math.max(4, bottom - top);
  const width = Math.max(2, Math.min(8, leftBleed - 1, rightBleed - 1));
  const interiorWidth = Math.max(8, Math.min(24, (metrics.rect.right - metrics.rect.left) / 8));
  const horizontalInset = Math.min(24, Math.max(8, (metrics.rect.right - metrics.rect.left) / 4));
  const horizontalLeft = Math.max(after.viewportLeft + 2, metrics.rect.left + horizontalInset);
  const horizontalRight = Math.min(after.viewportRight - 2, metrics.rect.right - horizontalInset);
  const horizontalWidth = Math.max(8, Math.min(96, horizontalRight - horizontalLeft));
  const verticalHeight = Math.max(2, Math.min(8, topBleed - 1, bottomBleed - 1));

  const leftSample = await measureBrightTextPixels(page, {
    height,
    label: `${label} left selection bleed`,
    left: after.viewportLeft + 1,
    top,
    width,
  });
  const rightSample = await measureBrightTextPixels(page, {
    height,
    label: `${label} right selection bleed`,
    left: metrics.rect.right + 1,
    top,
    width,
  });
  const leftInteriorSample = await measureBrightTextPixels(page, {
    height,
    label: `${label} left interior selection fill`,
    left: metrics.rect.left + 4,
    top,
    width: interiorWidth,
  });
  const rightInteriorSample = await measureBrightTextPixels(page, {
    height,
    label: `${label} right interior selection fill`,
    left: metrics.rect.right - interiorWidth - 4,
    top,
    width: interiorWidth,
  });
  const topSample = await measureBrightTextPixels(page, {
    height: verticalHeight,
    label: `${label} top selection bleed`,
    left: horizontalLeft,
    top: after.viewportTop + 1,
    width: horizontalWidth,
  });
  const bottomSample = await measureBrightTextPixels(page, {
    height: verticalHeight,
    label: `${label} bottom selection bleed`,
    left: horizontalLeft,
    top: metrics.rect.bottom + 1,
    width: horizontalWidth,
  });

  expect(leftSample.blueSelectionRatio, JSON.stringify({ label, metrics, leftSample }, null, 2)).toBeGreaterThan(0.35);
  expect(rightSample.blueSelectionRatio, JSON.stringify({ label, metrics, rightSample }, null, 2)).toBeGreaterThan(0.35);
  expect(leftInteriorSample.blueSelectionRatio, JSON.stringify({ label, metrics, leftInteriorSample }, null, 2)).toBeGreaterThan(0.35);
  expect(rightInteriorSample.blueSelectionRatio, JSON.stringify({ label, metrics, rightInteriorSample }, null, 2)).toBeGreaterThan(0.35);
  expect(topSample.blueSelectionRatio, JSON.stringify({ label, metrics, topSample }, null, 2)).toBeGreaterThan(0.35);
  expect(bottomSample.blueSelectionRatio, JSON.stringify({ label, metrics, bottomSample }, null, 2)).toBeGreaterThan(0.35);
}

async function expectSelectedAtomicSurfacePixels(page: Page, metrics: AtomicBlockMetrics, label: string) {
  expect(metrics.after, `${label} selection fill geometry`).not.toBeNull();
  const after = metrics.after!;
  const leftBleed = metrics.rect.left - after.viewportLeft;
  const rightBleed = after.viewportRight - metrics.rect.right;
  const fillHeight = after.viewportBottom - after.viewportTop;
  const fillWidth = after.viewportRight - after.viewportLeft;
  expect(leftBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);
  expect(rightBleed, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(1);
  expect(fillHeight, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(8);
  expect(fillWidth, JSON.stringify({ label, metrics }, null, 2)).toBeGreaterThan(8);

  const verticalSampleHeight = Math.max(2, Math.min(8, (fillHeight - 2) / 4));
  const horizontalInset = Math.min(24, Math.max(8, fillWidth / 4));
  const horizontalLeft = Math.max(after.viewportLeft + 2, metrics.rect.left + horizontalInset);
  const horizontalRight = Math.min(after.viewportRight - 2, metrics.rect.right - horizontalInset);
  const horizontalWidth = Math.max(8, Math.min(96, horizontalRight - horizontalLeft));
  const middleHeight = Math.max(4, Math.min(24, fillHeight - 2));
  const middleTop = after.viewportTop + Math.max(1, (fillHeight - middleHeight) / 2);
  const bleedWidth = Math.max(2, Math.min(8, leftBleed - 1, rightBleed - 1));

  const leftSample = await measureBrightTextPixels(page, {
    height: middleHeight,
    label: `${label} left selection surface`,
    left: after.viewportLeft + 1,
    top: middleTop,
    width: bleedWidth,
  });
  const rightSample = await measureBrightTextPixels(page, {
    height: middleHeight,
    label: `${label} right selection surface`,
    left: metrics.rect.right + 1,
    top: middleTop,
    width: bleedWidth,
  });
  const topSample = await measureBrightTextPixels(page, {
    height: verticalSampleHeight,
    label: `${label} top selection surface`,
    left: horizontalLeft,
    top: after.viewportTop + 1,
    width: horizontalWidth,
  });
  const bottomSample = await measureBrightTextPixels(page, {
    height: verticalSampleHeight,
    label: `${label} bottom selection surface`,
    left: horizontalLeft,
    top: after.viewportBottom - verticalSampleHeight - 1,
    width: horizontalWidth,
  });

  expect(leftSample.blueSelectionRatio, JSON.stringify({ label, metrics, leftSample }, null, 2)).toBeGreaterThan(0.35);
  expect(rightSample.blueSelectionRatio, JSON.stringify({ label, metrics, rightSample }, null, 2)).toBeGreaterThan(0.35);
  expect(topSample.blueSelectionRatio, JSON.stringify({ label, metrics, topSample }, null, 2)).toBeGreaterThan(0.35);
  expect(bottomSample.blueSelectionRatio, JSON.stringify({ label, metrics, bottomSample }, null, 2)).toBeGreaterThan(0.35);
}

async function collectSelectedBlockVisualAudit(page: Page): Promise<SelectedBlockVisualAudit | null> {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    if (!editor) return null;

    const parsePx = (value: string, fallback = 0) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const resolvePseudoFill = (element: HTMLElement, pseudo: '::after' | '::before') => {
      const style = getComputedStyle(element, pseudo);
      const hasAbsoluteFill = style.content !== 'none' &&
        style.display !== 'none' &&
        style.position === 'absolute';
      return {
        pseudo,
        style,
        hasAbsoluteFill,
      };
    };
    const resolvePaintRect = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const fill = [
        resolvePseudoFill(element, '::after'),
        resolvePseudoFill(element, '::before'),
      ].find((candidate) => candidate.hasAbsoluteFill);
      if (!fill) {
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      }
      return {
        left: rect.left + parsePx(fill.style.left),
        right: rect.right - parsePx(fill.style.right),
        top: rect.top + parsePx(fill.style.top),
        bottom: rect.bottom - parsePx(fill.style.bottom),
      };
    };

    const rows = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
      .filter((element) => !element.classList.contains('editor-block-selected-parent-marker'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const paint = resolvePaintRect(element);
        return {
          tagName: element.tagName,
          text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          className: element.className,
          rectTop: Math.round(rect.top * 100) / 100,
          paintLeft: Math.round(paint.left * 100) / 100,
          paintRight: Math.round(paint.right * 100) / 100,
          paintTop: Math.round(paint.top * 100) / 100,
          paintBottom: Math.round(paint.bottom * 100) / 100,
          paintHeight: Math.round((paint.bottom - paint.top) * 100) / 100,
          paintWidth: Math.round((paint.right - paint.left) * 100) / 100,
        };
      })
      .sort((left, right) => left.rectTop - right.rectTop);

    const invalidPaintRows = rows
      .filter((row) => row.paintWidth <= 0.5 || row.paintHeight <= 0.5)
      .map((row) => ({
        className: row.className,
        paintHeight: row.paintHeight,
        paintWidth: row.paintWidth,
        tagName: row.tagName,
        text: row.text,
      }));

    const pairGaps: SelectedBlockVisualAudit['pairGaps'] = [];
    for (let index = 0; index < rows.length - 1; index += 1) {
      const current = rows[index];
      const next = rows[index + 1];
      if (!current || !next) continue;
      const horizontalOverlap = Math.min(current.paintRight, next.paintRight) - Math.max(current.paintLeft, next.paintLeft);
      if (horizontalOverlap <= 0.5) continue;
      pairGaps.push({
        currentClassName: current.className,
        currentText: current.text,
        gap: Math.round((next.paintTop - current.paintBottom) * 100) / 100,
        nextClassName: next.className,
        nextText: next.text,
      });
    }

    return {
      active: editor.classList.contains('editor-block-selection-active'),
      invalidPaintRows,
      pairGaps,
      selectedCount: rows.length,
    };
  });
}

function expectSelectedBlockVisualAuditOk(audit: SelectedBlockVisualAudit | null, label: string) {
  expect(audit, `${label}: selected block visual audit`).not.toBeNull();
  expect(audit!.active, JSON.stringify({ label, audit }, null, 2)).toBe(true);
  expect(audit!.selectedCount, JSON.stringify({ label, audit }, null, 2)).toBeGreaterThan(0);
  expect(audit!.invalidPaintRows, JSON.stringify({ label, audit }, null, 2)).toEqual([]);

  const overlaps = audit!.pairGaps.filter((pair) => pair.gap < -0.5);
  expect(overlaps, JSON.stringify({ label, audit }, null, 2)).toEqual([]);

  const adjacentClassPairs = audit!.pairGaps.filter((pair) => (
    pair.currentClassName.includes('editor-block-selected-has-next') &&
    pair.nextClassName.includes('editor-block-selected-has-previous')
  ));
  const missingVisibleGaps = adjacentClassPairs.filter((pair) => pair.gap <= 0.5);
  expect(missingVisibleGaps, JSON.stringify({ label, audit }, null, 2)).toEqual([]);
}

async function collectSelectedTextClips(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const selectedElements = editor
      ? Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
      : [];
    if (!editor || selectedElements.length === 0) return null;

    const textClips: TextClip[] = [];
    for (const selected of selectedElements) {
      const walker = document.createTreeWalker(selected, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        if (!text.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = Array.from(range.getClientRects()).find((candidate) => (
          candidate.width > 0 && candidate.height > 0
        ));
        range.detach();
        if (!rect) continue;
        textClips.push({
          label: text.trim(),
          left: Math.max(0, Math.floor(rect.left)),
          top: Math.max(0, Math.floor(rect.top)),
          width: Math.max(1, Math.ceil(rect.width)),
          height: Math.max(1, Math.ceil(rect.height)),
        });
      }
    }

    return {
      pending: editor.classList.contains('editor-block-selection-pending'),
      selectedTexts: selectedElements.map((element) => element.textContent?.trim() ?? ''),
      textClips,
    };
  });
}

async function collectLineFillContinuity(page: Page) {
  return page.evaluate(() => {
    const fills = Array.from(document.querySelectorAll<HTMLElement>(
      '.milkdown .editor-block-selection-line-fill'
    )).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        top: Math.round(rect.top * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    }).sort((left, right) => left.top - right.top);

    const gaps: number[] = [];
    for (let index = 0; index < fills.length - 1; index += 1) {
      const current = fills[index];
      const next = fills[index + 1];
      if (!current || !next) continue;
      const horizontalOverlap = Math.min(current.right, next.right) - Math.max(current.left, next.left);
      if (horizontalOverlap <= 0) continue;
      gaps.push(Math.round((next.top - current.bottom) * 100) / 100);
    }

    return {
      fills,
      gaps,
      maxPositiveGap: gaps.reduce((max, gap) => Math.max(max, gap), 0),
    };
  });
}

async function collectBlockSelectionLayoutAuditSnapshot(
  page: Page,
): Promise<BlockSelectionLayoutAuditSnapshot> {
  return page.evaluate(() => {
    const blocks = ((window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
      className: string;
      rect: { height: number; top: number };
      tagName: string;
      text: string;
    }>).map((block, index) => ({
      className: String(block.className),
      height: Math.round(block.rect.height * 100) / 100,
      index,
      tagName: block.tagName,
      text: block.text.replace(/\s+/g, ' ').trim(),
      top: Math.round(block.rect.top * 100) / 100,
    }));

    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const selectedControlPositions = editor
      ? Array.from(editor.querySelectorAll<HTMLElement>(
        '.editor-block-selected :is(.heading-toggle-btn, .editor-collapse-btn, .ProseMirror-widget)'
      )).map((control) => {
        const selected = control.closest<HTMLElement>('.editor-block-selected');
        return {
          className: control.className,
          position: getComputedStyle(control).position,
          selectedText: selected?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          tagName: control.tagName,
        };
      })
      : [];

    return {
      blocks,
      selectedControlPositions,
    };
  });
}

function findLayoutAuditBlockIndex(
  snapshot: BlockSelectionLayoutAuditSnapshot,
  text: string,
): number {
  const index = snapshot.blocks.findIndex((block) => block.text.includes(text));
  expect(index, `Could not find selectable block containing "${text}". Blocks: ${JSON.stringify(snapshot.blocks, null, 2)}`)
    .toBeGreaterThanOrEqual(0);
  return index;
}

function expectLayoutStableAfterBlockSelection(
  before: BlockSelectionLayoutAuditSnapshot,
  after: BlockSelectionLayoutAuditSnapshot,
  label: string,
) {
  expect(after.blocks.length, JSON.stringify({ label, before, after }, null, 2)).toBe(before.blocks.length);

  const deltas = before.blocks.flatMap((beforeBlock, index) => {
    const afterBlock = after.blocks[index];
    if (!afterBlock) {
      return [{
        index,
        text: beforeBlock.text,
        reason: 'missing-after-block',
      }];
    }

    const topDelta = Math.round((afterBlock.top - beforeBlock.top) * 100) / 100;
    const heightDelta = Math.round((afterBlock.height - beforeBlock.height) * 100) / 100;
    if (Math.abs(topDelta) <= 1 && Math.abs(heightDelta) <= 1) return [];
    return [{
      index,
      text: beforeBlock.text,
      before: {
        height: beforeBlock.height,
        top: beforeBlock.top,
      },
      after: {
        height: afterBlock.height,
        top: afterBlock.top,
      },
      heightDelta,
      topDelta,
    }];
  });

  expect(deltas, JSON.stringify({ label, before, after }, null, 2)).toEqual([]);

  const displacedControls = after.selectedControlPositions.filter((control) => (
    (control.className.includes('heading-toggle-btn') || control.className.includes('editor-collapse-btn'))
    && control.position !== 'absolute'
  ));
  expect(displacedControls, JSON.stringify({ label, before, after }, null, 2)).toEqual([]);
}

async function installBlockSelectionConflictTheme(page: Page) {
  const themeDirectoryPath = await page.evaluate(() =>
    (window as any).__vlainaE2E.getImportedMarkdownThemesDirectoryPath()
  );
  const cssFilename = 'block-selection-conflict-typora.css';
  const css = [
    ':root { --text-color: #242424; --bg-color: #ffffff; }',
    '#write { color: var(--text-color); background: var(--bg-color); }',
    '#write strong,',
    '#write strong * {',
    '  color: #b42318 !important;',
    '  -webkit-text-fill-color: #b42318 !important;',
    '}',
    '#write .ProseMirror.editor-block-selection-pending .code-block-chrome-header,',
    '#write .ProseMirror.editor-block-selection-pending .code-block-chrome-language,',
    '#write .ProseMirror.editor-block-selection-pending .code-block-chrome-language-label {',
    '  display: none !important;',
    '  visibility: hidden !important;',
    '  opacity: 0 !important;',
    '  transition: opacity 30s linear !important;',
    '}',
    '#write .ProseMirror.editor-block-selection-pending .code-block-chrome-copy-button {',
    '  opacity: 1 !important;',
    '  pointer-events: auto !important;',
    '  transform: scale(1.2) !important;',
    '}',
  ].join('\n');

  await fs.mkdir(themeDirectoryPath, { recursive: true });
  await fs.writeFile(path.join(themeDirectoryPath, cssFilename), css, 'utf8');

  const syncResult = await page.evaluate(() =>
    (window as any).__vlainaE2E.syncImportedMarkdownThemesFromDirectory()
  );
  const theme = syncResult.themes.find((candidate: { sourcePath?: string | null; name: string }) =>
    candidate.sourcePath?.replace(/\\/g, '/').endsWith(`/${cssFilename}`) ||
    candidate.name === cssFilename.replace(/\.css$/i, '')
  );

  if (!theme) {
    throw new Error([
      `Could not sync synthetic block selection conflict theme ${cssFilename}`,
      `themeDirectoryPath=${themeDirectoryPath}`,
      `syncResult=${JSON.stringify(syncResult)}`,
    ].join('\n'));
  }

  await page.evaluate((themeId) =>
    (window as any).__vlainaE2E.setMarkdownImportedThemeId(themeId), theme.id);
  await expect.poll(() => page.evaluate((themeId) => {
    return {
      rootTheme: document.documentElement.getAttribute('data-vlaina-imported-app-theme'),
      markdownStyle: Boolean(document.head.querySelector(
        `style[data-vlaina-imported-markdown-theme="true"]#vlaina-imported-markdown-theme-${CSS.escape(themeId)}`
      )),
      postBridgeStyle: Boolean(document.head.querySelector(
        `style[data-vlaina-imported-markdown-theme-post-bridge="true"]#vlaina-imported-markdown-theme-post-bridge-${CSS.escape(themeId)}`
      )),
    };
  }, theme.id), { timeout: 30_000 }).toMatchObject({
    rootTheme: theme.id,
    markdownStyle: true,
    postBridgeStyle: true,
  });

  return theme;
}

async function expectImportedThemeRoot(page: Page, themeId: string) {
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-markdown-theme-root="true"]');
    return {
      compatLayer: root?.dataset.markdownCompatLayer ?? null,
      importedTheme: root?.dataset.markdownImportedTheme ?? null,
      platform: root?.dataset.markdownThemePlatform ?? null,
    };
  }), { timeout: 30_000 }).toMatchObject({
    compatLayer: 'external',
    importedTheme: themeId,
    platform: 'typora',
  });
}

async function measureHeadingBlockSelectionLayout(page: Page, headingText: string) {
  return page.evaluate((targetText) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    const scrollRoot = document.querySelector<HTMLElement>('[data-note-scroll-root="true"]');
    const heading = editor
      ? Array.from(editor.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
        .find((element) => element.textContent?.includes(targetText)) ?? null
      : null;
    const nextBlock = heading?.nextElementSibling instanceof HTMLElement
      ? heading.nextElementSibling
      : null;
    if (!editor || !heading) return null;

    const editorRect = editor.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const nextRect = nextBlock?.getBoundingClientRect() ?? null;
    const headingStyle = getComputedStyle(heading);
    const headingToggle = heading.querySelector<HTMLElement>('.heading-toggle-btn');
    const headingToggleStyle = headingToggle ? getComputedStyle(headingToggle) : null;
    return {
      active: editor.classList.contains('editor-block-selection-active'),
      editorTop: Math.round(editorRect.top * 100) / 100,
      headingTop: Math.round(headingRect.top * 100) / 100,
      headingHeight: Math.round(headingRect.height * 100) / 100,
      nextTop: nextRect ? Math.round(nextRect.top * 100) / 100 : null,
      scrollTop: scrollRoot ? Math.round(scrollRoot.scrollTop * 100) / 100 : Math.round(window.scrollY * 100) / 100,
      contentVisibility: headingStyle.contentVisibility,
      containIntrinsicSize: headingStyle.containIntrinsicSize,
      borderBlockStartWidth: headingStyle.borderBlockStartWidth,
      borderBlockEndWidth: headingStyle.borderBlockEndWidth,
      boxSizing: headingStyle.boxSizing,
      display: headingStyle.display,
      fontSize: headingStyle.fontSize,
      lineHeight: headingStyle.lineHeight,
      minHeight: headingStyle.minHeight,
      paddingBlockStart: headingStyle.paddingBlockStart,
      paddingBlockEnd: headingStyle.paddingBlockEnd,
      isolation: headingStyle.isolation,
      marginBlockStart: headingStyle.marginBlockStart,
      marginBlockEnd: headingStyle.marginBlockEnd,
      outlineStyle: headingStyle.outlineStyle,
      outlineWidth: headingStyle.outlineWidth,
      headingTogglePosition: headingToggleStyle?.position ?? null,
      headingToggleDisplay: headingToggleStyle?.display ?? null,
      className: heading.className,
    };
  }, headingText);
}

async function dragBlankAreaSelectionUntilPending(
  page: Page,
  start: { startX: number; startY: number },
  points: Array<{ x: number; y: number }>,
) {
  await page.mouse.move(start.startX, start.startY);
  await page.mouse.down();

  for (const point of points) {
    await page.mouse.move(point.x, point.y, { steps: 10 });
    await page.waitForTimeout(50);
    const pending = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
      return editor?.classList.contains('editor-block-selection-pending') ?? false;
    });
    if (pending) return true;
  }

  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    return editor?.classList.contains('editor-block-selection-pending') ?? false;
  });
}

test.describe("notes block selection regressions", () => {
  test.setTimeout(90_000);

  test('keeps heading block selection from shifting the editor vertically', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-block-selection-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'heading-block-selection-layout.md',
        content: [
          'Intro paragraph before heading.',
          '',
          '# Heading Layout Sentinel',
          '',
          'Paragraph immediately after heading.',
          '',
          '## Second Heading Layout Sentinel',
          '',
          'Paragraph after second heading.',
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Heading Layout Sentinel' })).toBeVisible();

      const before = await measureHeadingBlockSelectionLayout(page, 'Heading Layout Sentinel');
      expect(before, 'heading layout before selection').not.toBeNull();

      const selectedCount = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        const index = blocks.findIndex((block) => block.text.includes('Heading Layout Sentinel'));
        if (index < 0) return 0;
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(1);

      const after = await measureHeadingBlockSelectionLayout(page, 'Heading Layout Sentinel');
      expect(after, 'heading layout after selection').not.toBeNull();

      expect(after!.active, JSON.stringify({ before, after }, null, 2)).toBe(true);
      expect(after!.scrollTop, JSON.stringify({ before, after }, null, 2)).toBeCloseTo(before!.scrollTop, 0);
      expect(after!.editorTop, JSON.stringify({ before, after }, null, 2)).toBeCloseTo(before!.editorTop, 0);
      expect(after!.headingTop, JSON.stringify({ before, after }, null, 2)).toBeCloseTo(before!.headingTop, 0);
      expect(after!.headingHeight, JSON.stringify({ before, after }, null, 2)).toBeCloseTo(before!.headingHeight, 0);
      expect(after!.nextTop, JSON.stringify({ before, after }, null, 2)).toBeCloseTo(before!.nextTop!, 0);
      expect(after!.headingTogglePosition, JSON.stringify({ before, after }, null, 2)).toBe('absolute');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps representative text-like block selections layout-stable', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-layout-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 980 });

      await openMarkdownFixture(page, {
        filename: 'block-selection-layout-audit.md',
        content: [
          '# Audit Heading One Stable',
          '',
          'Audit Paragraph After H1 Stable',
          '',
          '## Audit Heading Two Stable',
          '',
          'Audit Paragraph Short Stable',
          '',
          'Audit Paragraph Long Stable has enough words to wrap on narrower editor widths and checks that selecting a paragraph never changes the line box, width decision, or following block position while the blue block selection surface is painted behind it.',
          '',
          '> Audit Quote Body Stable',
          '',
          '- Audit Bullet Parent Stable',
          '  - Audit Bullet Child Stable',
          '',
          '1. Audit Ordered Parent Stable',
          '   1. Audit Ordered Child Stable',
          '',
          '- [ ] Audit Task Parent Stable',
          '  - Audit Task Child Stable',
          '',
          '- Audit Bullet Parent With Code Stable',
          '  ```ts',
          '  const auditCodeValue = 1;',
          '  ```',
          '  - Audit Nested After Code Stable',
          '',
          'Audit Closing Paragraph Stable',
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Audit Heading One Stable' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .editor-collapse-btn[data-has-content="true"]`).first()).toBeAttached();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'auditCodeValue' })).toBeVisible();

      const targetTexts = [
        'Audit Heading One Stable',
        'Audit Heading Two Stable',
        'Audit Paragraph Short Stable',
        'Audit Paragraph Long Stable',
        'Audit Quote Body Stable',
        'Audit Bullet Parent Stable',
        'Audit Ordered Parent Stable',
        'Audit Task Parent Stable',
        'Audit Bullet Parent With Code Stable',
      ];

      for (const targetText of targetTexts) {
        await clearSelectedNoteBlocks(page);
        await page.evaluate(() => new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ));

        const before = await collectBlockSelectionLayoutAuditSnapshot(page);
        const index = findLayoutAuditBlockIndex(before, targetText);
        const selectedCount = await selectNoteBlocksByIndexes(page, [index]);
        expect(selectedCount, `Could not select block "${targetText}"`).toBe(1);
        await page.evaluate(() => new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ));

        const after = await collectBlockSelectionLayoutAuditSnapshot(page);
        expectLayoutStableAfterBlockSelection(before, after, targetText);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits Typora compatibility sample block selection geometry across mixed markdown', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typora-compat-block-selection-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1180, height: 900 });

      await openMarkdownFixture(page, {
        filename: 'typora-compat-block-selection-audit.md',
        content: TYPORA_COMPAT_BLOCK_SELECTION_AUDIT_MARKDOWN,
      });

      await expect(page.locator(`${EDITOR_SELECTOR}`, { hasText: 'YAML Front Matter only partly supported sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'typoraCompatDirectCodeSentinel' })).toBeAttached();
      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`, { hasText: 'Ctrl+Shift+L' })).toBeAttached();
      await expect(page.locator(`${EDITOR_SELECTOR} blockquote`, { hasText: '我是引用的句子' })).toBeAttached();

      const waitForSelectionPaint = async () => page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      ));
      const selectAndAuditIndexes = async (indexes: number[], label: string) => {
        expect(indexes.length, `${label}: no indexes to select`).toBeGreaterThan(0);
        await clearSelectedNoteBlocks(page);
        await waitForSelectionPaint();

        const before = await collectBlockSelectionLayoutAuditSnapshot(page);
        const selectedCount = await selectNoteBlocksByIndexes(page, indexes);
        expect(selectedCount, `${label}: selected count`).toBe(indexes.length);
        await waitForSelectionPaint();

        const after = await collectBlockSelectionLayoutAuditSnapshot(page);
        expectLayoutStableAfterBlockSelection(before, after, label);
        expectSelectedBlockVisualAuditOk(await collectSelectedBlockVisualAudit(page), label);
      };
      const findIndexes = async (needles: string[]) => {
        const snapshot = await collectBlockSelectionLayoutAuditSnapshot(page);
        return needles.map((needle) => findLayoutAuditBlockIndex(snapshot, needle));
      };
      const findPreviousBlankAndTarget = async (targetText: string) => page.evaluate((needle) => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          tagName: string;
          text: string;
        }>;
        const targetIndex = blocks.findIndex((block) => block.text.replace(/\s+/g, ' ').trim().includes(needle));
        let blankIndex = -1;
        for (let index = targetIndex - 1; index >= 0; index -= 1) {
          const block = blocks[index];
          const text = block?.text.replace(/\s+/g, ' ').trim() ?? '';
          if (text === '' || text === '⠀' || block?.className.includes('editor-list-gap-placeholder-item')) {
            blankIndex = index;
            break;
          }
          if (text.length > 0) break;
        }
        return {
          blankIndex,
          targetIndex,
          blocks: blocks.map((block, index) => ({
            className: block.className,
            index,
            tagName: block.tagName,
            text: block.text.replace(/\s+/g, ' ').trim().slice(0, 120),
          })),
        };
      }, targetText);
      const selectBlankBeforeTarget = async (targetText: string, label: string) => {
        const indexes = await findPreviousBlankAndTarget(targetText);
        expect(indexes.targetIndex, JSON.stringify({ label, indexes }, null, 2)).toBeGreaterThanOrEqual(0);
        expect(indexes.blankIndex, JSON.stringify({ label, indexes }, null, 2)).toBe(indexes.targetIndex - 1);
        await selectAndAuditIndexes([indexes.blankIndex, indexes.targetIndex], label);
      };

      const singleBlockTargets = [
        'YAML Front Matter only partly supported sentinel',
        'HTML paragraph block selection sentinel',
        '连续空格类似于单行换行符',
        '使用HTML实体',
        'Markdown提供了插入单个强行换行符的方法',
        '常用快捷键',
        'Ctrl+Shift+L',
        '据 GitHub Flavored Markdown',
        '标题支持使用两种标记',
        'typoraCompatDirectCodeSentinel',
        'List direct code audit item',
        '我是引用的句子',
        '普通表格',
        'inline html sentinel',
        '常用快捷键概述',
      ];

      for (const target of singleBlockTargets) {
        const [index] = await findIndexes([target]);
        await selectAndAuditIndexes([index], `single block: ${target}`);
      }

      await selectBlankBeforeTarget('Ctrl+Shift+L', 'blank line before shortcut table');
      await selectBlankBeforeTarget('Ctrl+B', 'blank line before format table');
      await selectBlankBeforeTarget('typoraCompatDirectCodeSentinel', 'blank line before list direct code block');
      await selectBlankBeforeTarget('String name', 'blank line before fenced code block');

      const headingRange = await findIndexes(['概述', '据 GitHub Flavored Markdown']);
      await selectAndAuditIndexes(
        Array.from(
          { length: headingRange[1] - headingRange[0] + 1 },
          (_, offset) => headingRange[0] + offset,
        ),
        'heading through hard-break paragraph range',
      );

      const tableToHeadingRange = await findIndexes(['视图', 'Ctrl+Shift+L']);
      await selectAndAuditIndexes(
        Array.from(
          { length: tableToHeadingRange[1] - tableToHeadingRange[0] + 1 },
          (_, offset) => tableToHeadingRange[0] + offset,
        ),
        'view heading through shortcut table range',
      );

      const listDirectCodeIndexes = await findIndexes([
        'List direct code audit item',
        'List item after direct code audit.',
      ]);
      await selectAndAuditIndexes(listDirectCodeIndexes, 'list direct code item and following item');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps visible gaps between selected blank lines and following rich blocks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-rich-block-selection-gap');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'blank-line-rich-block-selection-gap.md',
        content: [
          'Paragraph before blank line and code block.',
          '',
          '```ts',
          'const selectedCodeGapSentinel = true;',
          '```',
          '',
          'Paragraph before blank line and table.',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| tableGapSentinel | covered |',
          '',
          'Paragraph before blank line and html block.',
          '',
          '<div>htmlGapSentinel</div>',
          '',
          'Paragraph before blank line and math block.',
          '',
          '$$',
          '\\text{mathGapSentinel}',
          '$$',
          '',
          'Paragraph before blank line and mermaid block.',
          '',
          '```mermaid',
          'flowchart TD',
          '  mermaidGapStart --> mermaidGapEnd',
          '```',
          '',
          'Paragraph after code block.',
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'selectedCodeGapSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`, { hasText: 'tableGapSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-container`, { hasText: 'htmlGapSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-block"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="mermaid"]`)).toBeVisible();

      const findAdjacentIndexes = async (targetText: string, targetClassName = '') => page.evaluate((target) => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          rangeText: string;
          text: string;
        }>;
        const targetIndex = blocks.findIndex((block) => {
          const matchesText = target.text === '' ||
            block.text.includes(target.text) ||
            block.rangeText.includes(target.text);
          const matchesClass = target.className === '' || block.className.includes(target.className);
          return matchesText && matchesClass;
        });
        const blankIndex = targetIndex > 0 && blocks[targetIndex - 1]?.text === ''
          ? targetIndex - 1
          : -1;
        return {
          blankIndex,
          targetIndex,
          blocks: blocks.map((block, index) => ({
            className: block.className,
            index,
            rangeText: block.rangeText,
            text: block.text,
          })),
        };
      }, { className: targetClassName, text: targetText });

      const measureSelectedGap = async (targetClassName: string, targetText: string) => page.evaluate((target) => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolvePseudoFill = (element: HTMLElement, pseudo: '::before' | '::after') => {
          const style = getComputedStyle(element, pseudo);
          const hasAbsoluteFill = style.content !== 'none' &&
            style.display !== 'none' &&
            style.position === 'absolute';
          return {
            pseudo,
            style,
            hasAbsoluteFill,
          };
        };
        const resolvePaintRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const fill = [
            resolvePseudoFill(element, '::after'),
            resolvePseudoFill(element, '::before'),
          ].find((candidate) => candidate.hasAbsoluteFill);
          if (!fill) {
            return {
              top: rect.top,
              bottom: rect.bottom,
              fillTop: '0px',
              fillBottom: '0px',
              fillDisplay: 'none',
              fillContent: 'none',
              fillPosition: 'static',
              fillPseudo: null,
            };
          }
          return {
            top: rect.top + parsePx(fill.style.top),
            bottom: rect.bottom - parsePx(fill.style.bottom),
            fillTop: fill.style.top,
            fillBottom: fill.style.bottom,
            fillDisplay: fill.style.display,
            fillContent: fill.style.content,
            fillPosition: fill.style.position,
            fillPseudo: fill.pseudo,
          };
        };

        const rows = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .filter((element) => !element.classList.contains('editor-block-selected-parent-marker'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const paint = resolvePaintRect(element);
            return {
              tagName: element.tagName,
              text: element.textContent?.trim() ?? '',
              className: element.className,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              paintTop: Math.round(paint.top * 100) / 100,
              paintBottom: Math.round(paint.bottom * 100) / 100,
              fillTop: paint.fillTop,
              fillBottom: paint.fillBottom,
              fillDisplay: paint.fillDisplay,
              fillContent: paint.fillContent,
              fillPosition: paint.fillPosition,
              fillPseudo: paint.fillPseudo,
            };
          })
          .sort((left, right) => left.rectTop - right.rectTop);

        const targetRow = rows.find((row) =>
          row.className.includes(target.className) &&
          (target.text === '' || row.text.includes(target.text))
        ) ?? rows.find((row) => row.className.includes(target.className)) ?? null;
        const blank = rows.find((row) => (
          row.text === '' && row !== targetRow
        )) ?? null;
        return {
          active: editor.classList.contains('editor-block-selection-active'),
          rows,
          blank,
          target: targetRow,
          blankToTargetGap: blank && targetRow
            ? Math.round((targetRow.paintTop - blank.paintBottom) * 100) / 100
            : null,
        };
      }, { className: targetClassName, text: targetText });

      const assertRichBlockGap = async (
        targetText: string,
        targetClassName: string,
        label: string,
        targetIndexClassName = '',
      ) => {
        await clearSelectedNoteBlocks(page);
        const indexes = await findAdjacentIndexes(targetText, targetIndexClassName);
        expect(indexes.blankIndex, JSON.stringify({ label, indexes }, null, 2)).toBeGreaterThanOrEqual(0);
        expect(indexes.targetIndex, JSON.stringify({ label, indexes }, null, 2)).toBe(indexes.blankIndex + 1);

        const selectedCount = await selectNoteBlocksByIndexes(page, [indexes.blankIndex, indexes.targetIndex]);
        expect(selectedCount, JSON.stringify({ label, indexes }, null, 2)).toBe(2);
        await page.evaluate(() => new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ));

        const geometry = await measureSelectedGap(targetClassName, targetText);
        expect(geometry, `${label} blank line and rich block selection geometry`).not.toBeNull();
        expect(geometry!.active, JSON.stringify({ label, geometry }, null, 2)).toBe(true);
        expect(geometry!.rows, JSON.stringify({ label, geometry }, null, 2)).toHaveLength(2);
        expect(geometry!.blank, JSON.stringify({ label, geometry }, null, 2)).not.toBeNull();
        expect(geometry!.target, JSON.stringify({ label, geometry }, null, 2)).not.toBeNull();
        expect(geometry!.blank!.className, JSON.stringify({ label, geometry }, null, 2)).toContain('editor-block-selected-has-next');
        expect(geometry!.target!.className, JSON.stringify({ label, geometry }, null, 2)).toContain('editor-block-selected-has-previous');
        expect(Number.parseFloat(geometry!.blank!.fillBottom), JSON.stringify({ label, geometry }, null, 2)).toBeGreaterThanOrEqual(0.5);
        expect(Number.parseFloat(geometry!.target!.fillTop), JSON.stringify({ label, geometry }, null, 2)).toBeGreaterThanOrEqual(0.5);
        expect(geometry!.blankToTargetGap, JSON.stringify({ label, geometry }, null, 2)).toBeGreaterThan(0.5);
      };

      await assertRichBlockGap('selectedCodeGapSentinel', 'code-block-container', 'code block');
      await assertRichBlockGap('tableGapSentinel', 'milkdown-table-block', 'table block');
      await assertRichBlockGap('htmlGapSentinel', 'md-htmlblock-container', 'html block');
      await assertRichBlockGap('mathGapSentinel', 'math-block-wrapper', 'math block');
      await assertRichBlockGap('', 'mermaid-block', 'mermaid block', 'mermaid-block');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('paints selected atomic rich blocks with expected selection overflow', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-html-block-selection-paint');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'html-block-selection-paint.md',
        content: [
          'Paragraph before html block selection.',
          '',
          '# Atomic Rich TOC Heading',
          '',
          '[TOC]',
          '',
          '<!--注释-->',
          '',
          '<div><span style="color: #d22;">HTML block selection sentinel</span></div>',
          '',
          '$$',
          'E = mc^2',
          '$$',
          '',
          '```mermaid',
          'flowchart TD',
          '  mermaidSelectionStart --> mermaidSelectionEnd',
          '```',
          '',
          '```js',
          'console.log("Code block selection sentinel");',
          '```',
          '',
          'Paragraph after html block selection.',
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-literal-text`, { hasText: '<!--注释-->' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="toc"].toc-block`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'Code block selection sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text)`, { hasText: 'HTML block selection sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-block"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="mermaid"]`)).toBeVisible();
      const baseAtomicTransitions = await page.evaluate((editorSelector) => {
        const readTransition = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            selector,
            transitionDuration: style.transitionDuration,
            transitionProperty: style.transitionProperty,
          };
        };
        return {
          html: readTransition(`${editorSelector} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text)`),
          math: readTransition(`${editorSelector} [data-type="math-block"]`),
          toc: readTransition(`${editorSelector} [data-type="toc"].toc-block`),
          mermaid: readTransition(`${editorSelector} [data-type="mermaid"].mermaid-block`),
        };
      }, EDITOR_SELECTOR);
      expect(baseAtomicTransitions.html, JSON.stringify(baseAtomicTransitions, null, 2)).not.toBeNull();
      expect(baseAtomicTransitions.math, JSON.stringify(baseAtomicTransitions, null, 2)).not.toBeNull();
      expect(baseAtomicTransitions.toc, JSON.stringify(baseAtomicTransitions, null, 2)).not.toBeNull();
      expect(baseAtomicTransitions.mermaid, JSON.stringify(baseAtomicTransitions, null, 2)).not.toBeNull();
      expectNoComputedTransition(baseAtomicTransitions.html!, 'base html block');
      expectNoComputedTransition(baseAtomicTransitions.math!, 'base math block');
      expectNoComputedTransition(baseAtomicTransitions.toc!, 'base toc block');
      expectNoComputedTransition(baseAtomicTransitions.mermaid!, 'base mermaid block');

      const indexes = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          rangeText: string;
          tagName: string;
          text: string;
        }>;
        const includesText = (block: { rangeText: string; text: string }, text: string) =>
          block.text.includes(text) || block.rangeText.includes(text);
        return {
          commentIndex: blocks.findIndex((block) => includesText(block, '<!--注释-->')),
          codeIndex: blocks.findIndex((block) => includesText(block, 'Code block selection sentinel')),
          htmlIndex: blocks.findIndex((block) => includesText(block, 'HTML block selection sentinel')),
          mathIndex: blocks.findIndex((block) => includesText(block, 'E = mc^2') || includesText(block, 'E=mc')),
          tocIndex: blocks.findIndex((block) => block.className.includes('toc-block')),
          mermaidIndex: blocks.findIndex((block) => block.className.includes('mermaid-block')),
          blocks: blocks.map((block, index) => ({
            className: block.className,
            index,
            rangeText: block.rangeText,
            tagName: block.tagName,
            text: block.text,
          })),
        };
      });
      expect(indexes.commentIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.codeIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.htmlIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.mathIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.tocIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.mermaidIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);

      let selectedCount = await selectNoteBlocksByIndexes(page, [indexes.commentIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const commentMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-literal-text.editor-block-selected`);
      expect(commentMetrics, 'selected literal comment metrics').not.toBeNull();
      expect(commentMetrics!.text, JSON.stringify(commentMetrics, null, 2)).toContain('<!--注释-->');
      expect(commentMetrics!.overflowX, JSON.stringify(commentMetrics, null, 2)).toBe('visible');
      expect(commentMetrics!.overflowY, JSON.stringify(commentMetrics, null, 2)).toBe('visible');
      expect(commentMetrics!.scrollbarHeight, JSON.stringify(commentMetrics, null, 2)).toBe(0);
      expect(commentMetrics!.hasAfterPaint, JSON.stringify(commentMetrics, null, 2)).toBe(true);
      expect(commentMetrics!.after?.left, JSON.stringify(commentMetrics, null, 2)).toBeLessThan(-1);
      expect(commentMetrics!.after?.right, JSON.stringify(commentMetrics, null, 2)).toBeLessThan(-1);
      await expectSelectedAtomicBleedPixels(page, commentMetrics!, 'literal comment block');

      await clearSelectedNoteBlocks(page);
      selectedCount = await selectNoteBlocksByIndexes(page, [indexes.codeIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const codeMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} .code-block-container.editor-block-selected`);
      expect(codeMetrics, 'selected code block metrics').not.toBeNull();
      expect(codeMetrics!.text, JSON.stringify(codeMetrics, null, 2)).toContain('Code block selection sentinel');
      expectNoComputedTransition(codeMetrics!, 'selected code block');
      expect(codeMetrics!.hasAfterPaint, JSON.stringify(codeMetrics, null, 2)).toBe(true);

      await clearSelectedNoteBlocks(page);
      selectedCount = await selectNoteBlocksByIndexes(page, [indexes.htmlIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const htmlMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text).editor-block-selected`);
      expect(htmlMetrics, 'selected html block metrics').not.toBeNull();
      expect(htmlMetrics!.text, JSON.stringify(htmlMetrics, null, 2)).toContain('HTML block selection sentinel');
      expect(htmlMetrics!.overflowX, JSON.stringify(htmlMetrics, null, 2)).toBe('visible');
      expect(htmlMetrics!.overflowY, JSON.stringify(htmlMetrics, null, 2)).toBe('visible');
      expect(htmlMetrics!.scrollbarHeight, JSON.stringify(htmlMetrics, null, 2)).toBe(0);
      expectNoComputedTransition(htmlMetrics!, 'selected html block');
      expect(htmlMetrics!.hasAfterPaint, JSON.stringify(htmlMetrics, null, 2)).toBe(true);
      expect(htmlMetrics!.after?.left, JSON.stringify(htmlMetrics, null, 2)).toBeLessThan(-1);
      expect(htmlMetrics!.after?.right, JSON.stringify(htmlMetrics, null, 2)).toBeLessThan(-1);
      expect(htmlMetrics!.boxShadow, JSON.stringify(htmlMetrics, null, 2)).not.toBe('none');
      expectSelectedAtomicOutline(htmlMetrics!, 'html block');
      const htmlForeground = await page.evaluate((editorSelector) => {
        const block = document.querySelector<HTMLElement>(
          `${editorSelector} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text).editor-block-selected`
        );
        const child = block?.querySelector<HTMLElement>('span[style*="color"]') ?? null;
        if (!block || !child) return null;

        const blockStyle = getComputedStyle(block);
        const childStyle = getComputedStyle(child);
        return {
          blockColor: blockStyle.color,
          blockTextFillColor: blockStyle.webkitTextFillColor,
          childColor: childStyle.color,
          childInlineStyle: child.getAttribute('style') ?? '',
          childTextFillColor: childStyle.webkitTextFillColor,
        };
      }, EDITOR_SELECTOR);
      expect(htmlForeground, JSON.stringify({ htmlMetrics, htmlForeground }, null, 2)).not.toBeNull();
      expect(htmlForeground!.childInlineStyle, JSON.stringify(htmlForeground, null, 2)).toContain('color');
      expect(htmlForeground!.childColor, JSON.stringify(htmlForeground, null, 2)).toBe('rgb(221, 34, 34)');
      expect(htmlForeground!.childTextFillColor, JSON.stringify(htmlForeground, null, 2)).toBe('rgb(221, 34, 34)');
      await expectSelectedAtomicBleedPixels(page, htmlMetrics!, 'html block');

      await clearSelectedNoteBlocks(page);
      selectedCount = await selectNoteBlocksByIndexes(page, [indexes.mathIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const mathMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} [data-type="math-block"].editor-block-selected`);
      expect(mathMetrics, 'selected math block metrics').not.toBeNull();
      expect(mathMetrics!.overflowX, JSON.stringify(mathMetrics, null, 2)).toBe('visible');
      expect(mathMetrics!.overflowY, JSON.stringify(mathMetrics, null, 2)).toBe('visible');
      expect(mathMetrics!.contentVisibility, JSON.stringify(mathMetrics, null, 2)).toBe('visible');
      expect(mathMetrics!.contain, JSON.stringify(mathMetrics, null, 2)).toBe('none');
      expect(mathMetrics!.position, JSON.stringify(mathMetrics, null, 2)).toBe('relative');
      expect(mathMetrics!.scrollbarHeight, JSON.stringify(mathMetrics, null, 2)).toBe(0);
      expectNoComputedTransition(mathMetrics!, 'selected math block');
      expect(mathMetrics!.hasAfterPaint, JSON.stringify(mathMetrics, null, 2)).toBe(true);
      expect(mathMetrics!.after?.left, JSON.stringify(mathMetrics, null, 2)).toBeLessThan(-1);
      expect(mathMetrics!.after?.right, JSON.stringify(mathMetrics, null, 2)).toBeLessThan(-1);
      expect(mathMetrics!.boxShadow, JSON.stringify(mathMetrics, null, 2)).not.toBe('none');
      expectSelectedAtomicOutline(mathMetrics!, 'math block');
      await expectSelectedAtomicBleedPixels(page, mathMetrics!, 'math block');

      await clearSelectedNoteBlocks(page);
      selectedCount = await selectNoteBlocksByIndexes(page, [indexes.tocIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const tocMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} [data-type="toc"].toc-block.editor-block-selected`);
      expect(tocMetrics, 'selected toc block metrics').not.toBeNull();
      expect(tocMetrics!.className, JSON.stringify(tocMetrics, null, 2)).toContain('toc-block');
      expect(tocMetrics!.overflowX, JSON.stringify(tocMetrics, null, 2)).toBe('visible');
      expect(tocMetrics!.overflowY, JSON.stringify(tocMetrics, null, 2)).toBe('visible');
      expect(tocMetrics!.contentVisibility, JSON.stringify(tocMetrics, null, 2)).toBe('visible');
      expect(tocMetrics!.contain, JSON.stringify(tocMetrics, null, 2)).toBe('none');
      expect(tocMetrics!.position, JSON.stringify(tocMetrics, null, 2)).toBe('relative');
      expect(tocMetrics!.scrollbarHeight, JSON.stringify(tocMetrics, null, 2)).toBe(0);
      expectNoComputedTransition(tocMetrics!, 'selected toc block');
      expect(tocMetrics!.hasAfterPaint, JSON.stringify(tocMetrics, null, 2)).toBe(true);
      expect(tocMetrics!.after?.left, JSON.stringify(tocMetrics, null, 2)).toBeLessThan(-1);
      expect(tocMetrics!.after?.right, JSON.stringify(tocMetrics, null, 2)).toBeLessThan(-1);
      expect(tocMetrics!.boxShadow, JSON.stringify(tocMetrics, null, 2)).not.toBe('none');
      expectSelectedAtomicOutline(tocMetrics!, 'toc block');
      await expectSelectedAtomicBleedPixels(page, tocMetrics!, 'toc block');

      await clearSelectedNoteBlocks(page);
      selectedCount = await selectNoteBlocksByIndexes(page, [indexes.mermaidIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(1);
      const mermaidMetrics = await measureSelectedAtomicBlock(page, `${EDITOR_SELECTOR} [data-type="mermaid"].mermaid-block.editor-block-selected`);
      expect(mermaidMetrics, 'selected mermaid block metrics').not.toBeNull();
      expect(mermaidMetrics!.overflowX, JSON.stringify(mermaidMetrics, null, 2)).toBe('visible');
      expect(mermaidMetrics!.overflowY, JSON.stringify(mermaidMetrics, null, 2)).toBe('visible');
      expect(mermaidMetrics!.contentVisibility, JSON.stringify(mermaidMetrics, null, 2)).toBe('visible');
      expect(mermaidMetrics!.contain, JSON.stringify(mermaidMetrics, null, 2)).toBe('none');
      expect(mermaidMetrics!.position, JSON.stringify(mermaidMetrics, null, 2)).toBe('relative');
      expect(mermaidMetrics!.scrollbarHeight, JSON.stringify(mermaidMetrics, null, 2)).toBe(0);
      expectNoComputedTransition(mermaidMetrics!, 'selected mermaid block');
      expect(mermaidMetrics!.hasAfterPaint, JSON.stringify(mermaidMetrics, null, 2)).toBe(true);
      expect(mermaidMetrics!.after?.left, JSON.stringify(mermaidMetrics, null, 2)).toBeLessThan(-1);
      expect(mermaidMetrics!.after?.right, JSON.stringify(mermaidMetrics, null, 2)).toBeLessThan(-1);
      expect(mermaidMetrics!.boxShadow, JSON.stringify(mermaidMetrics, null, 2)).not.toBe('none');
      expectSelectedAtomicOutline(mermaidMetrics!, 'mermaid block');
      await expectSelectedAtomicBleedPixels(page, mermaidMetrics!, 'mermaid block');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps atomic rich block selection surfaces visible during large top-down selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-large-atomic-rich-selection-paint');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'large-atomic-rich-selection-paint.md',
        content: [
          '> Large selection quote rail sentinel.',
          '',
          '- [ ] Large selection task checkbox sentinel.',
          '',
          '---',
          '',
          '<!--Large selection literal comment-->',
          '',
          'Long selection lead paragraph 1.',
          '',
          '<div>Large selection HTML sentinel</div>',
          '',
          '$$',
          'a^2 + b^2 = c^2',
          '$$',
          '',
          '```mermaid',
          'flowchart TD',
          '  largeSelectionMermaidStart --> largeSelectionMermaidEnd',
          '```',
          '',
          ...Array.from(
            { length: 160 },
            (_, index) => `Long selection tail paragraph ${index}.`,
          ).flatMap((paragraph) => [paragraph, '']),
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} blockquote`, { hasText: 'Large selection quote rail sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"]`, { hasText: 'Large selection task checkbox sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="hr"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-literal-text`, { hasText: '<!--Large selection literal comment-->' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text)`, { hasText: 'Large selection HTML sentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-block"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="mermaid"]`)).toBeVisible();

      const selectionPlan = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          rangeText: string;
          tagName: string;
          text: string;
        }>;
        const includesText = (block: { rangeText: string; text: string }, text: string) =>
          block.text.includes(text) || block.rangeText.includes(text);
        const selectedIndexes = Array.from(
          { length: Math.min(140, blocks.length) },
          (_, index) => index,
        );
        return {
          quoteIndex: blocks.findIndex((block) => includesText(block, 'Large selection quote rail sentinel')),
          taskIndex: blocks.findIndex((block) => includesText(block, 'Large selection task checkbox sentinel')),
          hrIndex: blocks.findIndex((block) => block.className.includes('md-hr')),
          commentIndex: blocks.findIndex((block) => includesText(block, '<!--Large selection literal comment-->')),
          htmlIndex: blocks.findIndex((block) => includesText(block, 'Large selection HTML sentinel')),
          mathIndex: blocks.findIndex((block) => includesText(block, 'a^2 + b^2 = c^2') || includesText(block, 'a2+b2')),
          mermaidIndex: blocks.findIndex((block) => block.className.includes('mermaid-block')),
          selectedIndexes,
          blocks: blocks.slice(0, 150).map((block, index) => ({
            className: block.className,
            index,
            rangeText: block.rangeText,
            tagName: block.tagName,
            text: block.text,
          })),
        };
      });
      expect(selectionPlan.quoteIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.taskIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.hrIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.commentIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.htmlIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.mathIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.mermaidIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.selectedIndexes.length, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(128);
      expect(selectionPlan.quoteIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.taskIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.hrIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.commentIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.htmlIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.mathIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      expect(selectionPlan.mermaidIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);

      const markerColorBaseline = await page.evaluate((editorSelector) => {
        const quote = Array.from(document.querySelectorAll<HTMLElement>(`${editorSelector} blockquote`))
          .find((element) => element.textContent?.includes('Large selection quote rail sentinel')) ?? null;
        const task = Array.from(document.querySelectorAll<HTMLElement>(`${editorSelector} li[data-item-type="task"]`))
          .find((element) => element.textContent?.includes('Large selection task checkbox sentinel')) ?? null;
        if (!quote || !task) return null;
        return {
          quoteRailColor: getComputedStyle(quote, '::before').backgroundColor,
          taskCheckboxBorderColor: getComputedStyle(task, '::before').borderTopColor,
        };
      }, EDITOR_SELECTOR);
      expect(markerColorBaseline, 'large selection marker color baseline').not.toBeNull();

      const selectedCount = await selectNoteBlocksByIndexes(page, selectionPlan.selectedIndexes);
      expect(selectedCount, JSON.stringify(selectionPlan, null, 2)).toBe(selectionPlan.selectedIndexes.length);
      await expect.poll(() => page.evaluate((editorSelector) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        return {
          active: editor?.classList.contains('editor-block-selection-active') ?? false,
          large: editor?.classList.contains('editor-block-selection-large') ?? false,
          selectedCount: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
        };
      }, EDITOR_SELECTOR)).toMatchObject({
        active: false,
        large: true,
      });

      const quoteRail = await page.evaluate((editorSelector) => {
        const quote = Array.from(document.querySelectorAll<HTMLElement>(`${editorSelector} blockquote.editor-block-selected`))
          .find((element) => element.textContent?.includes('Large selection quote rail sentinel'));
        if (!quote) return null;

        const style = getComputedStyle(quote, '::before');
        const parsePx = (value: string) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
          beforeBackgroundColor: style.backgroundColor,
          beforeContent: style.content,
          beforeDisplay: style.display,
          beforeHeightPx: parsePx(style.height),
          beforeWidthPx: parsePx(style.width),
          className: quote.className,
        };
      }, EDITOR_SELECTOR);
      expect(quoteRail, 'large selected blockquote rail metrics').not.toBeNull();
      expect(quoteRail!.className, JSON.stringify(quoteRail, null, 2)).toContain('editor-block-selected-large-item');
      expect(quoteRail!.beforeContent, JSON.stringify(quoteRail, null, 2)).not.toBe('none');
      expect(quoteRail!.beforeDisplay, JSON.stringify(quoteRail, null, 2)).not.toBe('none');
      expect(quoteRail!.beforeWidthPx, JSON.stringify(quoteRail, null, 2)).toBeGreaterThan(0);
      expect(quoteRail!.beforeHeightPx, JSON.stringify(quoteRail, null, 2)).toBeGreaterThan(0);
      expect(quoteRail!.beforeBackgroundColor, JSON.stringify(quoteRail, null, 2)).toBe(markerColorBaseline!.quoteRailColor);

      const taskCheckbox = await page.evaluate((editorSelector) => {
        const task = Array.from(document.querySelectorAll<HTMLElement>(`${editorSelector} li[data-item-type="task"].editor-block-selected`))
          .find((element) => element.textContent?.includes('Large selection task checkbox sentinel'));
        if (!task) return null;

        const style = getComputedStyle(task, '::before');
        const parsePx = (value: string) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
          beforeBorderColor: style.borderTopColor,
          beforeContent: style.content,
          beforeDisplay: style.display,
          beforeHeightPx: parsePx(style.height),
          beforeWidthPx: parsePx(style.width),
          className: task.className,
        };
      }, EDITOR_SELECTOR);
      expect(taskCheckbox, 'large selected task checkbox metrics').not.toBeNull();
      expect(taskCheckbox!.className, JSON.stringify(taskCheckbox, null, 2)).toContain('editor-block-selected-large-item');
      expect(taskCheckbox!.beforeContent, JSON.stringify(taskCheckbox, null, 2)).not.toBe('none');
      expect(taskCheckbox!.beforeDisplay, JSON.stringify(taskCheckbox, null, 2)).not.toBe('none');
      expect(taskCheckbox!.beforeWidthPx, JSON.stringify(taskCheckbox, null, 2)).toBeGreaterThan(0);
      expect(taskCheckbox!.beforeHeightPx, JSON.stringify(taskCheckbox, null, 2)).toBeGreaterThan(0);
      expect(taskCheckbox!.beforeBorderColor, JSON.stringify(taskCheckbox, null, 2)).toBe(markerColorBaseline!.taskCheckboxBorderColor);

      const hrLine = await page.evaluate((editorSelector) => {
        const block = document.querySelector<HTMLElement>(
          `${editorSelector} .md-hr.editor-block-selected, ${editorSelector} hr.editor-block-selected`
        );
        if (!block) return null;

        const line = block.matches('hr')
          ? block
          : block.querySelector<HTMLElement>('hr') ?? block;
        const style = getComputedStyle(line, '::before');
        const parsePx = (value: string) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
          blockClassName: block.className,
          beforeBorderTopWidthPx: parsePx(style.borderTopWidth),
          beforeContent: style.content,
          beforeDisplay: style.display,
          lineTagName: line.tagName,
        };
      }, EDITOR_SELECTOR);
      expect(hrLine, 'large selected horizontal rule metrics').not.toBeNull();
      expect(hrLine!.blockClassName, JSON.stringify(hrLine, null, 2)).toContain('editor-block-selected-large-item');
      expect(hrLine!.beforeContent, JSON.stringify(hrLine, null, 2)).not.toBe('none');
      expect(hrLine!.beforeDisplay, JSON.stringify(hrLine, null, 2)).not.toBe('none');
      expect(hrLine!.beforeBorderTopWidthPx, JSON.stringify(hrLine, null, 2)).toBeGreaterThan(0);

      const targets = [
        {
          expectedClassName: 'editor-block-selected-large-textlike',
          forbiddenClassName: 'editor-block-selected-large-rich',
          label: 'large selection literal comment block',
          selector: `${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-literal-text.editor-block-selected`,
          text: '<!--Large selection literal comment-->',
        },
        {
          expectedClassName: 'editor-block-selected-large-rich',
          forbiddenClassName: 'editor-block-selected-large-textlike',
          label: 'large selection html block',
          selector: `${EDITOR_SELECTOR} [data-type="html-block"].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value="<!--vlaina-markdown-blank-line-->"]):not([data-value="<!--vlaina-rendered-html-boundary-blank-line-->"]):not([data-value="<!--vlaina-markdown-tight-heading-->"]).editor-block-selected`,
          text: 'Large selection HTML sentinel',
        },
        {
          expectedClassName: 'editor-block-selected-large-rich',
          forbiddenClassName: 'editor-block-selected-large-textlike',
          label: 'large selection math block',
          selector: `${EDITOR_SELECTOR} [data-type="math-block"].editor-block-selected`,
          text: null,
        },
        {
          expectedClassName: 'editor-block-selected-large-rich',
          forbiddenClassName: 'editor-block-selected-large-textlike',
          label: 'large selection mermaid block',
          selector: `${EDITOR_SELECTOR} [data-type="mermaid"].mermaid-block.editor-block-selected`,
          text: null,
        },
      ] as const;

      for (const target of targets) {
        await page.locator(target.selector).first().scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ));
        const metrics = await measureSelectedAtomicBlock(page, target.selector);
        expect(metrics, `${target.label} metrics`).not.toBeNull();
        if (target.text) {
          expect(metrics!.text, JSON.stringify(metrics, null, 2)).toContain(target.text);
        }
        expect(metrics!.className, JSON.stringify(metrics, null, 2)).toContain(target.expectedClassName);
        expect(metrics!.className, JSON.stringify(metrics, null, 2)).not.toContain(target.forbiddenClassName);
        expect(metrics!.overflowX, JSON.stringify(metrics, null, 2)).toBe('visible');
        expect(metrics!.overflowY, JSON.stringify(metrics, null, 2)).toBe('visible');
        expect(metrics!.contentVisibility, JSON.stringify(metrics, null, 2)).toBe('visible');
        expect(metrics!.contain, JSON.stringify(metrics, null, 2)).toBe('none');
        expect(metrics!.position, JSON.stringify(metrics, null, 2)).toBe('relative');
        expect(metrics!.hasAfterPaint, JSON.stringify(metrics, null, 2)).toBe(true);
        expect(metrics!.after?.left, JSON.stringify(metrics, null, 2)).toBeLessThan(-1);
        expect(metrics!.after?.right, JSON.stringify(metrics, null, 2)).toBeLessThan(-1);
        await expectSelectedAtomicSurfacePixels(page, metrics!, target.label);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps nested task list gap selection edges aligned during large selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-large-task-list-gap-selection-edge');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const listGapCases = [
        {
          label: 'task parent nested task',
          before: 'Task parent child before',
          after: 'Task parent child after',
          expectsTaskListGap: true,
          lines: [
            '- [ ] Task parent root',
            '  - [x] Task parent child before',
            '',
            '',
            '',
            '  - [x] Task parent child after',
            '- [x] Task parent following',
          ],
        },
        {
          label: 'task parent nested bullet',
          before: 'Task parent bullet before',
          after: 'Task parent bullet after',
          expectsTaskListGap: false,
          lines: [
            '- [ ] Task parent bullet root',
            '  - Task parent bullet before',
            '',
            '',
            '',
            '  - Task parent bullet after',
            '- [x] Task parent bullet following',
          ],
        },
        {
          label: 'task parent nested ordered',
          before: 'Task parent ordered before',
          after: 'Task parent ordered after',
          expectsTaskListGap: false,
          lines: [
            '- [ ] Task parent ordered root',
            '  1. Task parent ordered before',
            '',
            '',
            '',
            '  2. Task parent ordered after',
            '- [x] Task parent ordered following',
          ],
        },
        {
          label: 'bullet parent nested task',
          before: 'Bullet parent task before',
          after: 'Bullet parent task after',
          expectsTaskListGap: true,
          lines: [
            '- Bullet parent root',
            '  - [x] Bullet parent task before',
            '',
            '',
            '',
            '  - [x] Bullet parent task after',
            '- Bullet parent following',
          ],
        },
        {
          label: 'bullet parent nested bullet',
          before: 'Bullet parent bullet before',
          after: 'Bullet parent bullet after',
          expectsTaskListGap: false,
          lines: [
            '- Bullet parent root two',
            '  - Bullet parent bullet before',
            '',
            '',
            '',
            '  - Bullet parent bullet after',
            '- Bullet parent following two',
          ],
        },
        {
          label: 'bullet parent nested ordered',
          before: 'Bullet parent ordered before',
          after: 'Bullet parent ordered after',
          expectsTaskListGap: false,
          lines: [
            '- Bullet parent ordered root',
            '  1. Bullet parent ordered before',
            '',
            '',
            '',
            '  2. Bullet parent ordered after',
            '- Bullet parent ordered following',
          ],
        },
        {
          label: 'ordered parent nested task',
          before: 'Ordered parent task before',
          after: 'Ordered parent task after',
          expectsTaskListGap: true,
          lines: [
            '1. Ordered parent root',
            '   - [x] Ordered parent task before',
            '',
            '',
            '',
            '   - [x] Ordered parent task after',
            '2. Ordered parent following',
          ],
        },
        {
          label: 'ordered parent nested bullet',
          before: 'Ordered parent bullet before',
          after: 'Ordered parent bullet after',
          expectsTaskListGap: false,
          lines: [
            '1. Ordered parent bullet root',
            '   - Ordered parent bullet before',
            '',
            '',
            '',
            '   - Ordered parent bullet after',
            '2. Ordered parent bullet following',
          ],
        },
        {
          label: 'ordered parent nested ordered',
          before: 'Ordered parent ordered before',
          after: 'Ordered parent ordered after',
          expectsTaskListGap: false,
          lines: [
            '1. Ordered parent root two',
            '   1. Ordered parent ordered before',
            '',
            '',
            '',
            '   2. Ordered parent ordered after',
            '2. Ordered parent following two',
          ],
        },
      ] as const;

      await openMarkdownFixture(page, {
        filename: 'large-task-list-gap-selection-edge.md',
        content: [
          ...listGapCases.flatMap((section) => [...section.lines, '']),
          '',
          ...Array.from(
            { length: 160 },
            (_, index) => `Large task list gap tail paragraph ${index}.`,
          ).flatMap((paragraph) => [paragraph, '']),
        ].join('\n'),
      });

      for (const listCase of listGapCases) {
        await expect(page.locator(`${EDITOR_SELECTOR} li > p`, { hasText: new RegExp(`^${listCase.before}$`) })).toBeVisible();
        await expect(page.locator(`${EDITOR_SELECTOR} li > p`, { hasText: new RegExp(`^${listCase.after}$`) })).toBeVisible();
      }

      const selectionPlan = await page.evaluate((cases) => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          rangeText: string;
          tagName: string;
          text: string;
        }>;
        const selectedIndexes = Array.from(
          { length: Math.min(140, blocks.length) },
          (_, index) => index,
        );
        return {
          caseIndexes: cases.map((listCase) => ({
            label: listCase.label,
            beforeIndex: blocks.findIndex((block) => (
              block.text.trim() === listCase.before ||
              block.rangeText.trim() === listCase.before
            )),
            afterIndex: blocks.findIndex((block) => (
              block.text.trim() === listCase.after ||
              block.rangeText.trim() === listCase.after
            )),
          })),
          gapIndexes: blocks
            .map((block, index) => ({ block, index }))
            .filter(({ block }) => block.className.includes('editor-list-gap-placeholder-item'))
            .map(({ index }) => index),
          selectedIndexes,
          blocks: blocks.slice(0, 150).map((block, index) => ({
            className: block.className,
            index,
            rangeText: block.rangeText,
            tagName: block.tagName,
            text: block.text,
          })),
        };
      }, listGapCases);
      for (const row of selectionPlan.caseIndexes) {
        expect(row.beforeIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
        expect(row.afterIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
        expect(row.beforeIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
        expect(row.afterIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      }
      expect(selectionPlan.gapIndexes.length, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(listGapCases.length * 2);
      expect(selectionPlan.selectedIndexes.length, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(128);
      for (const gapIndex of selectionPlan.gapIndexes) {
        expect(gapIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.selectedIndexes.length);
      }

      const selectedCount = await selectNoteBlocksByIndexes(page, selectionPlan.selectedIndexes);
      expect(selectedCount, JSON.stringify(selectionPlan, null, 2)).toBe(selectionPlan.selectedIndexes.length);
      await expect.poll(() => page.evaluate((editorSelector) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        return {
          active: editor?.classList.contains('editor-block-selection-active') ?? false,
          large: editor?.classList.contains('editor-block-selection-large') ?? false,
          selectedCount: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
        };
      }, EDITOR_SELECTOR)).toMatchObject({
          active: false,
          large: true,
      });

      const geometry = await page.evaluate(({ cases, editorSelector }) => {
        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const readPaint = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          const hasAfterPaint = after.content !== 'none' &&
            after.display !== 'none' &&
            after.position === 'absolute';
          const afterLeftPx = hasAfterPaint ? parsePx(after.left) : null;
          return {
            afterDisplay: after.display,
            afterLeftPx,
            rectBottom: rect.bottom,
            className: element.className,
            paintLeft: hasAfterPaint && afterLeftPx !== null
              ? rect.left + afterLeftPx
              : rect.left,
            rectLeft: rect.left,
            rectTop: rect.top,
            text: element.textContent?.trim() ?? '',
          };
        };

        const directTaskText = (element: HTMLElement) =>
          element.querySelector<HTMLElement>(':scope > p')?.textContent?.trim() ?? '';
        const selectedTasks = Array.from(document.querySelectorAll<HTMLElement>(
          `${editorSelector} li.editor-block-selected`
        ));
        const selectedGaps = Array.from(document.querySelectorAll<HTMLElement>(
          `${editorSelector} li.editor-list-gap-placeholder-item.editor-block-selected`
        ));
        return cases.map((listCase) => {
          const before = selectedTasks.find((element) => directTaskText(element) === listCase.before) ?? null;
          const after = selectedTasks.find((element) => directTaskText(element) === listCase.after) ?? null;
          const beforeRect = before?.getBoundingClientRect();
          const afterRect = after?.getBoundingClientRect();
          const lower = beforeRect && afterRect ? Math.min(beforeRect.bottom, afterRect.top) - 2 : null;
          const upper = beforeRect && afterRect ? Math.max(beforeRect.bottom, afterRect.top) + 2 : null;
          const gaps = lower !== null && upper !== null
            ? selectedGaps
              .filter((gap) => {
                const rect = gap.getBoundingClientRect();
                const center = rect.top + rect.height / 2;
                return center >= lower && center <= upper;
              })
              .map(readPaint)
            : [];
          return {
            label: listCase.label,
            expectsTaskListGap: listCase.expectsTaskListGap,
            reference: before ? readPaint(before) : null,
            afterReference: after ? readPaint(after) : null,
            gaps,
          };
        });
      }, {
        cases: listGapCases,
        editorSelector: EDITOR_SELECTOR,
      });

      for (const row of geometry) {
        expect(row.reference, JSON.stringify({ selectionPlan, geometry, row }, null, 2)).not.toBeNull();
        expect(row.afterReference, JSON.stringify({ selectionPlan, geometry, row }, null, 2)).not.toBeNull();
        expect(row.gaps.length, JSON.stringify({ selectionPlan, geometry, row }, null, 2)).toBeGreaterThanOrEqual(2);
        for (const gap of row.gaps) {
          expect(gap.className, JSON.stringify({ selectionPlan, geometry, row, gap }, null, 2))
            .toContain('editor-block-selected-large-textlike');
          if (row.expectsTaskListGap) {
            expect(gap.className, JSON.stringify({ selectionPlan, geometry, row, gap }, null, 2))
              .toContain('editor-list-gap-placeholder-task-list');
          } else {
            expect(gap.className, JSON.stringify({ selectionPlan, geometry, row, gap }, null, 2))
              .not.toContain('editor-list-gap-placeholder-task-list');
          }
          expect(gap.afterDisplay, JSON.stringify({ selectionPlan, geometry, row, gap }, null, 2)).not.toBe('none');
          expect(Math.abs(gap.paintLeft - row.reference!.paintLeft), JSON.stringify({
            selectionPlan,
            geometry,
            row,
            gap,
          }, null, 2)).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps top-level task list gap selection edges aligned during large selections', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-top-level-task-list-gap-selection-edge');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'top-level-task-list-gap-selection-edge.md',
        content: [
          '# Top-level task list gap selection edge',
          '',
          '- [x] 喝',
          '',
          '',
          '',
          '- [ ] 玩',
          '',
          ...Array.from(
            { length: 160 },
            (_, index) => `Top-level task list gap tail paragraph ${index}.`,
          ).flatMap((paragraph) => [paragraph, '']),
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"]`, { hasText: '喝' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li[data-item-type="task"]`, { hasText: '玩' })).toBeVisible();

      const selectionPlan = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          rangeText: string;
          text: string;
        }>;
        const beforeIndex = blocks.findIndex((block) => block.text.trim() === '喝' || block.rangeText.trim() === '喝');
        const afterIndex = blocks.findIndex((block) => block.text.trim() === '玩' || block.rangeText.trim() === '玩');
        return {
          beforeIndex,
          afterIndex,
          gapIndexes: blocks
            .map((block, index) => ({ block, index }))
            .filter(({ block }) => block.className.includes('editor-list-gap-placeholder-item'))
            .map(({ index }) => index),
          selectedIndexes: Array.from(
            { length: Math.min(140, blocks.length) },
            (_, index) => index,
          ),
          blocks: blocks.slice(0, 12).map((block, index) => ({
            className: block.className,
            index,
            rangeText: block.rangeText,
            text: block.text,
          })),
        };
      });

      expect(selectionPlan.beforeIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(0);
      expect(selectionPlan.afterIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThan(selectionPlan.beforeIndex);
      expect(selectionPlan.gapIndexes.length, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThanOrEqual(2);
      for (const gapIndex of selectionPlan.gapIndexes) {
        expect(gapIndex, JSON.stringify(selectionPlan, null, 2)).toBeGreaterThan(selectionPlan.beforeIndex);
        expect(gapIndex, JSON.stringify(selectionPlan, null, 2)).toBeLessThan(selectionPlan.afterIndex);
      }

      const selectedCount = await selectNoteBlocksByIndexes(page, selectionPlan.selectedIndexes);
      expect(selectedCount, JSON.stringify(selectionPlan, null, 2)).toBe(selectionPlan.selectedIndexes.length);
      await expect.poll(() => page.evaluate((editorSelector) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        return {
          active: editor?.classList.contains('editor-block-selection-active') ?? false,
          large: editor?.classList.contains('editor-block-selection-large') ?? false,
          selectedCount: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
        };
      }, EDITOR_SELECTOR)).toMatchObject({
        active: false,
        large: true,
      });

      const geometry = await page.evaluate((editorSelector) => {
        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const readPaint = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          const hasAfterPaint = after.content !== 'none' &&
            after.display !== 'none' &&
            after.position === 'absolute';
          const afterLeftPx = hasAfterPaint ? parsePx(after.left) : null;
          return {
            afterDisplay: after.display,
            afterLeftPx,
            className: element.className,
            paintLeft: hasAfterPaint && afterLeftPx !== null
              ? rect.left + afterLeftPx
              : rect.left,
            rectLeft: rect.left,
            text: element.textContent?.trim() ?? '',
          };
        };
        const directTaskText = (element: HTMLElement) =>
          element.querySelector<HTMLElement>(':scope > p')?.textContent?.trim() ?? '';
        const selectedTasks = Array.from(document.querySelectorAll<HTMLElement>(
          `${editorSelector} li[data-item-type="task"].editor-block-selected`
        ));
        const before = selectedTasks.find((element) => directTaskText(element) === '喝') ?? null;
        const after = selectedTasks.find((element) => directTaskText(element) === '玩') ?? null;
        const selectedGaps = Array.from(document.querySelectorAll<HTMLElement>(
          `${editorSelector} li.editor-list-gap-placeholder-item.editor-block-selected`
        ));
        return {
          before: before ? readPaint(before) : null,
          after: after ? readPaint(after) : null,
          gaps: selectedGaps.map(readPaint),
        };
      }, EDITOR_SELECTOR);

      expect(geometry.before, JSON.stringify({ selectionPlan, geometry }, null, 2)).not.toBeNull();
      expect(geometry.after, JSON.stringify({ selectionPlan, geometry }, null, 2)).not.toBeNull();
      expect(geometry.gaps.length, JSON.stringify({ selectionPlan, geometry }, null, 2)).toBeGreaterThanOrEqual(2);
      for (const gap of geometry.gaps) {
        expect(gap.className, JSON.stringify({ selectionPlan, geometry, gap }, null, 2))
          .toContain('editor-list-gap-placeholder-task-list');
        expect(gap.className, JSON.stringify({ selectionPlan, geometry, gap }, null, 2))
          .toContain('editor-block-selected-large-textlike');
        expect(gap.afterDisplay, JSON.stringify({ selectionPlan, geometry, gap }, null, 2)).not.toBe('none');
        expect(Math.abs(gap.paintLeft - geometry.before!.paintLeft), JSON.stringify({
          selectionPlan,
          geometry,
          gap,
        }, null, 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(gap.paintLeft - geometry.after!.paintLeft), JSON.stringify({
          selectionPlan,
          geometry,
          gap,
        }, null, 2)).toBeLessThanOrEqual(1);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a visible gap between selected list items when the first has a direct code block', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-list-direct-code-selection-gap');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'list-direct-code-selection-gap.md',
        content: [
          'Paragraph before list direct code gap.',
          '',
          '- List direct code gap item',
          '  ```ts',
          '  const listDirectCodeGapSentinel = true;',
          '  ```',
          '- Next list item after direct code gap.',
        ].join('\n'),
      });

      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'listDirectCodeGapSentinel' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} li`, { hasText: 'Next list item after direct code gap.' })).toBeVisible();

      const indexes = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
          className: string;
          tagName: string;
          text: string;
        }>;
        const listIndex = blocks.findIndex((block) => (
          block.text.includes('List direct code gap item') &&
          block.text.includes('listDirectCodeGapSentinel')
        ));
        const nextItemIndex = blocks.findIndex((block) => block.text.includes('Next list item after direct code gap.'));
        return {
          listIndex,
          nextItemIndex,
          blocks: blocks.map((block, index) => ({
            index,
            className: block.className,
            tagName: block.tagName,
            text: block.text,
          })),
        };
      });
      expect(indexes.listIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThanOrEqual(0);
      expect(indexes.nextItemIndex, JSON.stringify(indexes, null, 2)).toBeGreaterThan(indexes.listIndex);

      const selectedCount = await selectNoteBlocksByIndexes(page, [indexes.listIndex, indexes.nextItemIndex]);
      expect(selectedCount, JSON.stringify(indexes, null, 2)).toBe(2);
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      ));

      const geometry = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) return null;

        const parsePx = (value: string, fallback = 0) => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolvePaintRect = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          if (after.content !== 'none' && after.display !== 'none' && after.position === 'absolute') {
            return {
              top: rect.top + parsePx(after.top),
              bottom: rect.bottom - parsePx(after.bottom),
              afterTop: after.top,
              afterBottom: after.bottom,
              afterDisplay: after.display,
              afterHeight: after.height,
              afterPosition: after.position,
            };
          }

          return {
            top: rect.top,
            bottom: rect.bottom,
            afterTop: '0px',
            afterBottom: '0px',
            afterDisplay: after.display,
            afterHeight: after.height,
            afterPosition: after.position,
          };
        };

        const rows = Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          .filter((element) => !element.classList.contains('editor-block-selected-parent-marker'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const paint = resolvePaintRect(element);
            return {
              tagName: element.tagName,
              text: element.textContent?.trim() ?? '',
              className: element.className,
              rectTop: Math.round(rect.top * 100) / 100,
              rectBottom: Math.round(rect.bottom * 100) / 100,
              paintTop: Math.round(paint.top * 100) / 100,
              paintBottom: Math.round(paint.bottom * 100) / 100,
              afterTop: paint.afterTop,
              afterBottom: paint.afterBottom,
              afterDisplay: paint.afterDisplay,
              afterHeight: paint.afterHeight,
              afterPosition: paint.afterPosition,
            };
          })
          .sort((left, right) => left.rectTop - right.rectTop);

        const listItem = rows.find((row) => row.className.includes('editor-block-selected-has-direct-code-block')) ?? null;
        const nextItem = rows.find((row) => row.text.includes('Next list item after direct code gap.')) ?? null;

        return {
          active: editor.classList.contains('editor-block-selection-active'),
          rows,
          listItem,
          nextItem,
          listToNextItemGap: listItem && nextItem
            ? Math.round((nextItem.paintTop - listItem.paintBottom) * 100) / 100
            : null,
        };
      });

      expect(geometry, 'list direct code block selection geometry').not.toBeNull();
      expect(geometry!.active, JSON.stringify({ indexes, geometry }, null, 2)).toBe(true);
      expect(geometry!.listItem, JSON.stringify({ indexes, geometry }, null, 2)).not.toBeNull();
      expect(geometry!.nextItem, JSON.stringify({ indexes, geometry }, null, 2)).not.toBeNull();
      expect(geometry!.listItem!.className, JSON.stringify({ indexes, geometry }, null, 2)).toContain('editor-block-selected-has-next');
      expect(geometry!.nextItem!.className, JSON.stringify({ indexes, geometry }, null, 2)).toContain('editor-block-selected-has-previous');
      expect(Number.parseFloat(geometry!.listItem!.afterBottom), JSON.stringify({ indexes, geometry }, null, 2)).toBeGreaterThanOrEqual(0.5);
      expect(geometry!.listToNextItemGap, JSON.stringify({ indexes, geometry }, null, 2)).toBeGreaterThan(0.5);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps inline-mark theme colors when selecting a hard-break paragraph block', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-inline-mark-hard-break');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 945, height: 1036 });
      const conflictTheme = await installBlockSelectionConflictTheme(page);

      await openMarkdownFixture(page, {
        filename: 'block-selection-inline-mark-hard-break.md',
        content: [
          '好的，我们现在来安装 **zsh + oh-my-zsh**，让你的服务器终端更好用、更漂亮、更高效。\\',
          '这是程序员几乎人手必装的环境，美观又强大。',
        ].join('\n'),
      });
      await expectImportedThemeRoot(page, conflictTheme.id);

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('zsh + oh-my-zsh');

      const selectedCount = await page.evaluate(async () => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{ text: string }>;
        const index = blocks.findIndex((block) => block.text.includes('zsh + oh-my-zsh'));
        if (index < 0) return 0;
        const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return count;
      });
      expect(selectedCount).toBe(1);

      const visibility = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const selectedElements = editor
          ? Array.from(editor.querySelectorAll<HTMLElement>('.editor-block-selected'))
          : [];
        if (!editor || selectedElements.length === 0) return null;

        const nodeRects: Array<{
          text: string;
          color: string;
          textFillColor: string;
          backgroundColor: string;
          hitClassName: string;
          hitTagName: string;
          hitText: string;
          rect: { height: number; left: number; top: number; width: number };
        }> = [];

        for (const selected of selectedElements) {
          const walker = document.createTreeWalker(selected, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            if (!text.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = Array.from(range.getClientRects()).find((candidate) => (
              candidate.width > 0 && candidate.height > 0
            ));
            range.detach();
            if (!rect) continue;

            const x = rect.left + Math.min(rect.width - 1, Math.max(1, rect.width / 2));
            const y = rect.top + Math.min(rect.height - 1, Math.max(1, rect.height / 2));
            const parent = node.parentElement ?? selected;
            const parentStyle = getComputedStyle(parent);
            const hit = document.elementFromPoint(x, y);
            nodeRects.push({
              text: text.trim(),
              color: parentStyle.color,
              textFillColor: parentStyle.webkitTextFillColor,
              backgroundColor: parentStyle.backgroundColor,
              hitClassName: hit instanceof HTMLElement ? hit.className : '',
              hitTagName: hit instanceof HTMLElement ? hit.tagName : '',
              hitText: hit instanceof HTMLElement ? (hit.textContent ?? '').replace(/\s+/g, ' ').trim() : '',
              rect: {
                height: Math.round(rect.height * 100) / 100,
                left: Math.round(rect.left * 100) / 100,
                top: Math.round(rect.top * 100) / 100,
                width: Math.round(rect.width * 100) / 100,
              },
            });
          }
        }

        const selected = selectedElements[0];
        const selectedStyle = getComputedStyle(selected);
        const strong = Array.from(editor.querySelectorAll<HTMLElement>('strong'))
          .find((element) => element.textContent?.includes('zsh + oh-my-zsh')) ?? null;
        const strongStyle = strong ? getComputedStyle(strong) : null;
        const after = getComputedStyle(selected, '::after');
        return {
          textClips: nodeRects.map((rect) => ({
            label: rect.text,
            left: Math.max(0, Math.floor(rect.rect.left)),
            top: Math.max(0, Math.floor(rect.rect.top)),
            width: Math.max(1, Math.ceil(rect.rect.width)),
            height: Math.max(1, Math.ceil(rect.rect.height)),
          })),
          selectedTexts: selectedElements.map((element) => element.textContent?.trim() ?? ''),
          selectedBackgroundColor: selectedStyle.backgroundColor,
          selectedClassName: selected.className,
          selectedColor: selectedStyle.color,
          selectedTextFillColor: selectedStyle.webkitTextFillColor,
          strongColor: strongStyle?.color ?? null,
          strongTextFillColor: strongStyle?.webkitTextFillColor ?? null,
          afterBackground: after.backgroundColor,
          afterContent: after.content,
          afterDisplay: after.display,
          afterZIndex: after.zIndex,
          nodeRects,
        };
      });

      expect(visibility, 'selected block visibility diagnostics').not.toBeNull();
      expect(visibility, JSON.stringify(visibility, null, 2)).toMatchObject({
        strongColor: 'rgb(180, 35, 24)',
        strongTextFillColor: 'rgb(180, 35, 24)',
      });
      expect(
        visibility!.nodeRects.some((rect) => (
          rect.text.includes('现在来安装') &&
          rect.hitText.includes('现在来安装')
        )),
        JSON.stringify(visibility, null, 2),
      ).toBe(true);
      expect(
        visibility!.nodeRects.some((rect) => (
          rect.text.includes('zsh + oh-my-zsh') &&
          rect.hitText.includes('zsh + oh-my-zsh')
        )),
        JSON.stringify(visibility, null, 2),
      ).toBe(true);
      expect(
        visibility!.nodeRects.every((rect) => (
          !rect.text.includes('zsh + oh-my-zsh') ||
          rect.backgroundColor === 'rgba(0, 0, 0, 0)'
        )),
        JSON.stringify(visibility, null, 2),
      ).toBe(true);
      const lineFillContinuity = await collectLineFillContinuity(page);
      expect(lineFillContinuity.fills.length, JSON.stringify(lineFillContinuity, null, 2)).toBeGreaterThanOrEqual(1);
      expect(
        lineFillContinuity.maxPositiveGap,
        JSON.stringify(lineFillContinuity, null, 2),
      ).toBeLessThanOrEqual(1);

      const clips = visibility!.textClips.filter((clip: TextClip) => (
        clip.label.includes('现在来安装') || clip.label.includes('zsh + oh-my-zsh')
      ));
      const samples = await Promise.all(clips.map((clip: TextClip) => measureBrightTextPixels(page, clip)));
      expect(
        samples.every((sample) => sample.brightRatio > 0.008 && sample.blueSelectionRatio > 0.35),
        JSON.stringify({ visibility, samples }, null, 2),
      ).toBe(true);

      await page.evaluate(() => (window as any).__vlainaE2E.selectNoteBlocksByIndexes([]));
      await expect.poll(() => page.evaluate(() =>
        document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length
      ), { timeout: 10_000 }).toBe(0);
      const dragTarget = await getBlankAreaDragTarget(page, 'zsh + oh-my-zsh');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      const dragPending = await dragBlankAreaSelectionUntilPending(page, dragTarget!, [
        { x: dragTarget!.endX, y: dragTarget!.startY + 12 },
        { x: dragTarget!.endX, y: dragTarget!.endY },
      ]);
      expect(dragPending, JSON.stringify(dragTarget, null, 2)).toBe(true);

      const pendingVisibility = await collectSelectedTextClips(page);
      expect(pendingVisibility, 'pending drag selected text clips').not.toBeNull();
      expect(pendingVisibility!.pending, JSON.stringify(pendingVisibility, null, 2)).toBe(true);
      const pendingClips = pendingVisibility!.textClips.filter((clip) => (
        clip.label.includes('现在来安装') || clip.label.includes('zsh + oh-my-zsh')
      ));
      const pendingSamples = await Promise.all(pendingClips.map((clip) => measureBrightTextPixels(page, clip)));
      expect(
        pendingSamples.every((sample) => sample.brightRatio > 0.008 && sample.blueSelectionRatio > 0.35),
        JSON.stringify({ pendingVisibility, pendingSamples }, null, 2),
      ).toBe(true);

      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps code block language header stable while blank-area dragging over code blocks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-block-selection-code-header-drag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const conflictTheme = await installBlockSelectionConflictTheme(page);

      await openMarkdownFixture(page, {
        filename: 'block-selection-code-header-drag.md',
        content: [
          'Drag selection anchor paragraph sentinel.',
          '',
          '```zsh',
          'echo "install zsh"',
          '```',
          '',
          'After code block sentinel.',
        ].join('\n'),
      });
      await expectImportedThemeRoot(page, conflictTheme.id);

      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-container`, { hasText: 'install zsh' })).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .code-block-chrome-language-label`).first()).toBeVisible();
      const languageLabel = page.locator(`${EDITOR_SELECTOR} .code-block-chrome-language-label`).first();
      const initialLabelText = await languageLabel.textContent();
      const initialLabelColor = await languageLabel.evaluate((element) => getComputedStyle(element).color);
      expect(initialLabelText?.trim()).toBeTruthy();

      const dragTarget = await getBlankAreaDragTarget(page, 'Drag selection anchor paragraph sentinel');
      expect(dragTarget, 'blank-area drag target').not.toBeNull();
      const codeHeaderPoint = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('.milkdown .ProseMirror .code-block-chrome-header');
        if (!header) return null;
        header.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = header.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      expect(codeHeaderPoint, 'code header point').not.toBeNull();

      await page.mouse.move(dragTarget!.startX, dragTarget!.startY);
      const dragPending = await dragBlankAreaSelectionUntilPending(page, dragTarget!, [
        {
          x: codeHeaderPoint!.x,
          y: codeHeaderPoint!.y,
        },
        {
          x: codeHeaderPoint!.x,
          y: codeHeaderPoint!.y + 24,
        },
      ]);
      expect(dragPending, JSON.stringify({ dragTarget, codeHeaderPoint }, null, 2)).toBe(true);

      const samples = await page.evaluate(async () => {
        const frames: Array<{
          copyOpacity: string;
          copyPointerEvents: string;
          headerDisplay: string;
          labelColor: string;
          labelDisplay: string;
          labelOpacity: string;
          labelText: string;
          labelVisibility: string;
          pending: boolean;
        }> = [];

        for (let index = 0; index < 12; index += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
          const header = document.querySelector<HTMLElement>('.milkdown .ProseMirror .code-block-chrome-header');
          const label = document.querySelector<HTMLElement>('.milkdown .ProseMirror .code-block-chrome-language-label');
          const copy = document.querySelector<HTMLElement>('.milkdown .ProseMirror .code-block-chrome-copy-button');
          const headerStyle = header ? getComputedStyle(header) : null;
          const labelStyle = label ? getComputedStyle(label) : null;
          const copyStyle = copy ? getComputedStyle(copy) : null;
          frames.push({
            copyOpacity: copyStyle?.opacity ?? '',
            copyPointerEvents: copyStyle?.pointerEvents ?? '',
            headerDisplay: headerStyle?.display ?? '',
            labelColor: labelStyle?.color ?? '',
            labelDisplay: labelStyle?.display ?? '',
            labelOpacity: labelStyle?.opacity ?? '',
            labelText: label?.textContent?.trim() ?? '',
            labelVisibility: labelStyle?.visibility ?? '',
            pending: editor?.classList.contains('editor-block-selection-pending') ?? false,
          });
        }

        return frames;
      });

      expect(samples.some((sample) => sample.pending), JSON.stringify(samples, null, 2)).toBe(true);
      expect(samples.every((sample) => (
        sample.headerDisplay !== 'none' &&
        sample.labelDisplay !== 'none' &&
        sample.labelVisibility !== 'hidden' &&
        sample.labelOpacity !== '0' &&
        sample.labelText === initialLabelText?.trim() &&
        sample.labelColor === initialLabelColor &&
        sample.copyOpacity === '0' &&
        sample.copyPointerEvents === 'none'
      )), JSON.stringify(samples, null, 2)).toBe(true);

      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
