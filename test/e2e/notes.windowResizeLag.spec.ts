import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  collectEditorDomMetrics,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const CONTENT_COMPENSATION_VARIABLE = '--vlaina-window-resize-content-compensation-x';
const RIGHT_COMPENSATION_VARIABLE = '--vlaina-window-resize-compensation-x';

type WindowResizeGeometry = {
  bodyCenter: number;
  contentCompensation: string;
  outlineRight: number;
  rightCompensation: string;
  titleCenter: number;
  toolbarRight: number;
};

type WindowResizeFrameSample = {
  at: number;
  contentHeight: number;
  contentWidth: number;
  innerWidth: number;
  outerWidth: number;
  rootRight: number;
  rootWidth: number;
  viewWidth?: number;
};

async function readWindowResizeGeometry(page: Awaited<ReturnType<typeof getOpenBridgePages>>[number]) {
  return page.evaluate(({ contentVariable, rightVariable }): WindowResizeGeometry | null => {
    const body = document.querySelector<HTMLElement>('[data-note-content-root="true"]');
    const outline = document.querySelector<HTMLElement>('[data-editor-outline-rail="true"]');
    const title = document.querySelector<HTMLElement>('[data-hero-icon-header="true"]');
    const toolbar = document.querySelector<HTMLElement>('[data-note-top-toolbar="true"]');
    if (!body || !outline || !title || !toolbar) return null;

    const bodyRect = body.getBoundingClientRect();
    const outlineRect = outline.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      bodyCenter: bodyRect.left + bodyRect.width / 2,
      contentCompensation: rootStyle.getPropertyValue(contentVariable).trim(),
      outlineRight: outlineRect.right,
      rightCompensation: rootStyle.getPropertyValue(rightVariable).trim(),
      titleCenter: titleRect.left + titleRect.width / 2,
      toolbarRight: toolbarRect.right,
    };
  }, {
    contentVariable: CONTENT_COMPENSATION_VARIABLE,
    rightVariable: RIGHT_COMPENSATION_VARIABLE,
  });
}

async function waitForAnimationFrames(
  page: Awaited<ReturnType<typeof getOpenBridgePages>>[number],
  count: number,
) {
  await page.evaluate(async (frameCount) => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, count);
}

async function startResizeFrameSampler(page: Awaited<ReturnType<typeof getOpenBridgePages>>[number]) {
  await page.evaluate(() => {
    const samples: WindowResizeFrameSample[] = [];
    let active = true;
    const sample = () => {
      if (!active) return;
      const root = document.querySelector<HTMLElement>('[data-app-shell-root="true"]');
      const rootRect = root?.getBoundingClientRect();
      samples.push({
        at: Date.now(),
        contentHeight: document.documentElement.clientHeight,
        contentWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
        outerWidth: window.outerWidth,
        rootRight: rootRect?.right ?? 0,
        rootWidth: rootRect?.width ?? 0,
      });
      window.requestAnimationFrame(sample);
    };
    (window as any).__vlainaResizeFrameSampler = {
      read: () => {
        active = false;
        return samples;
      },
    };
    window.requestAnimationFrame(sample);
  });
}

async function readResizeFrameSamples(
  page: Awaited<ReturnType<typeof getOpenBridgePages>>[number],
) {
  return page.evaluate(() => (
    (window as any).__vlainaResizeFrameSampler?.read?.() ?? []
  )) as Promise<WindowResizeFrameSample[]>;
}

