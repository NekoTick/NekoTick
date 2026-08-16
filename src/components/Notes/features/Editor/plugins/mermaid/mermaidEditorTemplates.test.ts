import zenumlDiagram from '@mermaid-js/mermaid-zenuml';
import mermaid from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeMermaidEditorCodeInput } from './mermaidFenceCode';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

describe('mermaidEditorTemplates', () => {
  beforeAll(async () => {
    await mermaid.registerExternalDiagrams([zenumlDiagram]);
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
  });

  it.each(mermaidEditorTemplates)('provides valid $label syntax', async ({ code }) => {
    await expect(mermaid.parse(code)).resolves.toBeTruthy();
  });

  it('builds visible event modeling content', async () => {
    const originalGetBBox = SVGElement.prototype.getBBox;
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 80, height: 20 }),
    });

    try {
      const template = mermaidEditorTemplates.find(({ id }) => id === 'event-modeling');

      expect(template).toBeDefined();
      const renderCode = normalizeMermaidEditorCodeInput(template!.code);
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(renderCode);
      const state = (diagram.db as unknown as {
        getState: () => { boxes: unknown[]; relations: unknown[] };
      }).getState();

      expect(state.boxes).toHaveLength(3);
      expect(state.relations).toHaveLength(2);
    } finally {
      if (originalGetBBox) {
        Object.defineProperty(SVGElement.prototype, 'getBBox', {
          configurable: true,
          value: originalGetBBox,
        });
      } else {
        delete (SVGElement.prototype as Partial<SVGElement>).getBBox;
      }
    }
  });
});
