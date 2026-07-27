import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BLOCK_CONTROLS_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  EDITOR_SELECTOR,
  getOpenBridgePages,
  installReferenceTyporaTheme,
  launchIsolatedElectron,
  NOTES_VIEW_SELECTOR,
  openAbsoluteNote,
  openNotesRootInNotes,
} from './notesE2E';
import { moveMouseToBlockHandleGutter } from './notesBlockSelectionShared';

async function getTabBox(page: Page, notePath: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.evaluate((pathToFind) => {
    const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-tab-path]'))
      .find((element) => element.dataset.notesTabPath === pathToFind);
    if (!tab) return null;
    const rect = tab.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, notePath);

  if (!box) {
    throw new Error(`Could not resolve tab geometry for ${notePath}`);
  }
  return box;
}

async function startSplitPaneBodyBlankAudit(page: Page, notePath: string, requiredTexts: string[]): Promise<void> {
  await page.evaluate(({ pathToAudit, requiredTexts }) => {
    let active = true;
    const events: Array<{
      editorMounted: boolean;
      fallbackMounted: boolean;
      html: string;
      text: string;
    }> = [];
    const findLeaf = () => (
      Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-path]'))
        .find((leaf) => leaf.dataset.notesSplitLeafPath === pathToAudit) ?? null
    );
    const sample = () => {
      const leaf = findLeaf();
      if (leaf) {
        const rect = leaf.getBoundingClientRect();
        const text = (leaf.textContent ?? '').replace(/\s+/g, ' ').trim();
        const hasRequiredBody = requiredTexts.every((requiredText) => text.includes(requiredText));
        if (rect.width > 0 && rect.height > 0 && !hasRequiredBody) {
          events.push({
            editorMounted: Boolean(leaf.querySelector('.ProseMirror')),
            fallbackMounted: Boolean(leaf.querySelector('[data-notes-split-activation-fallback="true"]')),
            html: leaf.innerHTML.slice(0, 400),
            text,
          });
        }
      }
      if (active) {
        window.requestAnimationFrame(sample);
      }
    };
    window.requestAnimationFrame(sample);
    (window as any).__splitPaneBlankAudit = {
      getEvents: () => events.slice(),
      stop: () => {
        active = false;
      },
    };
  }, { pathToAudit: notePath, requiredTexts });
}

async function dispatchSidebarFileDragMove(
  page: Page,
  notePath: string,
  point: { x: number; y: number },
): Promise<void> {
  const result = await page.evaluate(({ notePath, point }) => {
    const normalizedPath = notePath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    const sourceWrapper = Array.from(document.querySelectorAll<HTMLElement>('[data-file-tree-kind="file"][data-file-tree-path]'))
      .find((element) => {
        const rowPath = (element.dataset.fileTreePath ?? '').replace(/\\/g, '/');
        return rowPath === normalizedPath ||
          normalizedPath.endsWith(`/${rowPath}`) ||
          rowPath.endsWith(`/${filename}`) ||
          rowPath === filename;
      });
    const sourceRow = sourceWrapper?.firstElementChild instanceof HTMLElement
      ? sourceWrapper.firstElementChild
      : sourceWrapper;
    if (!sourceWrapper || !sourceRow) {
      return { ok: false, reason: 'missing-source' };
    }

    sourceWrapper.scrollIntoView({ block: 'center' });
    const sourceBox = sourceRow.getBoundingClientRect();
    const start = {
      x: sourceBox.left + Math.min(sourceBox.width / 2, 120),
      y: sourceBox.top + sourceBox.height / 2,
    };
    const dispatchPointer = (
      target: EventTarget,
      type: string,
      eventPoint: { x: number; y: number },
      buttons: number,
    ) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX: eventPoint.x,
        clientY: eventPoint.y,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }));
    };

    dispatchPointer(sourceRow, 'pointerdown', start, 1);
    dispatchPointer(document, 'pointermove', { x: start.x + 32, y: start.y + 18 }, 1);
    dispatchPointer(document, 'pointermove', point, 1);
    return { ok: true };
  }, { notePath, point });

  expect(result).toMatchObject({ ok: true });
}

async function dispatchSidebarFileDragEnd(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.evaluate((eventPoint) => {
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      clientX: eventPoint.x,
      clientY: eventPoint.y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    }));
  }, point);
}

async function getSidebarFileDragStartPoint(page: Page, notePath: string): Promise<{
  x: number;
  y: number;
}> {
  const start = await page.evaluate((pathToFind) => {
    const normalizedPath = pathToFind.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    const sourceWrapper = Array.from(document.querySelectorAll<HTMLElement>('[data-file-tree-kind="file"][data-file-tree-path]'))
      .find((element) => {
        const rowPath = (element.dataset.fileTreePath ?? '').replace(/\\/g, '/');
        return rowPath === normalizedPath ||
          normalizedPath.endsWith(`/${rowPath}`) ||
          rowPath.endsWith(`/${filename}`) ||
          rowPath === filename;
      });
    const sourceRow = sourceWrapper?.firstElementChild instanceof HTMLElement
      ? sourceWrapper.firstElementChild
      : sourceWrapper;
    if (!sourceWrapper || !sourceRow) {
      return null;
    }

    sourceWrapper.scrollIntoView({ block: 'center' });
    const sourceBox = sourceRow.getBoundingClientRect();
    return {
      x: sourceBox.left + Math.min(sourceBox.width / 2, 120),
      y: sourceBox.top + sourceBox.height / 2,
    };
  }, notePath);

  if (!start) {
    throw new Error(`Could not resolve sidebar file geometry for ${notePath}`);
  }
  return start;
}

