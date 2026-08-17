import { render, waitFor } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { READONLY_MARKDOWN_REHYPE_PLUGINS } from '@/components/common/markdown/markdownPipeline';
import {
  clearReadOnlyMermaidRenderCaches,
} from '@/components/common/markdown/ReadOnlyMermaidBlock';
import { renderMermaid } from '@/components/common/markdown/mermaidRenderer';
import { readonlyMarkdownUrlTransform } from '@/components/common/markdown/urlTransform';
import {
  createSplitPreviewMarkdownComponents,
  prepareSplitPreviewMarkdown,
  SPLIT_PREVIEW_REMARK_PLUGINS,
} from './NotesSplitPreviewMarkdown';

vi.mock('@/components/common/markdown/mermaidRenderer', () => ({
  generateMermaidId: () => 'split-preview-mermaid-test',
  MAX_MERMAID_CODE_CHARS: 20_000,
  mermaidRenderErrorMarkup: () => '<div class="mermaid-error">Mermaid Error</div>',
  renderMermaid: vi.fn(),
}));

function renderSplitPreview(
  markdown: string,
  loadImage: (src: string, isObsidianEmbed: boolean) => Promise<string> = () => new Promise(() => undefined),
) {
  return render(
    <ReactMarkdown
      components={createSplitPreviewMarkdownComponents(loadImage)}
      remarkPlugins={SPLIT_PREVIEW_REMARK_PLUGINS}
      rehypePlugins={READONLY_MARKDOWN_REHYPE_PLUGINS}
      urlTransform={readonlyMarkdownUrlTransform}
    >
      {prepareSplitPreviewMarkdown(markdown)}
    </ReactMarkdown>,
  );
}

beforeEach(() => {
  clearReadOnlyMermaidRenderCaches();
  vi.mocked(renderMermaid).mockReset();
  vi.mocked(renderMermaid).mockResolvedValue('<svg><text>Rendered diagram</text></svg>');
});

describe('Notes split preview math', () => {
  it('renders supported math syntax through the shared notes pipeline', () => {
    const markdown = [
      'Inline \\(x+y\\).',
      '',
      '\\[',
      '\\ce{H2O}',
      '\\]',
      '',
      '$$x^2$$',
      '',
      '```math',
      '\\frac{1}{2}',
      '```',
      '',
      '```latex',
      '\\documentclass{article}',
      '```',
    ].join('\n');
    const { container } = renderSplitPreview(markdown);

    expect(container.querySelectorAll('.katex')).toHaveLength(4);
    expect(container.querySelector('.math-error')).toBeNull();
    expect(container.querySelector('code.language-latex')?.textContent).toContain('\\documentclass');
    expect(container.querySelector('code.language-math')).toBeNull();
  });
});

describe('Notes split preview rich syntax', () => {
  it('renders Mermaid fences as diagrams', async () => {
    const { container } = renderSplitPreview([
      '```mermaid',
      'sequenceDiagram',
      'Alice->>Bob: Hello',
      '```',
    ].join('\n'));

    await waitFor(() => {
      expect(container.querySelector('.mermaid-block svg')).not.toBeNull();
    });
    expect(container.querySelector('.mermaid-placeholder')).toBeNull();
    expect(container.querySelector('code.language-mermaid')).toBeNull();
  });

  it('renders Markdown video images as block-level video content', () => {
    const source = 'https://example.test/demo.mp4';
    const { container } = renderSplitPreview(`![Demo video](${source})`);
    const videoBlock = container.querySelector('.video-block');

    expect(videoBlock).not.toBeNull();
    expect(videoBlock?.closest('p')).toBeNull();
    expect(videoBlock?.querySelector('video')?.getAttribute('src')).toBe(source);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders wiki-link aliases without exposing synthetic links', () => {
    const { container } = renderSplitPreview(
      String.raw`See [[Project Alpha|the project]]. Keep \[[Literal Link]] unchanged. [Manual anchor](#vlaina-wiki-link:manual).`,
    );
    const wikiLink = container.querySelector('.wiki-link');

    expect(wikiLink?.textContent).toBe('the project');
    expect(wikiLink?.tagName).toBe('SPAN');
    expect(container.querySelectorAll('.wiki-link')).toHaveLength(1);
    expect(container.querySelector('a[href="#vlaina-wiki-link:manual"]')?.textContent)
      .toBe('Manual anchor');
    expect(container.textContent).toContain('Keep [[Literal Link]] unchanged.');
  });

  it('keeps Obsidian image embeds distinct from wiki links', () => {
    const { container } = renderSplitPreview(
      '![[assets/cover.png|Cover image]] See [[Project Alpha|the project]].',
    );

    expect(container.querySelector('.image-block-container img')?.getAttribute('alt'))
      .toBe('Cover image');
    expect(container.querySelector('.wiki-link')?.textContent).toBe('the project');
    expect(container.querySelectorAll('.wiki-link')).toHaveLength(1);
    expect(container.textContent).not.toContain('assets/cover.png');
  });

  it('renders a bare Obsidian image embed', () => {
    const { container } = renderSplitPreview('![[1.png]]');

    expect(container.querySelector('.image-block-container img')?.getAttribute('data-src'))
      .toBe('1.png');
    expect(container.textContent).not.toContain('![[1.png]]');
  });

  it('keeps escaped Obsidian image syntax as literal text', () => {
    const { container } = renderSplitPreview(String.raw`\![[literal.png]]`);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('![[literal.png]]');
  });

  it('marks only Obsidian embeds for vault-wide filename lookup', async () => {
    const loadImage = vi.fn(async (src: string) => `blob:${src}`);
    renderSplitPreview('![[obsidian.png]]\n\n![standard](standard.png)', loadImage);

    await waitFor(() => expect(loadImage).toHaveBeenCalledTimes(2));
    expect(loadImage).toHaveBeenCalledWith('obsidian.png', true);
    expect(loadImage).toHaveBeenCalledWith('standard.png', false);
  });

  it('preserves generated TOC classes through sanitization', () => {
    const { container } = renderSplitPreview([
      '[TOC]',
      '',
      '# Alpha',
      '',
      '## Beta',
    ].join('\n'));

    expect(container.querySelector('.toc-list')).not.toBeNull();
    expect(container.querySelector('.toc-item.toc-level-1')).not.toBeNull();
    expect(container.querySelector('.toc-item.toc-level-2')).not.toBeNull();
    expect(container.querySelector('.toc-link')).not.toBeNull();
  });
});
