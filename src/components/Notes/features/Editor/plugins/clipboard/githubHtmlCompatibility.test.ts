import { afterEach, describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

import { configureTheme } from '../../theme';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { sanitizeHtml } from './sanitizer';
import { normalizeSerializedMarkdownDocument } from '@/lib/notes/markdown/markdownSerializationUtils';
import { stripTrailingNewlines } from '@/lib/notes/markdown/markdownSerializationUtils';
import {
  GITHUB_ALLOWED_ATTRIBUTES_BY_TAG,
  GITHUB_ALLOWED_GLOBAL_ATTRIBUTES,
  GITHUB_ALLOWED_HTML_TAGS,
  GITHUB_ALLOWED_LINK_PROTOCOLS,
  GITHUB_ALLOWED_MEDIA_PROTOCOLS,
  GITHUB_DROP_WITH_CONTENT_TAGS,
  GITHUB_LOADABLE_OR_URL_ATTRIBUTES,
  GITHUB_WRAP_CONTENT_WITH_WHITESPACE_TAGS,
} from '@/lib/notes/markdown/githubHtmlPolicy';

type TestEditor = ReturnType<typeof Editor.make>;

const editors: TestEditor[] = [];
const GITHUB_ALLOWED_TAG_FIXTURE = [
  '<h1>h1</h1><h2>h2</h2><h3>h3</h3><h4>h4</h4><h5>h5</h5><h6>h6</h6>',
  '<p>p<br><b>b</b><i>i</i><strong>strong</strong><em>em</em><a href="https://example.com">a</a><tt>tt</tt><ins>ins</ins><del>del</del><sup>sup</sup><sub>sub</sub><kbd>kbd</kbd><q cite="https://example.com/q">q</q><samp>samp</samp><var>var</var><s>s</s><strike>strike</strike><abbr title="abbr">abbr</abbr><bdo dir="rtl">bdo</bdo><cite>cite</cite><dfn>dfn</dfn><mark>mark</mark><small>small</small><span>span</span><time datetime="2026-05-06">time</time><wbr></p>',
  '<pre><code>code</code></pre><img src="https://example.com/a.png" alt="img"><hr>',
  '<div><blockquote cite="https://example.com/bq">blockquote</blockquote></div>',
  '<picture><source srcset="https://example.com/a.webp 1x"><img src="https://example.com/a.png" alt="picture"></picture>',
  '<video src="xxx.mp4" controls><source src="demo.webm" type="video/webm"><track src="captions.vtt" kind="captions"></video>',
  '<audio src="xxx.mp3" controls></audio>',
  '<iframe src="https://example.com/embed" title="embed"></iframe>',
  '<ol><li>ol li</li></ol><ul><li>ul li</li></ul>',
  '<table><caption>caption</caption><thead><tr><th scope="col">th</th></tr></thead><tbody><tr><td>td</td></tr></tbody><tfoot><tr><td>tfoot</td></tr></tfoot></table>',
  '<dl><dt>dt</dt><dd>dd</dd></dl>',
  '<ruby>rb<rp>(</rp><rt>rt</rt><rp>)</rp></ruby>',
  '<details open><summary>summary</summary><p>details</p></details>',
  '<figure><figcaption>figcaption</figcaption></figure>',
].join('');

afterEach(async () => {
  while (editors.length > 0) {
    await editors.pop()?.destroy();
  }
  document.body.innerHTML = '';
});

async function openGithubHtmlMarkdown(markdown: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(configureTheme);

  await editor.create();
  editors.push(editor);

  const view = editor.ctx.get(editorViewCtx);
  const serializer = editor.ctx.get(serializerCtx);
  return {
    dom: view.dom,
    persisted: stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc))),
  };
}

function getSanitizedTagNames(html: string): Set<string> {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  return new Set(Array.from(template.content.querySelectorAll('*')).map((element) =>
    element.tagName.toLowerCase()
  ));
}

