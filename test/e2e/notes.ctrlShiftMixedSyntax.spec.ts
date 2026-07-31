import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';
import { TINY_PNG_DATA_URL } from './notesMarkdownSyntaxFixture';

const START_TEXT = 'Start paragraph mixed syntax sentinel.';
const END_TEXT = 'End paragraph mixed syntax sentinel.';

async function collectSelectionState(page: Page) {
  return page.evaluate((editorSelector) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const summary = (window as any).__vlainaE2E.getEditorSelectionSummary();
    return {
      from: summary?.from ?? null,
      to: summary?.to ?? null,
      empty: summary?.empty ?? null,
      selectedText: summary?.selectedText ?? '',
      activeIsEditor: document.activeElement === editor,
      activeIsTitle: document.activeElement?.getAttribute('data-note-title-input') === 'true',
      blockSelections: editor?.querySelectorAll('.editor-block-selected').length ?? 0,
      cellSelections: editor?.querySelectorAll('.selectedCell').length ?? 0,
      nodeSelections: editor?.querySelectorAll('.ProseMirror-selectednode').length ?? 0,
    };
  }, EDITOR_SELECTOR);
}

function createMixedSyntaxMarkdown() {
  return [
    START_TEXT,
    '',
    '## Heading mixed syntax sentinel',
    '',
    '[TOC]',
    '',
    '> [!callout-icon:%F0%9F%93%8C] Callout mixed syntax sentinel',
    '> Callout body mixed syntax sentinel',
    '',
    '> Quote mixed syntax sentinel',
    '> - Quote list mixed syntax sentinel',
    '',
    '- Bullet mixed syntax sentinel',
    '  - Nested bullet mixed syntax sentinel',
    '',
    '1. Ordered mixed syntax sentinel',
    '2. Ordered second mixed syntax sentinel',
    '',
    '- [ ] Task mixed syntax sentinel',
    '',
    'Term mixed syntax sentinel',
    ': Definition mixed syntax sentinel',
    '',
    'Footnote reference mixed syntax sentinel[^mixed-note].',
    '',
    '[^mixed-note]: Footnote definition mixed syntax sentinel.',
    '',
    '| Key | Value |',
    '| --- | --- |',
    '| Table mixed syntax sentinel | Covered |',
    '',
    'Before rule mixed syntax sentinel.',
    '',
    '---',
    '',
    'After rule mixed syntax sentinel.',
    '',
    '$$',
    'E = mc^2',
    '$$',
    '',
    'After math mixed syntax sentinel.',
    '',
    '```mermaid',
    'flowchart TD',
    '  A --> B',
    '```',
    '',
    'After diagram mixed syntax sentinel.',
    '',
    '```ts',
    'const mixedSyntaxCodeSentinel = true;',
    '```',
    '',
    'After code mixed syntax sentinel.',
    '',
    `![Mixed syntax image sentinel](${TINY_PNG_DATA_URL})`,
    '',
    'After image mixed syntax sentinel.',
    '',
    '![Mixed syntax video sentinel](https://example.com/video.mp4)',
    '',
    'After video mixed syntax sentinel.',
    '',
    '<div>HTML mixed syntax sentinel</div>',
    '',
    END_TEXT,
  ].join('\n');
}

function expectStableSelectionState(state: Awaited<ReturnType<typeof collectSelectionState>>) {
  expect(state.empty).toBe(false);
  expect(state.activeIsEditor).toBe(true);
  expect(state.activeIsTitle).toBe(false);
  expect(state.blockSelections).toBe(0);
  expect(state.cellSelections).toBe(0);
  expect(state.nodeSelections).toBe(0);
}

