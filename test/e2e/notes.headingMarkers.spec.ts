import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  selectNoteBlocksByText,
} from './notesE2E';

async function getHeadingTextDragPoints(
  page: import('@playwright/test').Page,
  text: string,
) {
  return page.evaluate(({ editorSelector, headingText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) throw new Error('Missing editor');
    const heading = Array.from(editor.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .find((element) => element.textContent === headingText);
    if (!heading) throw new Error(`Missing heading text: ${headingText}`);
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.length > 0) textNodes.push(node);
    }
    const firstNode = textNodes[0];
    const lastNode = textNodes.at(-1);
    if (!firstNode || !lastNode) throw new Error(`Missing heading text nodes: ${headingText}`);
    const characterRect = (node: Text, offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      range.detach();
      return rect;
    };
    const first = characterRect(firstNode, 0);
    const last = characterRect(lastNode, lastNode.data.length - 1);
    return {
      end: { x: first.left + 0.5, y: first.top + first.height / 2 },
      start: { x: last.right - 0.5, y: last.top + last.height / 2 },
    };
  }, { editorSelector: EDITOR_SELECTOR, headingText: text });
}

async function getHeadingSubstringDragPoints(
  page: import('@playwright/test').Page,
  headingText: string,
  from: number,
  to: number,
) {
  return page.evaluate(({ editorSelector, fromOffset, text, toOffset }) => {
    const heading = Array.from(
      document.querySelectorAll<HTMLElement>(`${editorSelector} h1, ${editorSelector} h2, ${editorSelector} h3, ${editorSelector} h4, ${editorSelector} h5, ${editorSelector} h6`),
    ).find((element) => element.textContent?.endsWith(text));
    if (!heading) throw new Error(`Missing heading: ${text}`);
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.heading-markdown-marker')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.length > 0) textNodes.push(node);
    }
    if (textNodes.map((node) => node.data).join('') !== text) {
      throw new Error(`Missing heading text nodes: ${text}`);
    }
    const boundary = (offset: number, side: 'left' | 'right') => {
      let remaining = offset;
      const node = textNodes.find((candidate) => {
        if (remaining < candidate.data.length) return true;
        remaining -= candidate.data.length;
        return false;
      });
      if (!node) throw new Error(`Missing heading text offset: ${offset}`);
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, remaining + 1);
      const rect = range.getBoundingClientRect();
      range.detach();
      return {
        x: side === 'left' ? rect.left + 0.5 : rect.right - 0.5,
        y: rect.top + rect.height / 2,
      };
    };
    return {
      end: boundary(toOffset - 1, 'right'),
      start: boundary(fromOffset, 'left'),
    };
  }, {
    editorSelector: EDITOR_SELECTOR,
    fromOffset: from,
    text: headingText,
    toOffset: to,
  });
}

