import { expect, test, type Locator } from '@playwright/test';
import { SIDEBAR_MIN_WIDTH } from '../../src/lib/layout/sidebarWidth';
import {
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openNotesRootInNotes,
} from './notesE2E';

async function sampleSidebarToggleMotion(toggle: Locator) {
  return toggle.evaluate(async (element) => {
    const layout = document.querySelector<HTMLElement>('[data-shell-sidebar-layout="true"]');
    const sidebar = document.querySelector<HTMLElement>('[data-shell-sidebar-width-scope="true"] aside');
    if (!layout || !sidebar) throw new Error('Sidebar motion elements are unavailable');

    let previousFrameTime = performance.now();
    const capture = () => {
      const cover = document.querySelector<HTMLElement>('[data-note-cover-region="true"]');
      const cropper = cover?.querySelector<HTMLElement>('[data-testid="cover-cropper"]') ?? null;
      const backdrop = cover?.querySelector<HTMLImageElement>('img[aria-hidden="true"]') ?? null;
      const now = performance.now();
      const sample = {
        layoutWidth: layout.getBoundingClientRect().width,
        sidebarLeft: sidebar.getBoundingClientRect().left,
        frameGap: now - previousFrameTime,
        coverHasVisibleImage: cover
          ? Array.from(cover.querySelectorAll('img')).some((image) =>
              Number.parseFloat(getComputedStyle(image).opacity) > 0
            )
          : null,
        coverBackdropVisible: Boolean(
          backdrop && Number.parseFloat(getComputedStyle(backdrop).opacity) > 0
        ),
        coverCropperHidden: Boolean(
          cropper && Number.parseFloat(getComputedStyle(cropper).opacity) === 0
        ),
      };
      previousFrameTime = now;
      return sample;
    };

    const samples = [capture()];
    (element as HTMLElement).click();

    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(capture());
    }

    return samples;
  });
}

