import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const PROSEMIRROR_CARET_SELECTOR = [
  '.editor-textblock-caret-overlay',
  '.editor-forced-line-end-caret',
].join(', ');
const BLANK_LINE_SELECTOR = [
  `${EDITOR_SELECTOR} [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]`,
  `${EDITOR_SELECTOR} p.editor-editable-markdown-blank-line`,
  `${EDITOR_SELECTOR} p:empty`,
].join(', ');

async function clickTextTarget(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await target.page().mouse.click(
    box!.x + Math.max(2, Math.min(box!.width - 2, box!.width * 0.6)),
    box!.y + box!.height / 2,
  );
}

async function expectOverlayMatchesLineHeight(
  page: Page,
  label: string,
  line: Locator,
  caretSelector: string,
): Promise<void> {
  await expect.poll(async () => line.evaluate((element, selector) => {
    const caret = document.querySelector<HTMLElement>(selector);
    const caretHeight = caret?.getBoundingClientRect().height ?? 0;
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    return Number.isFinite(lineHeight) && caretHeight > 0
      ? Math.abs(caretHeight - lineHeight)
      : Number.POSITIVE_INFINITY;
  }, caretSelector), {
    message: `${label} caret should match its rendered line height`,
    timeout: 10_000,
  }).toBeLessThanOrEqual(0.75);
}

async function focusTextControlAtEnd(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await control.evaluate((element) => {
    const textControl = element as HTMLInputElement | HTMLTextAreaElement;
    textControl.setSelectionRange(textControl.value.length, textControl.value.length);
    document.dispatchEvent(new Event('vlaina:native-caret-overlay-refresh'));
  });
}

async function clickTrailingBlankArea(target: Locator): Promise<void> {
  const clickPoint = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const editorBox = element.closest('.ProseMirror')?.getBoundingClientRect() ?? box;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    range.detach();
    const textRight = Math.max(...textRects.map((rect) => rect.right));
    return {
      x: Math.min(editorBox.right - 12, textRight + 24),
      y: textRects[0]?.top + textRects[0]?.height / 2 || box.top + box.height / 2,
    };
  });
  await target.page().mouse.click(clickPoint.x, clickPoint.y);
}

async function setLineHeight(target: Locator, lineHeight: number): Promise<void> {
  await target.evaluate((element, value) => {
    (element as HTMLElement).style.lineHeight = `${value}px`;
  }, lineHeight);
}

test.describe('notes caret height', () => {
  test.setTimeout(120_000);

  test('matches the active visual line across Notes editing surfaces', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-caret-height');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 900 });
      await openMarkdownFixture(page, {
        filename: 'caret-height.md',
        content: [
          '---',
          'caret: height',
          '---',
          '',
          '# Heading caret target',
          '',
          'Paragraph caret target.',
          '',
          'Forced line-end caret target.',
          '',
          '- List caret target.',
          '',
          '| Key | Value |',
          '| --- | --- |',
          '| Table caret target | value |',
          '',
          '```ts',
          'const codeCaretTarget = true;',
          '```',
        ].join('\n'),
      });

      const title = page.locator('[data-note-title-input="true"]');
      await focusTextControlAtEnd(title);
      await expectOverlayMatchesLineHeight(page, 'note title', title, '.native-caret-overlay');

      const editor = page.locator(EDITOR_SELECTOR);
      const heading = editor.locator('h1', { hasText: 'Heading caret target' });
      await clickTextTarget(heading);
      await expectOverlayMatchesLineHeight(page, 'heading', heading, PROSEMIRROR_CARET_SELECTOR);

      const paragraph = editor.locator('p', { hasText: 'Paragraph caret target' });
      await clickTextTarget(paragraph);
      await expectOverlayMatchesLineHeight(page, 'paragraph', paragraph, PROSEMIRROR_CARET_SELECTOR);

      await setLineHeight(paragraph, 41);
      await expectOverlayMatchesLineHeight(page, 'restyled paragraph', paragraph, PROSEMIRROR_CARET_SELECTOR);

      const forcedLineEnd = editor.locator('p', { hasText: 'Forced line-end caret target' });
      await clickTrailingBlankArea(forcedLineEnd);
      await expect(page.locator('.editor-forced-line-end-caret')).toBeVisible();
      await expectOverlayMatchesLineHeight(
        page,
        'forced line-end',
        forcedLineEnd,
        '.editor-forced-line-end-caret',
      );

      const blankLine = page.locator(BLANK_LINE_SELECTOR).filter({ visible: true }).first();
      await expect(blankLine).toBeVisible();
      await clickTextTarget(blankLine);
      await expectOverlayMatchesLineHeight(page, 'blank line', blankLine, PROSEMIRROR_CARET_SELECTOR);

      const listParagraph = editor.locator('li', { hasText: 'List caret target' }).locator('p');
      await clickTextTarget(listParagraph);
      await expectOverlayMatchesLineHeight(page, 'list paragraph', listParagraph, PROSEMIRROR_CARET_SELECTOR);

      const tableParagraph = editor.locator('td', { hasText: 'Table caret target' }).locator('p');
      await clickTextTarget(tableParagraph);
      await expectOverlayMatchesLineHeight(page, 'table paragraph', tableParagraph, PROSEMIRROR_CARET_SELECTOR);

      const frontmatterLine = editor.locator('.frontmatter-block-container .cm-line').first();
      await clickTextTarget(frontmatterLine);
      await expectOverlayMatchesLineHeight(
        page,
        'frontmatter',
        frontmatterLine,
        '.frontmatter-block-container .cm-cursor-primary',
      );

      const codeLine = editor.locator('.code-block-container .cm-line').first();
      await clickTextTarget(codeLine);
      await expectOverlayMatchesLineHeight(
        page,
        'code block',
        codeLine,
        '.code-block-container .cm-cursor-primary',
      );
      await setLineHeight(codeLine, 37);
      await expectOverlayMatchesLineHeight(
        page,
        'restyled code block',
        codeLine,
        '.code-block-container .cm-cursor-primary',
      );

      await page.keyboard.press('Control+/');
      const sourceEditor = page.locator('[data-note-source-editor="true"]');
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await focusTextControlAtEnd(sourceEditor);
      const sourceCaret = await sourceEditor.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: document.activeElement === element,
          caretColor: style.caretColor,
          hasCustomOverlay: Boolean(document.querySelector('.native-caret-overlay')),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(sourceCaret.active).toBe(true);
      expect(sourceCaret.hasCustomOverlay).toBe(false);
      expect(sourceCaret.caretColor).not.toBe('transparent');
      expect(sourceCaret.lineHeight).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
