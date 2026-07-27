import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  SELECTED_BLOCK_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openMarkdownFixture,
  openNotesRootInNotes,
  selectNoteBlocksByText,
  waitForEditorAnimationFrame,
} from './notesE2E';

const BLANK_LINE_SELECTOR = `${EDITOR_SELECTOR} [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"], ${EDITOR_SELECTOR} p.editor-editable-markdown-blank-line, ${EDITOR_SELECTOR} p:empty`;
const SELECTED_NODE_SELECTOR = `${EDITOR_SELECTOR} .ProseMirror-selectednode`;
const SELECTED_MARKDOWN_BLANK_LINE_SELECTOR = [
  `${EDITOR_SELECTOR} [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"].editor-block-selected`,
  `${EDITOR_SELECTOR} [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"].ProseMirror-selectednode`,
  `${EDITOR_SELECTOR} p.editor-editable-markdown-blank-line.editor-block-selected`,
  `${EDITOR_SELECTOR} p.editor-editable-markdown-blank-line.ProseMirror-selectednode`,
].join(', ');

test.describe('notes blank line caret interaction', () => {
  test.setTimeout(120_000);

  test('places the caret into a blank markdown line when clicked', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-caret');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'blank-line-caret-e2e.md',
        content: ['Alpha blank line sentinel', '', 'Beta blank line sentinel'].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha blank line sentinel');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Beta blank line sentinel');
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);

      const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
      await expect(blankLine).toBeVisible({ timeout: 30_000 });
      await blankLine.scrollIntoViewIfNeeded();

      const box = await blankLine.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.type('Inserted blank line text');

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        selectedBlocks: editor.querySelectorAll('.editor-block-selected').length,
        activeElementClass: document.activeElement?.getAttribute('class') ?? '',
        domSelection: window.getSelection()?.toString() ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => ({
          text: paragraph.textContent ?? '',
          className: paragraph.getAttribute('class') ?? '',
        })),
      }));

      expect(after.selectedBlocks).toBe(0);
      expect(after.domSelection).toBe('');
      expect(after.text).toContain('Alpha blank line sentinel');
      expect(after.text).toContain('Inserted blank line text');
      expect(after.text).toContain('Beta blank line sentinel');
      expect(after.paragraphs.map((paragraph) => paragraph.text)).toEqual([
        'Alpha blank line sentinel',
        'Inserted blank line text',
        'Beta blank line sentinel',
      ]);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash text typed into a middle blank markdown line as its own paragraph', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-slash-text');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'blank-line-slash-text-e2e.md',
        content: ['hi', '', '1'].join('\n'),
      });

      const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
      await expect(blankLine).toBeVisible({ timeout: 30_000 });
      const box = await blankLine.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.type('/h');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => ({
          text: paragraph.textContent ?? '',
          className: paragraph.getAttribute('class') ?? '',
        })),
      }));

      expect(after.paragraphs.map((paragraph) => paragraph.text)).toEqual(['hi', '/h', '1']);
      expect(after.text, { after }).toContain('hi');
      expect(after.text, { after }).toContain('/h');
      expect(after.text, { after }).toContain('1');

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved }).toBe(['hi', '/h', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('hi\n\n/h');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash html text typed into a middle blank markdown line without hard-break backslashes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-slash-html-text');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'blank-line-slash-html-text-e2e.md',
        content: ['hi', '', '1'].join('\n'),
      });

      const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
      await expect(blankLine).toBeVisible({ timeout: 30_000 });
      const box = await blankLine.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.type('/html');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? ''),
      }));
      expect(after.paragraphs).toEqual(['hi', '/html', '1']);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '/html', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('hi\n\n/html');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/html\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash text typed after clicking between paragraphs as its own paragraph', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-slash-gap-click');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'blank-line-slash-gap-click-e2e.md',
        content: ['hi', '', '1'].join('\n'),
      });

      const hiParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^hi$/ }).first();
      const oneParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^1$/ }).first();
      await expect(hiParagraph).toBeVisible({ timeout: 30_000 });
      await expect(oneParagraph).toBeVisible({ timeout: 30_000 });
      const hiBox = await hiParagraph.boundingBox();
      const oneBox = await oneParagraph.boundingBox();
      expect(hiBox).not.toBeNull();
      expect(oneBox).not.toBeNull();

      await page.mouse.click(
        hiBox!.x + 4,
        Math.round((hiBox!.y + hiBox!.height + oneBox!.y) / 2),
      );
      await page.keyboard.type('/h');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => ({
          text: paragraph.textContent ?? '',
          className: paragraph.getAttribute('class') ?? '',
        })),
      }));

      expect(after.paragraphs.map((paragraph) => paragraph.text)).toEqual(['hi', '/h', '1']);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '/h', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('hi\n\n/h');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('runs a slash heading command from a middle blank markdown line without hard-break joining neighbors', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-slash-heading');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'blank-line-slash-heading-e2e.md',
        content: ['hi', '', '1'].join('\n'),
      });

      const hiParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^hi$/ }).first();
      const oneParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^1$/ }).first();
      await expect(hiParagraph).toBeVisible({ timeout: 30_000 });
      await expect(oneParagraph).toBeVisible({ timeout: 30_000 });
      const hiBox = await hiParagraph.boundingBox();
      const oneBox = await oneParagraph.boundingBox();
      expect(hiBox).not.toBeNull();
      expect(oneBox).not.toBeNull();

      await page.mouse.click(
        hiBox!.x + 4,
        Math.round((hiBox!.y + hiBox!.height + oneBox!.y) / 2),
      );
      await page.keyboard.type('/h');
      await expect(page.locator('.slash-menu-item.selected')).toContainText('Heading 1');
      await page.keyboard.press('Enter');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        blocks: Array.from(editor.children).map((child) => ({
          tagName: child.tagName,
          text: child.textContent ?? '',
          className: child.getAttribute('class') ?? '',
        })),
      }));

      expect(after.blocks.map((block) => ({ tagName: block.tagName, text: block.text }))).toEqual([
        { tagName: 'P', text: 'hi' },
        { tagName: 'H1', text: '' },
        { tagName: 'P', text: '1' },
      ]);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '#', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('hi\n\n#');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash text in a freshly typed middle line without adding blank lines', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-fresh-blank-line-slash');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'fresh-blank-line-slash-e2e.md',
        content: '',
      });

      await page.locator(EDITOR_SELECTOR).click();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('1');
      await waitForEditorAnimationFrame(page);

      const hiParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^hi$/ }).first();
      const oneParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: /^1$/ }).first();
      await expect(hiParagraph).toBeVisible({ timeout: 30_000 });
      await expect(oneParagraph).toBeVisible({ timeout: 30_000 });
      const hiBox = await hiParagraph.boundingBox();
      const oneBox = await oneParagraph.boundingBox();
      expect(hiBox).not.toBeNull();
      expect(oneBox).not.toBeNull();

      await page.mouse.click(
        hiBox!.x + 4,
        Math.round((hiBox!.y + hiBox!.height + oneBox!.y) / 2),
      );
      await page.keyboard.type('/h');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => ({
          text: paragraph.textContent ?? '',
          className: paragraph.getAttribute('class') ?? '',
        })),
      }));

      expect(after.paragraphs.map((paragraph) => paragraph.text)).toEqual(['hi', '/h', '1']);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '/h', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('\n\n');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash html text in a freshly typed middle line without adding blank lines', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-fresh-blank-line-keyboard-slash-html');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'fresh-blank-line-keyboard-slash-html-e2e.md',
        content: '',
      });

      await page.locator(EDITOR_SELECTOR).click();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('1');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.type('/html');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? ''),
      }));
      expect(after.paragraphs, { after }).toEqual(['hi', '/html', '1']);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '/html', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('\n\n');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/html\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash heading text in a freshly typed middle line without adding blank lines', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-fresh-blank-line-keyboard-slash-heading-text');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'fresh-blank-line-keyboard-slash-heading-text-e2e.md',
        content: '',
      });

      await page.locator(EDITOR_SELECTOR).click();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('1');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.type('/h');
      await waitForEditorAnimationFrame(page);

      const after = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        text: editor.textContent ?? '',
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? ''),
      }));
      expect(after.paragraphs, { after }).toEqual(['hi', '/h', '1']);

      await expect.poll(
        async () => page.evaluate(() => (
          (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
        )),
        { timeout: 3_000 },
      ).toBe(['hi', '/h', '1'].join('\n'));
      const liveContent = await page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
      ));
      expect(liveContent, { liveContent, after }).toBe(['hi', '/h', '1'].join('\n'));
      expect(liveContent, { liveContent }).not.toContain('\n\n');
      expect(liveContent, { liveContent }).not.toContain('hi\\');
      expect(liveContent, { liveContent }).not.toContain('/h\\');

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved, after }).toBe(['hi', '/h', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('\n\n');
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps slash heading text typed after a fresh blank line without hard-break backslashes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-fresh-blank-line-forward-slash-heading-text');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const opened = await openMarkdownFixture(page, {
        filename: 'fresh-blank-line-forward-slash-heading-text-e2e.md',
        content: '',
      });

      await page.locator(EDITOR_SELECTOR).click();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/h');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      await page.keyboard.type('1');
      await waitForEditorAnimationFrame(page);

      await expect.poll(
        async () => page.evaluate(() => (
          (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
        )),
        { timeout: 3_000 },
      ).toBe(['hi', '', '/h', '1'].join('\n'));
      const liveContent = await page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
      ));
      expect(liveContent, { liveContent }).not.toContain('hi\\');
      expect(liveContent, { liveContent }).not.toContain('/h\\');

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      expect(saved, { saved }).toBe(['hi', '', '/h', '1'].join('\n'));
      expect(saved, { saved }).not.toContain('hi\\');
      expect(saved, { saved }).not.toContain('/h\\');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not block-select markdown blank lines when moving through them with keyboard', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-keyboard-navigation');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const betaText = 'Beta keyboard blank line sentinel';
      await openMarkdownFixture(page, {
        filename: 'blank-line-keyboard-navigation-e2e.md',
        content: [
          'Alpha keyboard blank line sentinel',
          '',
          betaText,
          '',
          'Gamma keyboard blank line sentinel',
        ].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText(betaText);
      await expect(page.locator(BLANK_LINE_SELECTOR)).toHaveCount(2);

      const selectBetaText = async () => {
        const selected = await page.evaluate(
          (targetText) => (window as any).__vlainaE2E.selectEditorTextByText(targetText, targetText),
          betaText,
        );
        expect(selected.selected).toBe(true);
        return selected as { from: number; to: number };
      };

      const assertNoBlankLineSelection = async () => {
        await waitForEditorAnimationFrame(page);
        await waitForEditorAnimationFrame(page);
        await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
        await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
        await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
        await expect.poll(
          async () => page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary()),
          { timeout: 5_000 },
        ).toMatchObject({
          empty: true,
          selectedText: '',
        });
      };

      const selectedForUp = await selectBetaText();
      await page.keyboard.press('ArrowLeft');
      await waitForEditorAnimationFrame(page);
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary()),
        { timeout: 5_000 },
      ).toMatchObject({
        empty: true,
        from: selectedForUp.from,
      });
      await page.keyboard.press('ArrowUp');
      await assertNoBlankLineSelection();

      const selectedForDown = await selectBetaText();
      await page.keyboard.press('ArrowRight');
      await waitForEditorAnimationFrame(page);
      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary()),
        { timeout: 5_000 },
      ).toMatchObject({
        empty: true,
        from: selectedForDown.to,
      });
      await page.keyboard.press('ArrowDown');
      await assertNoBlankLineSelection();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not auto-select markdown blank line blocks when switching notes from the file tree', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-blank-line-file-tree-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'blank-line-file-tree-selection',
        files: [
          {
            filename: 'alpha-blank-lines.md',
            content: ['Alpha file tree sentinel', '', 'Alpha after blank line'].join('\n'),
          },
          {
            filename: 'beta-blank-lines.md',
            content: ['Beta file tree sentinel', '', 'Beta after blank line'].join('\n'),
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Blank Line Selection NotesRoot',
        minFileCount: 2,
      });

      for (const filename of ['alpha-blank-lines', 'beta-blank-lines', 'alpha-blank-lines']) {
        await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: filename }).first().click();
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(
          filename.startsWith('alpha') ? 'Alpha file tree sentinel' : 'Beta file tree sentinel',
          { timeout: 30_000 }
        );
        await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
        await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
        await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not auto-select leading markdown blank line blocks when opening notes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-leading-blank-line-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'leading-blank-line-selection-e2e.md',
        content: ['', 'Leading blank line sentinel', '', 'Body after leading blank line'].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Leading blank line sentinel');
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not select the next leading blank line after deleting the top blank line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-delete-leading-blank-line-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'delete-leading-blank-line-selection-e2e.md',
        content: ['', '', 'Body after two leading blank lines'].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Body after two leading blank lines');
      await expect(page.locator(BLANK_LINE_SELECTOR)).toHaveCount(2);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);

      const body = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body after two leading blank lines' }).first();
      await expect(body).toBeVisible({ timeout: 30_000 });
      await body.click({ position: { x: 1, y: 8 } });
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Backspace');
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      await expect(page.locator(BLANK_LINE_SELECTOR)).toHaveCount(1);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not native-select leading blank lines after Delete or repeated Backspace', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-clicked-leading-blank-line-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const runCase = async (label: string, key: 'Backspace' | 'Delete', presses = 1) => {
        await openMarkdownFixture(page, {
          filename: `${label}.md`,
          content: ['', '', `Body ${label}`].join('\n'),
        });
        const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
        await expect(blankLine).toBeVisible({ timeout: 30_000 });
        const box = await blankLine.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
        for (let index = 0; index < presses; index += 1) {
          await page.keyboard.press(key);
          await waitForEditorAnimationFrame(page);
        }
        await waitForEditorAnimationFrame(page);

        const diagnostics = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
          text: editor.textContent ?? '',
          selectedBlocks: editor.querySelectorAll('.editor-block-selected').length,
          selectedNodes: Array.from(editor.querySelectorAll<HTMLElement>('.ProseMirror-selectednode')).map((element) => ({
            tagName: element.tagName,
            className: element.className,
            dataType: element.getAttribute('data-type'),
            dataValue: element.getAttribute('data-value'),
            text: element.textContent,
          })),
          selectedMarkdownBlankLines: editor.querySelectorAll(
            '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"].editor-block-selected, [data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"].ProseMirror-selectednode, p.editor-editable-markdown-blank-line.editor-block-selected, p.editor-editable-markdown-blank-line.ProseMirror-selectednode'
          ).length,
          blankLines: editor.querySelectorAll('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"], p.editor-editable-markdown-blank-line, p:empty').length,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        }));
        expect(diagnostics.text, JSON.stringify(diagnostics, null, 2)).toContain(`Body ${label}`);
        expect(diagnostics.blankLines, JSON.stringify(diagnostics, null, 2)).toBeLessThanOrEqual(1);
        expect(diagnostics.selectedBlocks, JSON.stringify(diagnostics, null, 2)).toBe(0);
        expect(diagnostics.selectedNodes, JSON.stringify(diagnostics, null, 2)).toHaveLength(0);
        expect(diagnostics.selectedMarkdownBlankLines, JSON.stringify(diagnostics, null, 2)).toBe(0);
        await expect.poll(
          async () => page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary()),
          { timeout: 5_000 },
        ).toMatchObject({
          empty: true,
          selectedText: '',
        });
      };

      await runCase('double-backspace-on-clicked-leading-blank', 'Backspace', 2);
      await runCase('delete-on-clicked-leading-blank', 'Delete');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('deletes a clicked blank line between a heading and an ordered list', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-ordered-list-blank-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      for (const key of ['Backspace', 'Delete'] as const) {
        const opened = await openMarkdownFixture(page, {
          filename: `heading-ordered-list-blank-${key.toLowerCase()}.md`,
          content: ['# 1', '', '1. 1'].join('\n'),
        });

        await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: '1' })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(`${EDITOR_SELECTOR} ol li`, { hasText: '1' })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(BLANK_LINE_SELECTOR)).toHaveCount(1);

        const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
        const box = await blankLine.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await page.keyboard.press(key);
        await waitForEditorAnimationFrame(page);
        await waitForEditorAnimationFrame(page);

        const diagnostics = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
          blankLines: editor.querySelectorAll(
            '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"], p.editor-editable-markdown-blank-line, p:empty'
          ).length,
          headings: Array.from(editor.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) => heading.textContent ?? ''),
          orderedItems: Array.from(editor.querySelectorAll('ol li')).map((item) => item.textContent ?? ''),
          selectedBlocks: editor.querySelectorAll('.editor-block-selected').length,
          selectedNodes: editor.querySelectorAll('.ProseMirror-selectednode').length,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
          text: editor.textContent ?? '',
        }));

        expect(diagnostics.blankLines, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(0);
        expect(diagnostics.headings, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toEqual(['1']);
        expect(diagnostics.orderedItems, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toEqual(['1']);
        expect(diagnostics.selectedBlocks, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(0);
        expect(diagnostics.selectedNodes, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(0);
        expect(diagnostics.selection.empty, `${key}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(true);

        await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
        const saved = await page.evaluate(
          (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
          opened.notePath,
        );
        expect(saved, key).not.toContain('# 1\n\n1. 1');
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the caret out of a heading when Delete removes a blank line above it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-leading-blank-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'heading-leading-blank-delete-e2e.md',
        content: ['Intro before heading blank', '', '# Heading after blank'].join('\n'),
      });
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Heading after blank' })).toBeVisible({
        timeout: 30_000,
      });

      const blankLine = page.locator(BLANK_LINE_SELECTOR).first();
      await expect(blankLine).toBeVisible({ timeout: 30_000 });
      const box = await blankLine.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.press('Delete');
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      const diagnostics = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        headings: Array.from(editor.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) => ({
          tagName: heading.tagName,
          text: heading.textContent ?? '',
        })),
        paragraphs: Array.from(editor.querySelectorAll('p')).map((paragraph) => ({
          text: paragraph.textContent ?? '',
          className: paragraph.getAttribute('class') ?? '',
        })),
        blankLines: editor.querySelectorAll(
          '[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"], p.editor-editable-markdown-blank-line, p:empty'
        ).length,
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        selectionBlock: (() => {
          const selection = window.getSelection();
          const anchor = selection?.anchorNode;
          const anchorElement = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
          const block = anchorElement?.closest('p,h1,h2,h3,h4,h5,h6');
          return block instanceof HTMLElement
            ? {
              tagName: block.tagName,
              text: block.textContent ?? '',
              className: block.getAttribute('class') ?? '',
            }
            : null;
        })(),
      }));
      expect(diagnostics.headings, JSON.stringify(diagnostics, null, 2)).toEqual([{
        tagName: 'H1',
        text: 'Heading after blank',
      }]);
      expect(diagnostics.blankLines, JSON.stringify(diagnostics, null, 2)).toBe(0);
      expect(diagnostics.selectionBlock, JSON.stringify(diagnostics, null, 2)).toMatchObject({
        tagName: 'P',
        text: 'Intro before heading blank',
      });
      const marker = ' TypedAfterHeadingBlankDelete';
      await page.keyboard.type(marker, { delay: 0 });
      await waitForEditorAnimationFrame(page);

      const afterType = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        headingText: editor.querySelector('h1')?.textContent ?? '',
        paragraphTexts: Array.from(editor.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? ''),
      }));
      expect(afterType.headingText, JSON.stringify(afterType, null, 2)).toBe('Heading after blank');
      expect(afterType.paragraphTexts, JSON.stringify(afterType, null, 2)).toContain(
        `Intro before heading blank${marker}`,
      );
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the caret out of a heading when deleting a fresh Enter-created blank line above it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-fresh-enter-blank-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'heading-fresh-enter-blank-delete-e2e.md',
        content: ['Intro before fresh blank', '# Heading after fresh blank'].join('\n'),
      });
      await expect(page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Heading after fresh blank' })).toBeVisible({
        timeout: 30_000,
      });

      const intro = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Intro before fresh blank' }).first();
      await expect(intro).toBeVisible({ timeout: 30_000 });
      const selectedIntro = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectEditorTextByText(
          'Intro before fresh blank',
          'Intro before fresh blank',
        )
      );
      expect(selectedIntro).toMatchObject({
        selected: true,
        selectedText: 'Intro before fresh blank',
      });
      expect(typeof selectedIntro.to).toBe('number');
      await page.evaluate((position) =>
        (window as any).__vlainaE2E.setEditorSelectionRange(position), selectedIntro.to
      );
      await page.keyboard.press('Enter');
      await waitForEditorAnimationFrame(page);
      await page.keyboard.press('Delete');
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      const marker = ' TypedAfterFreshBlankDelete';
      await page.keyboard.type(marker, { delay: 0 });
      await waitForEditorAnimationFrame(page);

      const afterType = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        headingText: editor.querySelector('h1')?.textContent ?? '',
        paragraphTexts: Array.from(editor.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? ''),
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      }));
      expect(afterType.headingText, JSON.stringify(afterType, null, 2)).toBe('Heading after fresh blank');
      expect(afterType.paragraphTexts, JSON.stringify(afterType, null, 2)).toContain(
        `Intro before fresh blank${marker}`,
      );
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not select or delete a details html block when deleting blank lines above it', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-details-leading-blank-delete');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const detailsWithLeadingBlankLines = [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '<details>',
        '<summary>Title</summary>',
        '',
        'Content',
        '</details>',
      ].join('\n');
      const detailsWithSingleLeadingBlankLine = [
        '',
        '<details>',
        '<summary>Title</summary>',
        '',
        'Content',
        '</details>',
      ].join('\n');

      const opened = await openMarkdownFixture(page, {
        filename: 'details-leading-blank-delete.md',
        content: detailsWithLeadingBlankLines,
      });

      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="html-block"]`, { hasText: 'Title' })).toBeVisible({
        timeout: 30_000,
      });

      const clickBlankBeforeDetails = async () => {
        const clicked = await page.evaluate(({ editorSelector }) => {
          const editor = document.querySelector<HTMLElement>(editorSelector);
          const detailsBlock = Array.from(editor?.querySelectorAll<HTMLElement>('[data-type="html-block"]') ?? [])
            .find((element) => element.textContent?.includes('Title'));
          const blank = detailsBlock?.previousElementSibling instanceof HTMLElement
            ? detailsBlock.previousElementSibling
            : null;
          if (!blank) return null;
          const rect = blank.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            className: blank.className,
            dataType: blank.dataset.type ?? '',
            dataValue: blank.dataset.value ?? '',
            text: blank.textContent ?? '',
          };
        }, { editorSelector: EDITOR_SELECTOR });
        expect(clicked, JSON.stringify(clicked, null, 2)).not.toBeNull();
        await page.mouse.click(clicked!.x, clicked!.y);
        await waitForEditorAnimationFrame(page);
      };

      const assertDetailsNotSelectedOrDeleted = async (label: string) => {
        await waitForEditorAnimationFrame(page);

        const diagnostics = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
          text: editor.textContent ?? '',
          selectedBlocks: editor.querySelectorAll('.editor-block-selected').length,
          selectedNodes: Array.from(editor.querySelectorAll<HTMLElement>('.ProseMirror-selectednode')).map((element) => ({
            tagName: element.tagName,
            className: element.className,
            dataType: element.dataset.type ?? '',
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          })),
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        }));
        expect(diagnostics.text, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toContain('Title');
        expect(diagnostics.text, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toContain('Content');
        expect(diagnostics.selectedBlocks, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(0);
        expect(diagnostics.selectedNodes, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toEqual([]);
        expect(diagnostics.selection?.empty, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toBe(true);
        expect(diagnostics.selection?.selectedText, `${label}\n${JSON.stringify(diagnostics, null, 2)}`).toBe('');
      };

      await clickBlankBeforeDetails();
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Delete');
        await assertDetailsNotSelectedOrDeleted(`Delete ${index + 1}`);
      }

      const backspaceOpened = await openMarkdownFixture(page, {
        filename: 'details-leading-blank-backspace.md',
        content: detailsWithLeadingBlankLines,
      });
      await clickBlankBeforeDetails();
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Backspace');
        await assertDetailsNotSelectedOrDeleted(`Backspace ${index + 1}`);
      }

      const enterOpened = await openMarkdownFixture(page, {
        filename: 'details-leading-blank-enter.md',
        content: detailsWithLeadingBlankLines,
      });
      await clickBlankBeforeDetails();
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Enter');
        await assertDetailsNotSelectedOrDeleted(`Enter ${index + 1}`);
      }
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Backspace');
        await assertDetailsNotSelectedOrDeleted(`Enter then Backspace ${index + 1}`);
      }

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        enterOpened.notePath,
      );
      const deleteSaved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        opened.notePath,
      );
      const backspaceSaved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        backspaceOpened.notePath,
      );
      expect(saved).toContain('<summary>Title</summary>');
      expect(saved).toContain('Content');
      expect(deleteSaved).toContain('<summary>Title</summary>');
      expect(deleteSaved).toContain('Content');
      expect(backspaceSaved).toContain('<summary>Title</summary>');
      expect(backspaceSaved).toContain('Content');

      const singleBackspaceOpened = await openMarkdownFixture(page, {
        filename: 'details-single-leading-blank-backspace.md',
        content: detailsWithSingleLeadingBlankLine,
      });
      await clickBlankBeforeDetails();
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Backspace');
        await assertDetailsNotSelectedOrDeleted(`Single blank Backspace ${index + 1}`);
      }
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const singleBackspaceSaved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        singleBackspaceOpened.notePath,
      );
      expect(singleBackspaceSaved).toContain('<summary>Title</summary>');
      expect(singleBackspaceSaved).toContain('Content');

      const singleDeleteOpened = await openMarkdownFixture(page, {
        filename: 'details-single-leading-blank-delete.md',
        content: detailsWithSingleLeadingBlankLine,
      });
      await clickBlankBeforeDetails();
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Delete');
        await assertDetailsNotSelectedOrDeleted(`Single blank Delete ${index + 1}`);
      }
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const singleDeleteSaved = await page.evaluate(
        (pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead),
        singleDeleteOpened.notePath,
      );
      expect(singleDeleteSaved).toContain('<summary>Title</summary>');
      expect(singleDeleteSaved).toContain('Content');

    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('clears stale block selection when opening a note that starts with a blank line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-leading-blank-line-stale-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'leading-blank-line-stale-selection',
        files: [
          {
            filename: 'alpha-selected-source.md',
            content: ['Alpha stale block selection source', '', 'Alpha after blank line'].join('\n'),
          },
          {
            filename: 'beta-leading-blank-line.md',
            content: ['', 'Beta leading blank line sentinel', '', 'Beta body after blank line'].join('\n'),
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Leading Blank Line Stale Selection NotesRoot',
        minFileCount: 2,
      });

      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha-selected-source' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha stale block selection source', {
        timeout: 30_000,
      });
      expect(await selectNoteBlocksByText(page, ['Alpha stale block selection source'])).toBe(1);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(1);

      await openAbsoluteNote(page, fixture.notePaths[1]);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Beta leading blank line sentinel', {
        timeout: 30_000,
      });
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not turn a focused cursor into a selected leading blank line when opening notes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-focused-leading-blank-line-selection');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'focused-leading-blank-line-selection',
        files: [
          {
            filename: 'alpha-focused-source.md',
            content: ['Alpha focused cursor source', '', 'Alpha after blank line'].join('\n'),
          },
          {
            filename: 'beta-focused-leading-blank-line.md',
            content: ['', 'Beta focused leading blank line sentinel', '', 'Beta body after blank line'].join('\n'),
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Focused Leading Blank Line NotesRoot',
        minFileCount: 2,
      });

      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha-focused-source' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha focused cursor source', {
        timeout: 30_000,
      });
      await expect(
        page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditor())
      ).resolves.toBe(true);

      await openAbsoluteNote(page, fixture.notePaths[1]);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Beta focused leading blank line sentinel', {
        timeout: 30_000,
      });

      await expect.poll(
        async () => page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary()),
        { timeout: 10_000 }
      ).toMatchObject({
        empty: true,
      });
      const selection = await page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());
      expect(selection?.from).toBeGreaterThan(1);
      await expect(page.locator(SELECTED_BLOCK_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_NODE_SELECTOR)).toHaveCount(0);
      await expect(page.locator(SELECTED_MARKDOWN_BLANK_LINE_SELECTOR)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
