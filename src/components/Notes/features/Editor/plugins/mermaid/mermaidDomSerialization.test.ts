import { describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
} from '@milkdown/kit/core';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { mermaidPlugin } from './mermaidPlugin';
import { getMermaidElementCode, getPendingMermaidRenderCount } from './mermaidDom';

vi.mock('./mermaidRenderer', () => ({
  generateMermaidId: () => 'mermaid-serialized-test',
  mermaidRenderErrorMarkup: () => '<pre class="mermaid-error">Mermaid render error</pre>',
  renderMermaid: vi.fn(async () => '<svg data-rendered="serialized"></svg>'),
}));

describe('mermaid DOM serialization', () => {
  it('keeps diagram source available in memory without exposing it in serialized HTML', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(mermaidPlugin);

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const mermaidNode = view.state.schema.nodes.mermaid.create({
      code: ['sequenceDiagram', 'Alice->Bob: secret token'].join('\n'),
    });
    const pendingBefore = getPendingMermaidRenderCount();
    const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(
      view.state.schema.topNodeType.create(null, mermaidNode).content,
      { document }
    );
    const element = fragment.firstChild;

    expect(element).toBeInstanceOf(HTMLElement);
    expect((element as HTMLElement).classList.contains('mermaid-block')).toBe(true);
    expect((element as HTMLElement).classList.contains('md-fences')).toBe(true);
    expect((element as HTMLElement).classList.contains('md-diagram')).toBe(true);
    expect((element as HTMLElement).classList.contains('md-fences-advanced')).toBe(true);
    expect((element as HTMLElement).classList.contains('md-diagram-panel')).toBe(true);
    expect((element as HTMLElement).classList.contains('md-diagram-panel-preview')).toBe(true);
    expect(getMermaidElementCode(element as HTMLElement)).toBe(
      ['sequenceDiagram', 'Alice->Bob: secret token'].join('\n')
    );
    expect((element as HTMLElement).outerHTML).not.toContain('sequenceDiagram');
    expect((element as HTMLElement).outerHTML).not.toContain('secret token');
    expect((element as HTMLElement).outerHTML).not.toContain('data-code');
    expect(getPendingMermaidRenderCount()).toBe(pendingBefore);

    await editor.destroy();
  });
});