test.describe('notes Windows resize lag compensation', () => {
  test('keeps block-rich notes responsive across repeated native resizes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-window-resize-large-note');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const content = [
        '# Resize performance fixture',
        '',
        ...Array.from({ length: 520 }, (_, index) => (
          `## Section ${index} with **mixed syntax** ${'resize content '.repeat(40)}`
        )),
      ].join('\n\n');
      expect(content.length).toBeGreaterThan(250_000);

      await openMarkdownFixture(page, {
        filename: 'window-resize-large-note.md',
        content,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect.poll(async () => (
        await collectEditorDomMetrics(page)
      ).virtualizedPlaceholderCount).toBeGreaterThan(200);

      await startResizeFrameSampler(page);
      const resizeWindow = await app.evaluate(async ({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        const widths = [
          ...Array.from({ length: 26 }, (_, index) => 900 + index * 20),
          ...Array.from({ length: 26 }, (_, index) => 1400 - index * 20),
        ];
        const startedAt = Date.now();

        for (const width of widths) {
          browserWindow?.setContentSize(width, 760);
          await new Promise<void>((resolve) => setTimeout(resolve, 16));
        }

        return { finishedAt: Date.now(), finalWidth: widths.at(-1)!, startedAt };
      });
      await page.waitForFunction(
        (contentWidth) => window.innerWidth === contentWidth,
        resizeWindow.finalWidth,
      );
      await waitForAnimationFrames(page, 3);

      const frameSamples = await readResizeFrameSamples(page);
      const activeSamples = frameSamples.filter((sample) => (
        sample.at >= resizeWindow.startedAt && sample.at <= resizeWindow.finishedAt + 200
      ));
      const frameGaps = activeSamples.slice(1).map((sample, index) => (
        sample.at - activeSamples[index].at
      ));
      expect(activeSamples.length).toBeGreaterThan(5);
      expect(Math.max(...frameGaps)).toBeLessThan(500);
      for (const sample of activeSamples) {
        expect(sample.contentWidth).toBe(sample.innerWidth);
        expect(sample.rootRight).toBeCloseTo(sample.innerWidth, 0);
        expect(sample.rootWidth).toBeCloseTo(sample.innerWidth, 0);
      }

      const geometry = await readWindowResizeGeometry(page);
      expect(geometry).not.toBeNull();
      expect(geometry!.toolbarRight).toBeCloseTo(resizeWindow.finalWidth - 12, 0);
      expect(geometry!.outlineRight).toBeCloseTo(resizeWindow.finalWidth - 12, 0);

    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('forwards actual maximize and restore bounds from Electron', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-window-native-bounds');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const baselineWidth = await app.evaluate(({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        browserWindow?.unmaximize();
        browserWindow?.setSize(1000, 760);
        return browserWindow?.getSize()[0] ?? 0;
      });

      if (process.platform === 'linux') {
        const repairedContentView = await app.evaluate(({ BrowserWindow }) => {
          const browserWindow = BrowserWindow.getAllWindows()[0];
          if (!browserWindow) return null;
          const currentViewBounds = browserWindow.contentView.getBounds();
          browserWindow.contentView.setBounds({
            ...currentViewBounds,
            width: currentViewBounds.width + 400,
          });
          const before = browserWindow.contentView.getBounds();
          browserWindow.emit('resize');
          return {
            after: browserWindow.contentView.getBounds(),
            before,
            expected: currentViewBounds,
          };
        });
        expect(repairedContentView).not.toBeNull();
        expect(repairedContentView!.before.width).toBeGreaterThan(
          repairedContentView!.expected.width,
        );
        expect(repairedContentView!.after).toEqual(repairedContentView!.expected);
      }

      await page.evaluate(() => {
        const observedWidths: number[] = [];
        const removeListener = (window as any).vlainaDesktop.window.onBoundsChanged(
          (bounds: { width: number }) => observedWidths.push(bounds.width),
        );
        (window as any).__vlainaE2ENativeBounds = { observedWidths, removeListener };
      });

      await startResizeFrameSampler(page);
      const nativeMaximizeSamples = await app.evaluate(async ({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        const samples: Array<WindowResizeFrameSample & { contentX: number; x: number }> = [];
        if (!browserWindow) return samples;

        await new Promise<void>((resolve) => {
          const startedAt = Date.now();
          const sample = () => {
            const bounds = browserWindow.getBounds();
            const contentBounds = browserWindow.getContentBounds();
            const viewBounds = browserWindow.contentView.getBounds();
            samples.push({
              at: Date.now(),
              contentHeight: contentBounds.height,
              contentWidth: contentBounds.width,
              innerWidth: 0,
              outerWidth: bounds.width,
              rootRight: 0,
              rootWidth: 0,
              viewWidth: viewBounds.width,
              contentX: contentBounds.x,
              x: bounds.x,
            });
            if (Date.now() - startedAt >= 1200) {
              resolve();
              return;
            }
            setTimeout(sample, 4);
          };

          browserWindow.maximize();
          sample();
        });
        return samples;
      });
      const rendererMaximizeSamples = await readResizeFrameSamples(page);
      expect(nativeMaximizeSamples.length).toBeGreaterThan(1);
      expect(rendererMaximizeSamples.length).toBeGreaterThan(1);
      expect(rendererMaximizeSamples.at(-1)?.contentWidth)
        .toBe(nativeMaximizeSamples.at(-1)?.contentWidth);
      expect(nativeMaximizeSamples.at(-1)?.viewWidth)
        .toBe(nativeMaximizeSamples.at(-1)?.contentWidth);
      expect(rendererMaximizeSamples.at(-1)?.rootRight)
        .toBeCloseTo(rendererMaximizeSamples.at(-1)?.innerWidth ?? 0, 0);

      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
      await expect.poll(() => app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false,
      )).toBe(true);
      await expect.poll(() => page.evaluate((width) => (
        (window as any).__vlainaE2ENativeBounds.observedWidths
          .some((observedWidth: number) => observedWidth > width)
      ), baselineWidth)).toBe(true);
      const maximizedWidth = await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize()[0] ?? 0,
      );
      const eventCountAfterMaximize = await page.evaluate(() => (
        (window as any).__vlainaE2ENativeBounds.observedWidths.length
      ));

      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.unmaximize());
      await expect.poll(() => app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? true,
      )).toBe(false);
      await expect.poll(() => page.evaluate(({ eventCount, width }) => (
        (window as any).__vlainaE2ENativeBounds.observedWidths
          .slice(eventCount)
          .some((observedWidth: number) => observedWidth < width)
      ), { eventCount: eventCountAfterMaximize, width: maximizedWidth })).toBe(true);
      await page.evaluate(() => {
        (window as any).__vlainaE2ENativeBounds.removeListener();
        delete (window as any).__vlainaE2ENativeBounds;
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('moves centered content and right-edge controls from the main-process width signal', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-window-resize-lag');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1000, height: 760 });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          get: () => 'Win32',
        });
      });
      await page.reload();

      await openMarkdownFixture(page, {
        filename: 'window-resize-lag.md',
        content: '# First heading\n\nBody resize sentinel.\n\n## Second heading\n\nMore body text.',
      });
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator('[data-editor-outline-rail="true"]')).toBeVisible();
      await waitForAnimationFrames(page, 2);

      const before = await readWindowResizeGeometry(page);
      expect(before).not.toBeNull();
      const baselineOuterWidth = await page.evaluate(() => window.outerWidth);

      const widthDelta = 400;
      await app.evaluate(({ BrowserWindow }, nativeOuterWidth) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('desktop:window:bounds-changed', {
          width: nativeOuterWidth,
        });
      }, baselineOuterWidth + widthDelta);
      await expect.poll(async () => (await readWindowResizeGeometry(page))?.rightCompensation)
        .toBe(`${widthDelta}px`);

      const duringNativeResize = await readWindowResizeGeometry(page);
      expect(duringNativeResize).not.toBeNull();
      expect(duringNativeResize!.rightCompensation).toBe(`${widthDelta}px`);
      expect(duringNativeResize!.contentCompensation).toBe(`${widthDelta / 2}px`);
      expect(duringNativeResize!.toolbarRight - before!.toolbarRight).toBeCloseTo(widthDelta, 0);
      expect(duringNativeResize!.outlineRight - before!.outlineRight).toBeCloseTo(widthDelta, 0);
      expect(duringNativeResize!.titleCenter - before!.titleCenter).toBeCloseTo(widthDelta / 2, 0);
      expect(duringNativeResize!.bodyCenter - before!.bodyCenter).toBeCloseTo(widthDelta / 2, 0);

      await app.evaluate(({ BrowserWindow }, nativeOuterWidth) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('desktop:window:bounds-changed', {
          width: nativeOuterWidth,
        });
      }, baselineOuterWidth);
      await expect.poll(async () => (await readWindowResizeGeometry(page))?.rightCompensation)
        .toBe('0px');

      const settled = await readWindowResizeGeometry(page);
      expect(settled).not.toBeNull();
      expect(settled!.rightCompensation).toBe('0px');
      expect(settled!.contentCompensation).toBe('0px');
      expect(settled!.toolbarRight).toBeCloseTo(before!.toolbarRight, 0);
      expect(settled!.outlineRight).toBeCloseTo(before!.outlineRight, 0);
      expect(settled!.titleCenter).toBeCloseTo(before!.titleCenter, 0);
      expect(settled!.bodyCenter).toBeCloseTo(before!.bodyCenter, 0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
