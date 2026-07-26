import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openMarkdownFixture,
  openNotesRootInNotes,
  waitForEditorAnimationFrame,
} from './notesE2E';

type TextRange = { from: number; to: number };

async function getEditorTextRange(page: Page, text: string): Promise<TextRange> {
  const range = await page.evaluate((value) =>
    (window as any).__vlainaE2E.getEditorTextRange(value), text);
  expect(range, `Expected editor text range for "${text}"`).not.toBeNull();
  return range!;
}

async function getSelection(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getEditorSelectionSummary());
}

async function expectExpandedSource(page: Page, source: string): Promise<void> {
  await expect.poll(async () => page.locator(
    `${EDITOR_SELECTOR} .wiki-link-expanded`
  ).allTextContents()).toEqual(expect.arrayContaining([expect.any(String)]));
  await expect.poll(async () => (
    await page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`).allTextContents()
  ).join('')).toBe(source);
}

async function setSelection(page: Page, from: number, to = from): Promise<void> {
  await page.evaluate(({ nextFrom, nextTo }) =>
    (window as any).__vlainaE2E.setEditorSelectionRange(nextFrom, nextTo), {
    nextFrom: from,
    nextTo: to,
  });
}

async function resolveTextBoundaryPoint(
  page: Page,
  text: string,
  offset: number,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(({ editorSelector, value, boundaryOffset }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;
    const doc = editor.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const walker = doc.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.includes(value)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      if (!(current instanceof Text)) continue;
      const start = current.data.indexOf(value);
      if (start < 0) continue;
      const boundedOffset = Math.max(0, Math.min(value.length, boundaryOffset));
      const absoluteOffset = start + boundedOffset;
      const previousOffset = Math.max(start, absoluteOffset - 1);
      const nextOffset = Math.min(start + value.length - 1, absoluteOffset);
      const rectForCharacter = (characterOffset: number) => {
        const range = doc.createRange();
        range.setStart(current, characterOffset);
        range.setEnd(current, characterOffset + 1);
        const rect = range.getBoundingClientRect();
        range.detach();
        return rect.width > 0 && rect.height > 0 ? rect : null;
      };
      const previousRect = rectForCharacter(previousOffset);
      const nextRect = rectForCharacter(nextOffset);
      const rect = nextRect ?? previousRect;
      if (!rect) continue;

      const boundaryX = boundedOffset === 0
        ? nextRect?.left ?? rect.left
        : boundedOffset === value.length
          ? previousRect?.right ?? rect.right
          : ((previousRect?.right ?? rect.left) + (nextRect?.left ?? rect.right)) / 2;
      const samples = [boundaryX, boundaryX - 1, boundaryX + 1, boundaryX - 2, boundaryX + 2];
      const y = rect.top + rect.height / 2;
      for (const x of samples) {
        const caret = doc.caretPositionFromPoint?.(x, y);
        if (caret?.offsetNode === current && caret.offset === absoluteOffset) {
          return { x, y };
        }
        const range = doc.caretRangeFromPoint?.(x, y) ?? null;
        const matches = range?.startContainer === current && range.startOffset === absoluteOffset;
        range?.detach();
        if (matches) return { x, y };
      }
      return { x: boundaryX, y };
    }
    return null;
  }, {
    editorSelector: EDITOR_SELECTOR,
    value: text,
    boundaryOffset: offset,
  });

  expect(point, `Expected pointer point for "${text}" at ${offset}`).not.toBeNull();
  return point!;
}

async function clickTextBoundary(page: Page, text: string, offset: number): Promise<void> {
  await page.waitForTimeout(550);
  const point = await resolveTextBoundaryPoint(page, text, offset);
  await page.mouse.click(point.x, point.y);
  await waitForEditorAnimationFrame(page);
}

async function selectTextByKeyboard(
  page: Page,
  text: string,
  fromOffset: number,
  length: number,
): Promise<void> {
  await clickTextBoundary(page, text, fromOffset);
  await page.keyboard.down('Shift');
  for (let index = 0; index < length; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');
}

async function selectTextByPointer(
  page: Page,
  text: string,
  fromOffset: number,
  length: number,
): Promise<void> {
  await dragTextBoundaries(
    page,
    { text, offset: fromOffset },
    { text, offset: fromOffset + length },
  );
  await expect.poll(() => getSelection(page)).toMatchObject({
    empty: false,
    selectedText: text.slice(fromOffset, fromOffset + length),
  });
}

async function dragTextBoundaries(
  page: Page,
  start: { text: string; offset: number },
  end: { text: string; offset: number },
): Promise<void> {
  await page.waitForTimeout(550);
  const startPoint = await resolveTextBoundaryPoint(page, start.text, start.offset);
  const endPoint = await resolveTextBoundaryPoint(page, end.text, end.offset);
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 16 });
  await page.mouse.up();
  await waitForEditorAnimationFrame(page);
}

async function dragWholeText(page: Page, text: string, reverse = false): Promise<void> {
  const start = await resolveTextBoundaryPoint(page, text, reverse ? text.length : 0);
  const end = await resolveTextBoundaryPoint(page, text, reverse ? 0 : text.length);
  const startPoint = { x: start.x + (reverse ? -1 : 1), y: start.y };
  const endPoint = { x: end.x + (reverse ? 1 : -1), y: end.y };
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 16 });
  await page.mouse.up();
  await waitForEditorAnimationFrame(page);
}

async function openWikiAuditFixture(page: Page) {
  const target = 'Project Beta';
  const alias = 'the beta note';
  const source = `[[${target}|${alias}]]`;
  const opened = await openMarkdownFixture(page, {
    filename: 'wiki-link-system-audit.md',
    content: [
      '# Wiki Link System Audit',
      '',
      `Before ${source} following selectable text.`,
      '',
      'Adjacent [[First]][[Second]] links.',
      '',
      '[ordinary link](https://example.test/docs)',
    ].join('\n'),
  });
  return { ...opened, target, alias, source };
}

test.describe('notes wiki-link interaction audit', () => {
  test('audits collapsed presentation and mouse entry at every source boundary', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-presentation-pointer-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      const wikiLink = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`).first();
      const ordinaryLink = page.locator(`${EDITOR_SELECTOR} a[href="https://example.test/docs"]`);

      await expect(wikiLink).toHaveText(alias);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      const presentation = await page.evaluate(({ wikiSelector, ordinarySelector }) => {
        const wiki = document.querySelector<HTMLElement>(wikiSelector);
        const ordinary = document.querySelector<HTMLElement>(ordinarySelector);
        if (!wiki || !ordinary) return null;
        const wikiStyle = getComputedStyle(wiki);
        const ordinaryStyle = getComputedStyle(ordinary);
        return {
          wikiColor: wikiStyle.color,
          ordinaryColor: ordinaryStyle.color,
          wikiBorder: wikiStyle.borderBottomWidth,
          ordinaryBorder: ordinaryStyle.borderBottomWidth,
        };
      }, {
        wikiSelector: `${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="${target}"]`,
        ordinarySelector: `${EDITOR_SELECTOR} a[href="https://example.test/docs"]`,
      });
      expect(presentation).toEqual({
        wikiColor: presentation?.ordinaryColor,
        ordinaryColor: presentation?.ordinaryColor,
        wikiBorder: '0px',
        ordinaryBorder: '0px',
      });

      const linkBox = await wikiLink.boundingBox();
      expect(linkBox).not.toBeNull();
      await page.mouse.click(linkBox!.x - 1, linkBox!.y + linkBox!.height / 2);
      await expectExpandedSource(page, source);

      const sourceRange = await getEditorTextRange(page, source);
      const offsets = [
        0,
        1,
        2,
        5,
        2 + target.length,
        3 + target.length,
        3 + target.length + 4,
        source.length - 2,
        source.length - 1,
        source.length,
      ];
      for (const offset of offsets) {
        await clickTextBoundary(page, source, offset);
        await expect.poll(() => getSelection(page), {
          message: `Expected source caret at offset ${offset}`,
        }).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
          to: sourceRange.from + offset,
        });
      }

      await setSelection(page, sourceRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(wikiLink).toHaveText(alias);
      const foldedBox = await wikiLink.boundingBox();
      expect(foldedBox).not.toBeNull();
      await page.mouse.click(foldedBox!.x + foldedBox!.width + 1, foldedBox!.y + foldedBox!.height / 2);
      await expectExpandedSource(page, source);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits keyboard traversal, forward and reverse selection, and double click', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-keyboard-selection-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      await clickTextBoundary(page, 'the beta note', 4);
      await expectExpandedSource(page, source);
      const sourceRange = await getEditorTextRange(page, source);

      await clickTextBoundary(page, source, 0);
      expect(await getSelection(page)).toMatchObject({
        empty: true,
        from: sourceRange.from,
      });
      for (let offset = 1; offset <= source.length; offset += 1) {
        await page.keyboard.press('ArrowRight');
        expect(await getSelection(page), `ArrowRight offset ${offset}`).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
        });
      }
      for (let offset = source.length - 1; offset >= 0; offset -= 1) {
        await page.keyboard.press('ArrowLeft');
        expect(await getSelection(page), `ArrowLeft offset ${offset}`).toMatchObject({
          empty: true,
          from: sourceRange.from + offset,
        });
      }

      await dragWholeText(page, source);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: source,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragWholeText(page, source, true);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: source,
      });

      await selectTextByPointer(page, source, 2, target.length);
      await setSelection(page, sourceRange.from + 3);
      await selectTextByPointer(page, source, `[[${target}|`.length, alias.length);
      await setSelection(page, sourceRange.from + 3);

      const rightText = ' following selectable text.';
      const linkToRightText = source.slice(2) + rightText.slice(0, 10);
      await dragTextBoundaries(
        page,
        { text: source, offset: 2 },
        { text: rightText, offset: 10 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: linkToRightText,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragTextBoundaries(
        page,
        { text: rightText, offset: 10 },
        { text: source, offset: 2 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: linkToRightText,
      });
      await setSelection(page, sourceRange.from + 3);

      const leftText = 'Before ';
      const leftTextToLink = leftText.slice(3) + source.slice(0, source.length - 2);
      await dragTextBoundaries(
        page,
        { text: leftText, offset: 3 },
        { text: source, offset: source.length - 2 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: leftTextToLink,
      });
      await setSelection(page, sourceRange.from + 3);
      await dragTextBoundaries(
        page,
        { text: source, offset: source.length - 2 },
        { text: leftText, offset: 3 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: leftTextToLink,
      });

      await page.waitForTimeout(550);
      const targetPoint = await resolveTextBoundaryPoint(page, source, 5);
      await page.mouse.dblclick(targetPoint.x, targetPoint.y);
      await waitForEditorAnimationFrame(page);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'Project',
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits target and alias edits, deletion, undo, redo, folding, and invalid fallback', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-edit-history-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { alias, source, target } = await openWikiAuditFixture(page);
      await clickTextBoundary(page, alias, 4);
      let sourceRange = await getEditorTextRange(page, source);

      await selectTextByKeyboard(page, source, 2, target.length);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: target,
      });
      await page.keyboard.type('P');
      await expectExpandedSource(page, `[[P|${alias}]]`);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: true,
        selectedText: '',
      });
      await page.keyboard.type('roject Gamma');
      let editedSource = `[[Project Gamma|${alias}]]`;
      await expectExpandedSource(page, editedSource);
      await page.keyboard.press('Control+z');
      await expectExpandedSource(page, source);
      await page.keyboard.press('Control+y');
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await selectTextByKeyboard(page, editedSource, '[[Project Gamma|'.length, alias.length);
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: alias,
      });
      await page.keyboard.type('gamma alias');
      editedSource = '[[Project Gamma|gamma alias]]';
      await expectExpandedSource(page, editedSource);
      await page.waitForTimeout(550);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to - 1);
      await page.keyboard.press('Backspace');
      const invalidSource = '[[Project Gamma|gamma alias]';
      await expectExpandedSource(page, invalidSource);
      await page.keyboard.press('Control+z');
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to + 1);
      const folded = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Gamma"]`);
      await expect(folded).toHaveText('gamma alias');
      await clickTextBoundary(page, 'gamma alias', 5);
      await expectExpandedSource(page, editedSource);

      sourceRange = await getEditorTextRange(page, editedSource);
      await setSelection(page, sourceRange.to - 1);
      await page.keyboard.press('Delete');
      await expectExpandedSource(page, invalidSource);
      const invalidRange = await getEditorTextRange(page, invalidSource);
      await setSelection(page, invalidRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link`)).toHaveCount(2);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(invalidSource);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits adjacent-link boundary ownership', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-adjacent-boundary-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await openWikiAuditFixture(page);
      const first = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="First"]`);
      const second = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Second"]`);
      await dragTextBoundaries(
        page,
        { text: 'First', offset: 1 },
        { text: 'Second', offset: 5 },
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'irstSecon',
      });
      await setSelection(page, (await getEditorTextRange(page, 'Adjacent')).from);
      const firstBox = await first.boundingBox();
      expect(firstBox).not.toBeNull();
      await page.mouse.click(firstBox!.x + firstBox!.width, firstBox!.y + firstBox!.height / 2);
      await expectExpandedSource(page, '[[Second]]');

      const secondSourceRange = await getEditorTextRange(page, '[[Second]]');
      await setSelection(page, secondSourceRange.to + 1);
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
      await expect(first).toHaveText('First');
      await expect(second).toHaveText('Second');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits modified-click navigation and save-reopen persistence', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('wiki-link-navigation-persistence-audit');
    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'wiki-link-navigation-persistence',
        files: [
          {
            filename: 'Source.md',
            content: '# Source\n\nOpen [[Project Beta|the beta note]].\n',
          },
          {
            filename: 'Project Beta.md',
            content: '# Project Beta\n\nTarget content.\n',
          },
          {
            filename: 'Parking.md',
            content: '# Parking\n',
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'wiki-link-navigation-persistence',
        minFileCount: 3,
      });
      const [sourcePath, targetPath, parkingPath] = fixture.notePaths;
      await openAbsoluteNote(page, sourcePath!);
      const link = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Beta"]`);

      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await link.click({ modifiers: [modifier] });
      const targetFilename = targetPath!.replace(/\\/g, '/').split('/').pop();
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      )).toBe(targetFilename);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Target content.');

      await openAbsoluteNote(page, sourcePath!);
      await clickTextBoundary(page, 'the beta note', 4);
      const source = '[[Project Beta|the beta note]]';
      const sourceRange = await getEditorTextRange(page, source);
      await selectTextByKeyboard(
        page,
        source,
        '[[Project Beta|'.length,
        'the beta note'.length,
      );
      await expect.poll(() => getSelection(page)).toMatchObject({
        empty: false,
        selectedText: 'the beta note',
      });
      await page.keyboard.type('saved alias');
      await expectExpandedSource(page, '[[Project Beta|saved alias]]');

      await page.evaluate(() => (window as any).__vlainaE2E.flushCurrentEditorMarkdown());
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      await expect.poll(async () => page.evaluate((path) =>
        (window as any).__vlainaE2E.readTextFile(path), sourcePath!
      )).toContain('[[Project Beta|saved alias]]');

      await openAbsoluteNote(page, parkingPath!);
      await openAbsoluteNote(page, sourcePath!);
      const persisted = page.locator(`${EDITOR_SELECTOR} .wiki-link[data-wiki-link-target="Project Beta"]`);
      await expect(persisted).toHaveText('saved alias');
      await expect(page.locator(`${EDITOR_SELECTOR} .wiki-link-expanded`)).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