async function getHeadingMarkerDragPoint(
  page: import('@playwright/test').Page,
  headingText: string,
) {
  return page.evaluate(({ editorSelector, text }) => {
    const heading = Array.from(
      document.querySelectorAll<HTMLElement>(`${editorSelector} h1, ${editorSelector} h2, ${editorSelector} h3, ${editorSelector} h4, ${editorSelector} h5, ${editorSelector} h6`),
    ).find((element) => element.textContent?.endsWith(text));
    const marker = heading?.querySelector<HTMLElement>('.heading-markdown-marker');
    if (!marker) throw new Error(`Missing heading marker: ${text}`);
    const rect = marker.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { editorSelector: EDITOR_SELECTOR, text: headingText });
}

async function getHeadingSelectionPaintBounds(
  page: import('@playwright/test').Page,
  level: number,
) {
  const geometry = await page.locator(`${EDITOR_SELECTOR} h${level}`).evaluate((element) => {
    const headingRect = element.getBoundingClientRect();
    const clip = {
      height: Math.ceil(headingRect.height + 4),
      width: Math.ceil(headingRect.width + 4),
      x: Math.max(0, Math.floor(headingRect.left - 2)),
      y: Math.max(0, Math.floor(headingRect.top - 2)),
    };
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--vlaina-markdown-color-selection)';
    element.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const channels = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Invalid selection color: ${color}`);
    return {
      clip,
      color: { blue: channels[2], green: channels[1], red: channels[0] },
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      overlays: Array.from(
        element.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
        (overlay) => {
          const rect = overlay.getBoundingClientRect();
          return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
        },
      ),
    };
  });
  const screenshot = await page.screenshot({ clip: geometry.clip });

  return page.evaluate(async ({ geometry, imageUrl }) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load heading selection screenshot'));
      image.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create heading selection canvas context');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const scaleX = image.naturalWidth / geometry.clip.width;
    const scaleY = image.naturalHeight / geometry.clip.height;
    const matchesSelection = (offset: number) => (
      Math.abs((pixels.data[offset] ?? 0) - geometry.color.red) <= 8
      && Math.abs((pixels.data[offset + 1] ?? 0) - geometry.color.green) <= 8
      && Math.abs((pixels.data[offset + 2] ?? 0) - geometry.color.blue) <= 8
      && (pixels.data[offset + 3] ?? 0) > 240
    );

    return {
      lineHeight: geometry.lineHeight,
      overlays: geometry.overlays.map((rect) => {
        const left = Math.max(0, Math.floor((rect.left - geometry.clip.x) * scaleX));
        const right = Math.min(
          image.naturalWidth,
          Math.ceil((rect.right - geometry.clip.x) * scaleX),
        );
        const top = Math.max(0, Math.floor((rect.top - geometry.clip.y) * scaleY));
        const bottom = Math.min(
          image.naturalHeight,
          Math.ceil((rect.bottom - geometry.clip.y) * scaleY),
        );
        const minimumMatchingPixels = Math.max(2, Math.floor((right - left) * 0.15));
        const paintedRows: number[] = [];
        for (let y = top; y < bottom; y += 1) {
          let matchingPixels = 0;
          for (let x = left; x < right; x += 1) {
            if (matchesSelection((y * pixels.width + x) * 4)) matchingPixels += 1;
          }
          if (matchingPixels >= minimumMatchingPixels) paintedRows.push(y);
        }
        if (paintedRows.length === 0) return null;
        return {
          bottom: geometry.clip.y + (paintedRows.at(-1)! + 1) / scaleY,
          top: geometry.clip.y + paintedRows[0] / scaleY,
        };
      }),
    };
  }, {
    geometry,
    imageUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
  });
}

test.describe('notes heading Markdown markers', () => {
  test.setTimeout(90_000);

  test('shows matching heading markers only while the heading selection is active', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-markers');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-markers-e2e.md',
        content: [
          '# Heading one',
          '## Heading two',
          '### Heading three',
          '#### Heading four',
          '##### Heading five',
          '###### Heading six',
          'Body paragraph',
        ].join('\n\n'),
      });

      for (let level = 1; level <= 6; level += 1) {
        const heading = page.locator(`${EDITOR_SELECTOR} h${level}`).first();
        await heading.click();

        const marker = page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`);
        await expect(marker).toHaveCount(1);
        await expect(marker).toHaveText(`${'#'.repeat(level)} `, { useInnerText: false });
        const typography = await heading.evaluate((element) => {
          const markerElement = element.querySelector<HTMLElement>('.heading-markdown-marker')!;
          const headingStyle = getComputedStyle(element);
          const markerStyle = getComputedStyle(markerElement);
          return {
            fontSize: markerStyle.fontSize === headingStyle.fontSize,
            fontWeight: markerStyle.fontWeight === headingStyle.fontWeight,
            lineHeight: markerStyle.lineHeight === headingStyle.lineHeight,
          };
        });
        expect(typography).toEqual({ fontSize: true, fontWeight: true, lineHeight: true });
      }

      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.dispatchEvent(new Event('blur'));
      });
      await page.mouse.move(0, 0);
      const retainedMarker = page.locator(`${EDITOR_SELECTOR} h6 .heading-markdown-marker`);
      await expect(retainedMarker).toHaveText('###### ', { useInnerText: false });
      await expect.poll(() => retainedMarker.evaluate((element) => getComputedStyle(element).display))
        .not.toBe('none');

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);

      expect(await selectNoteBlocksByText(page, ['Heading two', 'Heading four'])).toBe(2);
      const selectedMarkers = page.locator(
        `${EDITOR_SELECTOR} .heading-markdown-marker-block-selected`,
      );
      await expect(selectedMarkers).toHaveCount(2);
      await expect(selectedMarkers.nth(0)).toHaveText('## ', { useInnerText: false });
      await expect(selectedMarkers.nth(1)).toHaveText('#### ', { useInnerText: false });
      expect(await selectNoteBlocksByText(page, [])).toBe(0);
      await expect(page.locator(`${EDITOR_SELECTOR} .heading-markdown-marker`)).toHaveCount(0);

      const body = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' });
      await body.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('###### ');
      await expect(page.locator(`${EDITOR_SELECTOR} h6 .heading-markdown-marker-empty`))
        .toHaveText('######');
      await page.keyboard.press('Enter');
      await expect(page.locator(`${EDITOR_SELECTOR} h6 .heading-markdown-marker-empty`))
        .toHaveText('######');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('reveals the selected heading marker only after pointer selection ends', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-drag');
    const headingText = 'Notes full syntax check';

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-drag-e2e.md',
        content: ['# Notes **full** syntax check', '', 'Body paragraph'].join('\n'),
      });

      await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' }).click();
      const points = await getHeadingTextDragPoints(page, headingText);
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 20 });

      await expect(page.locator(EDITOR_SELECTOR)).toHaveAttribute(
        'data-editor-pointer-selecting',
        'true',
      );
      const marker = page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`);
      await expect(marker).toHaveCount(1);
      await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).display))
        .toBe('none');

      await page.mouse.up();

      await expect(page.locator(EDITOR_SELECTOR)).not.toHaveAttribute(
        'data-editor-pointer-selecting',
        'true',
      );
      await expect(page.locator(EDITOR_SELECTOR)).not.toHaveClass(/editor-pointer-native-selection/);
      await expect(marker).toHaveText('# ', { useInnerText: false });
      await expect(marker).toHaveClass(/editor-text-selection-overlay/);
      await expect(page.locator(`${EDITOR_SELECTOR} h1`))
        .toHaveClass(/heading-markdown-fully-selected/);
      const selectionVisual = await page.locator(`${EDITOR_SELECTOR} h1`).evaluate((heading) => {
        const markerElement = heading.querySelector<HTMLElement>('.heading-markdown-marker');
        const textOverlay = Array.from(
          heading.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
        ).find((element) => element !== markerElement);
        if (!markerElement || !textOverlay) throw new Error('Missing heading selection overlay');
        const markerStyle = getComputedStyle(markerElement);
        const markerRect = markerElement.getBoundingClientRect();
        const textRect = textOverlay.getBoundingClientRect();
        const overlayRects = Array.from(
          heading.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
          (element) => {
            const rect = element.getBoundingClientRect();
            return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
          },
        );
        const editor = heading.closest<HTMLElement>('.ProseMirror');
        if (!editor) throw new Error('Missing editor root');
        const probe = document.createElement('span');
        const editorStyle = getComputedStyle(editor);
        probe.style.backgroundColor = editorStyle.getPropertyValue('--vlaina-markdown-color-selection');
        probe.style.color = editorStyle.getPropertyValue('--vlaina-color-white');
        editor.append(probe);
        const expectedStyle = getComputedStyle(probe);
        const expected = {
          backgroundColor: expectedStyle.backgroundColor,
          color: expectedStyle.color,
        };
        probe.remove();
        return {
          backgroundImage: markerStyle.backgroundImage,
          color: markerStyle.color,
          expected,
          overlayCount: heading.querySelectorAll('.editor-text-selection-overlay').length,
          markerBottom: markerRect.bottom,
          markerRight: markerRect.right,
          markerTop: markerRect.top,
          overlayRects,
          radii: Array.from(
            heading.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
            (element) => getComputedStyle(element).borderRadius,
          ),
          textBottom: textRect.bottom,
          textLeft: textRect.left,
          textTop: textRect.top,
        };
      });
      expect(selectionVisual.backgroundImage).toContain(selectionVisual.expected.backgroundColor);
      expect(selectionVisual.color).toBe(selectionVisual.expected.color);
      expect(selectionVisual.overlayCount).toBeGreaterThan(2);
      expect(Math.abs(selectionVisual.markerTop - selectionVisual.textTop)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(selectionVisual.markerBottom - selectionVisual.textBottom)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(selectionVisual.markerRight - selectionVisual.textLeft)).toBeLessThanOrEqual(0.5);
      expect(selectionVisual.radii.every((radius) => radius === '0px')).toBe(true);
      for (const [index, rect] of selectionVisual.overlayRects.entries()) {
        expect(Math.abs(rect.top - selectionVisual.markerTop)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(rect.bottom - selectionVisual.markerBottom)).toBeLessThanOrEqual(0.5);
        const nextRect = selectionVisual.overlayRects[index + 1];
        if (nextRect) expect(Math.abs(rect.right - nextRect.left)).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('uses one selection height for every inline segment at each heading level', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-heights');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-heights-e2e.md',
        content: Array.from({ length: 6 }, (_, index) => (
          `${'#'.repeat(index + 1)} Plain **bold** *italic* \`code\``
        )).join('\n\n'),
      });

      for (let level = 1; level <= 6; level += 1) {
        const heading = page.locator(`${EDITOR_SELECTOR} h${level}`);
        await heading.click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await expect(heading.locator('.heading-markdown-marker'))
          .toHaveClass(/editor-text-selection-overlay/);

        const paint = await getHeadingSelectionPaintBounds(page, level);
        expect(paint.overlays.length, JSON.stringify({ level, paint })).toBeGreaterThan(4);
        expect(paint.overlays.every(Boolean), JSON.stringify({ level, paint })).toBe(true);
        const [first] = paint.overlays as Array<{ bottom: number; top: number }>;
        for (const rect of paint.overlays as Array<{ bottom: number; top: number }>) {
          expect(Math.abs(rect.top - first.top), JSON.stringify({ level, paint }))
            .toBeLessThanOrEqual(1);
          expect(Math.abs(rect.bottom - first.bottom), JSON.stringify({ level, paint }))
            .toBeLessThanOrEqual(1);
          expect(Math.abs((rect.bottom - rect.top) - paint.lineHeight), JSON.stringify({ level, paint }))
            .toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the marker visible while reselecting text in the same heading', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-reselect');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-reselect-e2e.md',
        content: ['# 123456', '', 'Body paragraph'].join('\n'),
      });

      const marker = page.locator(`${EDITOR_SELECTOR} h1 .heading-markdown-marker`);
      const select56 = await getHeadingSubstringDragPoints(page, '123456', 4, 6);
      await page.mouse.move(select56.start.x, select56.start.y);
      await page.mouse.down();
      await page.mouse.move(select56.end.x, select56.end.y, { steps: 8 });
      await page.mouse.up();
      await expect(marker).toHaveText('# ', { useInnerText: false });
      await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).display))
        .not.toBe('none');

      const select12 = await getHeadingSubstringDragPoints(page, '123456', 0, 2);
      await page.mouse.move(select12.start.x, select12.start.y);
      await page.mouse.down();
      await expect(page.locator(`${EDITOR_SELECTOR} >> xpath=..`))
        .toHaveClass(/heading-markdown-marker-pointer-retained/);
      await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).display))
        .not.toBe('none');

      await page.mouse.move(select12.end.x, select12.end.y, { steps: 8 });
      await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).display))
        .not.toBe('none');
      await page.mouse.up();

      await expect(marker).toHaveText('# ', { useInnerText: false });
      await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).display))
        .not.toBe('none');

      const selectAll = await getHeadingSubstringDragPoints(page, '123456', 0, 6);
      await page.mouse.move(selectAll.end.x, selectAll.end.y);
      await page.mouse.down();
      await page.mouse.move(selectAll.start.x, selectAll.start.y, { steps: 8 });
      const draggingFullHeading = await marker.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundImage: style.backgroundImage,
          className: element.className,
          editorSelection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        };
      });
      expect(draggingFullHeading.editorSelection.selectedText, JSON.stringify(draggingFullHeading))
        .toBe('123456');
      expect(draggingFullHeading.className, JSON.stringify(draggingFullHeading))
        .toContain('editor-text-selection-overlay');
      expect(draggingFullHeading.backgroundImage).not.toBe('none');
      await page.mouse.up();
      await expect.poll(() => page.evaluate(
        () => (window as any).__vlainaE2E.getEditorSelectionSummary().selectedText,
      )).toBe('123456');

      const fromThree = await getHeadingSubstringDragPoints(page, '123456', 2, 3);
      const throughOne = await getHeadingSubstringDragPoints(page, '123456', 0, 1);
      const markerPoint = await getHeadingMarkerDragPoint(page, '123456');
      await page.mouse.move(fromThree.start.x, fromThree.start.y);
      await page.mouse.down();
      await page.mouse.move(throughOne.start.x - 2, throughOne.start.y, { steps: 6 });
      const beforeMarker = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        usesNativeSelection: editor.classList.contains('editor-pointer-native-selection'),
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      }));
      expect(beforeMarker.selection.empty, JSON.stringify({
        beforeMarker,
        fromThree,
        markerPoint,
        throughOne,
      })).toBe(false);
      await page.mouse.move(markerPoint.x, markerPoint.y, { steps: 6 });

      const draggingPastStart = await marker.evaluate((element) => {
        const heading = element.closest('h1')!;
        const textOverlay = Array.from(
          heading.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
        ).find((candidate) => candidate !== element);
        const markerRect = element.getBoundingClientRect();
        const textRect = textOverlay?.getBoundingClientRect();
        return {
          markerBackgroundImage: getComputedStyle(element).backgroundImage,
          markerBottom: markerRect.bottom,
          markerTop: markerRect.top,
          overlayCount: heading.querySelectorAll('.editor-text-selection-overlay').length,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
          textBottom: textRect?.bottom ?? null,
          textTop: textRect?.top ?? null,
          usesNativeSelection: heading.closest('.ProseMirror')
            ?.classList.contains('editor-pointer-native-selection') ?? false,
        };
      });
      expect(draggingPastStart.selection.selectedText, JSON.stringify(draggingPastStart)).toBe('12');
      expect(draggingPastStart.markerBackgroundImage).not.toBe('none');
      expect(draggingPastStart.overlayCount).toBeGreaterThan(1);
      expect(draggingPastStart.usesNativeSelection).toBe(false);
      expect(draggingPastStart.textTop).not.toBeNull();
      expect(Math.abs(draggingPastStart.markerTop - draggingPastStart.textTop!))
        .toBeLessThanOrEqual(0.5);
      expect(Math.abs(draggingPastStart.markerBottom - draggingPastStart.textBottom!))
        .toBeLessThanOrEqual(0.5);
      await page.mouse.up();
      const afterMarkerMouseUp = await marker.evaluate((element) => {
        const heading = element.closest('h1')!;
        const textOverlay = Array.from(
          heading.querySelectorAll<HTMLElement>('.editor-text-selection-overlay'),
        ).find((candidate) => candidate !== element);
        const markerRect = element.getBoundingClientRect();
        const textRect = textOverlay?.getBoundingClientRect();
        return {
          markerBottom: markerRect.bottom,
          markerTop: markerRect.top,
          selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
          textBottom: textRect?.bottom ?? null,
          textTop: textRect?.top ?? null,
        };
      });
      expect(afterMarkerMouseUp.selection.selectedText).toBe('12');
      expect(afterMarkerMouseUp.textTop).not.toBeNull();
      expect(Math.abs(afterMarkerMouseUp.markerTop - draggingPastStart.markerTop))
        .toBeLessThanOrEqual(0.5);
      expect(Math.abs(afterMarkerMouseUp.markerBottom - draggingPastStart.markerBottom))
        .toBeLessThanOrEqual(0.5);
      expect(Math.abs(afterMarkerMouseUp.markerTop - afterMarkerMouseUp.textTop!))
        .toBeLessThanOrEqual(0.5);
      expect(Math.abs(afterMarkerMouseUp.markerBottom - afterMarkerMouseUp.textBottom!))
        .toBeLessThanOrEqual(0.5);

      const fromMarker = await getHeadingMarkerDragPoint(page, '123456');
      const throughThree = await getHeadingSubstringDragPoints(page, '123456', 2, 3);
      await page.mouse.move(fromMarker.x, fromMarker.y);
      await page.mouse.down();
      await page.mouse.move(throughThree.end.x, throughThree.end.y, { steps: 8 });
      const draggingFromMarker = await marker.evaluate((element) => ({
        markerBackgroundImage: getComputedStyle(element).backgroundImage,
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        usesNativeSelection: element.closest('.ProseMirror')
          ?.classList.contains('editor-pointer-native-selection') ?? false,
      }));
      expect(draggingFromMarker.selection.selectedText, JSON.stringify(draggingFromMarker))
        .toBe('123');
      expect(draggingFromMarker.markerBackgroundImage).not.toBe('none');
      expect(draggingFromMarker.usesNativeSelection).toBe(false);
      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the caret and continued input on the heading line after typing a marker', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-heading-marker-input');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'heading-marker-input-e2e.md',
        content: 'Body paragraph',
      });

      const body = page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Body paragraph' });
      await body.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('#');
      await expect(page.locator(`${EDITOR_SELECTOR} p`).last()).toHaveText('#');

      await page.keyboard.type(' ');
      const heading = page.locator(`${EDITOR_SELECTOR} h1`).last();
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('#');
      const emptyHeadingDom = await heading.evaluate((element) => ({
        breakDisplay: getComputedStyle(
          element.querySelector('br.ProseMirror-trailingBreak')!,
        ).display,
        html: element.innerHTML,
      }));
      expect(emptyHeadingDom.breakDisplay, emptyHeadingDom.html).toBe('none');
      await expect(page.locator('.editor-textblock-caret-overlay')).toHaveCount(1);
      const emptyHeadingCaret = await heading.evaluate((element) => {
        const selection = window.getSelection();
        const marker = element.querySelector<HTMLElement>('.heading-markdown-marker-empty');
        const markerRect = marker?.getBoundingClientRect();
        const caret = document.querySelector<HTMLElement>('.editor-textblock-caret-overlay');
        const caretRect = caret?.getBoundingClientRect();
        const headingRect = element.getBoundingClientRect();
        return {
          anchorInsideHeading: selection?.anchorNode
            ? element.contains(selection.anchorNode)
            : false,
          caretBottom: caretRect?.bottom ?? null,
          caretLeft: caretRect?.left ?? null,
          caretTop: caretRect?.top ?? null,
          headingBottom: headingRect.bottom,
          headingTop: headingRect.top,
          html: element.innerHTML,
          markerBottom: markerRect?.bottom ?? null,
          markerRight: markerRect?.right ?? null,
          markerTop: markerRect?.top ?? null,
        };
      });
      expect(emptyHeadingCaret.anchorInsideHeading, emptyHeadingCaret.html).toBe(true);
      expect(emptyHeadingCaret.caretTop).not.toBeNull();
      expect(emptyHeadingCaret.markerTop).not.toBeNull();
      const caretCenter = (emptyHeadingCaret.caretTop! + emptyHeadingCaret.caretBottom!) / 2;
      const markerCenter = (emptyHeadingCaret.markerTop! + emptyHeadingCaret.markerBottom!) / 2;
      expect(Math.abs(caretCenter - markerCenter))
        .toBeLessThanOrEqual(1);
      expect(Math.abs(emptyHeadingCaret.caretLeft! - emptyHeadingCaret.markerRight!))
        .toBeLessThanOrEqual(1);
      expect(emptyHeadingCaret.headingTop).toBeLessThanOrEqual(emptyHeadingCaret.caretTop! + 0.5);
      expect(emptyHeadingCaret.headingBottom).toBeGreaterThanOrEqual(emptyHeadingCaret.caretBottom! - 0.5);

      await page.keyboard.type('123456');
      await expect(heading).toHaveText('# 123456', { useInnerText: false });
      await expect(heading).toContainText('123456');
      const finalSelectionInsideHeading = await heading.evaluate((element) => {
        const selection = window.getSelection();
        return Boolean(selection?.anchorNode && element.contains(selection.anchorNode));
      });
      expect(finalSelectionInsideHeading).toBe(true);

      for (let index = 0; index < 6; index += 1) await page.keyboard.press('Backspace');
      await expect(heading.locator('.heading-markdown-marker-empty')).toHaveText('#');
      await expect(page.locator('.editor-textblock-caret-overlay')).toHaveCount(1);

      await page.keyboard.press('Backspace');
      await expect(page.locator(`${EDITOR_SELECTOR} h1`)).toHaveCount(0);
      await expect(page.locator(`${EDITOR_SELECTOR} p`).last()).toBeEmpty();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