test('extends Ctrl+Shift selection through mixed Markdown syntax in both directions', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('notes-ctrl-shift-mixed-syntax');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await openMarkdownFixture(page, {
      filename: 'ctrl-shift-mixed-syntax.md',
      content: createMixedSyntaxMarkdown(),
    });
    await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="toc"]`)).toHaveCount(1);
    await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="callout"]`)).toHaveCount(1);
    await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block`)).toHaveCount(1);
    await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"]`)).toHaveCount(1);
    await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`)).toHaveCount(1);
    await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`)).toHaveCount(1);

    const start = await page.evaluate(
      (text) => (window as any).__vlainaE2E.selectEditorTextByText(text),
      START_TEXT,
    );
    expect(start.to).not.toBeNull();
    await page.evaluate(
      (position) => (window as any).__vlainaE2E.setEditorSelectionRange(position),
      start.to,
    );

    let previousTo = Number(start.to);
    let downState = await collectSelectionState(page);
    const maxSelectionSteps = await page.evaluate(() => Math.max(
      96,
      (window as any).__vlainaE2E.getNoteSelectableBlocks().length * 8 + 32,
    ));
    for (let index = 0; index < maxSelectionSteps && !downState.selectedText.includes(END_TEXT); index += 1) {
      await page.keyboard.press('Control+Shift+ArrowDown');
      await waitForEditorAnimationFrame(page);
      downState = await collectSelectionState(page);
      expectStableSelectionState(downState);
      expect(downState.from).toBe(start.to);
      expect(Number(downState.to)).toBeGreaterThanOrEqual(previousTo);
      previousTo = Number(downState.to);
    }
    for (const text of [
      'Heading mixed syntax sentinel',
      'Callout body mixed syntax sentinel',
      'Quote list mixed syntax sentinel',
      'Nested bullet mixed syntax sentinel',
      'Task mixed syntax sentinel',
      'Definition mixed syntax sentinel',
      'Footnote definition mixed syntax sentinel',
      'Table mixed syntax sentinel',
      'After math mixed syntax sentinel',
      'After diagram mixed syntax sentinel',
      'const mixedSyntaxCodeSentinel = true;',
      'After image mixed syntax sentinel',
      'After video mixed syntax sentinel',
      END_TEXT,
    ]) {
      expect(downState.selectedText).toContain(text);
    }

    await page.keyboard.press('Control+C');
    const copiedMarkdown = await app.evaluate(({ clipboard }) => clipboard.readText());
    for (const text of [
      '## Heading mixed syntax sentinel',
      '[TOC]',
      'Callout body mixed syntax sentinel',
      'Footnote definition mixed syntax sentinel',
      'Table mixed syntax sentinel',
      '$$',
      'E = mc^2',
      '```mermaid',
      'const mixedSyntaxCodeSentinel = true;',
      'Mixed syntax image sentinel',
      'https://example.com/video.mp4',
      '<div>HTML mixed syntax sentinel</div>',
      END_TEXT,
    ]) {
      expect(copiedMarkdown).toContain(text);
    }
    expect(copiedMarkdown).not.toContain('\u2800');

    const end = await page.evaluate(
      (text) => (window as any).__vlainaE2E.selectEditorTextByText(text),
      END_TEXT,
    );
    expect(end.from).not.toBeNull();
    await page.evaluate(
      (position) => (window as any).__vlainaE2E.setEditorSelectionRange(position),
      end.from,
    );

    let previousFrom = Number(end.from);
    let upState = await collectSelectionState(page);
    for (let index = 0; index < maxSelectionSteps && !upState.selectedText.includes(START_TEXT); index += 1) {
      await page.keyboard.press('Control+Shift+ArrowUp');
      await waitForEditorAnimationFrame(page);
      upState = await collectSelectionState(page);
      expectStableSelectionState(upState);
      expect(upState.to).toBe(end.from);
      expect(Number(upState.from)).toBeLessThanOrEqual(previousFrom);
      previousFrom = Number(upState.from);
    }
    for (const text of [
      START_TEXT,
      'Heading mixed syntax sentinel',
      'Callout body mixed syntax sentinel',
      'Quote mixed syntax sentinel',
      'Ordered second mixed syntax sentinel',
      'Table mixed syntax sentinel',
      'Footnote definition mixed syntax sentinel',
      'Before rule mixed syntax sentinel',
      'After math mixed syntax sentinel',
      'const mixedSyntaxCodeSentinel = true;',
      'After image mixed syntax sentinel',
      'After video mixed syntax sentinel',
    ]) {
      expect(upState.selectedText).toContain(text);
    }

    const tableCell = await page.evaluate(
      (text) => (window as any).__vlainaE2E.selectEditorTextByText(text),
      'Table mixed syntax sentinel',
    );
    expect(tableCell.from).not.toBeNull();
    expect(tableCell.to).not.toBeNull();
    const tableDownAnchor = Number(tableCell.from) + 5;
    await page.evaluate(
      (position) => (window as any).__vlainaE2E.setEditorSelectionRange(position),
      tableDownAnchor,
    );
    await page.keyboard.press('Control+Shift+ArrowDown');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await waitForEditorAnimationFrame(page);
    const tableDownState = await collectSelectionState(page);
    expectStableSelectionState(tableDownState);
    expect(tableDownState.from).toBe(tableDownAnchor);
    expect(tableDownState.to).toBe(tableCell.to);
    expect(tableDownState.selectedText).not.toContain('Covered');

    const tableUpAnchor = Number(tableCell.to) - 5;
    await page.evaluate(
      (position) => (window as any).__vlainaE2E.setEditorSelectionRange(position),
      tableUpAnchor,
    );
    await page.keyboard.press('Control+Shift+ArrowUp');
    await page.keyboard.press('Control+Shift+ArrowUp');
    await waitForEditorAnimationFrame(page);
    const tableUpState = await collectSelectionState(page);
    expectStableSelectionState(tableUpState);
    expect(tableUpState.to).toBe(tableUpAnchor);
    expect(tableUpState.from).toBe(tableCell.from);
    expect(tableUpState.selectedText).not.toContain('Key');
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