describe('GitHub README HTML compatibility', () => {
  it('matches the current note HTML sanitizer element allowlist exactly', () => {
    expect(Array.from(GITHUB_ALLOWED_HTML_TAGS)).toEqual([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'br', 'b', 'i', 'strong', 'em', 'a', 'pre', 'code', 'img', 'tt',
      'div', 'ins', 'del', 'sup', 'sub', 'p', 'picture',
      'ol', 'ul', 'table', 'thead', 'tbody', 'tfoot', 'blockquote',
      'dl', 'dt', 'dd', 'kbd', 'q', 'samp', 'var', 'hr', 'ruby', 'rt', 'rp',
      'li', 'tr', 'td', 'th', 's', 'strike', 'summary', 'details', 'caption',
      'figure', 'figcaption', 'abbr', 'bdo', 'cite', 'dfn', 'mark', 'small',
      'source', 'span', 'time', 'wbr', 'video', 'audio', 'iframe', 'track',
    ]);
  });

  it('matches the current note HTML sanitizer attribute allowlist exactly', () => {
    expect(Array.from(GITHUB_ALLOWED_GLOBAL_ATTRIBUTES)).toEqual([
      'abbr', 'accept', 'accept-charset', 'accesskey', 'action', 'align', 'alt',
      'aria-describedby', 'aria-hidden', 'aria-label', 'aria-labelledby', 'axis',
      'border', 'char', 'charoff', 'charset', 'checked', 'clear', 'cols', 'colspan',
      'compact', 'coords', 'datetime', 'dir', 'disabled', 'enctype', 'for', 'frame',
      'headers', 'height', 'hreflang', 'hspace', 'ismap', 'label', 'lang',
      'maxlength', 'media', 'method', 'multiple', 'name', 'nohref', 'noshade',
      'nowrap', 'open', 'progress', 'prompt', 'readonly', 'rel', 'rev', 'role',
      'rows', 'rowspan', 'rules', 'scope', 'selected', 'shape', 'size', 'span',
      'start', 'style', 'summary', 'tabindex', 'title', 'type', 'usemap', 'valign', 'value',
      'width', 'itemprop',
    ]);
    expect(Object.fromEntries(
      Object.entries(GITHUB_ALLOWED_ATTRIBUTES_BY_TAG).map(([tagName, attributes]) => [
        tagName,
        Array.from(attributes),
      ]),
    )).toEqual({
      a: ['href'],
      img: ['src', 'longdesc', 'loading', 'alt'],
      div: ['itemscope', 'itemtype'],
      blockquote: ['cite'],
      del: ['cite'],
      ins: ['cite'],
      q: ['cite'],
      source: ['src', 'srcset', 'type', 'media'],
      video: ['src', 'poster', 'controls', 'autoplay', 'loop', 'muted', 'preload', 'playsinline'],
      audio: ['src', 'controls', 'autoplay', 'loop', 'muted', 'preload'],
      track: ['src', 'kind', 'srclang', 'label', 'default'],
      iframe: ['src', 'sandbox', 'allow', 'allowfullscreen', 'allowtransparency', 'frameborder', 'scrolling', 'referrerpolicy', 'loading'],
    });
  });

  it('matches the current note URL protocol allowlist exactly', () => {
    expect(Array.from(GITHUB_ALLOWED_LINK_PROTOCOLS)).toEqual(['http:', 'https:', 'mailto:', 'weixin:']);
    expect(Array.from(GITHUB_ALLOWED_MEDIA_PROTOCOLS)).toEqual(['http:', 'https:']);
  });

  it('preserves Selma-style relative URLs without rewriting them to the app origin', () => {
    const result = sanitizeHtml([
      '<a href="docs/readme.html">doc</a>',
      '<a href="./guide.html">guide</a>',
      '<a href="../parent.html">parent</a>',
      '<a href="/absolute-path">absolute path</a>',
      '<img src="images/a.png" longdesc="docs/image.html">',
      '<a href="readme.html">plain file</a>',
      '<a href="README.md">plain markdown file</a>',
      '<source srcset="images/a.webp 1x, ../images/a@2x.webp 2x">',
      '<source srcset="https://example.com/a.webp 1x">',
    ].join(''));

    expect(result).toContain('href="docs/readme.html"');
    expect(result).toContain('href="./guide.html"');
    expect(result).toContain('href="../parent.html"');
    expect(result).toContain('href="/absolute-path"');
    expect(result).toContain('src="images/a.png"');
    expect(result).toContain('longdesc="docs/image.html"');
    expect(result).toContain('href="readme.html"');
    expect(result).toContain('href="README.md"');
    expect(result).toContain('srcset="images/a.webp 1x, ../images/a@2x.webp 2x"');
    expect(result).toContain('srcset="https://example.com/a.webp 1x"');
  });

  it('keeps Selma-allowed spaces in URL attributes while rejecting control characters', () => {
    const result = sanitizeHtml([
      '<a href="https://example.com/a b">space</a>',
      '<a href="  https://example.com/leading">leading</a>',
      '<a href="https://example.com/trailing ">trailing</a>',
      '<img src="images/a b.png">',
      '<img src="/images/root.png">',
      '<source srcset="  images/a.webp 1x ">',
      '<a href="https://example.com/a\tb">tab</a>',
      '<img src="/images/a\nb.png">',
    ].join(''));

    expect(result).toContain('href="https://example.com/a b"');
    expect(result).toContain('href="https://example.com/leading"');
    expect(result).toContain('href="https://example.com/trailing "');
    expect(result).toContain('src="images/a b.png"');
    expect(result).not.toContain('/images/root.png');
    expect(result).toContain('srcset="images/a.webp 1x "');
    expect(result).toContain('<a>tab</a>');
    expect(result).toContain('<img>');
    expect(result).not.toContain('a\tb');
    expect(result).not.toContain('a\nb');
  });

  it('matches the note sanitizer protocol marker behavior for URL attributes', () => {
    const result = sanitizeHtml([
      '<a href="//example.com/protocol-relative">protocol relative</a>',
      '<img src="//example.com/a.png">',
      '<iframe src="//example.com/embed"></iframe>',
      '<video src="//example.com/demo.mp4"></video>',
      '<a href="HTTPS://example.com/Upper">upper</a>',
      '<a href="MAILTO:user@example.com">mail</a>',
      '<a href="weixin://">wx</a>',
      '<img src="MAILTO:user@example.com">',
      '<img src="weixin://">',
    ].join(''));

    expect(result).toContain('<a>protocol relative</a>');
    expect(result).toContain('src="https://example.com/a.png"');
    expect(result).toContain('<iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
    expect(result).toContain('<video src="https://example.com/demo.mp4"></video>');
    expect(result).toContain('href="HTTPS://example.com/Upper"');
    expect(result).toContain('href="MAILTO:user@example.com"');
    expect(result).toContain('href="weixin://"');
    expect(result).toContain('<img>');
    expect(result).not.toContain('src="MAILTO:user@example.com"');
    expect(result).not.toContain('src="weixin://"');
  });

  it('drops only GFM-disallowed raw HTML plus Selma remove-content extras', () => {
    expect(Array.from(GITHUB_DROP_WITH_CONTENT_TAGS)).toEqual([
      'script', 'style', 'title', 'textarea', 'xmp', 'noembed',
      'noframes', 'plaintext', 'math', 'noscript', 'svg',
    ]);
  });

  it('matches Selma whitespace wrappers for removed unsupported block elements', () => {
    expect(Array.from(GITHUB_WRAP_CONTENT_WITH_WHITESPACE_TAGS)).toEqual([
      'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
      'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
      'li', 'nav', 'ol', 'p', 'pre', 'section', 'ul',
    ]);

    expect(sanitizeHtml('a<section>b</section>c')).toBe('a b c');
    expect(sanitizeHtml('a<nav><span>b</span></nav>c')).toBe('a <span>b</span> c');
  });

  it('removes elements with Selma-forbidden comment-like attribute names', () => {
    const result = sanitizeHtml('<img <!-- bad --> src="https://example.com/a.png"><p>safe</p>');

    expect(result).toBe(' src="https://example.com/a.png"&gt;<p>safe</p>');
    expect(result).not.toContain('<img');
  });

  it('sanitizes the full GitHub allowlist tag set instead of unwrapping supported tags', () => {
    const html = [
      '<details open><summary>Tips</summary><p>Body</p></details>',
      '<figure><picture><source srcset="./a.webp 1x, https://example.com/a@2x.webp 2x"><img src="./a.png" alt="A" loading="lazy"></picture><figcaption>Caption</figcaption></figure>',
      '<dl><dt>Term</dt><dd>Definition</dd></dl>',
      '<ruby>漢<rp>(</rp><rt>han</rt><rp>)</rp></ruby>',
      '<p><kbd>Ctrl</kbd> <abbr title="HyperText Markup Language">HTML</abbr> <time datetime="2026-05-06">today</time> <wbr></p>',
      '<table><caption>Cap</caption><thead><tr><th scope="col">A</th></tr></thead><tfoot><tr><td colspan="1">F</td></tr></tfoot></table>',
    ].join('');

    const result = sanitizeHtml(html);

    for (const tag of ['details', 'summary', 'figure', 'picture', 'source', 'figcaption', 'dl', 'dt', 'dd', 'ruby', 'rp', 'rt', 'kbd', 'abbr', 'time', 'wbr', 'caption', 'tfoot']) {
      expect(result).toContain(`<${tag}`);
    }
    expect(result).toContain('open=""');
    expect(result).toContain('srcset="./a.webp 1x, https://example.com/a@2x.webp 2x"');
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('scope="col"');
    expect(result).toContain('colspan="1"');
  });

  it('preserves every GitHub-supported HTML tag through the sanitizer', () => {
    const sanitizedTags = getSanitizedTagNames(GITHUB_ALLOWED_TAG_FIXTURE);

    expect(Array.from(GITHUB_ALLOWED_HTML_TAGS).filter((tagName) =>
      !sanitizedTags.has(tagName)
    )).toEqual([]);
  });

  it('renders every GitHub-supported HTML tag when opening markdown notes', async () => {
    const result = await openGithubHtmlMarkdown(GITHUB_ALLOWED_TAG_FIXTURE);
    const renderedTags = new Set(Array.from(result.dom.querySelectorAll('*')).map((element) =>
      element.tagName.toLowerCase()
    ));

    expect(Array.from(GITHUB_ALLOWED_HTML_TAGS).filter((tagName) =>
      !renderedTags.has(tagName)
    )).toEqual([]);
  });

  it('preserves every GitHub-supported global attribute through the sanitizer', () => {
    for (const attributeName of GITHUB_ALLOWED_GLOBAL_ATTRIBUTES) {
      if (GITHUB_LOADABLE_OR_URL_ATTRIBUTES.has(attributeName)) {
        continue;
      }
      const value = attributeName === 'style' ? 'color: red' : 'github-value';
      const result = sanitizeHtml(`<div ${attributeName}="${value}">x</div>`);
      const template = document.createElement('template');
      template.innerHTML = result;

      expect(template.content.querySelector('div')?.hasAttribute(attributeName)).toBe(true);
    }
  });

  it('preserves every GitHub-supported tag-specific attribute through the sanitizer', () => {
    const fixtures: Record<string, Record<string, string>> = {
      a: { href: '<a href="https://example.com">x</a>' },
      img: {
        src: '<img src="https://example.com/a.png">',
        longdesc: '<img src="https://example.com/a.png" longdesc="https://example.com/desc">',
        loading: '<img src="https://example.com/a.png" loading="lazy">',
        alt: '<img src="https://example.com/a.png" alt="x">',
      },
      div: {
        itemscope: '<div itemscope>x</div>',
        itemtype: '<div itemtype="schema/Thing">x</div>',
      },
      blockquote: { cite: '<blockquote cite="https://example.com/q">x</blockquote>' },
      del: { cite: '<del cite="https://example.com/q">x</del>' },
      ins: { cite: '<ins cite="https://example.com/q">x</ins>' },
      q: { cite: '<q cite="https://example.com/q">x</q>' },
      source: {
        src: '<video><source src="a.webm"></video>',
        srcset: '<picture><source srcset="images/a.webp 1x"><img src="https://example.com/a.png" alt="x"></picture>',
        type: '<video><source src="a.webm" type="video/webm"></video>',
        media: '<picture><source srcset="images/a.webp 1x" media="(min-width: 800px)"><img src="https://example.com/a.png" alt="x"></picture>',
      },
      video: {
        src: '<video src="a.mp4"></video>',
        poster: '<video src="a.mp4" poster="poster.png"></video>',
        controls: '<video src="a.mp4" controls></video>',
        autoplay: '<video src="a.mp4" autoplay></video>',
        loop: '<video src="a.mp4" loop></video>',
        muted: '<video src="a.mp4" muted></video>',
        preload: '<video src="a.mp4" preload="metadata"></video>',
        playsinline: '<video src="a.mp4" playsinline></video>',
      },
      audio: {
        src: '<audio src="a.mp3"></audio>',
        controls: '<audio src="a.mp3" controls></audio>',
        autoplay: '<audio src="a.mp3" autoplay></audio>',
        loop: '<audio src="a.mp3" loop></audio>',
        muted: '<audio src="a.mp3" muted></audio>',
        preload: '<audio src="a.mp3" preload="metadata"></audio>',
      },
      track: {
        src: '<video src="a.mp4"><track src="a.vtt"></video>',
        kind: '<video src="a.mp4"><track src="a.vtt" kind="captions"></video>',
        srclang: '<video src="a.mp4"><track src="a.vtt" srclang="en"></video>',
        label: '<video src="a.mp4"><track src="a.vtt" label="English"></video>',
        default: '<video src="a.mp4"><track src="a.vtt" default></video>',
      },
      iframe: {
        src: '<iframe src="https://example.com/embed"></iframe>',
        sandbox: '<iframe src="https://example.com/embed" sandbox="allow-forms"></iframe>',
        allow: '<iframe src="https://example.com/embed" allow="fullscreen"></iframe>',
        allowfullscreen: '<iframe src="https://example.com/embed" allowfullscreen></iframe>',
        allowtransparency: '<iframe src="https://example.com/embed" allowtransparency></iframe>',
        frameborder: '<iframe src="https://example.com/embed" frameborder="0"></iframe>',
        scrolling: '<iframe src="https://example.com/embed" scrolling="no"></iframe>',
        referrerpolicy: '<iframe src="https://example.com/embed" referrerpolicy="no-referrer"></iframe>',
        loading: '<iframe src="https://example.com/embed" loading="lazy"></iframe>',
      },
    };

    for (const [tagName, attributes] of Object.entries(GITHUB_ALLOWED_ATTRIBUTES_BY_TAG)) {
      for (const attributeName of attributes) {
        const result = sanitizeHtml(fixtures[tagName][attributeName]);
        const template = document.createElement('template');
        template.innerHTML = result;

        expect(template.content.querySelector(tagName)?.hasAttribute(attributeName)).toBe(true);
      }
    }
  });

  it('unwraps unsupported HTML tags unless GitHub removes their contents', () => {
    const result = sanitizeHtml(
      '<object><p>fallback</p></object><embed><span>child</span></embed><svg><text>hidden</text></svg><math><mi>x</mi></math>',
    );

    expect(result).toContain('<p>fallback</p>');
    expect(result).toContain('<span>child</span>');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    expect(result).not.toContain('hidden');
    expect(result).not.toContain('<math');
    expect(result).not.toContain('<mi');
  });

  it('renders and preserves supported inline raw HTML from markdown notes', async () => {
    const markdown = 'Press <kbd>Ctrl</kbd> and read <abbr title="HyperText Markup Language">HTML</abbr>.';

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.innerHTML).toContain('<kbd>Ctrl</kbd>');
    expect(result.dom.querySelector('abbr')?.getAttribute('title')).toBe('HyperText Markup Language');
    expect(result.persisted).toBe(markdown);
  });

  it('renders editor-style inline HTML examples from markdown notes', async () => {
    const markdown = [
      '<span style="color:red">This is red</span>',
      '<ruby>漢<rt>ㄏㄢˋ</rt></ruby>',
      '<kbd>Ctrl</kbd>+<kbd>F9</kbd>',
      '<span style="font-size:2rem; background:yellow;">**Bigger**</span>',
    ].join('\n\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('span[style]')?.getAttribute('style')).toBe('color: red');
    expect(result.dom.querySelector('ruby rt')?.textContent).toBe('ㄏㄢˋ');
    expect(Array.from(result.dom.querySelectorAll('kbd')).map((node) => node.textContent)).toEqual(['Ctrl', 'F9']);
    expect(result.dom.innerHTML).toContain('<strong>Bigger</strong>');
    expect(result.persisted).toBe([
      '<span style="color:red">This is red</span>',
      '<ruby>漢<rt>ㄏㄢˋ</rt></ruby>',
      '<kbd>Ctrl</kbd>+<kbd>F9</kbd>',
      '<span style="font-size:2rem; background:yellow;"><strong>Bigger</strong></span>',
    ].join('\n\n'));
  });

  it('renders and preserves supported block raw HTML from markdown notes', async () => {
    const markdown = '<details open><summary>Tips</summary><p>Body</p></details>';

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(result.dom.querySelector('summary')?.textContent).toBe('Tips');
    expect(result.dom.querySelector('details p')?.textContent).toBe('Body');
    expect(result.persisted).toBe(markdown);
  });

  it('renders and preserves public remote image sources from raw HTML', async () => {
    const markdown = '<img src="https://example.com/tracker.png" alt="tracker">';

    const result = await openGithubHtmlMarkdown(markdown);
    const image = result.dom.querySelector('img');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://example.com/tracker.png');
    expect(image?.getAttribute('alt')).toBe('tracker');
    expect(result.persisted).toContain('https://example.com/tracker.png');
  });

  it('renders public remote images inside raw HTML table sponsors', async () => {
    const markdown = [
      '<table>',
      '  <thead>',
      '    <tr>',
      '      <th align="center" style="width: 80px;">',
      '        <a href="https://www.compshare.cn/?utm_source=otherdsp">',
      '          <img src="https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/ucloud.png" width="60px"><br>',
      '          <sub>UCloud</sub><br>',
      '          <sub>超值的GPU云服务</sub>',
      '        </a>',
      '      </th>',
      '    </tr>',
      '  </thead>',
      '</table>',
    ].join('\n');

    const result = await openGithubHtmlMarkdown(markdown);
    const image = result.dom.querySelector('table th a img');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/ucloud.png');
    expect(image?.getAttribute('width')).toBe('60px');
    expect(result.dom.querySelector('table th a sub')?.textContent).toBe('UCloud');
  });

  it('keeps single-line GFM HTML blocks separate from inline raw HTML', async () => {
    const blockResult = await openGithubHtmlMarkdown('<div><p>Block</p></div>');
    const inlineResult = await openGithubHtmlMarkdown('Press <kbd>Ctrl</kbd>.');

    expect(blockResult.dom.querySelector('div[data-type="html-block"] p')?.textContent).toBe('Block');
    expect(blockResult.persisted).toBe('<div><p>Block</p></div>');
    expect(inlineResult.dom.querySelector('span[data-type="html"] kbd')?.textContent).toBe('Ctrl');
    expect(inlineResult.dom.querySelector('div[data-type="html-block"] kbd')).toBeNull();
    expect(inlineResult.persisted).toBe('Press <kbd>Ctrl</kbd>.');
  });

  it('renders and preserves multiline GitHub-supported HTML blocks from markdown notes', async () => {
    const markdown = ['<pre>', 'raw', '</pre>'].join('\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('pre')?.textContent).toContain('raw');
    expect(result.persisted).toBe(markdown);
  });

  it('renders and preserves GFM type-7 HTML blocks for supported inline tags', async () => {
    const markdown = ['<abbr title="HyperText Markup Language">', 'HTML', '</abbr>'].join('\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('abbr')?.getAttribute('title')).toBe('HyperText Markup Language');
    expect(result.dom.querySelector('abbr')?.textContent).toContain('HTML');
    expect(result.persisted).toBe(markdown);
  });

  it('sanitizes unsupported GFM HTML block wrappers while preserving their markdown source', async () => {
    const markdown = [
      '<section>',
      '*literal emphasis markers*',
      '</section>',
      '',
      '<form>',
      '**literal strong markers**',
      '</form>',
    ].join('\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('section')).toBeNull();
    expect(result.dom.querySelector('form')).toBeNull();
    expect(result.dom.querySelector('em')).toBeNull();
    expect(result.dom.querySelector('strong')).toBeNull();
    expect(result.dom.textContent).toContain('*literal emphasis markers*');
    expect(result.dom.textContent).toContain('**literal strong markers**');
    expect(result.persisted).toContain('<section>');
    expect(result.persisted).toContain('<form>');
    expect(result.persisted).toContain('*literal emphasis markers*');
    expect(result.persisted).toContain('**literal strong markers**');
  });

  it('keeps raw HTML block text literal across all seven GFM start conditions', async () => {
    const cases = [
      ['<pre>', '*literal emphasis markers*', '</pre>'].join('\n'),
      ['<!--', '*literal emphasis markers*', '-->'].join('\n'),
      ['<?github', '*literal emphasis markers*', '?>'].join('\n'),
      ['<!A', '*literal emphasis markers*', '>'].join('\n'),
      ['<![CDATA[', '*literal emphasis markers*', ']]>'].join('\n'),
      ['<section>', '*literal emphasis markers*', '</section>'].join('\n'),
      ['<custom>', '*literal emphasis markers*', '</custom>'].join('\n'),
    ];

    for (const markdown of cases) {
      const result = await openGithubHtmlMarkdown(markdown);

      expect(result.dom.querySelector('em')).toBeNull();
      expect(result.persisted).toBe(markdown);
    }
  });

  it('renders and preserves GitHub-supported source HTML blocks from markdown notes', async () => {
    const markdown = '<source srcset="images/a.webp 1x">\n';

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('source')?.getAttribute('srcset')).toBe('images/a.webp 1x');
    expect(result.persisted).toBe('<source srcset="images/a.webp 1x">');
  });

  it('unwraps unsupported GFM search HTML blocks while preserving literal text', async () => {
    const markdown = '<search>Find *literal emphasis markers*\n</search>';

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('em')).toBeNull();
    expect(result.dom.textContent).toContain('Find *literal emphasis markers*');
    expect(result.persisted).toBe(markdown);
  });

  it('renders authored comments literally while preserving sanitizer-only markdown source', async () => {
    const markdown = [
      '<!-- hidden comment -->',
      '<!doctype html>',
      '<svg><text>hidden</text></svg>',
      '<meta name="x" content="y">',
    ].join('\n\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.textContent).toContain('<!-- hidden comment -->');
    expect(result.dom.textContent).not.toContain('doctype');
    expect(result.dom.textContent).not.toContain('hidden</text>');
    expect(result.dom.querySelector('svg')).toBeNull();
    expect(result.dom.querySelector('meta')).toBeNull();
    expect(result.dom.querySelector('[data-type="html-block"].md-htmlblock-literal-text')?.textContent).toBe('<!-- hidden comment -->');
    expect(result.persisted).toContain('<!-- hidden comment -->');
    expect(result.persisted).toContain('<!doctype html>');
    expect(result.persisted).toContain('<meta');
    expect(result.persisted).toContain('<svg');
    expect(result.persisted).toContain('hidden</text>');
  });

  it('keeps malformed sanitizer-only raw HTML active across parser-promoted siblings', async () => {
    const markdown = [
      '<svg <img src="https://example.com/hidden.png">',
      '<img src="https://example.com/leaked.png">',
      '</svg>',
      '<img src="https://example.com/real.png">',
    ].join('\n\n');

    const result = await openGithubHtmlMarkdown(markdown);
    const srcs = Array.from(result.dom.querySelectorAll('img'))
      .map((image) => image.getAttribute('src'))
      .filter((src): src is string => Boolean(src));

    expect(srcs).toEqual(['https://example.com/real.png']);
    expect(result.dom.innerHTML).not.toContain('hidden.png');
    expect(result.dom.innerHTML).not.toContain('leaked.png');
  });

  it('applies GFM tagfilter when rendering nested disallowed raw HTML', async () => {
    const markdown = [
      '<strong> <title> <style> <em>',
      '',
      '<blockquote>',
      '  <xmp> is disallowed.  <XMP> is also disallowed.',
      '</blockquote>',
    ].join('\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('strong')).not.toBeNull();
    expect(result.dom.querySelector('em')).not.toBeNull();
    expect(result.dom.querySelector('blockquote')).not.toBeNull();
    expect(result.dom.querySelector('title')).toBeNull();
    expect(result.dom.querySelector('style')).toBeNull();
    expect(result.dom.querySelector('xmp')).toBeNull();
    expect(result.dom.textContent).toContain('<title>');
    expect(result.dom.textContent).toContain('<style>');
    expect(result.dom.textContent).toContain('<xmp>');
    expect(result.persisted).toContain('<style>');
    expect(result.persisted).toContain('<xmp>');
    expect(result.persisted).toContain('<XMP>');
  });

  it('renders iframe raw HTML in a sandbox when opening notes', async () => {
    const markdown = '<iframe src="https://example.com/embed"></iframe>';

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com/embed');
    expect(result.dom.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(result.dom.querySelector('iframe')?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(result.persisted).toBe(markdown);
  });

  it('renders video and audio raw HTML from markdown notes', async () => {
    const markdown = [
      '<video src="xxx.mp4" controls />',
      '<audio src="xxx.mp3" controls />',
    ].join('\n\n');

    const result = await openGithubHtmlMarkdown(markdown);

    expect(result.dom.querySelector('video')?.getAttribute('src')).toBe('xxx.mp4');
    expect(result.dom.querySelector('video')?.hasAttribute('controls')).toBe(true);
    expect(result.dom.querySelector('audio')?.getAttribute('src')).toBe('xxx.mp3');
    expect(result.dom.querySelector('audio')?.hasAttribute('controls')).toBe(true);
    expect(result.persisted).toBe(markdown);
  });
});
