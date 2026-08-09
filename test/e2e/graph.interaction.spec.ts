import { expect, test, type Locator } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  GRAPH_VIEW_SELECTOR,
  launchIsolatedElectron,
  NOTES_VIEW_SELECTOR,
  openNotesRootInNotes,
  setAppViewMode,
} from './notesE2E';

function readGraphNodePosition(node: Locator) {
  return node.evaluate((element) => {
    const matrix = element.closest<SVGGElement>('[data-graph-node-position]')
      ?.transform.baseVal.consolidate()?.matrix;
    return { cx: matrix?.e ?? 0, cy: matrix?.f ?? 0 };
  });
}

test.describe('graph interactions', () => {
  test.setTimeout(120_000);

  test('opens the corresponding note with a single node click', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('graph-node-open');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'graph-node-open',
        files: [
          { filename: 'Open Me.md', content: '# Open Me\n\n[[Linked Note]]' },
          { filename: 'Linked Note.md', content: '# Linked Note\n\n[[Open Me]]' },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Graph Node Open',
      });
      await setAppViewMode(page, 'graph');

      const graphView = page.locator(GRAPH_VIEW_SELECTOR);
      const zoomPercentage = graphView.locator('[data-whiteboard-zoom-percentage="true"]');
      await expect(zoomPercentage).toBeVisible();
      const nodeTarget = graphView.locator('[data-graph-node-hit-target="Linked Note.md"]');
      await expect(nodeTarget).toBeVisible({ timeout: 30_000 });
      await nodeTarget.click();

      await expect(page.locator(NOTES_VIEW_SELECTOR)).toBeVisible();
      await expect.poll(() => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ))).toBe('Linked Note.md');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a large graph draggable with a stable screen hit target', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('graph-interaction');
    const pageErrors: string[] = [];

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 860 });
      const noteCount = 240;
      const linksPerNote = 16;
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'large-graph',
        files: Array.from({ length: noteCount }, (_, index) => {
          const title = `Graph Note ${String(index + 1).padStart(3, '0')}`;
          const linkedTitles = Array.from({ length: linksPerNote }, (_, offset) => (
            `Graph Note ${String((index + offset + 1) % noteCount + 1).padStart(3, '0')}`
          ));
          const propertyLinks = linkedTitles.slice(0, linksPerNote / 2);
          const bodyLinks = linkedTitles.slice(linksPerNote / 2);
          return {
            filename: `${title}.md`,
            content: `---\nrelated:\n${propertyLinks.map((linked) => (
              `  - "[[${linked}]]"`
            )).join('\n')}\n---\n\n# ${title}\n\n${bodyLinks.map((linked) => (
              `[${linked}](${encodeURIComponent(linked)}.md)`
            )).join('\n\n')}`,
          };
        }),
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Large Graph',
      });
      const graphView = page.locator(GRAPH_VIEW_SELECTOR);
      const nodes = graphView.locator('[data-graph-node-hit-target]');
      const renderedEdges = graphView.locator('[data-graph-edge-layer="base"]');
      await expect(graphView).toHaveAttribute('data-graph-active', 'false', { timeout: 30_000 });
      await expect(nodes).toHaveCount(0);
      const graphOpenedAt = Date.now();
      await setAppViewMode(page, 'graph');

      await expect(graphView).toHaveAttribute('data-graph-active', 'true');
      await expect(nodes).toHaveCount(noteCount, { timeout: 30_000 });
      await expect(renderedEdges).toHaveAttribute(
        'data-graph-edge-count',
        String(noteCount * linksPerNote),
      );
      const graphSidebar = page.locator('[data-graph-sidebar="true"]');
      const graphSearchInput = graphSidebar.getByRole('combobox');
      const graphModeSelector = graphSidebar.locator('[data-graph-mode-indicator="true"]').locator('..');
      await page.keyboard.press('Control+Shift+F');
      await expect(graphSearchInput).toBeFocused();
      const [searchInputBox, modeSelectorBox] = await Promise.all([
        graphSearchInput.boundingBox(),
        graphModeSelector.boundingBox(),
      ]);
      expect(searchInputBox).not.toBeNull();
      expect(modeSelectorBox).not.toBeNull();
      expect(searchInputBox!.y + searchInputBox!.height).toBeLessThan(modeSelectorBox!.y);
      await page.keyboard.press('Escape');
      await expect(graphSidebar.locator('[data-sidebar-search-drawer="true"]')).toHaveAttribute('data-state', 'closed');
      await expect(graphSearchInput).toBeHidden();
      await graphSidebar.locator('[data-sidebar-scroll-root="true"]').hover();
      await page.mouse.wheel(0, -80);
      await page.keyboard.press('Control+Shift+F');
      await expect(graphSearchInput).toBeFocused();
      await page.keyboard.press('Escape');
      const entryAnimation = await nodes.evaluateAll((elements) => {
        const delays = elements.map((element) => (
          Number.parseFloat(getComputedStyle(element.parentElement!).animationDelay) || 0
        ));
        const visibleNode = elements[0]?.parentElement?.querySelectorAll('circle')[1];
        const graphEntry = elements[0]?.closest('svg')?.querySelector('.vlaina-graph-enter');
        return {
          graphAnimationName: graphEntry ? getComputedStyle(graphEntry).animationName : '',
          maxDelay: Math.max(...delays),
          minDelay: Math.min(...delays),
          nodeAnimationName: getComputedStyle(elements[0]!.parentElement!).animationName,
          dotAnimationName: visibleNode ? getComputedStyle(visibleNode).animationName : '',
        };
      });
      expect(entryAnimation.graphAnimationName).toContain('vlaina-graph-enter');
      expect(entryAnimation.nodeAnimationName).toBe('none');
      expect(entryAnimation.dotAnimationName).toBe('none');
      expect(entryAnimation.minDelay).toBe(0);
      expect(entryAnimation.maxDelay).toBe(0);
      await expect(graphView.locator('[data-graph-top-controls="true"]')).toHaveCount(0);
      expect(Date.now() - graphOpenedAt).toBeLessThan(5_000);
      const edgeAppearance = await renderedEdges.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          opacity: Number(style.opacity),
          stroke: style.stroke,
          strokeOpacity: Number(style.strokeOpacity),
          pathLength: (element as SVGPathElement).getTotalLength(),
        };
      });
      expect(edgeAppearance.stroke).not.toBe('none');
      expect(edgeAppearance.opacity).toBeGreaterThan(0);
      expect(edgeAppearance.strokeOpacity).toBeGreaterThan(0);
      expect(edgeAppearance.strokeOpacity).toBeLessThan(0.8);
      expect(edgeAppearance.pathLength).toBeGreaterThan(0);
      const hoverTarget = graphView.locator(
        '[data-graph-node-hit-target="Graph Note 050.md"]',
      );
      const hoverNodeDot = hoverTarget.locator('..').locator('.vlaina-graph-node-dot');
      const hoverEdge = graphView.locator('[data-graph-edge-layer="active"]');
      await page.mouse.move(1, 1);
      await hoverTarget.hover();
      expect(await hoverTarget.evaluate((element) => (
        element.parentElement?.querySelectorAll('circle')[1]
          ?.getAttribute('class')
          ?.includes('fill-[var(--vlaina-color-graph-node-active)]')
        ?? false
      ))).toBe(true);
      await expect(hoverEdge).toHaveAttribute('opacity', '1');
      expect(await hoverEdge.getAttribute('d')).not.toBe('');
      const graphBox = await graphView.boundingBox();
      expect(graphBox).not.toBeNull();
      const nodeCenters = await nodes.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }));
      expect(nodeCenters.every((center) => (
        center.x >= graphBox!.x
        && center.x <= graphBox!.x + graphBox!.width
        && center.y >= graphBox!.y
        && center.y <= graphBox!.y + graphBox!.height
      ))).toBe(true);
      await expect.poll(() => graphView.locator('svg text').count(), {
        timeout: 10_000,
      }).toBeGreaterThan(0);
      const zoomResult = await graphView.locator('svg[role="group"]').evaluate(async (element) => {
        const scene = element.querySelector(':scope > g');
        const before = scene?.getAttribute('transform');
        const startedAt = performance.now();
        for (let index = 0; index < 80; index += 1) {
          element.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: 640,
            clientY: 430,
            deltaY: -12,
          }));
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => (
          requestAnimationFrame(() => resolve())
        )));
        const after = scene?.getAttribute('transform');
        const visibleLabelCount = element.querySelectorAll('text').length;
        for (let index = 0; index < 80; index += 1) {
          element.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: 640,
            clientY: 430,
            deltaY: 12,
          }));
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => (
          requestAnimationFrame(() => resolve())
        )));
        return {
          after,
          before,
          elapsedMs: performance.now() - startedAt,
          visibleLabelCount,
        };
      });
      expect(zoomResult.after).not.toBe(zoomResult.before);
      expect(zoomResult.elapsedMs).toBeLessThan(1_000);
      expect(zoomResult.visibleLabelCount).toBeGreaterThan(0);
      const target = nodes.first();
      const linkedTarget = graphView.locator(
        '[data-graph-node-hit-target="Graph Note 002.md"]',
      );
      const distantTarget = graphView.locator(
        '[data-graph-node-hit-target="Graph Note 120.md"]',
      );
      const before = await readGraphNodePosition(target);
      const linkedBefore = await readGraphNodePosition(linkedTarget);
      await page.waitForTimeout(200);
      expect(await readGraphNodePosition(linkedTarget)).toEqual(linkedBefore);
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(28);
      expect(box!.height).toBeGreaterThanOrEqual(28);

      const linkedTrajectoryPromise = linkedTarget.evaluate((element) => new Promise<Array<{
        x: number;
        y: number;
      }>>((resolve) => {
        const samples: Array<{ x: number; y: number }> = [];
        const startedAt = performance.now();
        const readPosition = () => {
          const matrix = element.closest<SVGGElement>('[data-graph-node-position]')
            ?.transform.baseVal.consolidate()?.matrix;
          return { x: matrix?.e ?? 0, y: matrix?.f ?? 0 };
        };
        const sample = () => {
          samples.push(readPosition());
          if (performance.now() - startedAt < 1_200) {
            requestAnimationFrame(sample);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(sample);
      }));
      const draggedTrajectoryPromise = target.evaluate((element) => new Promise<Array<{
        x: number;
        y: number;
      }>>((resolve) => {
        const samples: Array<{ x: number; y: number }> = [];
        const startedAt = performance.now();
        const readPosition = () => {
          const matrix = element.closest<SVGGElement>('[data-graph-node-position]')
            ?.transform.baseVal.consolidate()?.matrix;
          return { x: matrix?.e ?? 0, y: matrix?.f ?? 0 };
        };
        const sample = () => {
          samples.push(readPosition());
          if (performance.now() - startedAt < 1_200) {
            requestAnimationFrame(sample);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(sample);
      }));
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2 + 50, { steps: 12 });
      expect(await target.evaluate((element) => (
        element.parentElement?.querySelectorAll('circle')[1]
          ?.getAttribute('class')
          ?.includes('fill-[var(--vlaina-color-graph-node-active)]')
        ?? false
      ))).toBe(true);
      await expect(hoverEdge).toHaveAttribute('opacity', '1');
      expect(await hoverEdge.getAttribute('d')).not.toBe('');
      const linkedPositionBeforeRelease = await readGraphNodePosition(linkedTarget);
      await page.mouse.up();

      await expect.poll(() => readGraphNodePosition(target)).not.toEqual(before);
      const linkedPositionAtRelease = await readGraphNodePosition(linkedTarget);
      const linkedDisplacementBeforeRelease = Math.hypot(
        linkedPositionBeforeRelease.cx - linkedBefore.cx,
        linkedPositionBeforeRelease.cy - linkedBefore.cy,
      );
      const retainedLinkedDisplacement = Math.hypot(
        linkedPositionAtRelease.cx - linkedBefore.cx,
        linkedPositionAtRelease.cy - linkedBefore.cy,
      );
      expect(retainedLinkedDisplacement).toBeGreaterThan(linkedDisplacementBeforeRelease * 0.75);
      await expect.poll(() => readGraphNodePosition(linkedTarget)).not.toEqual(linkedPositionAtRelease);
      const droppedPosition = await readGraphNodePosition(target);
      await page.waitForTimeout(100);
      const distantPositionAfterRelease = await readGraphNodePosition(distantTarget);
      await page.waitForTimeout(300);
      expect(await readGraphNodePosition(target)).toEqual(droppedPosition);
      expect(await readGraphNodePosition(distantTarget)).toEqual(distantPositionAfterRelease);
      await expect.poll(() => readGraphNodePosition(linkedTarget)).not.toEqual(linkedBefore);
      const linkedTrajectory = await linkedTrajectoryPromise;
      const draggedTrajectory = await draggedTrajectoryPromise;
      const settledLinkedPosition = await readGraphNodePosition(linkedTarget);
      await page.waitForTimeout(300);
      expect(await readGraphNodePosition(linkedTarget)).toEqual(settledLinkedPosition);
      const linkedDisplacementAtRelease = Math.hypot(
        linkedPositionAtRelease.cx - linkedBefore.cx,
        linkedPositionAtRelease.cy - linkedBefore.cy,
      );
      const linkedTravelAfterRelease = Math.hypot(
        settledLinkedPosition.cx - linkedPositionAtRelease.cx,
        settledLinkedPosition.cy - linkedPositionAtRelease.cy,
      );
      expect(linkedTravelAfterRelease).toBeLessThan(16);
      expect(linkedTravelAfterRelease).toBeLessThan(linkedDisplacementAtRelease * 0.35);
      const distinctLinkedPositions = new Set(linkedTrajectory.map((position) => (
        `${position.x.toFixed(1)},${position.y.toFixed(1)}`
      )));
      const largestLinkedStep = linkedTrajectory.slice(1).reduce((largest, position, index) => (
        Math.max(largest, Math.hypot(
          position.x - linkedTrajectory[index]!.x,
          position.y - linkedTrajectory[index]!.y,
        ))
      ), 0);
      const largestDraggedStep = draggedTrajectory.slice(1).reduce((largest, position, index) => (
        Math.max(largest, Math.hypot(
          position.x - draggedTrajectory[index]!.x,
          position.y - draggedTrajectory[index]!.y,
        ))
      ), 0);
      expect(distinctLinkedPositions.size).toBeGreaterThan(4);
      expect(largestLinkedStep).toBeLessThan(40);
      expect(largestDraggedStep).toBeLessThan(40);
      const labelRects = await graphView.locator('svg text').evaluateAll((elements) => (
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
        })
      ));
      const labelOverlapCount = labelRects.reduce((count, rect, index) => count + labelRects
        .slice(index + 1)
        .filter((other) => (
          rect.left < other.right
          && rect.right > other.left
          && rect.top < other.bottom
          && rect.bottom > other.top
        )).length, 0);
      expect(labelRects.length).toBeLessThanOrEqual(noteCount);
      expect(labelOverlapCount).toBe(0);
      expect(pageErrors.filter((message) => message.includes('Maximum update depth'))).toEqual([]);
      const graphDiagnosticEvents = await page.evaluate(() => (
        window.__vlainaDiagnosticsLog
          ?.filter((entry) => entry.channel === 'graph')
          .map((entry) => entry.event)
        ?? []
      ));
      expect(graphDiagnosticEvents).toEqual(expect.arrayContaining([
        'pointer-drag-start',
        'pointer-drag-release',
        'force-release',
        'force-settled',
      ]));
      await hoverTarget.click();
      await expect(graphView).not.toBeVisible();
      await expect(page.locator(NOTES_VIEW_SELECTOR)).toBeVisible();
      await expect.poll(() => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ))).toBe('Graph Note 050.md');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