async function dragSidebarFileToSplitPoint(
  page: Page,
  notePath: string,
  point: { x: number; y: number },
  direction: 'left' | 'right' | 'top' | 'bottom',
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = await getSidebarFileDragStartPoint(page, notePath);
    const targetPoint = {
      x: direction === 'left' ? point.x + attempt * 14 : direction === 'right' ? point.x - attempt * 14 : point.x,
      y: direction === 'top' ? point.y + attempt * 14 : direction === 'bottom' ? point.y - attempt * 14 : point.y,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 32, start.y + 18, { steps: 6 });
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 24 });
    await page.waitForTimeout(100);

    try {
      await expect(page.locator(`[data-notes-split-drop-overlay="${direction}"]`))
        .toBeVisible({ timeout: 7_000 });
      await page.mouse.up();
      return;
    } catch (error) {
      lastError = error;
      await page.mouse.up().catch(() => undefined);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not drag sidebar file to ${direction} split target`);
}

async function dragTabToRightSplit(page: Page, notePath: string): Promise<void> {
  const tabBox = await getTabBox(page, notePath);
  const notesViewBox = await getNotesViewBox(page);
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2 + 12, tabBox.y + tabBox.height / 2, { steps: 4 });
  await page.mouse.move(notesViewBox.x + notesViewBox.width - 24, notesViewBox.y + notesViewBox.height / 2, { steps: 16 });
  await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
}

async function getSplitLeafBox(page: Page, notePath: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.evaluate((pathToFind) => {
    const normalizedPath = pathToFind.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    const leaf = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-path]'))
      .find((element) => {
        const leafPath = (element.dataset.notesSplitLeafPath ?? '').replace(/\\/g, '/');
        return leafPath === normalizedPath ||
          normalizedPath.endsWith(`/${leafPath}`) ||
          leafPath.endsWith(`/${filename}`) ||
          leafPath === filename;
      });
    if (!leaf) return null;
    const rect = leaf.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, notePath);

  if (!box) {
    throw new Error(`Could not resolve split leaf geometry for ${notePath}`);
  }
  return box;
}

async function getSplitPaneChromeDragBox(page: Page, notePath: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.evaluate((pathToFind) => {
    const normalizedPath = pathToFind.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    const leaf = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-id][data-notes-split-leaf-path]'))
      .find((element) => {
        const leafPath = (element.dataset.notesSplitLeafPath ?? '').replace(/\\/g, '/');
        return leafPath === normalizedPath ||
          normalizedPath.endsWith(`/${leafPath}`) ||
          leafPath.endsWith(`/${filename}`) ||
          leafPath === filename;
      });
    const dragTarget = leaf?.querySelector<HTMLElement>('[data-notes-split-pane-name="true"]') ??
      leaf?.querySelector<HTMLElement>('[data-notes-split-pane-chrome="true"]');
    if (!dragTarget) return null;
    const rect = dragTarget.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, notePath);

  if (!box) {
    throw new Error(`Could not resolve split pane chrome drag geometry for ${notePath}`);
  }
  return box;
}

async function dragSplitPaneChromeToSplitPoint(
  page: Page,
  notePath: string,
  point: { x: number; y: number },
  direction: 'left' | 'right' | 'top' | 'bottom',
): Promise<void> {
  const chromeBox = await getSplitPaneChromeDragBox(page, notePath);
  const start = {
    x: chromeBox.x + Math.min(Math.max(chromeBox.width / 2, 8), 120),
    y: chromeBox.y + chromeBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 8, { steps: 4 });
  await page.mouse.move(point.x, point.y, { steps: 16 });
  await expect(page.locator(`[data-notes-split-drop-overlay="${direction}"]`))
    .toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
}

async function dragSplitPaneChromeWithoutDrop(page: Page, notePath: string): Promise<void> {
  const chromeBox = await getSplitPaneChromeDragBox(page, notePath);
  const start = {
    x: chromeBox.x + Math.min(Math.max(chromeBox.width / 2, 8), 120),
    y: chromeBox.y + chromeBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 3, start.y + 2, { steps: 2 });
  await expect(page.locator('[data-notes-split-drop-overlay]')).toHaveCount(0);
  await page.mouse.up();
}

async function expectCurrentNotePathToMatch(page: Page, notePath: string): Promise<void> {
  await expect.poll(async () => page.evaluate((pathToFind) => {
    const currentPath = ((window as any).__vlainaE2E.getNotesState().currentNote?.path ?? '').replace(/\\/g, '/');
    const normalizedPath = pathToFind.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    return currentPath === normalizedPath ||
      normalizedPath.endsWith(`/${currentPath}`) ||
      currentPath.endsWith(`/${filename}`) ||
      currentPath === filename;
  }, notePath), { timeout: 10_000 }).toBe(true);
}

async function focusVisibleEditorForTyping(page: Page, paragraphText?: string): Promise<void> {
  const target = paragraphText
    ? page.locator(`${EDITOR_SELECTOR} p`, { hasText: paragraphText })
    : page.locator(EDITOR_SELECTOR);
  await expect(target).toBeVisible({ timeout: 10_000 });
  const focusedAtEnd = await page.evaluate(() => {
    const bridge = (window as any).__vlainaE2E;
    return typeof bridge?.focusCurrentEditorAtEnd === 'function'
      ? Boolean(bridge.focusCurrentEditorAtEnd())
      : false;
  });
  if (!focusedAtEnd) {
    await target.click();
  }
  await expect.poll(async () => page.evaluate(() => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement &&
      Boolean(activeElement.closest('.ProseMirror'));
  }), { timeout: 10_000, message: 'Expected editor to receive keyboard focus before typing' })
    .toBe(true);
}

async function typeFocusedEditorTextAndExpectSaved(
  page: Page,
  notePath: string,
  marker: string,
  message: string,
): Promise<void> {
  await page.keyboard.insertText(marker);
  await page.evaluate(() => (window as any).__vlainaE2E.flushCurrentEditorMarkdown?.());
  await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote?.());
  await expect.poll(async () => page.evaluate((pathToRead) =>
    (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
  ), { timeout: 10_000, message }).toContain(marker);
}

async function getEditorBlockSelectionDiagnostics(page: Page): Promise<{
  atomicSelectedNodeCount: number;
  blockSelectionActive: boolean;
  selectedBlockCount: number;
  selectedText: string;
}> {
  return page.evaluate((editorSelector) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const selection = (window as any).__vlainaE2E.getEditorSelectionSummary?.() ?? null;
    return {
      atomicSelectedNodeCount: document.querySelectorAll('.ProseMirror-selectednode').length,
      blockSelectionActive: editor?.classList.contains('editor-block-selection-active') ?? false,
      selectedBlockCount: document.querySelectorAll('.editor-block-selected').length,
      selectedText: String(selection?.selectedText ?? ''),
    };
  }, EDITOR_SELECTOR);
}

async function getSplitLeafSnapshots(page: Page): Promise<Array<{
  id: string;
  path: string;
  pane: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>> {
  return page.evaluate(() => (
    Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.notesSplitLeafId ?? '',
          path: element.dataset.notesSplitLeafPath ?? '',
          pane: element.dataset.notesSplitPane ?? '',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
  ));
}

async function getSplitPaneVisualSnapshot(page: Page, notePath: string, paragraphText: string): Promise<{
  pane: string;
  leaf: { x: number; y: number; width: number; height: number };
  cover: { top: number; height: number; src: string | null } | null;
  title: { top: number; height: number; fontSize: number; text: string } | null;
  paragraph: { top: number; height: number; fontSize: number; lineHeight: number; text: string } | null;
  scrollTop: number;
}> {
  const snapshot = await page.evaluate(({ pathToFind, paragraphText }) => {
    const normalizedPath = pathToFind.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() ?? normalizedPath;
    const leaf = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-path]'))
      .find((element) => {
        const leafPath = (element.dataset.notesSplitLeafPath ?? '').replace(/\\/g, '/');
        return leafPath === normalizedPath ||
          normalizedPath.endsWith(`/${leafPath}`) ||
          leafPath.endsWith(`/${filename}`) ||
          leafPath === filename;
      });
    if (!leaf) return null;

    const leafRect = leaf.getBoundingClientRect();
    const coverElement = leaf.querySelector<HTMLElement>('[data-note-cover-region="true"]');
    const coverImage = coverElement?.querySelector<HTMLImageElement>('img') ?? null;
    const coverRect = coverElement?.getBoundingClientRect() ?? null;
    const titleElement = leaf.querySelector<HTMLElement>('[data-hero-icon-title="true"], [data-note-title-input="true"]');
    const titleRect = titleElement?.getBoundingClientRect() ?? null;
    const titleStyle = titleElement ? window.getComputedStyle(titleElement) : null;
    const paragraphElement = Array.from(leaf.querySelectorAll<HTMLElement>('p'))
      .find((element) => element.textContent?.includes(paragraphText));
    const paragraphRect = paragraphElement?.getBoundingClientRect() ?? null;
    const paragraphStyle = paragraphElement ? window.getComputedStyle(paragraphElement) : null;
    const scrollViewport = leaf.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ??
      leaf.querySelector<HTMLElement>('.overflow-auto, .overflow-y-auto');

    return {
      pane: leaf.dataset.notesSplitPane ?? '',
      leaf: {
        x: Math.round(leafRect.x),
        y: Math.round(leafRect.y),
        width: Math.round(leafRect.width),
        height: Math.round(leafRect.height),
      },
      cover: coverRect ? {
        top: Math.round(coverRect.top - leafRect.top),
        height: Math.round(coverRect.height),
        src: coverImage?.getAttribute('src') ?? null,
      } : null,
      title: titleRect ? {
        top: Math.round(titleRect.top - leafRect.top),
        height: Math.round(titleRect.height),
        fontSize: Math.round(Number.parseFloat(titleStyle?.fontSize ?? '0')),
        text: titleElement instanceof HTMLTextAreaElement || titleElement instanceof HTMLInputElement
          ? titleElement.value
          : titleElement?.textContent ?? '',
      } : null,
      paragraph: paragraphRect ? {
        top: Math.round(paragraphRect.top - leafRect.top),
        height: Math.round(paragraphRect.height),
        fontSize: Math.round(Number.parseFloat(paragraphStyle?.fontSize ?? '0')),
        lineHeight: Math.round(Number.parseFloat(paragraphStyle?.lineHeight ?? '0')),
        text: paragraphElement?.textContent ?? '',
      } : null,
      scrollTop: Math.round(scrollViewport?.scrollTop ?? 0),
    };
  }, { pathToFind: notePath, paragraphText });

  if (!snapshot) {
    throw new Error(`Could not resolve split pane visual snapshot for ${notePath}`);
  }
  return snapshot;
}

function expectSplitPaneVisualSnapshotStable(
  after: Awaited<ReturnType<typeof getSplitPaneVisualSnapshot>>,
  before: Awaited<ReturnType<typeof getSplitPaneVisualSnapshot>>,
): void {
  expect(after.leaf).toEqual(before.leaf);
  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.cover?.src).toBe(before.cover?.src);
  expect(Math.abs((after.cover?.top ?? 0) - (before.cover?.top ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((after.cover?.height ?? 0) - (before.cover?.height ?? 0))).toBeLessThanOrEqual(2);
  expect(after.title?.text).toBe(before.title?.text);
  expect(Math.abs((after.title?.top ?? 0) - (before.title?.top ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((after.title?.height ?? 0) - (before.title?.height ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((after.title?.fontSize ?? 0) - (before.title?.fontSize ?? 0))).toBeLessThanOrEqual(1);
  expect(after.paragraph?.text).toBe(before.paragraph?.text);
  expect(Math.abs((after.paragraph?.top ?? 0) - (before.paragraph?.top ?? 0))).toBeLessThanOrEqual(3);
  expect(Math.abs((after.paragraph?.height ?? 0) - (before.paragraph?.height ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((after.paragraph?.fontSize ?? 0) - (before.paragraph?.fontSize ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after.paragraph?.lineHeight ?? 0) - (before.paragraph?.lineHeight ?? 0))).toBeLessThanOrEqual(1);
}

function expectLeafGeometryToStayStable(
  after: Array<{ path: string; id: string; x: number; y: number; width: number; height: number }>,
  beforeLeaf: { path: string; id: string; x: number; y: number; width: number; height: number },
): void {
  const afterLeaf = after.find((leaf) => leaf.path === beforeLeaf.path);
  expect(afterLeaf).toBeTruthy();
  expect(afterLeaf?.id).toBe(beforeLeaf.id);
  expect(Math.abs((afterLeaf?.x ?? 0) - beforeLeaf.x)).toBeLessThanOrEqual(2);
  expect(Math.abs((afterLeaf?.y ?? 0) - beforeLeaf.y)).toBeLessThanOrEqual(2);
  expect(Math.abs((afterLeaf?.width ?? 0) - beforeLeaf.width)).toBeLessThanOrEqual(2);
  expect(Math.abs((afterLeaf?.height ?? 0) - beforeLeaf.height)).toBeLessThanOrEqual(2);
}

function findSplitLeafSnapshotByPath<T extends { path: string }>(snapshots: T[], notePath: string): T | undefined {
  const normalizedPath = notePath.replace(/\\/g, '/');
  const filename = normalizedPath.split('/').pop() ?? normalizedPath;
  return snapshots.find((leaf) => {
    const leafPath = leaf.path.replace(/\\/g, '/');
    return leafPath === normalizedPath ||
      normalizedPath.endsWith(`/${leafPath}`) ||
      leafPath.endsWith(`/${filename}`) ||
      leafPath === filename;
  });
}

async function getNotesViewBox(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.locator(NOTES_VIEW_SELECTOR).boundingBox();
  if (!box) {
    throw new Error('Could not resolve notes view geometry');
  }
  return box;
}

async function getRootHorizontalSplitMetrics(page: Page): Promise<{
  firstWidth: number;
  secondWidth: number;
  dividerX: number;
  dividerY: number;
}> {
  const metrics = await page.evaluate(() => {
    const layout = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-layout][data-notes-split-orientation="horizontal"]'))
      .find((element) => element.parentElement?.matches('[data-notes-split-drop-root="true"]'));
    if (!layout || layout.children.length < 3) return null;
    const firstRect = layout.children[0]?.getBoundingClientRect();
    const dividerRect = layout.children[1]?.getBoundingClientRect();
    const secondRect = layout.children[2]?.getBoundingClientRect();
    if (!firstRect || !dividerRect || !secondRect) return null;
    return {
      firstWidth: firstRect.width,
      secondWidth: secondRect.width,
      dividerX: dividerRect.x + dividerRect.width / 2,
      dividerY: dividerRect.y + dividerRect.height / 2,
    };
  });

  if (!metrics) {
    throw new Error('Could not resolve root horizontal split metrics');
  }
  return metrics;
}

async function expectSplitDividerUsesAccentColor(page: Page, orientation: 'horizontal' | 'vertical'): Promise<void> {
  await expect.poll(async () => page.evaluate((dividerOrientation) => {
    const divider = document.querySelector<HTMLElement>(`[data-notes-split-divider="${dividerOrientation}"]`);
    const visibleLine = divider?.firstElementChild;
    if (!(visibleLine instanceof HTMLElement)) {
      return null;
    }

    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--vlaina-accent)';
    document.body.appendChild(probe);
    const expected = window.getComputedStyle(probe).backgroundColor;
    probe.remove();

    return {
      actual: window.getComputedStyle(visibleLine).backgroundColor,
      expected,
    };
  }, orientation), { timeout: 10_000 }).toEqual(expect.objectContaining({
    actual: expect.any(String),
    expected: expect.any(String),
  }));

  const colors = await page.evaluate((dividerOrientation) => {
    const divider = document.querySelector<HTMLElement>(`[data-notes-split-divider="${dividerOrientation}"]`);
    const visibleLine = divider?.firstElementChild as HTMLElement | null;
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--vlaina-accent)';
    document.body.appendChild(probe);
    const expected = window.getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      actual: visibleLine ? window.getComputedStyle(visibleLine).backgroundColor : '',
      expected,
    };
  }, orientation);

  expect(colors.actual).toBe(colors.expected);
}

async function getSplitMetrics(page: Page, direction: 'left' | 'right' | 'top' | 'bottom'): Promise<{
  firstSize: number;
  secondSize: number;
  dividerX: number;
  dividerY: number;
  orientation: 'horizontal' | 'vertical';
}> {
  const metrics = await page.evaluate((splitDirection) => {
    const layout = document.querySelector<HTMLElement>(`[data-notes-split-layout="${splitDirection}"]`);
    if (!layout || layout.children.length < 3) return null;
    const firstRect = layout.children[0]?.getBoundingClientRect();
    const dividerRect = layout.children[1]?.getBoundingClientRect();
    const secondRect = layout.children[2]?.getBoundingClientRect();
    if (!firstRect || !dividerRect || !secondRect) return null;

    const orientation = layout.dataset.notesSplitOrientation === 'vertical'
      ? 'vertical'
      : 'horizontal';

    return {
      firstSize: orientation === 'horizontal' ? firstRect.width : firstRect.height,
      secondSize: orientation === 'horizontal' ? secondRect.width : secondRect.height,
      dividerX: dividerRect.x + dividerRect.width / 2,
      dividerY: dividerRect.y + dividerRect.height / 2,
      orientation,
    };
  }, direction);

  if (!metrics) {
    throw new Error(`Could not resolve ${direction} split metrics`);
  }
  return metrics;
}

async function beginBlockHandleDrag(page: Page): Promise<void> {
  const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
  if (!handleBox) {
    throw new Error('Could not resolve block drag handle geometry');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 28, startY, { steps: 4 });
  await expect.poll(async () => page.evaluate(() =>
    document.body.classList.contains('editor-block-drag-active')
  ), { message: 'Expected split pane block drag to become active' }).toBe(true);
}

async function getVisibleEditorParagraphBox(page: Page, text: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.locator(`${EDITOR_SELECTOR} p`, { hasText: text }).boundingBox();
  if (!box) {
    throw new Error(`Could not resolve editor paragraph geometry for ${text}`);
  }
  return box;
}

async function selectImageBlockBySource(page: Page, sourcePart: string): Promise<void> {
  const result = await page.evaluate(async (sourcePartToFind) => {
    const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
      className?: string;
      dataset?: Record<string, string>;
      rangeText: string;
      text: string;
    }>;
    const index = blocks.findIndex((block) => (
      block.rangeText.includes(sourcePartToFind) ||
      block.text.includes(sourcePartToFind) ||
      block.dataset?.src?.includes(sourcePartToFind) ||
      String(block.className ?? '').includes('editor-paragraph-has-image-block') ||
      String(block.className ?? '').includes('image-block-container')
    ));
    if (index < 0) {
      return { count: 0, index, blocks };
    }

    const count = await (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
    return { count, index, blocks };
  }, sourcePart);

  expect(result.count, `Could not select image block from: ${JSON.stringify(result.blocks)}`).toBe(1);
}

type ParagraphSpacingMetrics = {
  firstGap: number;
  secondGap: number;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
};

async function getParagraphSpacingMetrics(
  page: Page,
  rootSelector: string,
  texts: [string, string, string],
): Promise<ParagraphSpacingMetrics> {
  const metrics = await page.evaluate(({ rootSelector, texts }) => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return null;

    const paragraphs = texts.map((text) => {
      const element = Array.from(root.querySelectorAll<HTMLElement>('p'))
        .find((candidate) => candidate.textContent?.trim() === text);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        bottom: rect.bottom,
        top: rect.top,
        lineHeight: Number.parseFloat(style.lineHeight),
        marginTop: Number.parseFloat(style.marginTop),
        marginBottom: Number.parseFloat(style.marginBottom),
      };
    });

    const [first, second, third] = paragraphs;
    if (!first || !second || !third) return null;

    return {
      firstGap: second.top - first.bottom,
      secondGap: third.top - second.bottom,
      lineHeight: second.lineHeight,
      marginTop: second.marginTop,
      marginBottom: second.marginBottom,
    };
  }, { rootSelector, texts });

  if (!metrics) {
    throw new Error(`Could not resolve paragraph spacing metrics for ${rootSelector}`);
  }
  return metrics;
}

function expectSpacingMetricsToMatch(
  actual: ParagraphSpacingMetrics,
  expected: ParagraphSpacingMetrics,
): void {
  expect(Math.abs(actual.lineHeight - expected.lineHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.marginTop - expected.marginTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.marginBottom - expected.marginBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.firstGap - expected.firstGap)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.secondGap - expected.secondGap)).toBeLessThanOrEqual(2);
}

type AdjacentBlockSpacingCase = {
  firstSelector: string;
  firstText: string;
  name: string;
  secondSelector: string;
  secondText: string;
};

type AdjacentBlockSpacingMetrics = {
  firstMarginBottom: number;
  gap: number;
  name: string;
  secondMarginTop: number;
};

async function getAdjacentBlockSpacingMetrics(
  page: Page,
  rootSelector: string,
  cases: AdjacentBlockSpacingCase[],
): Promise<AdjacentBlockSpacingMetrics[]> {
  const metrics = await page.evaluate(({ cases, rootSelector }) => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return null;

    return cases.map((spacingCase) => {
      const findElement = (selector: string, text: string) => (
        Array.from(root.querySelectorAll<HTMLElement>(selector))
          .find((candidate) => candidate.textContent?.trim() === text)
      );
      const first = findElement(spacingCase.firstSelector, spacingCase.firstText);
      const second = findElement(spacingCase.secondSelector, spacingCase.secondText);
      if (!first || !second) {
        return {
          missing: true,
          name: spacingCase.name,
        };
      }

      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      const firstStyle = window.getComputedStyle(first);
      const secondStyle = window.getComputedStyle(second);
      return {
        firstMarginBottom: Number.parseFloat(firstStyle.marginBottom),
        gap: secondRect.top - firstRect.bottom,
        name: spacingCase.name,
        secondMarginTop: Number.parseFloat(secondStyle.marginTop),
      };
    });
  }, { cases, rootSelector });

  if (!metrics) {
    throw new Error(`Could not resolve adjacent block spacing metrics for ${rootSelector}`);
  }

  const missing = metrics.filter((metric) => 'missing' in metric);
  if (missing.length > 0) {
    throw new Error(`Could not resolve adjacent block spacing cases: ${JSON.stringify(missing)}`);
  }

  return metrics as AdjacentBlockSpacingMetrics[];
}

async function expectPreviewBlocksAreClickable(page: Page, rootSelector: string): Promise<void> {
  await expect.poll(async () => page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return null;

    return Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter((child) => /^(H[1-6]|P|UL|OL|BLOCKQUOTE)$/i.test(child.tagName))
      .map((child) => ({
        pointerEvents: window.getComputedStyle(child).pointerEvents,
        tagName: child.tagName,
        text: child.textContent?.trim() ?? '',
      }));
  }, rootSelector), { timeout: 10_000 }).toEqual(expect.arrayContaining([
    expect.objectContaining({ pointerEvents: 'auto' }),
  ]));

  const blockedBlocks = await page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return [];

    return Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter((child) => /^(H[1-6]|P|UL|OL|BLOCKQUOTE)$/i.test(child.tagName))
      .map((child) => ({
        pointerEvents: window.getComputedStyle(child).pointerEvents,
        tagName: child.tagName,
        text: child.textContent?.trim() ?? '',
      }))
      .filter((block) => block.pointerEvents !== 'auto');
  }, rootSelector);

  expect(blockedBlocks).toEqual([]);
}

function expectPreviewSpacingNotLooserThanEditor(
  previewMetrics: AdjacentBlockSpacingMetrics[],
  editorMetrics: AdjacentBlockSpacingMetrics[],
): void {
  for (const previewMetric of previewMetrics) {
    const editorMetric = editorMetrics.find((metric) => metric.name === previewMetric.name);
    if (!editorMetric) {
      throw new Error(`Missing editor spacing metric for ${previewMetric.name}`);
    }

    expect(previewMetric.gap, `${previewMetric.name} preview gap should not exceed focused editor gap`)
      .toBeLessThanOrEqual(editorMetric.gap + 2);
    expect(previewMetric.gap, `${previewMetric.name} preview gap should remain non-negative`)
      .toBeGreaterThanOrEqual(0);
  }
}

const TIGHT_BLOCK_SPACING_CASES: AdjacentBlockSpacingCase[] = [
  {
    firstSelector: 'h1',
    firstText: 'Tight H1 Sentinel',
    name: 'h1-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h1.',
  },
  {
    firstSelector: 'h2',
    firstText: 'Tight H2 Sentinel',
    name: 'h2-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h2.',
  },
  {
    firstSelector: 'h3',
    firstText: 'Tight H3 Sentinel',
    name: 'h3-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h3.',
  },
  {
    firstSelector: 'h4',
    firstText: 'Tight H4 Sentinel',
    name: 'h4-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h4.',
  },
  {
    firstSelector: 'h5',
    firstText: 'Tight H5 Sentinel',
    name: 'h5-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h5.',
  },
  {
    firstSelector: 'h6',
    firstText: 'Tight H6 Sentinel',
    name: 'h6-to-paragraph',
    secondSelector: 'p',
    secondText: 'Tight paragraph after h6.',
  },
  {
    firstSelector: 'h1',
    firstText: 'Tight List Heading Sentinel',
    name: 'heading-to-list',
    secondSelector: 'ul',
    secondText: 'Tight list item after heading',
  },
  {
    firstSelector: 'h2',
    firstText: 'Tight Quote Heading Sentinel',
    name: 'heading-to-blockquote',
    secondSelector: 'blockquote',
    secondText: 'Tight quote after heading',
  },
];

const REAL_BLANK_LINE_SPACING_CASE: AdjacentBlockSpacingCase = {
  firstSelector: 'h1',
  firstText: 'Real Blank Heading Sentinel',
  name: 'heading-to-paragraph-with-real-blank-line',
  secondSelector: 'p',
  secondText: 'Paragraph after real blank line.',
};

const TIGHT_BLOCK_SPACING_CONTENT = [
  '# Tight H1 Sentinel',
  'Tight paragraph after h1.',
  '',
  '## Tight H2 Sentinel',
  'Tight paragraph after h2.',
  '',
  '### Tight H3 Sentinel',
  'Tight paragraph after h3.',
  '',
  '#### Tight H4 Sentinel',
  'Tight paragraph after h4.',
  '',
  '##### Tight H5 Sentinel',
  'Tight paragraph after h5.',
  '',
  '###### Tight H6 Sentinel',
  'Tight paragraph after h6.',
  '',
  '# Tight List Heading Sentinel',
  '- Tight list item after heading',
  '',
  '## Tight Quote Heading Sentinel',
  '> Tight quote after heading',
  '',
  '# Real Blank Heading Sentinel',
  '',
  'Paragraph after real blank line.',
].join('\n');
const TIGHT_BLOCK_SPACING_BLANK_LINE_COUNT = 9;

async function runSplitSpacingAudit(
  page: Page,
  fixtureName: string,
): Promise<void> {
  const fixture = await createNotesRootFilesFixture(page, {
    name: fixtureName,
    files: [
      {
        filename: 'alpha-spacing-audit.md',
        content: '# Active Audit Heading\nActive audit paragraph.',
      },
      {
        filename: 'beta-spacing-audit.md',
        content: TIGHT_BLOCK_SPACING_CONTENT,
      },
    ],
  });
  const [alphaPath, betaPath] = fixture.notePaths;
  if (!alphaPath || !betaPath) {
    throw new Error('Missing fixture note paths');
  }

  await openAbsoluteNote(page, alphaPath);
  await openAbsoluteNote(page, betaPath);
  await openAbsoluteNote(page, alphaPath);
  await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);

  await dragTabToRightSplit(page, betaPath);

  const previewRootSelector = '[data-notes-split-preview-pane="true"] [data-notes-split-preview-content="true"]';
  const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
    hasText: 'Tight paragraph after h3.',
  });
  await expect(betaPreview).toBeVisible({ timeout: 10_000 });
  await expectPreviewBlocksAreClickable(page, previewRootSelector);

  const previewMetrics = await getAdjacentBlockSpacingMetrics(
    page,
    previewRootSelector,
    TIGHT_BLOCK_SPACING_CASES,
  );
  const [previewBlankMetric] = await getAdjacentBlockSpacingMetrics(
    page,
    previewRootSelector,
    [REAL_BLANK_LINE_SPACING_CASE],
  );
  const previewTightH1Metric = previewMetrics.find((metric) => metric.name === 'h1-to-paragraph');
  if (!previewBlankMetric || !previewTightH1Metric) {
    throw new Error('Missing preview blank line spacing metrics');
  }
  expect(previewBlankMetric.gap).toBeGreaterThan(previewTightH1Metric.gap + 8);
  await expect(page.locator(`${previewRootSelector} .notes-readonly-markdown-blank-line`))
    .toHaveCount(TIGHT_BLOCK_SPACING_BLANK_LINE_COUNT);

  const activationParagraph = betaPreview.locator('p', { hasText: 'Tight paragraph after h3.' });
  const activationBox = await activationParagraph.boundingBox();
  const previewContentBox = await betaPreview
    .locator('[data-notes-split-preview-content="true"]')
    .boundingBox();
  if (!activationBox || !previewContentBox) {
    throw new Error('Missing split activation paragraph geometry');
  }
  const activationPoint = {
    x: activationBox.x + activationBox.width / 2,
    y: activationBox.y + activationBox.height / 2,
  };
  const activationContentOffset = {
    x: activationPoint.x - previewContentBox.x,
    y: activationPoint.y - previewContentBox.y,
  };
  await page.mouse.click(activationPoint.x, activationPoint.y);
  await expectCurrentNotePathToMatch(page, betaPath);
  await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Tight paragraph after h3.' }))
    .toBeVisible({ timeout: 10_000 });
  const mappedActivationPoint = await page.locator(EDITOR_SELECTOR).evaluate((element, offset) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + offset.x, y: rect.top + offset.y };
  }, activationContentOffset);
  const expectedActivationPos = await page.evaluate(({ x, y }) => (
    (window as any).__vlainaE2E.getEditorPositionAtPoint(x, y)
  ), mappedActivationPoint) as number | null;
  const activationTextRange = await page.evaluate(() => (
    (window as any).__vlainaE2E.getEditorTextRange('Tight paragraph after h3.')
  )) as { from: number; to: number } | null;
  expect(expectedActivationPos).not.toBeNull();
  expect(activationTextRange).not.toBeNull();
  expect(expectedActivationPos).toBeGreaterThanOrEqual(activationTextRange!.from);
  expect(expectedActivationPos).toBeLessThanOrEqual(activationTextRange!.to);
  await expect.poll(async () => page.evaluate(() => (
    (window as any).__vlainaE2E.getEditorSelectionSummary()
  )), {
    message: 'Expected delayed split activation focus to keep the clicked editor position',
  }).toMatchObject({
    empty: true,
    from: expectedActivationPos,
    to: expectedActivationPos,
  });
  const editorMetrics = await getAdjacentBlockSpacingMetrics(
    page,
    EDITOR_SELECTOR,
    TIGHT_BLOCK_SPACING_CASES,
  );

  expectPreviewSpacingNotLooserThanEditor(previewMetrics, editorMetrics);
}

test.describe('notes tab split panes', () => {
  test('splits tabs and sidebar notes, supports multiple panes, and resizes dividers', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-tab-split');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'tab-split',
        files: [
          { filename: 'alpha.md', content: '# Alpha\n\nAlpha split body' },
          { filename: 'beta.md', content: '# Beta\n\nBeta active body' },
          { filename: 'gamma.md', content: '# Gamma\n\nGamma sidebar body' },
        ],
      });
      const [alphaPath, betaPath, gammaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath || !gammaPath) {
        throw new Error('Missing fixture note paths');
      }

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Tab Split NotesRoot',
        minFileCount: 3,
      });
      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      const betaTabBox = await getTabBox(page, betaPath);
      const notesViewBox = await getNotesViewBox(page);
      const startX = betaTabBox.x + betaTabBox.width / 2;
      const startY = betaTabBox.y + betaTabBox.height / 2;
      const dropX = notesViewBox.x + notesViewBox.width - 24;
      const dropY = notesViewBox.y + notesViewBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 12, startY, { steps: 4 });
      await page.mouse.move(dropX, dropY, { steps: 16 });
      await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
      await page.mouse.up();

      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible({ timeout: 10_000 });
      await expectSplitDividerUsesAccentColor(page, 'horizontal');
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toBeVisible();
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);
      await expect(page.getByText('Beta active body')).toBeVisible();
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ), { timeout: 10_000 }).toBe(alphaPath);

      const betaLeafBox = await getSplitLeafBox(page, betaPath);
      const sidebarDropPoint = {
        x: betaLeafBox.x + betaLeafBox.width / 2,
        y: betaLeafBox.y + betaLeafBox.height - 12,
      };

      await dispatchSidebarFileDragMove(page, gammaPath, sidebarDropPoint);
      await expect(page.locator('[data-notes-split-drop-overlay="bottom"]')).toBeVisible({ timeout: 10_000 });
      await dispatchSidebarFileDragEnd(page, sidebarDropPoint);

      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(2, { timeout: 10_000 });
      await expect(page.locator('[data-notes-split-layout="bottom"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Gamma sidebar body')).toBeVisible();

      const beforeResize = await getRootHorizontalSplitMetrics(page);
      await page.mouse.move(beforeResize.dividerX, beforeResize.dividerY);
      await page.mouse.down();
      await page.mouse.move(beforeResize.dividerX + 180, beforeResize.dividerY, { steps: 12 });
      await page.mouse.up();

      await expect.poll(async () => {
        const afterResize = await getRootHorizontalSplitMetrics(page);
        return Math.round(afterResize.firstWidth - beforeResize.firstWidth);
      }, { timeout: 10_000 }).toBeGreaterThan(80);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('supports sidebar split directions, pane actions, floating chat, and close promotion', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-actions-close');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const installedTheme = await installReferenceTyporaTheme(page, 'phycat-sky.css');

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-actions-close',
        files: [
          { filename: 'alpha-active.md', content: '# Alpha Active\n\nAlpha active body' },
          {
            filename: 'beta-left.md',
            content: [
              '---',
              'vlaina_cover: "@monet/3" x=50 y=50 height=180 scale=1',
              'vlaina_icon: "🧭" size=72',
              '---',
              '',
              '# Beta Left',
              '',
              '![vlaina-logo](./assets/logo.png#logo#left)',
              '',
              'Beta left preview body',
            ].join('\n'),
          },
          { filename: 'gamma-top.md', content: '# Gamma Top\n\nGamma top preview body' },
        ],
      });
      const [alphaPath, betaPath, gammaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath || !gammaPath) {
        throw new Error('Missing fixture note paths');
      }
      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      );
      const betaLogoPath = path.join(path.dirname(betaPath), 'assets', 'logo.png');
      await fs.mkdir(path.dirname(betaLogoPath), { recursive: true });
      await fs.writeFile(betaLogoPath, pngBytes);

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Split Pane Actions NotesRoot',
        minFileCount: 3,
      });
      await openAbsoluteNote(page, alphaPath);
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(1, { timeout: 10_000 });

      const notesViewBox = await getNotesViewBox(page);
      const leftDropPoint = {
        x: notesViewBox.x + 18,
        y: notesViewBox.y + notesViewBox.height / 2,
      };
      await dragSidebarFileToSplitPoint(page, betaPath, leftDropPoint, 'left');

      await expect(page.locator('[data-notes-split-layout="left"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);

      const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Beta left preview body',
      });
      await expect(betaPreview).toBeVisible({ timeout: 10_000 });
      await expect(betaPreview.locator('[data-notes-split-pane-name="true"]')).toContainText('beta');
      await expect(betaPreview.locator('[data-note-cover-region="true"]')).toBeVisible({ timeout: 10_000 });
      await expect(betaPreview).toContainText('🧭');
      await expect(betaPreview).not.toContainText('vlaina_cover');
      await expect(betaPreview).not.toContainText('vlaina_icon');
      const betaLogoImage = betaPreview.locator('.image-block-container[data-src="./assets/logo.png#logo#left"] img');
      await expect(betaLogoImage).toBeVisible({ timeout: 10_000 });
      if (!installedTheme.skipped) {
        const betaMarkdownRoot = betaPreview.locator('[data-markdown-theme-root="true"]');
        await expect(betaMarkdownRoot).toHaveAttribute('data-markdown-compat-layer', 'external');
        await expect(betaMarkdownRoot).toHaveAttribute('data-markdown-theme-platform', 'typora');
        await expect.poll(async () => betaPreview.locator('.image-block-container[data-src="./assets/logo.png#logo#left"]').evaluate((element) =>
          window.getComputedStyle(element).float
        ), { timeout: 10_000, message: 'Expected split preview logo image to receive Typora left logo styling' })
          .toBe('left');
      }
      await expect.poll(async () => betaLogoImage.evaluate((image) => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        src: image.getAttribute('src') ?? '',
        dataSrc: image.getAttribute('data-src') ?? '',
      })), { timeout: 10_000, message: 'Expected split preview local logo image to resolve like an editor image block' })
        .toMatchObject({
          complete: true,
          naturalWidth: 1,
          dataSrc: './assets/logo.png#logo#left',
        });

      const betaPreviewChrome = betaPreview.locator('[data-notes-split-pane-chrome="true"]');
      const primaryChrome = page.locator('[data-notes-split-pane="primary"] [data-notes-split-pane-chrome="true"]');
      const primaryPane = page.locator('[data-notes-split-pane="primary"]');
      await expect(primaryChrome.getByRole('button', { name: 'Add to Starred' })).toBeVisible();
      await expect(primaryChrome.getByRole('button', { name: 'Right Chat' })).toBeVisible();
      await expect(primaryPane.getByRole('button', { name: 'Right Chat' })).toBeVisible();
      await expect(primaryChrome.getByRole('button', { name: 'More note actions' })).toBeVisible();
      await expect(primaryChrome.getByRole('button', { name: 'Close' })).toBeVisible();

      await betaPreviewChrome.getByRole('button', { name: 'More note actions' }).click();
      await expect(page.getByTestId('note-menu-content')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('note-menu-content')).toContainText('Export');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('note-menu-content')).toHaveCount(0);

      await betaPreviewChrome.getByRole('button', { name: 'Add to Starred' }).click();
      await expect(betaPreviewChrome.getByRole('button', { name: /^(Remove from Starred|Unfavorite)$/ }))
        .toBeVisible({ timeout: 10_000 });

      await expect(betaPreviewChrome.getByRole('button', { name: 'Right Chat' })).toBeVisible();
      await betaPreviewChrome.getByRole('button', { name: 'Right Chat' }).click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toBeVisible({ timeout: 30_000 });
      await expectCurrentNotePathToMatch(page, betaPath);
      await page.locator('[data-notes-chat-floating="true"] [aria-label="Close Chat panel"]').click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toHaveCount(0, { timeout: 10_000 });

      const alphaPreviewAfterChat = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Alpha active body',
      });
      await alphaPreviewAfterChat.locator('p', { hasText: 'Alpha active body' }).click();
      await expectCurrentNotePathToMatch(page, alphaPath);

      const betaLeafBox = await getSplitLeafBox(page, betaPath);
      const topDropPoint = {
        x: betaLeafBox.x + betaLeafBox.width / 2,
        y: betaLeafBox.y + 12,
      };
      await dragSidebarFileToSplitPoint(page, gammaPath, topDropPoint, 'top');

      await expect(page.locator('[data-notes-split-layout="top"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(2);
      await expect(page.getByText('Gamma top preview body')).toBeVisible();

      const beforeVerticalResize = await getSplitMetrics(page, 'top');
      expect(beforeVerticalResize.orientation).toBe('vertical');
      await page.mouse.move(beforeVerticalResize.dividerX, beforeVerticalResize.dividerY);
      await page.mouse.down();
      await page.mouse.move(beforeVerticalResize.dividerX, beforeVerticalResize.dividerY + 120, { steps: 10 });
      await page.mouse.up();
      await expect.poll(async () => {
        const afterResize = await getSplitMetrics(page, 'top');
        return Math.round(afterResize.firstSize - beforeVerticalResize.firstSize);
      }, { timeout: 10_000 }).toBeGreaterThan(60);

      const gammaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Gamma top preview body',
      });
      await gammaPreview.locator('[data-notes-split-pane-chrome="true"]')
        .getByRole('button', { name: 'Close' })
        .click();
      await expect(gammaPreview).toHaveCount(0);
      await expect(page.locator('[data-notes-split-layout="top"]')).toHaveCount(0);
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);
      await expect(page.locator('[data-notes-split-layout="left"]')).toBeVisible();

      await page.locator('[data-notes-split-pane="primary"] [data-notes-split-pane-chrome="true"]')
        .getByRole('button', { name: 'Close' })
        .click();
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(page.locator('[data-notes-split-layout]')).toHaveCount(0);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(1);
      await expectCurrentNotePathToMatch(page, betaPath);

      const promotedBetaParagraph = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Beta left preview body' });
      await expect.poll(async () => promotedBetaParagraph.evaluate((element) =>
        window.getComputedStyle(element).pointerEvents
      ), { timeout: 10_000, message: 'Expected promoted editor paragraph to remain clickable under imported Typora theme' })
        .toBe('auto');
      await focusVisibleEditorForTyping(page, 'Beta left preview body');
      await typeFocusedEditorTextAndExpectSaved(
        page,
        betaPath,
        'Beta promoted pane edit saved',
        'Expected promoted split pane to remain editable and saved',
      );
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps covered split previews stable on chrome clicks and activates only editor content', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-cover-focus');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-cover-focus',
        files: [
          { filename: 'alpha-cover-focus.md', content: '# Alpha Cover Focus\n\nAlpha cover focus body' },
          {
            filename: 'beta-cover-focus.md',
            content: [
              '---',
              'vlaina_cover: "./assets/cover.png" x=50 y=50 height=180 scale=1',
              'vlaina_icon: "🧪" size=72',
              '---',
              '',
              '# Beta Cover Focus',
              '',
              'Beta cover focus body',
              '',
              'Beta cover focus tail',
            ].join('\n'),
          },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath) {
        throw new Error('Missing fixture note paths');
      }

      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      );
      const coverAssetPath = path.join(path.dirname(betaPath), 'assets', 'cover.png');
      await fs.mkdir(path.dirname(coverAssetPath), { recursive: true });
      await fs.writeFile(coverAssetPath, pngBytes);

      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await openAbsoluteNote(page, alphaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      await dragTabToRightSplit(page, betaPath);
      const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Beta cover focus body',
      });
      await expect(betaPreview).toBeVisible({ timeout: 10_000 });
      const previewCover = betaPreview.locator('[data-note-cover-region="true"]');
      await expect(previewCover).toBeVisible({ timeout: 10_000 });
      const previewCoverSrc = await previewCover.locator('img').first().getAttribute('src');
      expect(previewCoverSrc).toBeTruthy();
      const beforeCoverClickLeaves = await getSplitLeafSnapshots(page);

      const coverBox = await previewCover.boundingBox();
      if (!coverBox) {
        throw new Error('Could not resolve split preview cover geometry');
      }
      await page.mouse.click(coverBox.x + coverBox.width / 2, coverBox.y + coverBox.height / 2);
      await expectCurrentNotePathToMatch(page, alphaPath);
      expect(await getSplitLeafSnapshots(page)).toEqual(beforeCoverClickLeaves);
      const afterCoverClickSrc = await previewCover.locator('img').first().getAttribute('src');
      expect(afterCoverClickSrc).toBe(previewCoverSrc);
      await expect.poll(async () => getEditorBlockSelectionDiagnostics(page), {
        timeout: 10_000,
        message: 'Expected cover click to avoid block or atomic node selection',
      }).toMatchObject({
        atomicSelectedNodeCount: 0,
        blockSelectionActive: false,
        selectedBlockCount: 0,
        selectedText: '',
      });

      await betaPreview.locator('[data-hero-icon-title="true"]').click();
      await expectCurrentNotePathToMatch(page, alphaPath);
      expect(await getSplitLeafSnapshots(page)).toEqual(beforeCoverClickLeaves);

      await betaPreview.locator('p', { hasText: 'Beta cover focus body' }).click();
      await expectCurrentNotePathToMatch(page, betaPath);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Beta cover focus body' }))
        .toBeVisible({ timeout: 10_000 });

      const editorCover = page.locator('[data-notes-split-pane="primary"] [data-note-cover-region="true"]').first();
      await expect(editorCover).toBeVisible({ timeout: 10_000 });
      const editorCoverSrc = await editorCover.locator('img').first().getAttribute('src');
      expect(editorCoverSrc).toBe(previewCoverSrc);
      await expect.poll(async () => getEditorBlockSelectionDiagnostics(page), {
        timeout: 10_000,
        message: 'Expected cover activation to avoid block or atomic node selection',
      }).toMatchObject({
        atomicSelectedNodeCount: 0,
        blockSelectionActive: false,
        selectedBlockCount: 0,
        selectedText: '',
      });

      await page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Alpha cover focus body',
      }).locator('p', { hasText: 'Alpha cover focus body' }).click();
      await expectCurrentNotePathToMatch(page, alphaPath);
      await expect.poll(async () => getEditorBlockSelectionDiagnostics(page), {
        timeout: 10_000,
        message: 'Expected title activation to avoid block or atomic node selection',
      }).toMatchObject({
        atomicSelectedNodeCount: 0,
        blockSelectionActive: false,
        selectedBlockCount: 0,
        selectedText: '',
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps split pane geometry stable while focusing between panes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-focus-geometry');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-focus-geometry',
        files: [
          {
            filename: 'source-focus-geometry.md',
            content: [
              '---',
              'vlaina_cover: "./assets/source-cover.png" x=50 y=50 height=170 scale=1',
              'vlaina_icon: "S" size=64',
              '---',
              '',
              '# Source Focus Geometry',
              'Source focus first paragraph',
              '',
              'Source focus second paragraph',
            ].join('\n'),
          },
          {
            filename: 'target-focus-geometry.md',
            content: [
              '---',
              'vlaina_cover: "./assets/target-cover.png" x=50 y=50 height=170 scale=1',
              'vlaina_icon: "T" size=64',
              '---',
              '',
              '# Target Focus Geometry',
              'Target focus first paragraph',
              '',
              'Target focus second paragraph',
            ].join('\n'),
          },
        ],
      });
      const [sourcePath, targetPath] = fixture.notePaths;
      if (!sourcePath || !targetPath) {
        throw new Error('Missing fixture note paths');
      }

      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      );
      await fs.mkdir(path.join(path.dirname(sourcePath), 'assets'), { recursive: true });
      await fs.writeFile(path.join(path.dirname(sourcePath), 'assets', 'source-cover.png'), pngBytes);
      await fs.writeFile(path.join(path.dirname(targetPath), 'assets', 'target-cover.png'), pngBytes);

      await openAbsoluteNote(page, sourcePath);
      await openAbsoluteNote(page, targetPath);
      await openAbsoluteNote(page, sourcePath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      await dragTabToRightSplit(page, targetPath);
      const targetPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Target focus first paragraph',
      });
      await expect(targetPreview).toBeVisible({ timeout: 10_000 });
      await expectCurrentNotePathToMatch(page, sourcePath);

      const beforeTargetFocus = await getSplitPaneVisualSnapshot(page, targetPath, 'Target focus first paragraph');
      expect(beforeTargetFocus.pane).toBe('preview');
      await targetPreview.locator('p', { hasText: 'Target focus first paragraph' }).click();
      await expectCurrentNotePathToMatch(page, targetPath);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Target focus first paragraph' }))
        .toBeVisible({ timeout: 10_000 });
      const afterTargetFocus = await getSplitPaneVisualSnapshot(page, targetPath, 'Target focus first paragraph');
      expect(afterTargetFocus.pane).toBe('primary');
      expectSplitPaneVisualSnapshotStable(afterTargetFocus, beforeTargetFocus);

      const sourcePreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Source focus first paragraph',
      });
      await expect(sourcePreview).toBeVisible({ timeout: 10_000 });
      const beforeSourceFocus = await getSplitPaneVisualSnapshot(page, sourcePath, 'Source focus first paragraph');
      expect(beforeSourceFocus.pane).toBe('preview');
      await sourcePreview.locator('p', { hasText: 'Source focus first paragraph' }).click();
      await expectCurrentNotePathToMatch(page, sourcePath);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Source focus first paragraph' }))
        .toBeVisible({ timeout: 10_000 });
      const afterSourceFocus = await getSplitPaneVisualSnapshot(page, sourcePath, 'Source focus first paragraph');
      expect(afterSourceFocus.pane).toBe('');
      expectSplitPaneVisualSnapshotStable(afterSourceFocus, beforeSourceFocus);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps split pane covers visible while focus switches between covered panes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-cover-reload');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-cover-reload',
        files: [
          {
            filename: 'source-cover-reload.md',
            content: [
              '---',
              'vlaina_cover: "./assets/source.png" x=50 y=50 height=168 scale=1',
              '---',
              '',
              'Source cover reload body',
            ].join('\n'),
          },
          {
            filename: 'target-cover-reload.md',
            content: [
              '---',
              'vlaina_cover: "./assets/target.png" x=50 y=50 height=168 scale=1',
              '---',
              '',
              'Target cover reload body',
            ].join('\n'),
          },
          {
            filename: 'spare-cover-reload.md',
            content: 'Spare cover reload body',
          },
        ],
      });
      const [sourcePath, targetPath] = fixture.notePaths;
      if (!sourcePath || !targetPath) {
        throw new Error('Missing fixture note paths');
      }

      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      );
      await fs.mkdir(path.join(path.dirname(sourcePath), 'assets'), { recursive: true });
      await fs.writeFile(path.join(path.dirname(sourcePath), 'assets', 'source.png'), pngBytes);
      await fs.writeFile(path.join(path.dirname(targetPath), 'assets', 'target.png'), pngBytes);

      await openAbsoluteNote(page, sourcePath);
      await openAbsoluteNote(page, targetPath);
      await openAbsoluteNote(page, sourcePath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      await dragTabToRightSplit(page, targetPath);
      await expect(page.locator('[data-note-cover-region="true"]')).toHaveCount(2, { timeout: 10_000 });
      await expect.poll(async () => page.evaluate(() => (
        Array.from(document.querySelectorAll<HTMLElement>('[data-note-cover-region="true"]'))
          .every((cover) => Boolean(cover.querySelector('img[src]')))
      )), { timeout: 10_000 }).toBe(true);
      const beforeSources = await page.evaluate(() => (
        Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-id][data-notes-split-leaf-path]'))
          .map((leaf) => ({
            path: leaf.dataset.notesSplitLeafPath ?? '',
            pane: leaf.dataset.notesSplitPane ?? '',
            src: leaf.querySelector<HTMLImageElement>('[data-note-cover-region="true"] img[src]')?.getAttribute('src') ?? '',
            animating: leaf.querySelector<HTMLElement>('[data-note-cover-region="true"]')?.classList.contains('animate-in') ?? false,
          }))
      ));
      expect(beforeSources.every((entry) => entry.src)).toBe(true);
      expect(beforeSources.every((entry) => !entry.animating)).toBe(true);

      await page.evaluate(() => {
        const blankEvents: Array<{ path: string; pane: string; coverIndex: number }> = [];
        const recordBlankCovers = () => {
          Array.from(document.querySelectorAll<HTMLElement>('[data-note-cover-region="true"]'))
            .forEach((cover, coverIndex) => {
              const leaf = cover.closest<HTMLElement>('[data-notes-split-leaf-id][data-notes-split-leaf-path]');
              if (cover.querySelector('img[src]')) return;
              blankEvents.push({
                path: leaf?.dataset.notesSplitLeafPath ?? '',
                pane: leaf?.dataset.notesSplitPane ?? '',
                coverIndex,
              });
            });
        };
        const observer = new MutationObserver(recordBlankCovers);
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['src'],
          childList: true,
          subtree: true,
        });
        (window as any).__splitCoverBlankAudit = {
          disconnect: () => observer.disconnect(),
          getEvents: () => blankEvents.slice(),
        };
      });

      await page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Target cover reload body',
      }).locator('p', { hasText: 'Target cover reload body' }).click();
      await expectCurrentNotePathToMatch(page, targetPath);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

      const blankEvents = await page.evaluate(() => {
        const audit = (window as any).__splitCoverBlankAudit;
        audit?.disconnect();
        return audit?.getEvents() ?? [];
      });
      expect(blankEvents).toEqual([]);
      const afterSources = await page.evaluate(() => (
        Array.from(document.querySelectorAll<HTMLElement>('[data-notes-split-leaf-id][data-notes-split-leaf-path]'))
          .map((leaf) => ({
            path: leaf.dataset.notesSplitLeafPath ?? '',
            pane: leaf.dataset.notesSplitPane ?? '',
            src: leaf.querySelector<HTMLImageElement>('[data-note-cover-region="true"] img[src]')?.getAttribute('src') ?? '',
            animating: leaf.querySelector<HTMLElement>('[data-note-cover-region="true"]')?.classList.contains('animate-in') ?? false,
          }))
      ));
      expect(afterSources.every((entry) => entry.src)).toBe(true);
      expect(afterSources.every((entry) => !entry.animating)).toBe(true);
      for (const before of beforeSources) {
        const after = afterSources.find((entry) => entry.path === before.path);
        expect(after?.src).toBe(before.src);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps paragraph spacing stable when focus moves between split panes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-spacing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const spacingTexts: [string, string, string] = [
        'Spacing first paragraph sentinel.',
        'Spacing second paragraph sentinel.',
        'Spacing third paragraph sentinel.',
      ];
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-spacing',
        files: [
          {
            filename: 'alpha-spacing.md',
            content: [
              'Active first paragraph sentinel.',
              '',
              'Active second paragraph sentinel.',
              '',
              'Active third paragraph sentinel.',
            ].join('\n'),
          },
          {
            filename: 'beta-spacing.md',
            content: spacingTexts.join('\n\n'),
          },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath) {
        throw new Error('Missing fixture note paths');
      }

      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await openAbsoluteNote(page, alphaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      const betaTabBox = await getTabBox(page, betaPath);
      const notesViewBox = await getNotesViewBox(page);
      await page.mouse.move(betaTabBox.x + betaTabBox.width / 2, betaTabBox.y + betaTabBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(betaTabBox.x + betaTabBox.width / 2 + 12, betaTabBox.y + betaTabBox.height / 2, { steps: 4 });
      await page.mouse.move(notesViewBox.x + notesViewBox.width - 24, notesViewBox.y + notesViewBox.height / 2, { steps: 16 });
      await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
      await page.mouse.up();

      const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: spacingTexts[1],
      });
      await expect(betaPreview).toBeVisible({ timeout: 10_000 });
      const previewMetrics = await getParagraphSpacingMetrics(
        page,
        '[data-notes-split-preview-pane="true"] [data-notes-split-preview-content="true"]',
        spacingTexts,
      );

      await betaPreview.locator('p', { hasText: spacingTexts[1] }).click();
      await expectCurrentNotePathToMatch(page, betaPath);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: spacingTexts[1] }))
        .toBeVisible({ timeout: 10_000 });
      const editorMetrics = await getParagraphSpacingMetrics(page, EDITOR_SELECTOR, spacingTexts);

      expectSpacingMetricsToMatch(editorMetrics, previewMetrics);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('renders Notes-specific rich syntax in split previews', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-rich-syntax');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-rich-syntax',
        files: [
          { filename: 'alpha-rich-syntax.md', content: '# Active note\n\nActive body.' },
          {
            filename: 'beta-rich-syntax.md',
            content: [
              '# Split preview rich syntax',
              '',
              '[TOC]',
              '',
              '## Diagram section',
              '',
              '```mermaid',
              'flowchart TD',
              '  A --> B',
              '```',
              '',
              '![Demo clip](https://media.example.test/demo.mp4)',
              '',
              '![[assets/cover.png|Cover image]] See [[Project Alpha|Rich alias]].',
            ].join('\n'),
          },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath) throw new Error('Missing fixture note paths');

      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await openAbsoluteNote(page, alphaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);
      await dragTabToRightSplit(page, betaPath);

      const preview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Split preview rich syntax',
      });
      await expect(preview).toBeVisible({ timeout: 10_000 });
      await expect(preview.locator('.toc-list .toc-link')).toHaveCount(2);
      await expect(preview.locator('.toc-item.toc-level-1')).toHaveCount(1);
      await expect(preview.locator('.toc-item.toc-level-2')).toHaveCount(1);
      await expect(preview.locator('.mermaid-block svg')).toBeVisible({ timeout: 30_000 });
      await expect(preview.locator('.mermaid-placeholder, code.language-mermaid')).toHaveCount(0);
      await expect(preview.locator('.video-block video[src="https://media.example.test/demo.mp4"]'))
        .toHaveCount(1);
      await expect(preview.locator('img[src="https://media.example.test/demo.mp4"]')).toHaveCount(0);
      await expect(preview.locator('.image-block-container img[alt="Cover image"]')).toHaveCount(1);
      await expect(preview.locator('span.wiki-link')).toHaveText('Rich alias');
      await expect(preview).not.toContainText('[[Project Alpha|Rich alias]]');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits native split preview spacing and blank-line fidelity', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-native-spacing-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await runSplitSpacingAudit(page, 'split-pane-native-spacing-audit');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits external theme split preview spacing, blank lines, and clickability', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-external-spacing-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await installReferenceTyporaTheme(page, 'phycat-sky.css');
      await runSplitSpacingAudit(page, 'split-pane-external-spacing-audit');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps split leaf order stable when activating panes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-activation-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-activation-layout',
        files: [
          { filename: 'alpha-layout.md', content: '# Alpha Layout\n\nAlpha layout body' },
          { filename: 'beta-layout.md', content: '# Beta Layout\n\nBeta layout body' },
        ],
      });
      const [alphaPath, betaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath) {
        throw new Error('Missing fixture note paths');
      }

      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await openAbsoluteNote(page, alphaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      const betaTabBox = await getTabBox(page, betaPath);
      const notesViewBox = await getNotesViewBox(page);
      await page.mouse.move(betaTabBox.x + betaTabBox.width / 2, betaTabBox.y + betaTabBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(betaTabBox.x + betaTabBox.width / 2 + 12, betaTabBox.y + betaTabBox.height / 2, { steps: 4 });
      await page.mouse.move(notesViewBox.x + notesViewBox.width - 24, notesViewBox.y + notesViewBox.height / 2, { steps: 16 });
      await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
      await page.mouse.up();

      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible({ timeout: 10_000 });
      const before = await getSplitLeafSnapshots(page);
      const alphaBefore = before.find((leaf) => leaf.path === alphaPath);
      const betaBefore = before.find((leaf) => leaf.path === betaPath);
      if (!alphaBefore || !betaBefore) {
        throw new Error(`Missing initial split leaves: ${JSON.stringify(before)}`);
      }

      const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Beta layout body',
      });
      await betaPreview.locator('p', { hasText: 'Beta layout body' }).click();
      await expectCurrentNotePathToMatch(page, betaPath);
      const afterBetaActivation = await getSplitLeafSnapshots(page);
      expectLeafGeometryToStayStable(afterBetaActivation, alphaBefore);
      expectLeafGeometryToStayStable(afterBetaActivation, betaBefore);
      expect(afterBetaActivation.find((leaf) => leaf.path === betaPath)?.pane).toBe('primary');
      expect(afterBetaActivation.find((leaf) => leaf.path === alphaPath)?.pane).toBe('preview');

      await page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Alpha layout body',
      }).locator('p', { hasText: 'Alpha layout body' }).click();
      await expectCurrentNotePathToMatch(page, alphaPath);
      const afterAlphaActivation = await getSplitLeafSnapshots(page);
      expectLeafGeometryToStayStable(afterAlphaActivation, alphaBefore);
      expectLeafGeometryToStayStable(afterAlphaActivation, betaBefore);
      expect(afterAlphaActivation.find((leaf) => leaf.path === alphaPath)?.pane).toBe('');
      expect(afterAlphaActivation.find((leaf) => leaf.path === betaPath)?.pane).toBe('preview');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('reorders existing split panes by dragging pane chrome and keeps editing usable', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-reorder');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-reorder',
        files: [
          { filename: 'alpha-reorder.md', content: '# Alpha Reorder\n\nAlpha reorder body' },
          { filename: 'beta-reorder.md', content: '# Beta Reorder\n\nBeta reorder body' },
          { filename: 'gamma-reorder.md', content: '# Gamma Reorder\n\nGamma reorder body' },
        ],
      });
      const [alphaPath, betaPath, gammaPath] = fixture.notePaths;
      if (!alphaPath || !betaPath || !gammaPath) {
        throw new Error('Missing fixture note paths');
      }

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Split Pane Reorder NotesRoot',
        minFileCount: 3,
      });
      await openAbsoluteNote(page, alphaPath);
      await openAbsoluteNote(page, betaPath);
      await openAbsoluteNote(page, alphaPath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      await dragTabToRightSplit(page, betaPath);
      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible({ timeout: 10_000 });

      const betaLeafBox = await getSplitLeafBox(page, betaPath);
      await dragSidebarFileToSplitPoint(page, gammaPath, {
        x: betaLeafBox.x + betaLeafBox.width / 2,
        y: betaLeafBox.y + betaLeafBox.height - 16,
      }, 'bottom');
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(2, { timeout: 10_000 });

      const betaPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Beta reorder body',
      });
      const betaPreviewChrome = betaPreview.locator('[data-notes-split-pane-chrome="true"]');
      await betaPreviewChrome.getByRole('button', { name: 'More note actions' }).click();
      await expect(page.getByTestId('note-menu-content')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-split-drop-overlay]')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await betaPreviewChrome.getByRole('button', { name: 'Add to Starred' }).click();
      await expect(betaPreviewChrome.getByRole('button', { name: /^(Remove from Starred|Unfavorite)$/ }))
        .toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-split-drop-overlay]')).toHaveCount(0);
      await expect(betaPreviewChrome.getByRole('button', { name: 'Right Chat' })).toBeVisible();
      await betaPreviewChrome.getByRole('button', { name: 'Right Chat' }).click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toBeVisible({ timeout: 30_000 });
      await expectCurrentNotePathToMatch(page, betaPath);
      await expect(page.locator('[data-notes-split-drop-overlay]')).toHaveCount(0);
      await page.locator('[data-notes-chat-floating="true"] [aria-label="Close Chat panel"]').click();
      await expect(page.locator('[data-notes-chat-floating="true"]')).toHaveCount(0, { timeout: 10_000 });

      const alphaPreviewAfterChat = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Alpha reorder body',
      });
      await alphaPreviewAfterChat.locator('p', { hasText: 'Alpha reorder body' }).click();
      await expectCurrentNotePathToMatch(page, alphaPath);

      const before = await getSplitLeafSnapshots(page);
      const alphaBefore = findSplitLeafSnapshotByPath(before, alphaPath);
      const betaBefore = findSplitLeafSnapshotByPath(before, betaPath);
      const gammaBefore = findSplitLeafSnapshotByPath(before, gammaPath);
      if (!alphaBefore || !betaBefore || !gammaBefore) {
        throw new Error(`Missing initial reorder split leaves: ${JSON.stringify(before)}`);
      }
      expect(gammaBefore.y).toBeGreaterThan(betaBefore.y);

      await dragSplitPaneChromeWithoutDrop(page, gammaPath);
      expect(await getSplitLeafSnapshots(page)).toEqual(before);

      const alphaLeafBox = await getSplitLeafBox(page, alphaPath);
      await dragSplitPaneChromeToSplitPoint(page, gammaPath, {
        x: alphaLeafBox.x + 14,
        y: alphaLeafBox.y + alphaLeafBox.height / 2,
      }, 'left');

      const after = await getSplitLeafSnapshots(page);
      const alphaAfter = findSplitLeafSnapshotByPath(after, alphaPath);
      const betaAfter = findSplitLeafSnapshotByPath(after, betaPath);
      const gammaAfter = findSplitLeafSnapshotByPath(after, gammaPath);
      if (!alphaAfter || !betaAfter || !gammaAfter) {
        throw new Error(`Missing reordered split leaves: ${JSON.stringify(after)}`);
      }
      expect(alphaAfter.id).toBe(alphaBefore.id);
      expect(betaAfter.id).toBe(betaBefore.id);
      expect(gammaAfter.id).toBe(gammaBefore.id);
      expect(gammaAfter.x).toBeLessThan(alphaAfter.x);
      expect(betaAfter.x).toBeGreaterThan(alphaAfter.x);
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);

      await page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Gamma reorder body',
      }).locator('p', { hasText: 'Gamma reorder body' }).click();
      await expectCurrentNotePathToMatch(page, gammaPath);
      await focusVisibleEditorForTyping(page, 'Gamma reorder body');
      await typeFocusedEditorTextAndExpectSaved(
        page,
        gammaPath,
        'Gamma reordered pane edit saved',
        'Expected reordered split pane to remain editable and saved',
      );

      const betaLeafBoxAfterPreviewMove = await getSplitLeafBox(page, betaPath);
      await dragSplitPaneChromeToSplitPoint(page, gammaPath, {
        x: betaLeafBoxAfterPreviewMove.x + betaLeafBoxAfterPreviewMove.width / 2,
        y: betaLeafBoxAfterPreviewMove.y + betaLeafBoxAfterPreviewMove.height - 14,
      }, 'bottom');
      const afterActiveMove = await getSplitLeafSnapshots(page);
      const betaAfterActiveMove = findSplitLeafSnapshotByPath(afterActiveMove, betaPath);
      const gammaAfterActiveMove = findSplitLeafSnapshotByPath(afterActiveMove, gammaPath);
      if (!betaAfterActiveMove || !gammaAfterActiveMove) {
        throw new Error(`Missing active-moved split leaves: ${JSON.stringify(afterActiveMove)}`);
      }
      expect(gammaAfterActiveMove.id).toBe(gammaBefore.id);
      expect(gammaAfterActiveMove.y).toBeGreaterThan(betaAfterActiveMove.y);
      await expectCurrentNotePathToMatch(page, gammaPath);

      const beforeResizeAfterMove = await getSplitMetrics(page, 'bottom');
      await page.mouse.move(beforeResizeAfterMove.dividerX, beforeResizeAfterMove.dividerY);
      await page.mouse.down();
      await page.mouse.move(beforeResizeAfterMove.dividerX, beforeResizeAfterMove.dividerY + 80, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => {
        const afterResize = await getSplitMetrics(page, 'bottom');
        return Math.abs(Math.round(afterResize.firstSize - beforeResizeAfterMove.firstSize));
      }, { timeout: 10_000 }).toBeGreaterThan(30);

      await focusVisibleEditorForTyping(page, 'Gamma reordered pane edit saved');
      await typeFocusedEditorTextAndExpectSaved(
        page,
        gammaPath,
        'Gamma active pane drag edit saved',
        'Expected active dragged split pane to remain editable and saved',
      );
      await expect(page.locator('[data-notes-split-layout]')).not.toHaveCount(0);
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('copies local image assets when image blocks are dragged between split panes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-image-block-drag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-image-block-drag',
        files: [
          {
            filename: 'source/source-image.md',
            content: [
              '# Image Source',
              '',
              '<img src="./assets/photo.png" alt="Drag image" />',
              '',
              'Source image after',
            ].join('\n'),
          },
          {
            filename: 'target/target-image.md',
            content: [
              '# Image Target',
              '',
              'Target before image',
              '',
              'Target image anchor',
            ].join('\n'),
          },
        ],
      });
      const [sourcePath, targetPath] = fixture.notePaths;
      if (!sourcePath || !targetPath) {
        throw new Error('Missing fixture note paths');
      }

      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      );
      const sourceAssetPath = path.join(path.dirname(sourcePath), 'assets', 'photo.png');
      const targetAssetPath = path.join(path.dirname(targetPath), 'assets', 'photo.png');
      await fs.mkdir(path.dirname(sourceAssetPath), { recursive: true });
      await fs.writeFile(sourceAssetPath, pngBytes);

      await openAbsoluteNote(page, sourcePath);
      await openAbsoluteNote(page, targetPath);
      await openAbsoluteNote(page, sourcePath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      const targetTabBox = await getTabBox(page, targetPath);
      const notesViewBox = await getNotesViewBox(page);
      await page.mouse.move(targetTabBox.x + targetTabBox.width / 2, targetTabBox.y + targetTabBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetTabBox.x + targetTabBox.width / 2 + 12, targetTabBox.y + targetTabBox.height / 2, { steps: 4 });
      await page.mouse.move(notesViewBox.x + notesViewBox.width - 24, notesViewBox.y + notesViewBox.height / 2, { steps: 16 });
      await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
      await page.mouse.up();

      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container`)).toBeVisible({ timeout: 10_000 });

      await selectImageBlockBySource(page, 'photo.png');
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} .image-block-container`).first(),
        { assertCentered: false },
      );
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();
      await beginBlockHandleDrag(page);

      const targetLeafBox = await getSplitLeafBox(page, targetPath);
      await page.mouse.move(
        targetLeafBox.x + targetLeafBox.width / 2,
        targetLeafBox.y + targetLeafBox.height / 2,
        { steps: 8 },
      );
      await expectCurrentNotePathToMatch(page, targetPath);

      const targetAnchorBox = await getVisibleEditorParagraphBox(page, 'Target image anchor');
      await page.mouse.move(
        targetAnchorBox.x + Math.min(40, Math.max(12, targetAnchorBox.width / 3)),
        targetAnchorBox.y + 2,
        { steps: 10 },
      );
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      ), { message: 'Expected image block drag to settle' }).toBe(false);
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), targetPath
      ), { timeout: 10_000, message: 'Expected target note to receive copied image markdown' })
        .toContain('./assets/photo.png');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), sourcePath
      ), { timeout: 10_000, message: 'Expected source note image block to be moved away' })
        .not.toContain('Drag image');
      await expect.poll(async () => fs.readFile(targetAssetPath).then(
        (bytes) => Array.from(bytes),
        () => null,
      ), { timeout: 10_000, message: 'Expected target image asset to be copied beside the target note' })
        .toEqual(Array.from(pngBytes));
      await expect(fs.readFile(sourceAssetPath).then((bytes) => Array.from(bytes))).resolves.toEqual(Array.from(pngBytes));
      await expect(page.locator(`${EDITOR_SELECTOR} .image-block-container img[data-src="./assets/photo.png"]`))
        .toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps split panes full-fidelity, editable, saved, and usable for cross-pane block drag', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-split-pane-edit-block-drag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'split-pane-edit-block-drag',
        files: [
          {
            filename: 'source-pane.md',
            content: [
              '---',
              'vlaina_cover: "@monet/1" x=50 y=50 height=180 scale=1',
              'vlaina_icon: "🍓" size=72',
              '---',
              '',
              '# Source Pane',
              '',
              'Source keep before',
              '',
              'Source block to move into target',
              '',
              'Source drop anchor',
            ].join('\n'),
          },
          {
            filename: 'target-pane.md',
            content: [
              '---',
              'vlaina_cover: "@monet/2" x=50 y=50 height=180 scale=1',
              'vlaina_icon: "💡" size=72',
              '---',
              '',
              '# Target Pane',
              '',
              'Target keep before',
              '',
              'Move this block between split panes',
              '',
              'Target keep after',
            ].join('\n'),
          },
        ],
      });
      const [sourcePath, targetPath] = fixture.notePaths;
      if (!sourcePath || !targetPath) {
        throw new Error('Missing fixture note paths');
      }

      await openAbsoluteNote(page, sourcePath);
      await openAbsoluteNote(page, targetPath);
      await openAbsoluteNote(page, sourcePath);
      await expect.poll(async () => page.locator('[data-notes-tab-path]').count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);

      const targetTabBox = await getTabBox(page, targetPath);
      const notesViewBox = await getNotesViewBox(page);
      await page.mouse.move(targetTabBox.x + targetTabBox.width / 2, targetTabBox.y + targetTabBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetTabBox.x + targetTabBox.width / 2 + 12, targetTabBox.y + targetTabBox.height / 2, { steps: 4 });
      await page.mouse.move(notesViewBox.x + notesViewBox.width - 24, notesViewBox.y + notesViewBox.height / 2, { steps: 16 });
      await expect(page.locator('[data-notes-split-drop-overlay="right"]')).toBeVisible({ timeout: 10_000 });
      await page.mouse.up();

      const targetPreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Move this block between split panes',
      });
      await expect(targetPreview).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);
      await expect(targetPreview.locator('[data-note-cover-region="true"]')).toBeVisible({ timeout: 10_000 });
      await expect(targetPreview).toContainText('💡');
      await expect(targetPreview).not.toContainText('vlaina_cover');
      await expect(targetPreview).not.toContainText('vlaina_icon');
      await expect.poll(async () => targetPreview.locator('[data-hero-icon-title="true"]').evaluate((element) =>
        Number.parseFloat(window.getComputedStyle(element).fontSize)
      ), { timeout: 10_000, message: 'Expected inactive split preview title to stay compact' })
        .toBeLessThanOrEqual(24);
      const targetPreviewChrome = targetPreview.locator('[data-notes-split-pane-chrome="true"]');
      await expect(targetPreviewChrome.getByRole('button', { name: 'Add to Starred' })).toBeVisible();
      await expect(targetPreviewChrome.getByRole('button', { name: 'Right Chat' })).toBeVisible();
      await expect(targetPreviewChrome.getByRole('button', { name: 'More note actions' })).toBeVisible();

      await targetPreview.locator('p', { hasText: 'Target keep before' }).click();
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ), { timeout: 10_000 }).toBe(targetPath);
      await page.keyboard.type('\n\nDirect split pane edit saved');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), targetPath
      ), { timeout: 10_000, message: 'Expected direct split pane click to focus the editor and save' })
        .toContain('Direct split pane edit saved');
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Target keep after' }))
        .toBeVisible({ timeout: 10_000 });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Target keep after' }).click();
      await page.keyboard.type('\n\nSplit pane edit saved');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), targetPath
      ), { timeout: 10_000, message: 'Expected active split pane edit to be saved' })
        .toContain('Split pane edit saved');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), sourcePath
      ), { timeout: 10_000, message: 'Expected target pane edits to stay out of the source note' })
        .not.toContain('Split pane edit saved');
      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible();
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);

      const sourcePreview = page.locator('[data-notes-split-preview-pane="true"]', {
        hasText: 'Source keep before',
      });
      await sourcePreview.locator('p', { hasText: 'Source keep before' }).click();
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ), { timeout: 10_000, message: 'Expected direct source split pane click to activate it' }).toBe(sourcePath);
      await page.keyboard.type('\n\nDirect source pane edit saved');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), sourcePath
      ), { timeout: 10_000, message: 'Expected direct source split pane edit to be saved' })
        .toContain('Direct source pane edit saved');
      const splitEditIsolation = await page.evaluate(async ({ sourcePath, targetPath }) => {
        const bridge = (window as any).__vlainaE2E;
        const [sourceContent, targetContent] = await Promise.all([
          bridge.readTextFile(sourcePath),
          bridge.readTextFile(targetPath),
        ]);
        return { sourceContent, targetContent };
      }, { sourcePath, targetPath });
      expect(splitEditIsolation.sourceContent).toContain('Direct source pane edit saved');
      expect(splitEditIsolation.sourceContent).not.toContain('Direct split pane edit saved');
      expect(splitEditIsolation.sourceContent).not.toContain('Split pane edit saved');
      expect(splitEditIsolation.targetContent).toContain('Direct split pane edit saved');
      expect(splitEditIsolation.targetContent).toContain('Split pane edit saved');
      expect(splitEditIsolation.targetContent).not.toContain('Direct source pane edit saved');
      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible();
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);

      const sourceSelectedCount = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectNoteBlocksByText(['Source block to move into target'])
      );
      expect(sourceSelectedCount).toBe(1);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Source block to move into target' }),
      );
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();
      await beginBlockHandleDrag(page);

      const targetLeafBox = await getSplitLeafBox(page, targetPath);
      await startSplitPaneBodyBlankAudit(page, targetPath, [
        'Target keep before',
        'Move this block between split panes',
      ]);
      await page.mouse.move(
        targetLeafBox.x + targetLeafBox.width / 2,
        targetLeafBox.y + targetLeafBox.height / 2,
        { steps: 8 },
      );
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ), { timeout: 10_000, message: 'Expected hovering the target split pane to activate it' }).toBe(targetPath);
      const targetActivationBlankEvents = await page.evaluate(() => {
        const audit = (window as any).__splitPaneBlankAudit;
        audit?.stop();
        return audit?.getEvents() ?? [];
      });
      expect(targetActivationBlankEvents).toEqual([]);

      const targetAnchorBox = await getVisibleEditorParagraphBox(page, 'Target keep before');
      await page.mouse.move(
        targetAnchorBox.x + Math.min(40, Math.max(12, targetAnchorBox.width / 3)),
        targetAnchorBox.y + 2,
        { steps: 10 },
      );
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      ), { message: 'Expected source-to-target split pane block drag to settle' }).toBe(false);
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), targetPath
      ), { timeout: 10_000, message: 'Expected target split pane to receive source block' })
        .toContain('Source block to move into target');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), sourcePath
      ), { timeout: 10_000, message: 'Expected source split pane block to be removed' })
        .not.toContain('Source block to move into target');
      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible();
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);

      const selectedCount = await page.evaluate(() =>
        (window as any).__vlainaE2E.selectNoteBlocksByText(['Move this block between split panes'])
      );
      expect(selectedCount).toBe(1);
      await moveMouseToBlockHandleGutter(
        page,
        page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Move this block between split panes' }),
      );
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();
      await beginBlockHandleDrag(page);

      const sourceLeafBox = await getSplitLeafBox(page, sourcePath);
      await startSplitPaneBodyBlankAudit(page, sourcePath, [
        'Source keep before',
        'Source drop anchor',
      ]);
      await page.mouse.move(
        sourceLeafBox.x + sourceLeafBox.width / 2,
        sourceLeafBox.y + sourceLeafBox.height / 2,
        { steps: 8 },
      );
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ), { timeout: 10_000, message: 'Expected hovering the source split pane to activate it' }).toBe(sourcePath);
      const sourceActivationBlankEvents = await page.evaluate(() => {
        const audit = (window as any).__splitPaneBlankAudit;
        audit?.stop();
        return audit?.getEvents() ?? [];
      });
      expect(sourceActivationBlankEvents).toEqual([]);

      const sourceAnchorBox = await getVisibleEditorParagraphBox(page, 'Source drop anchor');
      await page.mouse.move(
        sourceAnchorBox.x + Math.min(40, Math.max(12, sourceAnchorBox.width / 3)),
        sourceAnchorBox.y + 2,
        { steps: 10 },
      );
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() =>
        document.body.classList.contains('editor-block-drag-active')
      ), { message: 'Expected split pane block drag to settle' }).toBe(false);
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), sourcePath
      ), { timeout: 10_000, message: 'Expected source split pane to receive dragged block' })
        .toContain('Move this block between split panes');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), targetPath
      ), { timeout: 10_000, message: 'Expected active split pane source block to be removed' })
        .not.toContain('Move this block between split panes');
      await expect(page.locator('[data-notes-split-layout="right"]')).toBeVisible();
      await expect(page.locator('[data-notes-split-preview-pane="true"]')).toHaveCount(1);
      await expect(page.locator('[data-notes-tab-path]')).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
