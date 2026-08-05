import { expect, test } from '@playwright/test';
import {
  buildMermaidFormatsMarkdown,
  MERMAID_FORMAT_FIXTURES,
} from '../../src/test/fixtures/mermaidFormatFixtures';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

test.describe('notes Mermaid format matrix', () => {
  test.setTimeout(180_000);

  test('renders common Mermaid diagram formats with visible SVG content', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-mermaid-format-matrix');

    try {
      await app.firstWindow({ timeout: 60_000 });
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1440, height: 960 });

      await openMarkdownFixture(page, {
        filename: 'mermaid-format-matrix.md',
        content: buildMermaidFormatsMarkdown(),
      });

      const blocks = page.locator(`${EDITOR_SELECTOR} [data-type="mermaid"]`);
      await expect(blocks).toHaveCount(MERMAID_FORMAT_FIXTURES.length, { timeout: 30_000 });

      const results = [];
      for (const [index, fixture] of MERMAID_FORMAT_FIXTURES.entries()) {
        const block = blocks.nth(index);
        await block.evaluate((element) => {
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
        });
        await expect(block).toBeVisible({ timeout: 30_000 });
        await expect(block).toBeInViewport({ ratio: 0.9, timeout: 30_000 });

        const readMetrics = () => block.evaluate((element) => {
          const svg = element.querySelector<SVGSVGElement>('svg');
          const error = element.querySelector<HTMLElement>('.mermaid-error');
          const empty = element.querySelector<HTMLElement>('.mermaid-empty');
          const placeholder = element.querySelector<HTMLElement>('.mermaid-placeholder');
          const blockRect = element.getBoundingClientRect();
          const svgRect = svg?.getBoundingClientRect();
          const visibleText = (svg?.textContent ?? '').replace(/\s+/g, ' ').trim();
          const tolerancePx = 2;
          const graphicSelector = [
            'text',
            'path',
            'line',
            'rect',
            'circle',
            'ellipse',
            'polygon',
            'polyline',
            'use',
            'foreignObject',
          ].join(',');
          const graphicBounds = svg
            ? Array.from(svg.querySelectorAll<SVGGraphicsElement>(graphicSelector))
              .map((graphic) => {
                const style = getComputedStyle(graphic);
                const rect = graphic.getBoundingClientRect();
                const nonRenderingContainer = graphic.closest('defs,clipPath,marker,mask,pattern,symbol');
                const clipPathContainer = graphic.closest('[clip-path]');
                if (
                  nonRenderingContainer ||
                  graphic.classList.contains('today') ||
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  Number(style.opacity) === 0 ||
                  (rect.width < 0.5 && rect.height < 0.5)
                ) {
                  return null;
                }

                const localLeft = rect.left - blockRect.left + element.scrollLeft;
                const localRight = rect.right - blockRect.left + element.scrollLeft;
                const localTop = rect.top - blockRect.top + element.scrollTop;
                const localBottom = rect.bottom - blockRect.top + element.scrollTop;
                return {
                  tagName: graphic.tagName,
                  className: graphic.getAttribute('class') ?? '',
                  id: graphic.getAttribute('id') ?? '',
                  parentTags: Array.from({ length: 4 }, (_value, ancestorIndex) => {
                    let parent = graphic.parentElement;
                    for (let index = 0; index < ancestorIndex; index += 1) {
                      parent = parent?.parentElement ?? null;
                    }
                    return parent?.tagName ?? '';
                  }).filter(Boolean),
                  clipPath: graphic.getAttribute('clip-path') ?? '',
                  text: (graphic.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
                  localLeft: Math.round(localLeft * 10) / 10,
                  localRight: Math.round(localRight * 10) / 10,
                  localTop: Math.round(localTop * 10) / 10,
                  localBottom: Math.round(localBottom * 10) / 10,
                  outsideBlockScrollArea:
                    !clipPathContainer &&
                    (
                      localLeft < -tolerancePx ||
                      localRight > element.scrollWidth + tolerancePx ||
                      localTop < -tolerancePx ||
                      localBottom > element.scrollHeight + tolerancePx
                    ),
                  outsideSvgViewport: svgRect
                    ? rect.left < svgRect.left - tolerancePx ||
                      rect.right > svgRect.right + tolerancePx ||
                      rect.top < svgRect.top - tolerancePx ||
                      rect.bottom > svgRect.bottom + tolerancePx
                    : false,
                };
              })
              .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            : [];
          const graphicsOutsideBlockScrollArea = graphicBounds.filter((entry) => entry.outsideBlockScrollArea);
          const graphicsOutsideSvgViewport = graphicBounds.filter((entry) => entry.outsideSvgViewport);
          const parseRgbColor = (value: string) => {
            const match = value.match(/rgba?\(([^)]+)\)/i);
            if (!match) return null;
            const parts = match[1]
              .split(',')
              .map((part) => Number.parseFloat(part.trim()));
            const [red, green, blue, alpha = 1] = parts;
            if (
              !Number.isFinite(red) ||
              !Number.isFinite(green) ||
              !Number.isFinite(blue) ||
              !Number.isFinite(alpha) ||
              alpha <= 0
            ) {
              return null;
            }
            return { red, green, blue };
          };
          const relativeLuminance = (color: { red: number; green: number; blue: number }) => {
            const toLinear = (channel: number) => {
              const value = channel / 255;
              return value <= 0.03928
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * toLinear(color.red) +
              0.7152 * toLinear(color.green) +
              0.0722 * toLinear(color.blue);
          };
          const contrastRatio = (
            foreground: { red: number; green: number; blue: number },
            background: { red: number; green: number; blue: number },
          ) => {
            const foregroundLuminance = relativeLuminance(foreground);
            const backgroundLuminance = relativeLuminance(background);
            const lighter = Math.max(foregroundLuminance, backgroundLuminance);
            const darker = Math.min(foregroundLuminance, backgroundLuminance);
            return (lighter + 0.05) / (darker + 0.05);
          };
          const blockBackground = parseRgbColor(getComputedStyle(element).backgroundColor) ?? {
            red: 255,
            green: 255,
            blue: 255,
          };
          const paintedBackgroundTags = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);
          const resolveTextBackground = (text: SVGTextElement, rect: DOMRect) => {
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const previousPointerEvents = text.style.pointerEvents;
            const previousVisibility = text.style.visibility;
            text.style.pointerEvents = 'none';
            text.style.visibility = 'hidden';
            const underlyingElements = document.elementsFromPoint(x, y);
            text.style.pointerEvents = previousPointerEvents;
            text.style.visibility = previousVisibility;

            for (const underlyingElement of underlyingElements) {
              if (
                !(underlyingElement instanceof Element) ||
                underlyingElement === text ||
                text.contains(underlyingElement)
              ) {
                continue;
              }

              let current: Element | null = underlyingElement;
              while (current && current !== svg && current !== element) {
                if (current === text || text.contains(current)) {
                  current = current.parentElement;
                  continue;
                }

                const currentStyle = getComputedStyle(current);
                const tagName = current.tagName.toLowerCase();
                const fill = paintedBackgroundTags.has(tagName) && currentStyle.fill !== 'none'
                  ? parseRgbColor(currentStyle.fill)
                  : null;
                if (fill) {
                  return fill;
                }
                const background = parseRgbColor(currentStyle.backgroundColor);
                if (background) {
                  return background;
                }
                current = current.parentElement;
              }
            }

            return blockBackground;
          };
          const visibleTextBounds = svg
            ? Array.from(svg.querySelectorAll<SVGTextElement>('text'))
              .map((text) => {
                const style = getComputedStyle(text);
                const rect = text.getBoundingClientRect();
                const content = (text.textContent ?? '').replace(/\s+/g, ' ').trim();
                if (
                  !content ||
                  text.closest('defs,clipPath,marker,mask,pattern,symbol') ||
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  Number(style.opacity) === 0 ||
                  rect.width < 0.5 ||
                  rect.height < 0.5
                ) {
                  return null;
                }

                const textPaintElement = Array.from(text.querySelectorAll<SVGElement>('tspan,textPath'))
                  .find((child) => {
                    const childRect = child.getBoundingClientRect();
                    const childStyle = getComputedStyle(child);
                    return childRect.width >= 0.5 &&
                      childRect.height >= 0.5 &&
                      childStyle.display !== 'none' &&
                      childStyle.visibility !== 'hidden' &&
                      Number(childStyle.opacity) !== 0;
                  }) ?? text;
                const paintStyle = getComputedStyle(textPaintElement);
                const foreground = parseRgbColor(paintStyle.fill) ??
                  parseRgbColor(paintStyle.color) ??
                  parseRgbColor(style.fill) ??
                  parseRgbColor(style.color);
                const background = resolveTextBackground(text, rect);
                const contrast = foreground
                  ? Math.round(contrastRatio(foreground, background) * 100) / 100
                  : null;
                return {
                  text: content.slice(0, 80),
                  className: text.getAttribute('class') ?? '',
                  parentTags: Array.from({ length: 4 }, (_value, ancestorIndex) => {
                    let parent = text.parentElement;
                    for (let index = 0; index < ancestorIndex; index += 1) {
                      parent = parent?.parentElement ?? null;
                    }
                    return parent
                      ? `${parent.tagName}${parent.getAttribute('class') ? `.${parent.getAttribute('class')}` : ''}`
                      : '';
                  }).filter(Boolean),
                  fontSize: Math.round((Number.parseFloat(style.fontSize) || 0) * 10) / 10,
                  height: Math.round(rect.height * 10) / 10,
                  width: Math.round(rect.width * 10) / 10,
                  contrastRatio: contrast,
                  fill: style.fill,
                  opacity: style.opacity,
                };
              })
              .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            : [];
          const tinyText = visibleTextBounds.filter((entry) =>
            entry.fontSize > 0 &&
            entry.fontSize < 9 &&
            entry.height < 9
          );
          const lowContrastText = visibleTextBounds.filter((entry) =>
            entry.contrastRatio !== null &&
            entry.contrastRatio < (entry.fontSize >= 18 ? 3 : 4.5)
          );
          return {
            blockHeight: Math.round(blockRect.height),
            blockScrollHeight: element.scrollHeight,
            blockScrollWidth: element.scrollWidth,
            blockWidth: Math.round(blockRect.width),
            diagramType: element.dataset.mermaidDiagram ?? null,
            emptyText: empty?.textContent?.trim() ?? '',
            errorText: error?.textContent?.trim() ?? '',
            graphicsOutsideBlockScrollArea: graphicsOutsideBlockScrollArea.slice(0, 10),
            graphicsOutsideBlockScrollAreaCount: graphicsOutsideBlockScrollArea.length,
            graphicsOutsideSvgViewportCount: graphicsOutsideSvgViewport.length,
            hasPlaceholder: Boolean(placeholder),
            hasSvg: Boolean(svg),
            lowContrastText: lowContrastText.slice(0, 10),
            lowContrastTextCount: lowContrastText.length,
            shapeCount: svg?.querySelectorAll('path,line,rect,circle,ellipse,polygon,polyline,use,foreignObject').length ?? 0,
            svgHeight: svgRect ? Math.round(svgRect.height) : 0,
            svgOverflow: svg ? getComputedStyle(svg).overflow : '',
            svgWidth: svgRect ? Math.round(svgRect.width) : 0,
            textMinFontSize: visibleTextBounds.length > 0
              ? Math.min(...visibleTextBounds.map((entry) => entry.fontSize))
              : 0,
            textMinHeight: visibleTextBounds.length > 0
              ? Math.min(...visibleTextBounds.map((entry) => entry.height))
              : 0,
            tinyText: tinyText.slice(0, 10),
            tinyTextCount: tinyText.length,
            visibleTextElementCount: visibleTextBounds.length,
            textLength: visibleText.length,
          };
        });
        await expect.poll(async () => {
          const metrics = await readMetrics();
          if (metrics.hasSvg) return 'svg';
          if (metrics.errorText) return 'error';
          if (metrics.emptyText) return 'empty';
          if (metrics.hasPlaceholder) return 'pending';
          return 'blank';
        }, {
          message: `${fixture.label} should finish Mermaid rendering`,
          timeout: 30_000,
        }).not.toBe('pending');
        const metrics = await readMetrics();
        results.push({ label: fixture.label, ...metrics });

        expect(metrics.hasSvg, `${fixture.label} should render an SVG: ${JSON.stringify(metrics)}`).toBe(true);
        expect(metrics.errorText, `${fixture.label} rendered an error`).toBe('');
        expect(metrics.svgWidth, `${fixture.label} svg width`).toBeGreaterThanOrEqual(fixture.minWidth ?? 80);
        expect(metrics.svgHeight, `${fixture.label} svg height`).toBeGreaterThanOrEqual(fixture.minHeight ?? 32);
        expect(
          metrics.textLength + metrics.shapeCount,
          `${fixture.label} should contain visible SVG content`
        ).toBeGreaterThan(0);
        expect(
          metrics.svgOverflow,
          `${fixture.label} Mermaid SVG should not clip content: ${JSON.stringify(metrics)}`
        ).toBe('visible');
        expect(
          metrics.graphicsOutsideBlockScrollArea,
          `${fixture.label} SVG content should stay inside the Mermaid block scroll area: ${JSON.stringify(metrics)}`
        ).toEqual([]);
        expect(
          metrics.lowContrastText,
          `${fixture.label} Mermaid text should remain readable: ${JSON.stringify(metrics)}`
        ).toEqual([]);
        expect(
          metrics.tinyText,
          `${fixture.label} Mermaid text should not render too small to read: ${JSON.stringify(metrics)}`
        ).toEqual([]);
      }

      console.info('[mermaid-format-matrix]', JSON.stringify(results));
      await test.info().attach('mermaid-format-matrix.json', {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
