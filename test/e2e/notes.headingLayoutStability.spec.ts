import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByText,
  waitForEditorAnimationFrame,
} from './notesE2E';

type BlockGeometry = {
  bottom: number;
  height: number;
  lineHeight: string;
  marginBottom: string;
  marginTop: string;
  top: number;
};

async function getBlockGeometry(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<BlockGeometry> {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      bottom: rect.bottom,
      height: rect.height,
      lineHeight: style.lineHeight,
      marginBottom: style.marginBottom,
      marginTop: style.marginTop,
      top: rect.top,
    };
  });
}

test.describe('notes heading layout stability', () => {
  test.setTimeout(90_000);

  test('keeps heading geometry stable across block selection and blank-line clicks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-layout-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const headingTexts = Array.from(
        { length: 6 },
        (_, index) => `Heading ${index + 1} layout sentinel`,
      );
      await openMarkdownFixture(page, {
        filename: 'heading-layout-stability-e2e.md',
        content: headingTexts.flatMap((text, index) => [
          `${'#'.repeat(index + 1)} ${text}`,
          '',
          `Paragraph after heading ${index + 1}`,
          '',
        ]).join('\n'),
      });

      for (const [index, headingText] of headingTexts.entries()) {
        const level = index + 1;
        const headingSelector = `${EDITOR_SELECTOR} h${level}`;
        const baseline = await getBlockGeometry(page, headingSelector);

        expect(await selectNoteBlocksByText(page, [headingText])).toBe(1);
        await waitForEditorAnimationFrame(page);
        expect(await getBlockGeometry(page, headingSelector)).toEqual(baseline);

        await selectNoteBlocksByText(page, []);
        const blankLine = page.locator([
          `${headingSelector} + [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]`,
          `${headingSelector} + p.editor-editable-markdown-blank-line`,
          `${headingSelector} + p:empty`,
        ].join(', ')).first();
        await expect(blankLine).toBeVisible();
        const blankBox = await blankLine.boundingBox();
        expect(blankBox).not.toBeNull();
        await page.mouse.click(blankBox!.x + blankBox!.width / 2, blankBox!.y + blankBox!.height / 2);
        await waitForEditorAnimationFrame(page);

        expect(await getBlockGeometry(page, headingSelector)).toEqual(baseline);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps heading geometry stable while selecting its text', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-text-selection-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-text-selection-layout-e2e.md',
        content: '# Heading text selection sentinel',
      });

      const headingSelector = `${EDITOR_SELECTOR} h1`;
      const baseline = await getBlockGeometry(page, headingSelector);
      const box = await page.locator(headingSelector).boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await expect(page.locator(
        `${headingSelector} .editor-text-selection-overlay:not(.heading-markdown-marker)`,
      )).toBeAttached();
      await waitForEditorAnimationFrame(page);

      expect(await getBlockGeometry(page, headingSelector)).toEqual(baseline);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps common markdown block geometry stable during block selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-block-layout-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'markdown-block-layout-stability-e2e.md',
        content: [
          'Paragraph with **strong**, *emphasis*, `inline code`, and [link](https://example.test).',
          '',
          '> Blockquote layout sentinel',
          '',
          '- Bullet layout sentinel',
          '',
          '1. Ordered layout sentinel',
          '',
          '```text',
          'Code block layout sentinel',
          '```',
          '',
          '| Table layout sentinel | Value |',
          '| --- | --- |',
          '| Row | 1 |',
        ].join('\n'),
      });

      const cases = [
        {
          selector: `${EDITOR_SELECTOR} > p`,
          text: 'Paragraph with strong, emphasis, inline code, and link.',
        },
        { selector: `${EDITOR_SELECTOR} > blockquote`, text: 'Blockquote layout sentinel' },
        { selector: `${EDITOR_SELECTOR} ul > li`, text: 'Bullet layout sentinel' },
        { selector: `${EDITOR_SELECTOR} ol > li`, text: 'Ordered layout sentinel' },
        { selector: `${EDITOR_SELECTOR} .code-block-container`, text: 'Code block layout sentinel' },
        { selector: `${EDITOR_SELECTOR} .milkdown-table-block`, text: 'Table layout sentinel' },
      ];

      for (const syntaxCase of cases) {
        const target = page.locator(syntaxCase.selector, { hasText: syntaxCase.text }).first();
        await expect(target).toBeVisible();
        const baseline = await getBlockGeometry(page, syntaxCase.selector);

        expect(await selectNoteBlocksByText(page, [syntaxCase.text])).toBe(1);
        await waitForEditorAnimationFrame(page);
        expect(await getBlockGeometry(page, syntaxCase.selector)).toEqual(baseline);
        await selectNoteBlocksByText(page, []);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
