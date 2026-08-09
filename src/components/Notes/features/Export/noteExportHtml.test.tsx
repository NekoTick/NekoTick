import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearReadOnlyMermaidRenderCaches,
} from '@/components/common/markdown/ReadOnlyMermaidBlock';
import { renderMermaid } from '@/components/common/markdown/mermaidRenderer';
import {
  MAX_EXPORT_IMAGE_DECODE_CONCURRENCY,
  MAX_EXPORT_IMAGE_DECODE_SCAN_ELEMENTS,
  MAX_EXPORT_MERMAID_RENDER_WAIT_MS,
  collectExportDecodeWaitImages,
  renderNoteExportElement,
  renderNoteExportHtml,
} from './noteExportHtml';

vi.mock('@/components/common/markdown/mermaidRenderer', () => ({
  generateMermaidId: () => 'note-export-mermaid-test',
  MAX_MERMAID_CODE_CHARS: 20_000,
  mermaidRenderErrorMarkup: () => '<div class="mermaid-error">Mermaid Error</div>',
  renderMermaid: vi.fn(),
}));

function parseExportHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('renderNoteExportHtml', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearReadOnlyMermaidRenderCaches();
    vi.mocked(renderMermaid).mockReset();
    vi.mocked(renderMermaid).mockResolvedValue('<svg><text>Exported diagram</text></svg>');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      window.setTimeout(() => callback(performance.now()), 0);
      return 1;
    });
  });

  it('sanitizes raw HTML, event handlers, and unsafe links', async () => {
    const html = await renderNoteExportHtml(
      [
        '<script>alert(1)</script>',
        '<svg><script>alert(2)</script></svg>',
        '<noscript><img src="assets/hidden-noscript.png"></noscript>',
        '<math><img src="assets/hidden-math.png"></math>',
        '<noembed><img src="assets/hidden-noembed.png"></noembed>',
        '<a href="javascript:alert(3)" onclick="alert(4)">bad</a>',
        '<a href="file:///etc/passwd">file</a>',
        '<a href="/etc/passwd">absolute path</a>',
        '<a href="//example.com/protocol-relative">protocol</a>',
        '<a href="http://127.0.0.1:3000/admin">local raw</a>',
        '<a href="http://router/admin">router raw</a>',
        '<a href="https://user:pass@example.com/private">credential raw</a>',
        '<a href=".vlaina/workspace.md">internal raw</a>',
        '<a href="docs/.git/config.md">git raw</a>',
        '<a href=".notes/alpha.md">dot raw</a>',
        '<a href="https://example.com/.git/config.md">external git path</a>',
        '<a href="https://example.com" onclick="alert(5)">safe</a>',
        '<a href="mailto:user@example.com">mail</a>',
        '<a href="weixin://dl/chat">wx raw</a>',
        '<img src="assets/demo.png" onerror="alert(6)" alt="demo">',
        '<img src="weixin://" alt="wx image">',
        '[protocol markdown](//example.com/markdown)',
        '[absolute markdown](/etc/passwd)',
        '[local markdown](http://localhost:3000/secret)',
        '[credential markdown](https://user:pass@example.com/private)',
        '[internal markdown](.vlaina/workspace.md)',
        '[git markdown](docs/.git/config.md)',
        '[dot markdown](.notes/alpha.md)',
        '[wx markdown](weixin://)',
      ].join('\n'),
      'Unsafe <Title>',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('title')?.textContent).toBe('Unsafe <Title>');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('svg')).toBeNull();
    expect(doc.querySelector('img[src="assets/hidden-noscript.png"]')).toBeNull();
    expect(doc.querySelector('img[src="assets/hidden-math.png"]')).toBeNull();
    expect(doc.querySelector('img[src="assets/hidden-noembed.png"]')).toBeNull();
    expect(doc.body.textContent).toContain('<noembed>');
    expect(doc.querySelector('[onclick]')).toBeNull();
    expect(doc.querySelector('[onerror]')).toBeNull();
    expect(doc.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(doc.querySelector('a[href^="file:"]')).toBeNull();
    expect(doc.querySelector('a[href="/etc/passwd"]')).toBeNull();
    expect(doc.querySelector('a[href^="//"]')).toBeNull();
    expect(doc.querySelector('a[href^="http://127.0.0.1"]')).toBeNull();
    expect(doc.querySelector('a[href^="http://router"]')).toBeNull();
    expect(doc.querySelector('a[href^="http://localhost"]')).toBeNull();
    expect(doc.querySelector('a[href*="user:pass"]')).toBeNull();
    expect(doc.querySelector('a[href=".vlaina/workspace.md"]')).toBeNull();
    expect(doc.querySelector('a[href="docs/.git/config.md"]')).toBeNull();
    expect(doc.body.textContent).toContain('protocol');
    expect(doc.body.textContent).toContain('protocol markdown');
    expect(doc.body.textContent).toContain('absolute path');
    expect(doc.body.textContent).toContain('absolute markdown');
    expect(doc.body.textContent).toContain('local raw');
    expect(doc.body.textContent).toContain('router raw');
    expect(doc.body.textContent).toContain('credential raw');
    expect(doc.body.textContent).toContain('local markdown');
    expect(doc.body.textContent).toContain('credential markdown');
    expect(doc.body.textContent).toContain('internal raw');
    expect(doc.body.textContent).toContain('git raw');
    expect(doc.body.textContent).toContain('internal markdown');
    expect(doc.body.textContent).toContain('git markdown');
    expect(doc.querySelector('a[href=".notes/alpha.md"]')?.textContent).toBe('dot raw');
    expect(doc.querySelector('a[href="https://example.com/.git/config.md"]')?.textContent).toBe('external git path');
    expect(doc.querySelector('a[href="https://example.com"]')?.textContent).toBe('safe');
    expect(doc.querySelector('a[href="mailto:user@example.com"]')?.textContent).toBe('mail');
    expect(doc.querySelector('a[href="weixin://dl/chat"]')?.textContent).toBe('wx raw');
    expect(doc.querySelector('a[href="weixin://"]')?.textContent).toBe('wx markdown');
    expect(doc.querySelector('img[src="assets/demo.png"]')?.getAttribute('alt')).toBe('demo');
    expect(doc.querySelector('img[src^="weixin:"]')).toBeNull();
  });

  it('strips arbitrary raw div data attributes from exported markdown', async () => {
    const html = await renderNoteExportHtml(
      '<div data-token="hidden_export_marker" data-track="1">safe div</div>',
      'Data Attributes',
    );
    const doc = parseExportHtml(html);
    const div = doc.querySelector('.note-export-body > div');

    expect(div?.textContent).toBe('safe div');
    expect(div?.getAttribute('data-token')).toBeNull();
    expect(div?.getAttribute('data-track')).toBeNull();
    expect(html).not.toContain('hidden_export_marker');
  });

  it('drops dangerous schemes from exported non-url raw HTML attributes', async () => {
    const html = await renderNoteExportHtml(
      [
        '<abbr title="javascript:alert(1)" aria-label="data:text/html,<script>alert(1)</script>">abbr</abbr>',
        '<abbr title="java&#10;script:alert(1)" aria-label="da&#9;ta:text/html,<script>alert(1)</script>">wrapped abbr</abbr>',
        '<time datetime="data:text/html,<script>alert(1)</script>">time</time>',
        '<time datetime="da&#9;ta:text/html,<script>alert(1)</script>">wrapped time</time>',
        '<span title="safe text">safe</span>',
      ].join('\n'),
      'Non URL Attributes',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('abbr')?.getAttribute('title')).toBeNull();
    expect(doc.querySelector('abbr')?.getAttribute('aria-label')).toBeNull();
    expect(doc.querySelectorAll('abbr')[1]?.getAttribute('title')).toBeNull();
    expect(doc.querySelectorAll('abbr')[1]?.getAttribute('aria-label')).toBeNull();
    expect(doc.querySelectorAll('time')[0]?.getAttribute('datetime')).toBeNull();
    expect(doc.querySelectorAll('time')[1]?.getAttribute('datetime')).toBeNull();
    expect(doc.querySelector('span')?.getAttribute('title')).toBe('safe text');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text/html');
  });

  it('blocks exported images that can execute code or trigger external loads', async () => {
    const html = await renderNoteExportHtml(
      [
        '![portable](data:image/png;base64,aGk=)',
        '![portable bmp](data:image/bmp;base64,aGk=)',
        '![portable avif](DATA:IMAGE/AVIF;BASE64,aGk=)',
        '![svg](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+)',
        '![remote](https://example.com/pixel.png)',
        '![local](http://127.0.0.1/pixel.png)',
        '![blob](blob:https://example.com/id)',
        '![blob upper](BLOB:https://example.com/id)',
        '![absolute](/etc/passwd)',
        '![internal](.vlaina/secret.png)',
        '![nested internal](docs/.git/secret.png)',
        '![encoded internal](%2evlaina/secret.png)',
        '![encoded nested](docs%2f.git%2fsecret.png)',
        '![relative](assets/photo.webp)',
        '![user dot](.notes/photo.webp)',
        '![encoded user dot](%2enotes/photo.webp)',
        '<img src=".vlaina/raw.png" alt="raw internal">',
        '<img src="docs/.git/raw.png" alt="raw git">',
        '<img src="docs/%2Egit/raw.png" alt="raw encoded git">',
        '<img src=".notes/raw.png" alt="raw user dot">',
        `<img src="${' '.repeat(4097)}assets/trimmed-raw.png" alt="trimmed raw">`,
      ].join('\n'),
      'Images',
    );
    const doc = parseExportHtml(html);
    const imageSources = Array.from(doc.querySelectorAll('img')).map((image) => image.getAttribute('src'));

    expect(imageSources).toEqual([
      'data:image/png;base64,aGk=',
      'data:image/bmp;base64,aGk=',
      'data:image/avif;base64,aGk=',
      'assets/photo.webp',
      '.notes/photo.webp',
      '%2enotes/photo.webp',
      '.notes/raw.png',
    ]);
    expect(html).not.toContain('image/svg+xml');
    expect(html).not.toContain('https://example.com/pixel.png');
    expect(html).not.toContain('http://127.0.0.1/pixel.png');
    expect(html).not.toContain('blob:https://example.com/id');
    expect(html).not.toContain('BLOB:https://example.com/id');
    expect(html).not.toContain('/etc/passwd');
    expect(html).not.toContain('.vlaina/secret.png');
    expect(html).not.toContain('docs/.git/secret.png');
    expect(html).not.toContain('%2evlaina/secret.png');
    expect(html).not.toContain('docs%2f.git%2fsecret.png');
    expect(html).not.toContain('.vlaina/raw.png');
    expect(html).not.toContain('docs/.git/raw.png');
    expect(html).not.toContain('docs/%2Egit/raw.png');
    expect(html).not.toContain('trimmed-raw.png');
  });

  it('drops unresolved internal image sources from exported documents', async () => {
    const html = await renderNoteExportHtml(
      '![missing](img:assets/missing.gif)\n\n![relative](assets/relative.png)',
      'Missing Images',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('img[src^="img:"]')).toBeNull();
    expect(doc.querySelector('img[src="assets/relative.png"]')).not.toBeNull();
  });

  it('caps image decode waits while keeping all exported images in the document', async () => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let activeDecodes = 0;
    let maxActiveDecodes = 0;
    const decode = vi.fn(function (this: HTMLImageElement) {
      if (this.getAttribute('src') === 'assets/late-200.png') {
        throw new Error('image decode wait cap was not applied');
      }
      activeDecodes += 1;
      maxActiveDecodes = Math.max(maxActiveDecodes, activeDecodes);
      return Promise.resolve().finally(() => {
        activeDecodes -= 1;
      });
    });
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get: () => false,
    });
    HTMLImageElement.prototype.decode = decode;

    try {
      const html = await renderNoteExportHtml(
        Array.from({ length: 205 }, (_value, index) => `![image ${index}](assets/late-${index}.png)`).join('\n'),
        'Many Images',
      );
      const doc = parseExportHtml(html);

      expect(doc.querySelectorAll('img')).toHaveLength(205);
      expect(decode).toHaveBeenCalledTimes(200);
      expect(maxActiveDecodes).toBeLessThanOrEqual(MAX_EXPORT_IMAGE_DECODE_CONCURRENCY);
      expect(decode.mock.instances.some((image) => image.getAttribute('src') === 'assets/late-200.png')).toBe(false);
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
    }
  });

  it('caps image decode scanning while preserving late images in the container', () => {
    const container = document.createElement('div');
    const filler = document.createElement('div');
    for (let index = 0; index < MAX_EXPORT_IMAGE_DECODE_SCAN_ELEMENTS + 32; index += 1) {
      filler.appendChild(document.createElement('span'));
    }
    const lateImage = document.createElement('img');
    lateImage.setAttribute('src', 'assets/after-scan.png');
    container.append(filler, lateImage);

    const images = collectExportDecodeWaitImages(container);

    expect(container.querySelector('img[src="assets/after-scan.png"]')).toBe(lateImage);
    expect(images).not.toContain(lateImage);
    expect(images).toHaveLength(0);
  });

  it('cleans the hidden export host if render waiting fails', async () => {
    const childCountBefore = document.body.childElementCount;
    vi.stubGlobal('requestAnimationFrame', () => {
      throw new Error('requestAnimationFrame failed');
    });

    await expect(renderNoteExportElement('# Broken', 'Broken')).rejects.toThrow('requestAnimationFrame failed');

    expect(document.body.childElementCount).toBe(childCountBefore);
    expect(document.body.textContent).not.toContain('Broken');
  });

  it('keeps safe raw HTML while dropping exported raw media loaders', async () => {
    const html = await renderNoteExportHtml(
      [
        '<figure><figcaption>Caption</figcaption></figure>',
        '<time datetime="2026-05-06">today</time><wbr>',
        '<iframe src="https://example.com/embed" sandbox="allow-scripts"></iframe>',
        '<iframe src="http://127.0.0.1:3000/admin"></iframe>',
        '<video src="https://example.com/movie.mp4" poster="assets/poster.png" controls></video>',
        '<audio src="assets/audio.mp3" controls></audio>',
        '<track src="assets/captions.vtt" kind="captions">',
      ].join('\n'),
      'Raw Media',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('figure figcaption')?.textContent).toBe('Caption');
    expect(doc.querySelector('time')?.getAttribute('datetime')).toBe('2026-05-06');
    expect(doc.querySelector('wbr')).not.toBeNull();
    expect(doc.querySelector('iframe')).toBeNull();
    expect(doc.querySelector('video')).toBeNull();
    expect(doc.querySelector('audio')).toBeNull();
    expect(doc.querySelector('track')).toBeNull();
    expect(html).not.toContain('https://example.com/embed');
    expect(html).not.toContain('http://127.0.0.1:3000/admin');
    expect(html).not.toContain('https://example.com/movie.mp4');
    expect(html).not.toContain('assets/poster.png');
    expect(html).not.toContain('assets/audio.mp3');
    expect(html).not.toContain('assets/captions.vtt');
  });

  it('waits for Mermaid diagrams before serializing export HTML', async () => {
    const html = await renderNoteExportHtml([
      '```mermaid',
      'sequenceDiagram',
      'Alice->>Bob: Hello',
      '```',
    ].join('\n'), 'Mermaid');
    const doc = parseExportHtml(html);

    expect(doc.querySelector('.mermaid-block svg')).not.toBeNull();
    expect(doc.querySelector('.mermaid-placeholder')).toBeNull();
    expect(doc.querySelector('code.language-mermaid')).toBeNull();
  });

  it('exports more than 80 Mermaid diagrams without overflow errors', async () => {
    const diagramCount = 85;
    const markdown = Array.from({ length: diagramCount }, (_value, index) => [
      '```mermaid',
      'sequenceDiagram',
      `Alice->>Bob: Diagram ${index}`,
      '```',
    ].join('\n')).join('\n\n');

    const html = await renderNoteExportHtml(markdown, 'Many diagrams');
    const doc = parseExportHtml(html);

    expect(doc.querySelectorAll('.mermaid-block')).toHaveLength(diagramCount);
    expect(doc.querySelectorAll('.mermaid-block svg')).toHaveLength(diagramCount);
    expect(doc.querySelector('.mermaid-placeholder, .mermaid-error')).toBeNull();
  });

  it('does not serialize export HTML while Mermaid rendering remains pending', async () => {
    let resolveRender = (_markup: string) => {};
    vi.mocked(renderMermaid).mockImplementation(() => new Promise((resolve) => {
      resolveRender = resolve;
    }));
    let settled = false;
    const htmlPromise = renderNoteExportHtml(
      '```mermaid\nflowchart TD\nA --> B\n```',
      'Pending',
    ).then((html) => {
      settled = true;
      return html;
    });

    await vi.waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    expect(settled).toBe(false);

    resolveRender('<svg><text>Completed diagram</text></svg>');
    const html = await htmlPromise;
    const doc = parseExportHtml(html);

    expect(doc.querySelector('.mermaid-placeholder')).toBeNull();
    expect(doc.querySelector('.mermaid-block svg')).not.toBeNull();
  });

  it('continues exporting when Mermaid rendering never settles', async () => {
    let resolveRender = (_markup: string) => {};
    vi.mocked(renderMermaid).mockImplementation(() => new Promise((resolve) => {
      resolveRender = resolve;
    }));
    let now = 0;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += MAX_EXPORT_MERMAID_RENDER_WAIT_MS + 1;
      return now;
    });

    try {
      const html = await renderNoteExportHtml(
        '```mermaid\nflowchart TD\nA --> B\n```',
        'Timed out',
      );
      const doc = parseExportHtml(html);

      expect(doc.querySelector('.mermaid-placeholder')).toBeNull();
      expect(doc.querySelector('.mermaid-error')).not.toBeNull();
    } finally {
      dateNow.mockRestore();
      resolveRender('<svg><text>Late diagram</text></svg>');
    }
  });

  it('exports Markdown videos as static safe links', async () => {
    const source = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const html = await renderNoteExportHtml(`![Demo video](${source})`, 'Video');
    const doc = parseExportHtml(html);
    const videoBlock = doc.querySelector('.note-export-video');

    expect(videoBlock?.closest('p')).toBeNull();
    expect(videoBlock?.querySelector('a')?.getAttribute('href')).toBe(source);
    expect(videoBlock?.textContent).toBe('Demo video');
    expect(doc.querySelector('iframe, video, .note-export-video img')).toBeNull();
  });

  it('exports wiki-link aliases as text without synthetic hrefs', async () => {
    const html = await renderNoteExportHtml(
      String.raw`See [[Project Alpha|the project]]. Keep \[[Literal Link]] unchanged. [Manual anchor](#vlaina-wiki-link:manual).`,
      'Wiki Link',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('.note-export-body')?.textContent).toContain('See the project.');
    expect(doc.querySelector('a[href="#vlaina-wiki-link:manual"]')?.textContent)
      .toBe('Manual anchor');
    expect(doc.querySelector('.note-export-body')?.textContent)
      .toContain('Keep [[Literal Link]] unchanged.');
  });

  it('preserves generated TOC classes in exports', async () => {
    const html = await renderNoteExportHtml([
      '[TOC]',
      '',
      '# Alpha',
      '',
      '## Beta',
    ].join('\n'), 'TOC');
    const doc = parseExportHtml(html);

    expect(doc.querySelector('.toc-list')).not.toBeNull();
    expect(doc.querySelector('.toc-item.toc-level-1')).not.toBeNull();
    expect(doc.querySelector('.toc-item.toc-level-2')).not.toBeNull();
    expect(doc.querySelector('.toc-link')).not.toBeNull();
  });

  it('renders exported math with shared KaTeX settings without source annotations', async () => {
    const html = await renderNoteExportHtml(
      'Inline $\\R$ and hidden $x% hidden_export_marker$',
      'Math',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelector('.katex')).toBeInstanceOf(HTMLElement);
    expect(doc.querySelector('style')?.textContent).toContain('.katex');
    expect(html).toContain('mathbb');
    expect(html).not.toContain('application/x-tex');
    expect(html).not.toContain('hidden_export_marker');
  });

  it('renders all supported notes math delimiters, math fences, and chemistry consistently', async () => {
    const html = await renderNoteExportHtml(
      [
        'Inline \\(x+y\\) and chemistry $\\ce{H2O}$.',
        '',
        '\\[',
        '\\pu{123 kJ mol-1}',
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
      ].join('\n'),
      'Math Syntax',
    );
    const doc = parseExportHtml(html);

    expect(doc.querySelectorAll('.katex')).toHaveLength(5);
    expect(doc.body.textContent).toContain('H');
    expect(doc.body.textContent).toContain('kJ');
    expect(doc.querySelector('code.language-latex')?.textContent).toContain('\\documentclass');
    expect(doc.querySelector('code.language-math')).toBeNull();
  });

  it('isolates macros and enforces the shared formula size limit during export', async () => {
    const html = await renderNoteExportHtml(
      [
        '$\\gdef\\R{\\mathbf{H}}\\R$',
        '$\\R$',
        `$${'x'.repeat(10001)}$`,
      ].join('\n\n'),
      'Math Boundaries',
    );
    const doc = parseExportHtml(html);
    const formulas = doc.querySelectorAll('.katex');

    expect(formulas).toHaveLength(2);
    expect(formulas[0]?.innerHTML).toContain('mathbf');
    expect(formulas[1]?.innerHTML).toContain('mathbb');
    expect(doc.querySelector('.math-error')).toBeInstanceOf(HTMLElement);
  });
});
