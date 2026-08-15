import { expect, type Locator, type Page } from "@playwright/test";

type BlockTextMatcher = {
  include?: string;
  exact?: string;
  exclude?: string[];
};

export async function selectNoteBlocksByMatchers(page: Page, matchers: BlockTextMatcher[]): Promise<void> {
  const result = await page.evaluate(async (targetMatchers) => {
    const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks() as Array<{
      text: string;
      tagName: string;
      from: number;
      to: number;
    }>;
    const usedIndexes = new Set<number>();
    const indexes: number[] = [];
    const missing: BlockTextMatcher[] = [];

    for (const matcher of targetMatchers) {
      const index = blocks.findIndex((block, blockIndex) => {
        if (usedIndexes.has(blockIndex)) return false;
        if (matcher.exact !== undefined && block.text !== matcher.exact) return false;
        if (matcher.include !== undefined && !block.text.includes(matcher.include)) return false;
        if (matcher.exclude?.some((text) => block.text.includes(text))) return false;
        return true;
      });
      if (index < 0) {
        missing.push(matcher);
        continue;
      }
      usedIndexes.add(index);
      indexes.push(index);
    }

    const count = missing.length === 0
      ? await (window as any).__vlainaE2E.selectNoteBlocksByIndexes(indexes)
      : 0;
    return {
      count,
      indexes,
      missing,
      blockTexts: blocks.map((block) => block.text),
    };
  }, matchers);

  expect(result.missing, `Missing selectable blocks from: ${JSON.stringify(result.blockTexts)}`).toEqual([]);
  expect(result.count).toBe(matchers.length);
}

type MoveMouseToBlockHandleGutterOptions = {
  assertCentered?: boolean;
  maxCenterDelta?: number;
};

export async function moveMouseToBlockHandleGutter(
  page: Page,
  locator: Locator,
  options: MoveMouseToBlockHandleGutterOptions = {},
): Promise<void> {
  const rect = await locator.evaluateAll((elements) => {
    const resolveHandleTargetRect = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      if (element.tagName !== 'LI') return box;

      const headElement = element.firstElementChild;
      if (!(headElement instanceof HTMLElement)) return box;

      const headBox = headElement.getBoundingClientRect();
      if (headBox.width <= 0 || headBox.height <= 0 || box.width <= 0) return box;

      return {
        x: box.x,
        y: headBox.y,
        width: box.width,
        height: headBox.height,
      };
    };

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = resolveHandleTargetRect(element);
      if (box.width <= 0 || box.height <= 0) continue;
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    }
    return null;
  });
  if (!rect) {
    throw new Error('Could not resolve block geometry');
  }
  await moveMouseToBlockHandleGutterAtRect(page, rect, options);
}

async function moveMouseToBlockHandleGutterAtRect(
  page: Page,
  rect: { x?: number; y?: number; left?: number; top?: number; width: number; height: number },
  options: MoveMouseToBlockHandleGutterOptions = {},
): Promise<void> {
  const rectX = rect.x ?? rect.left;
  const rectY = rect.y ?? rect.top;
  if (rectX === undefined || rectY === undefined) {
    throw new Error('Could not resolve block geometry');
  }
  const targetCenterY = rectY + rect.height / 2;
  const targetX = Math.max(8, rectX - 18);
  const primingX = targetX > 8 ? targetX - 1 : targetX + 1;
  await page.mouse.move(primingX, targetCenterY);
  await page.mouse.move(targetX, targetCenterY, { steps: 3 });

  if (options.assertCentered === false) {
    await expect(page.locator('.editor-block-controls.visible')).toBeVisible({ timeout: 10_000 });
    return;
  }

  await expect.poll(async () => page.evaluate(({ x, y, expectedCenterY }) => {
    // Electron can coalesce Playwright mouse moves when the cursor is already at the same screen point.
    const target = document.elementFromPoint(x, y) ?? document;
    target.dispatchEvent(new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true,
      composed: true,
      view: window,
    }));
    if (typeof PointerEvent !== 'undefined') {
      target.dispatchEvent(new PointerEvent('pointermove', {
        clientX: x,
        clientY: y,
        pointerType: 'mouse',
        bubbles: true,
        composed: true,
        view: window,
      }));
    }

    const controls = document.querySelector<HTMLElement>('.editor-block-controls');
    if (!controls?.classList.contains('visible')) return Number.POSITIVE_INFINITY;
    const controlsRect = controls.getBoundingClientRect();
    return Math.abs((controlsRect.top + controlsRect.height / 2) - expectedCenterY);
  }, { x: targetX, y: targetCenterY, expectedCenterY: targetCenterY }), {
    message: 'Expected block controls to align with the hovered block',
  }).toBeLessThanOrEqual(options.maxCenterDelta ?? 2);
}

export async function measureVisibleHandleGeometry(
  page: Page,
  input: {
    targetSelector: string;
    targetText: string;
    anchorSelector?: string;
    anchorText?: string;
  },
): Promise<{
  controlsCenterY: number;
  targetCenterY: number;
  targetGapX: number;
  anchorGapX: number;
  targetIndentFromAnchorX: number;
}> {
  const geometry = await page.evaluate(({ targetSelector, targetText, anchorSelector, anchorText }) => {
    const findElement = (selector: string, text: string) => (
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .find((element) => element.textContent?.includes(text)) ?? null
    );
    const controls = document.querySelector<HTMLElement>('.editor-block-controls.visible');
    const target = findElement(targetSelector, targetText);
    const anchor = anchorSelector && anchorText
      ? findElement(anchorSelector, anchorText)
      : target;
    if (!controls || !target || !anchor) return null;

    const controlsRect = controls.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      controlsCenterY: controlsRect.top + controlsRect.height / 2,
      targetCenterY: targetRect.top + targetRect.height / 2,
      targetGapX: targetRect.left - controlsRect.left,
      anchorGapX: anchorRect.left - controlsRect.left,
      targetIndentFromAnchorX: targetRect.left - anchorRect.left,
    };
  }, input);

  expect(geometry).not.toBeNull();
  return geometry!;
}

function expectHandleCenteredOnTarget(geometry: { controlsCenterY: number; targetCenterY: number }): void {
  expect(Math.abs(geometry.controlsCenterY - geometry.targetCenterY)).toBeLessThanOrEqual(2);
}

export function expectHandleAnchoredToListRow(geometry: {
  controlsCenterY: number;
  targetCenterY: number;
  targetGapX: number;
}): void {
  expectHandleCenteredOnTarget(geometry);
  expect(geometry.targetGapX).toBeGreaterThan(48);
  expect(geometry.targetGapX).toBeLessThan(88);
}

export function expectHandleAnchoredToOuterListRow(geometry: {
  controlsCenterY: number;
  targetCenterY: number;
  targetGapX: number;
  anchorGapX: number;
  targetIndentFromAnchorX: number;
}): void {
  expectHandleCenteredOnTarget(geometry);
  expect(geometry.anchorGapX).toBeGreaterThan(48);
  expect(geometry.anchorGapX).toBeLessThan(88);
  expect(geometry.targetIndentFromAnchorX).toBeGreaterThan(16);
  expect(geometry.targetGapX).toBeGreaterThan(geometry.anchorGapX + 16);
}
