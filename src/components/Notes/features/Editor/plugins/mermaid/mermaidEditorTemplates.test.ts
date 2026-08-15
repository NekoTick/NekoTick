import zenumlDiagram from '@mermaid-js/mermaid-zenuml';
import mermaid from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

describe('mermaidEditorTemplates', () => {
  beforeAll(async () => {
    await mermaid.registerExternalDiagrams([zenumlDiagram]);
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
  });

  it.each(mermaidEditorTemplates)('provides valid $label syntax', async ({ code }) => {
    await expect(mermaid.parse(code)).resolves.toBeTruthy();
  });
});
