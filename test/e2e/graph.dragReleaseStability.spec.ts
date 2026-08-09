import { expect, test } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  GRAPH_VIEW_SELECTOR,
  launchIsolatedElectron,
  openNotesRootInNotes,
  setAppViewMode,
} from './notesE2E';

test.describe('graph drag release stability', () => {
  test.setTimeout(90_000);

  test('does not replay entry or retain background focus after releasing a node', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('graph-drag-release-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const noteCount = 48;
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'graph-drag-release-stability',
        files: Array.from({ length: noteCount }, (_, index) => {
          const title = `Release Note ${String(index + 1).padStart(2, '0')}`;
          const links = Array.from({ length: 4 }, (_, offset) => (
            `[[Release Note ${String((index + offset + 1) % noteCount + 1).padStart(2, '0')}]]`
          ));
          return { filename: `${title}.md`, content: `# ${title}\n\n${links.join('\n')}` };
        }),
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Graph Drag Release Stability',
      });
      await setAppViewMode(page, 'graph');

      const graphView = page.locator(GRAPH_VIEW_SELECTOR);
      const nodes = graphView.locator('[data-graph-node-hit-target]');
      await expect(graphView).toHaveAttribute('data-graph-active', 'true');
      await expect(nodes).toHaveCount(noteCount, { timeout: 30_000 });
      await page.waitForTimeout(2_500);

      const target = nodes.nth(8);
      const before = await target.boundingBox();
      expect(before).not.toBeNull();
      await target.hover();
      await expect(graphView.locator('[data-graph-edge-layer="active"]')).toHaveAttribute('opacity', '1');

      await graphView.evaluate((element) => {
        const audit = { entryAnimationStarts: 0 };
        (window as any).__graphDragReleaseAudit = audit;
        element.addEventListener('animationstart', (event) => {
          if ((event as AnimationEvent).animationName.includes('graph-enter')) {
            audit.entryAnimationStarts += 1;
          }
        });
      });

      const startX = before!.x + before!.width / 2;
      const startY = before!.y + before!.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 120, startY + 70, { steps: 16 });
      await page.mouse.up();

      const samples = await graphView.evaluate(async (element) => new Promise<Array<{
        activeEdgeOpacity: number;
        activeView: string | null;
        baseEdgeOpacity: number;
        dimmedNodeCount: number;
        nodeCount: number;
        sceneTransform: string | null;
      }>>((resolve) => {
        const frames: Array<{
          activeEdgeOpacity: number;
          activeView: string | null;
          baseEdgeOpacity: number;
          dimmedNodeCount: number;
          nodeCount: number;
          sceneTransform: string | null;
        }> = [];
        const sample = () => {
          const dots = [...element.querySelectorAll<SVGCircleElement>('.vlaina-graph-node-dot')];
          const baseEdge = element.querySelector<SVGPathElement>('[data-graph-edge-layer="base"]');
          const activeEdge = element.querySelector<SVGPathElement>('[data-graph-edge-layer="active"]');
          const scene = element.querySelector<SVGGElement>('svg[role="group"] > g');
          frames.push({
            activeEdgeOpacity: Number(activeEdge?.getAttribute('opacity') ?? 0),
            activeView: element.getAttribute('data-graph-active'),
            baseEdgeOpacity: Number(baseEdge?.getAttribute('stroke-opacity') ?? 0),
            dimmedNodeCount: dots.filter((dot) => Number(dot.style.opacity) < 0.5).length,
            nodeCount: dots.length,
            sceneTransform: scene?.getAttribute('transform') ?? null,
          });
          if (frames.length < 18) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }));

      expect(samples.every((sample) => sample.activeView === 'true')).toBe(true);
      expect(samples.every((sample) => sample.nodeCount === noteCount)).toBe(true);
      expect(samples.every((sample) => sample.activeEdgeOpacity === 0)).toBe(true);
      expect(samples.every((sample) => sample.baseEdgeOpacity > 0)).toBe(true);
      expect(new Set(samples.map((sample) => sample.baseEdgeOpacity)).size).toBe(1);
      expect(samples.every((sample) => sample.dimmedNodeCount === 0)).toBe(true);
      expect(new Set(samples.map((sample) => sample.sceneTransform)).size).toBe(1);
      expect(await page.evaluate(() => (window as any).__graphDragReleaseAudit.entryAnimationStarts)).toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('does not refit the viewport after an immediate first-load drag', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('graph-first-load-drag-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const noteCount = 72;
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'graph-first-load-drag-stability',
        files: Array.from({ length: noteCount }, (_, index) => {
          const title = `First Load Note ${String(index + 1).padStart(2, '0')}`;
          const links = Array.from({ length: 6 }, (_, offset) => (
            `[[First Load Note ${String((index + offset + 1) % noteCount + 1).padStart(2, '0')}]]`
          ));
          return { filename: `${title}.md`, content: `# ${title}\n\n${links.join('\n')}` };
        }),
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Graph First Load Drag Stability',
      });
      await setAppViewMode(page, 'graph');

      const graphView = page.locator(GRAPH_VIEW_SELECTOR);
      const nodes = graphView.locator('[data-graph-node-hit-target]');
      await expect(nodes).toHaveCount(noteCount, { timeout: 30_000 });
      const target = nodes.nth(12);
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;
      await page.mouse.move(startX, startY);
      await expect(graphView.locator('[data-graph-edge-layer="active"]')).toHaveAttribute('opacity', '1');
      const firstHoverEndpointGap = await graphView.evaluate((element) => {
        const nodePositions = [...element.querySelectorAll<SVGCircleElement>('[data-graph-node-hit-target]')]
          .map((node) => {
            const matrix = node.closest<SVGGElement>('[data-graph-node-position]')
              ?.transform.baseVal.consolidate()?.matrix;
            return { x: matrix?.e ?? 0, y: matrix?.f ?? 0 };
          });
        const path = element.querySelector<SVGPathElement>('[data-graph-edge-layer="active"]')
          ?.getAttribute('d') ?? '';
        const values = path.match(/[-+\d.e]+/giu)?.map(Number) ?? [];
        let largestGap = 0;
        for (let index = 0; index + 1 < values.length; index += 2) {
          const closest = nodePositions.reduce((distance, position) => Math.min(
            distance,
            Math.hypot(values[index]! - position.x, values[index + 1]! - position.y),
          ), Number.POSITIVE_INFINITY);
          largestGap = Math.max(largestGap, closest);
        }
        return largestGap;
      });
      expect(firstHoverEndpointGap).toBeLessThan(0.5);
      await page.mouse.down();
      await page.mouse.move(startX + 90, startY + 55, { steps: 10 });
      await page.mouse.up();

      const scene = graphView.locator('svg[role="group"] > g');
      const transformAtRelease = await scene.getAttribute('transform');
      const samples: Array<string | null> = [];
      for (let index = 0; index < 12; index += 1) {
        await page.waitForTimeout(200);
        samples.push(await scene.getAttribute('transform'));
      }

      expect(samples.every((transform) => transform === transformAtRelease)).toBe(true);
      await expect(graphView.locator('[data-graph-edge-layer="active"]')).toHaveAttribute('opacity', '0');
      expect(await graphView.locator('.vlaina-graph-node-dot').evaluateAll((dots) => (
        dots.filter((dot) => Number((dot as SVGCircleElement).style.opacity) < 0.5).length
      ))).toBe(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a dragged local-graph child attached to its active edge', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('graph-local-child-edge');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'graph-local-child-edge',
        files: [
          { filename: 'Child.md', content: '# Child\n\n[[Hub]]' },
          { filename: 'Hub.md', content: '# Hub\n\n[[Child]]\n[[Other]]' },
          { filename: 'Other.md', content: '# Other\n\n[[Hub]]' },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Graph Local Child Edge',
      });
      await setAppViewMode(page, 'graph');

      const graphView = page.locator(GRAPH_VIEW_SELECTOR);
      const allNodes = graphView.locator('[data-graph-node-hit-target]');
      await expect(allNodes).toHaveCount(3, { timeout: 30_000 });
      await page.waitForTimeout(1_500);
      const positionsBeforeLocal = await allNodes.evaluateAll((elements) => Object.fromEntries(
        elements.map((element) => {
          const matrix = element.closest<SVGGElement>('[data-graph-node-position]')
            ?.transform.baseVal.consolidate()?.matrix;
          return [element.getAttribute('data-graph-node-hit-target'), {
            x: matrix?.e ?? 0,
            y: matrix?.f ?? 0,
          }];
        }),
      ));
      const readFirstGraphFrame = () => graphView.evaluate(async (element) => (
        new Promise<{
          edgeLength: number;
          positions: Record<string, { x: number; y: number }>;
        }>((resolve) => {
          requestAnimationFrame(() => {
            const positions = Object.fromEntries(
              [...element.querySelectorAll<SVGCircleElement>('[data-graph-node-hit-target]')]
                .map((node) => {
                  const matrix = node.closest<SVGGElement>('[data-graph-node-position]')
                    ?.transform.baseVal.consolidate()?.matrix;
                  return [node.dataset.graphNodeHitTarget ?? '', {
                    x: matrix?.e ?? 0,
                    y: matrix?.f ?? 0,
                  }];
                }),
            );
            const edge = element.querySelector<SVGPathElement>('[data-graph-edge-layer="base"]');
            resolve({ edgeLength: edge?.getTotalLength() ?? 0, positions });
          });
        })
      ));
      const expectFrameToRetainPositions = (frame: Awaited<ReturnType<typeof readFirstGraphFrame>>) => {
        expect(frame.edgeLength).toBeGreaterThan(20);
        for (const [id, position] of Object.entries(frame.positions)) {
          const before = positionsBeforeLocal[id];
          expect(before).toBeDefined();
          expect(Math.hypot(position.x - before!.x, position.y - before!.y)).toBeLessThan(0.5);
        }
      };
      const modeButtons = page.locator('[data-graph-mode-indicator="true"]').locator('..').getByRole('button');
      await modeButtons.nth(1).click();
      const nodes = graphView.locator('[data-graph-node-hit-target]');
      await expect(nodes).toHaveCount(2, { timeout: 30_000 });
      expectFrameToRetainPositions(await readFirstGraphFrame());

      await modeButtons.nth(0).click();
      await expect(allNodes).toHaveCount(3, { timeout: 30_000 });
      expectFrameToRetainPositions(await readFirstGraphFrame());

      await modeButtons.nth(1).click();
      await expect(nodes).toHaveCount(2, { timeout: 30_000 });
      expectFrameToRetainPositions(await readFirstGraphFrame());

      const target = nodes.last();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;
      await page.mouse.move(startX, startY);
      await expect(graphView.locator('[data-graph-edge-layer="active"]')).toHaveAttribute('opacity', '1');
      const firstHoverEndpointGap = await target.evaluate((element) => {
        const nodePositions = [...element.closest('svg')!
          .querySelectorAll<SVGCircleElement>('[data-graph-node-hit-target]')]
          .map((node) => {
            const matrix = node.closest<SVGGElement>('[data-graph-node-position]')
              ?.transform.baseVal.consolidate()?.matrix;
            return { x: matrix?.e ?? 0, y: matrix?.f ?? 0 };
          });
        const path = element.closest('svg')
          ?.querySelector<SVGPathElement>('[data-graph-edge-layer="active"]')
          ?.getAttribute('d') ?? '';
        const values = path.match(/[-+\d.e]+/giu)?.map(Number) ?? [];
        let largestGap = 0;
        for (let index = 0; index + 1 < values.length; index += 2) {
          const closest = nodePositions.reduce((distance, position) => Math.min(
            distance,
            Math.hypot(values[index]! - position.x, values[index + 1]! - position.y),
          ), Number.POSITIVE_INFINITY);
          largestGap = Math.max(largestGap, closest);
        }
        return largestGap;
      });
      expect(firstHoverEndpointGap).toBeLessThan(0.5);
      await page.mouse.down();
      await page.mouse.move(startX + 100, startY + 60, { steps: 12 });

      await expect(graphView.locator('[data-graph-edge-layer="base"]')).toHaveAttribute('stroke-opacity', '0');
      await expect(graphView.locator('[data-graph-edge-layer="active"]')).toHaveAttribute('opacity', '1');
      const endpointGap = await target.evaluate((element) => {
        const nodeMatrix = element.closest<SVGGElement>('[data-graph-node-position]')
          ?.transform.baseVal.consolidate()?.matrix;
        const path = element.closest('svg')
          ?.querySelector<SVGPathElement>('[data-graph-edge-layer="active"]')
          ?.getAttribute('d') ?? '';
        const values = path.match(/[-+\d.e]+/giu)?.map(Number) ?? [];
        let closest = Number.POSITIVE_INFINITY;
        for (let index = 0; index + 1 < values.length; index += 2) {
          closest = Math.min(closest, Math.hypot(
            values[index]! - (nodeMatrix?.e ?? 0),
            values[index + 1]! - (nodeMatrix?.f ?? 0),
          ));
        }
        return closest;
      });
      expect(endpointGap).toBeLessThan(0.5);
      await page.mouse.up();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