test.describe('collapsed sidebar peek', () => {
  test('keeps the current sidebar and covered note smooth while collapsing and expanding', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('sidebar-manual-toggle-mounted');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1100, height: 760 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'sidebar-covered-toggle',
        files: [
          {
            filename: 'covered-toggle.md',
            content: [
              '---',
              'vlaina_cover: "./assets/cover.svg" x=38 y=62 height=240 scale=1.2',
              '---',
              '',
              '# Covered Toggle',
              '',
              'COVERED_TOGGLE_SENTINEL',
            ].join('\n'),
          },
          {
            filename: 'assets/cover.svg',
            content: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#2f6f59"/><rect x="900" width="700" height="900" fill="#d4b24c"/></svg>',
          },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Covered Toggle NotesRoot',
        minFileCount: 1,
      });
      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'covered-toggle' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('COVERED_TOGGLE_SENTINEL', {
        timeout: 30_000,
      });
      const cover = page.locator('[data-note-cover-region="true"]').first();
      await expect(cover.locator('img').first()).toBeVisible({ timeout: 30_000 });

      await expect(page.locator('.sidebar-user-header')).toBeVisible({ timeout: 30_000 });
      const sidebar = page.locator('[data-shell-sidebar-width-scope="true"] aside').first();
      await sidebar.evaluate((element) => {
        (element as HTMLElement & { __vlainaSidebarMountedMarker?: boolean }).__vlainaSidebarMountedMarker = true;
      });

      await page.locator('.sidebar-user-header').hover();
      const collapseSamples = await sampleSidebarToggleMotion(
        page.locator('.sidebar-user-header-collapse'),
      );

      await expect(sidebar).toHaveAttribute('data-shell-sidebar-peek', 'true');
      await expect(sidebar).toHaveAttribute('data-open', 'false');
      const expandedWidth = collapseSamples[0]!.layoutWidth;
      expect(new Set(collapseSamples.map(({ layoutWidth }) => Math.round(layoutWidth))).size).toBeLessThanOrEqual(2);
      expect(collapseSamples.some(({ sidebarLeft }) =>
        sidebarLeft < -1 && sidebarLeft > -expandedWidth + 1
      )).toBe(true);
      expect(collapseSamples.every(({ coverHasVisibleImage }) => coverHasVisibleImage)).toBe(true);
      expect(collapseSamples.some(({ coverBackdropVisible, coverCropperHidden }) =>
        coverBackdropVisible && coverCropperHidden
      )).toBe(true);
      expect(Math.max(...collapseSamples.slice(1).map(({ frameGap }) => frameGap))).toBeLessThan(100);
      await expect.poll(() => cover.evaluate((element) => ({
        backdrop: Boolean(element.querySelector('img[aria-hidden="true"]')),
        cropperOpacity: Number.parseFloat(getComputedStyle(
          element.querySelector<HTMLElement>('[data-testid="cover-cropper"]')!
        ).opacity),
      }))).toEqual({ backdrop: false, cropperOpacity: 1 });
      await expect.poll(() => sidebar.evaluate((element) =>
        Boolean((element as HTMLElement & { __vlainaSidebarMountedMarker?: boolean }).__vlainaSidebarMountedMarker)
      )).toBe(true);
      await expect.poll(() => page.evaluate(() => {
        const activeElement = document.activeElement;
        return Boolean(activeElement?.closest('[data-shell-sidebar-peek="true"]'));
      })).toBe(false);

      const expandSamples = await sampleSidebarToggleMotion(
        page.getByRole('button', { name: /Toggle sidebar|切换侧边栏/i }),
      );

      await expect(sidebar).not.toHaveAttribute('data-shell-sidebar-peek', 'true');
      expect(new Set(expandSamples.map(({ layoutWidth }) => Math.round(layoutWidth))).size).toBeLessThanOrEqual(2);
      expect(expandSamples.some(({ sidebarLeft }) =>
        sidebarLeft < -1 && sidebarLeft > -expandedWidth + 1
      )).toBe(true);
      expect(expandSamples.every(({ coverHasVisibleImage }) => coverHasVisibleImage)).toBe(true);
      expect(expandSamples.some(({ coverBackdropVisible, coverCropperHidden }) =>
        coverBackdropVisible && coverCropperHidden
      )).toBe(true);
      expect(Math.max(...expandSamples.slice(1).map(({ frameGap }) => frameGap))).toBeLessThan(100);
      await expect.poll(() => cover.evaluate((element) => ({
        backdrop: Boolean(element.querySelector('img[aria-hidden="true"]')),
        cropperOpacity: Number.parseFloat(getComputedStyle(
          element.querySelector<HTMLElement>('[data-testid="cover-cropper"]')!
        ).opacity),
      }))).toEqual({ backdrop: false, cropperOpacity: 1 });
      await expect.poll(() => sidebar.evaluate((element) =>
        Boolean((element as HTMLElement & { __vlainaSidebarMountedMarker?: boolean }).__vlainaSidebarMountedMarker)
      )).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the expanded sidebar capsule intact at minimum resized width', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('sidebar-min-width-capsule');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1100, height: 760 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'sidebar-min-width-capsule',
        files: [
          {
            filename: 'minimum-width.md',
            content: '# Minimum Width\n\nMINIMUM_WIDTH_SENTINEL',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Minimum Width NotesRoot',
        minFileCount: 1,
      });

      const resizeHandle = page.locator('[data-resize-handle="shell-sidebar"]').first();
      const handleBox = await resizeHandle.boundingBox();
      expect(handleBox).not.toBeNull();
      const startX = handleBox!.x + handleBox!.width / 2;
      const startY = handleBox!.y + handleBox!.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 160, startY, { steps: 8 });
      await page.mouse.up();

      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>('[data-shell-sidebar-width-scope="true"] aside');
        const capsule = sidebar?.querySelector<HTMLElement>(
          '[aria-hidden="false"] [data-sidebar-capsule-panel="true"]',
        ) ?? null;
        const tablist = capsule?.querySelector<HTMLElement>('[role="tablist"]') ?? null;
        if (!sidebar || !capsule || !tablist) return null;

        const sidebarRect = sidebar.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const tablistRect = tablist.getBoundingClientRect();
        const capsuleStyle = getComputedStyle(capsule);
        return {
          sidebarWidth: sidebarRect.width,
          capsuleLeft: capsuleRect.left,
          capsuleRight: capsuleRect.right,
          sidebarLeft: sidebarRect.left,
          sidebarRight: sidebarRect.right,
          tablistLeft: tablistRect.left,
          tablistRight: tablistRect.right,
          capsuleBorderRadius: Number.parseFloat(capsuleStyle.borderTopLeftRadius),
          capsuleOverflow: capsuleStyle.overflow,
        };
      });
      expect(metrics).not.toBeNull();
      expect(metrics!.sidebarWidth).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH - 1);
      expect(metrics!.sidebarWidth).toBeLessThanOrEqual(SIDEBAR_MIN_WIDTH + 1);
      expect(metrics!.capsuleBorderRadius).toBeGreaterThan(12);
      expect(metrics!.capsuleOverflow).toBe('hidden');
      expect(metrics!.capsuleLeft).toBeGreaterThanOrEqual(metrics!.sidebarLeft + 7);
      expect(metrics!.capsuleRight).toBeLessThanOrEqual(metrics!.sidebarRight - 7);
      expect(metrics!.tablistLeft).toBeGreaterThanOrEqual(metrics!.capsuleLeft);
      expect(metrics!.tablistRight).toBeLessThanOrEqual(metrics!.capsuleRight);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('opens the current sidebar from the left edge and allows note selection', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('sidebar-peek-collapsed');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1100, height: 760 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'sidebar-peek',
        files: [
          {
            filename: 'peek-alpha.md',
            content: '# Peek Alpha\n\nPEEK_ALPHA_SENTINEL',
          },
          {
            filename: 'peek-beta.md',
            content: '# Peek Beta\n\nPEEK_BETA_SENTINEL',
          },
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Sidebar Peek NotesRoot',
        minFileCount: 2,
      });
      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'peek-alpha' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('PEEK_ALPHA_SENTINEL', {
        timeout: 30_000,
      });

      await page.locator('.sidebar-user-header').hover();
      await page.locator('.sidebar-user-header-collapse').click();

      const peekSidebar = page.locator('[data-shell-sidebar-peek="true"]');
      await expect(peekSidebar).toHaveAttribute('data-open', 'false');
      await expect(peekSidebar).toHaveAttribute('aria-hidden', 'true');

      await page.mouse.move(2, 120);
      await expect(peekSidebar).toHaveAttribute('data-open', 'true');
      await expect(peekSidebar).toHaveAttribute('aria-hidden', 'false');
      const peekCapsule = page
        .locator(
          '[data-shell-sidebar-peek="true"] [aria-hidden="false"] [data-sidebar-capsule-panel="true"]',
        )
        .first();
      const peekSurface = page
        .locator(
          '[data-shell-sidebar-peek="true"] [aria-hidden="false"] [data-sidebar-surface="true"]',
        )
        .first();
      await expect(peekSurface).toBeVisible();
      await expect(peekCapsule).toBeVisible();
      const peekStyle = await peekSidebar.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        };
      });
      expect(peekStyle).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        boxShadow: 'none',
      });
      await expect(peekSurface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const capsuleStyle = await peekCapsule.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderRadius: Number.parseFloat(style.borderTopLeftRadius),
          boxShadow: style.boxShadow,
        };
      });
      expect(capsuleStyle.borderRadius).toBeGreaterThan(12);
      expect(capsuleStyle.boxShadow).not.toBe('none');

      await page
        .locator('[data-shell-sidebar-peek="true"] [data-file-tree-kind="file"]', { hasText: 'peek-beta' })
        .first()
        .click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('PEEK_BETA_SENTINEL', {
        timeout: 30_000,
      });
      await expect(peekSidebar).toHaveAttribute('data-open', 'true');
      await expect(peekSidebar).toHaveAttribute('aria-hidden', 'false');

      await page.mouse.move(700, 120);
      await expect(peekSidebar).toHaveAttribute('data-open', 'false');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
