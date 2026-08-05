import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { sanitizeHtml } from './sanitizer';

describe('sanitizeHtml', () => {
  it('removes script tags and inline event handlers', () => {
    const result = sanitizeHtml(
      '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(1)</script><p onload="evil()">ok</p>',
    );

    expect(result).toContain('<img src="https://example.com/a.png">');
    expect(result).toContain('<p>ok</p>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert(1)');
  });

  it('preserves the authored newline after an opening pre tag', () => {
    expect(sanitizeHtml(['<pre>', '- not a list', '', '- still pre', '</pre>'].join('\n'))).toBe(
      ['<pre>', '- not a list', '', '- still pre', '</pre>'].join('\n'),
    );
  });

  it('keeps safe attributes while removing id class and data attributes', () => {
    const result = sanitizeHtml(
      '<p class="x" id="y" role="note" data-test="z">safe</p><div itemscope itemtype="schema/Thing" data-token="1">thing</div>',
    );

    expect(result).toContain('<p role="note">safe</p>');
    expect(result).toContain('<div itemscope="" itemtype="schema/Thing">thing</div>');
    expect(result).not.toContain('id=');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('data-test');
    expect(result).not.toContain('data-token');
  });

  it('does not return unsanitized html when sanitizer setup fails', () => {
    const createElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'template') {
        throw new Error('template unavailable');
      }
      return createElement(tagName, options);
    });

    try {
      expect(sanitizeHtml('<img src="javascript:alert(1)" onerror="alert(1)">')).toBe('');
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('keeps iframe embeds in a forced sandbox', () => {
    const result = sanitizeHtml(
      '<iframe src="https://example.com/embed" srcdoc="<script>alert(1)</script>" allowfullscreen referrerpolicy="unsafe-url"></iframe>',
    );

    expect(result).toContain('src="https://example.com/embed"');
    expect(result).toContain('allowfullscreen=""');
    expect(result).toContain('sandbox="allow-scripts"');
    expect(result).toContain('referrerpolicy="no-referrer"');
    expect(result).not.toContain('srcdoc');
    expect(result).not.toContain('alert(1)');
    expect(result).not.toContain('unsafe-url');
  });

  it('rejects dangerous iframe sources including javascript and localhost', () => {
    expect(sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://localhost:3000/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://127.0.0.1:3000/embed"></iframe>')).toBe('');
  });

  it('rejects dangerous links and image sources', () => {
    const result = sanitizeHtml(
      '<a href="javascript:alert(1)" target="_blank">bad</a><a href="//example.com/path">protocol</a><img src="javascript:alert(1)"><a href="#anchor">anchor</a>',
    );

    expect(result).toContain('<a>bad</a>');
    expect(result).toContain('<a>protocol</a>');
    expect(result).toContain('<img>');
    expect(result).toContain('<a href="#anchor">anchor</a>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('//example.com');
  });

  it('blocks local-network raw HTML links during editor sanitization', () => {
    const result = sanitizeHtml([
      '<a href="http://127.0.0.1:3000/admin">local</a>',
      '<a href="http://router/admin">router</a>',
      '<a href="https://example.com/docs">public</a>',
      '<a href="/docs/readme">root</a>',
    ].join(''));

    expect(result).toBe([
      '<a>local</a>',
      '<a>router</a>',
      '<a href="https://example.com/docs">public</a>',
      '<a href="/docs/readme">root</a>',
    ].join(''));
  });

  it('keeps constrained editor-style inline styles while dropping executable CSS', () => {
    const result = sanitizeHtml(
      [
        '<span style="color:red; font-size:2rem; background:yellow;',
        'background-image:url(javascript:alert(1));',
        "background:image-set('https://example.test/image-set.png' 1x);",
        "background:-webkit-image-set('https://example.test/webkit-image-set.png' 1x);",
        'border:u\\72l(https://example.test/a.png);',
        'margin:u/**/rl(https://example.test/a.png);',
        'padding:exp\\72 ession(alert(1));',
        'position:fixed">x</span>',
      ].join(''),
    );

    expect(result).toBe('<span style="color: red; font-size: 2rem; background: yellow">x</span>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('example.test');
    expect(result).not.toContain('image-set');
    expect(result).not.toContain('expression');
    expect(result).not.toContain('position');
  });

  it('keeps authored presentation styles outside the clipboard-specific pipeline', () => {
    expect(sanitizeHtml(
      '<span style="display:none; opacity:0; color:red">authored</span>',
    )).toBe(
      '<span style="display: none; opacity: 0; color: red">authored</span>',
    );
  });

  it('keeps video and audio media tags with safe sources', () => {
    const result = sanitizeHtml(
      '<video src="xxx.mp4" controls poster="poster.png"></video><audio src="xxx.mp3" controls></audio>',
    );

    expect(result).toBe('<video src="xxx.mp4" controls="" poster="poster.png"></video><audio src="xxx.mp3" controls=""></audio>');
  });

  it('drops media tags that only contain unsafe sources after sanitizing', () => {
    const result = sanitizeHtml(
      '<video><source src="javascript:alert(1)" type="video/mp4"></video><audio><source src="http://127.0.0.1:3000/a.mp3"></audio>',
    );

    expect(result).toBe('');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('127.0.0.1');
  });

  it('keeps safe links while stripping unsupported target attributes', () => {
    const result = sanitizeHtml('<a href="https://example.com" target="_blank" rel="nofollow">safe</a>');

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="nofollow"');
    expect(result).not.toContain('target=');
  });

  it('blocks protocol obfuscation attempts in links and iframes', () => {
    const result = sanitizeHtml([
      '<a href="JaVaScRiPt:alert(1)">mixed-case</a>',
      '<a href="java&#x73;cript:alert(1)">entity</a>',
      '<iframe src="java&#x73;cript:alert(1)"></iframe>',
      '<iframe src="HTTPS://example.com/embed"></iframe>',
    ].join(''));

    expect(result).toContain('<a>mixed-case</a>');
    expect(result).toContain('<a>entity</a>');
    expect(result).toContain('<iframe src="HTTPS://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
    expect(result).not.toContain('javascript:');
  });

  it('strips data urls and svg payloads from image src attributes', () => {
    const result = sanitizeHtml([
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
      '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+">',
      '<img src="data:image/png;base64,QUJDRA==">',
    ].join(''));

    expect(result).toBe('<img><img><img>');
    expect(result).not.toContain('data:text/html');
    expect(result).not.toContain('image/svg+xml');
  });

  it('rejects scheme-bearing media urls even when plain relatives are allowed', () => {
    const result = sanitizeHtml([
      '<img src="blob:https://example.com/image">',
      '<img src="data:image/png;base64,QUJDRA==">',
      '<img src="mailto:user@example.com">',
      '<img src="images/safe.png">',
      '<source srcset="blob:https://example.com/image 1x">',
      '<source srcset="images/safe.webp 1x">',
    ].join(''));

    expect(result).toBe('<img><img><img><img src="images/safe.png"><source><source srcset="images/safe.webp 1x">');
    expect(result).not.toContain('blob:');
    expect(result).not.toContain('data:');
    expect(result).not.toContain('mailto:');
  });

  it('keeps public remote source srcset candidates', () => {
    const result = sanitizeHtml([
      '<source srcset="https://example.com/safe.webp 1x, //cdn.example.com/safe@2x.webp 2x">',
      '<source srcset="https://user:pass@example.com/secret.webp 1x">',
      '<source srcset="//127.0.0.1:3000/secret.webp 1x">',
    ].join(''));

    expect(result).toBe(
      '<source srcset="https://example.com/safe.webp 1x, https://cdn.example.com/safe@2x.webp 2x"><source><source>',
    );
  });

  it('blocks local-network image sources that would be auto-loaded on open', () => {
    const result = sanitizeHtml([
      '<img src="http://localhost:3000/secret.png">',
      '<img src="http://localhost./secret.png">',
      '<img src="http://assets.localhost/secret.png">',
      '<img src="http://printer.local/secret.png">',
      '<img src="http://router/secret.png">',
      '<img src="http://100.64.0.1/secret.png">',
      '<img src="http://127.0.0.1:3000/secret.png">',
      '<img src="//127.0.0.1:3000/secret.png">',
      '<img src="http://192.168.1.8/secret.png">',
      '<img src="http://[::ffff:7f00:1]/secret.png">',
      '<img src="http://[::7f00:1]/secret.png">',
      '<img src="http://[::ffff:0:7f00:1]/secret.png">',
      String.raw`<img src="http:\127.0.0.1\secret.png">`,
      String.raw`<img src="\\127.0.0.1\secret.png">`,
      '<img src="https://example.com/safe.png">',
    ].join(''));

    expect(result).toBe('<img><img><img><img><img><img><img><img><img><img><img><img><img><img><img src="https://example.com/safe.png">');
  });

  it('blocks credentialed raw HTML URLs', () => {
    const result = sanitizeHtml([
      '<a href="https://user:pass@example.com/private">link</a>',
      '<blockquote cite="https://user:pass@example.com/private">quote</blockquote>',
      '<img src="https://user:pass@example.com/secret.png">',
      '<iframe src="https://user:pass@example.com/embed"></iframe>',
      '<video src="https://user:pass@example.com/movie.mp4" poster="//user:pass@example.com/poster.png"></video>',
      '<source src="https://user:pass@example.com/source.mp4">',
      '<img src="https://example.com/safe.png">',
    ].join(''));

    expect(result).not.toContain('user:pass');
    expect(result).toContain('<a>link</a>');
    expect(result).toContain('<img src="https://example.com/safe.png">');
  });

  it('blocks root-path raw media urls while keeping safe media relatives', () => {
    const result = sanitizeHtml([
      '<img src="/etc/passwd">',
      '<iframe src="/admin"></iframe>',
      '<iframe src="#self"></iframe>',
      '<iframe src="?embed"></iframe>',
      '<iframe src="embed.html"></iframe>',
      '<iframe src="./embed.html"></iframe>',
      '<video poster="/private.png"><source src="/private.mp4"></video>',
      '<img src="./images/safe.png">',
      '<img src="../images/safe.png">',
      '<img src="//example.com/safe.png">',
      '<iframe src="//example.com/embed"></iframe>',
      '<video src="//example.com/demo.mp4" poster="//example.com/poster.png"></video>',
    ].join(''));

    expect(result).toBe('<img><img src="./images/safe.png"><img src="../images/safe.png"><img src="https://example.com/safe.png"><iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><video src="https://example.com/demo.mp4" poster="https://example.com/poster.png"></video>');
  });

  it('blocks raw media paths inside internal note folders while allowing user dot folders', () => {
    const result = sanitizeHtml([
      '<img src=".vlaina/secret.png">',
      '<img src="docs/.git/secret.png">',
      '<img src="docs/.GIT/secret.png">',
      '<img src="%2evlaina/secret.png">',
      '<img src="docs/%252egit/secret.png">',
      '<source srcset=".git/a.webp 1x">',
      '<source srcset="docs/%2Egit/a.webp 1x">',
      '<video poster=".vlaina/poster.png"><source src=".git/movie.mp4"></video>',
      '<img src=".notes/public.png">',
      '<source srcset=".notes/a.webp 1x">',
      '<video poster=".notes/poster.png" src=".notes/movie.mp4"></video>',
    ].join(''));

    expect(result).toBe('<img><img><img><img><img><source><source><img src=".notes/public.png"><source srcset=".notes/a.webp 1x"><video poster=".notes/poster.png" src=".notes/movie.mp4"></video>');
    expect(result).not.toContain('.vlaina');
    expect(result).not.toContain('.git');
    expect(result).not.toContain('%2evlaina');
    expect(result).not.toContain('%252egit');
  });

  it('blocks raw link paths inside internal note folders while allowing user dot folders', () => {
    const result = sanitizeHtml([
      '<a href=".vlaina/workspace.md">vlaina</a>',
      '<a href="./.vlaina/workspace.md">nested vlaina</a>',
      '<a href="docs/.git/config.md">git</a>',
      '<a href="docs/%252egit/config.md">encoded git</a>',
      '<blockquote cite=".vlaina/source.md">quote</blockquote>',
      '<q cite="docs/.GIT/source.md">inline quote</q>',
      '<a href=".notes/public.md">notes</a>',
      '<blockquote cite=".notes/source.md">safe quote</blockquote>',
    ].join(''));

    expect(result).toBe([
      '<a>vlaina</a>',
      '<a>nested vlaina</a>',
      '<a>git</a>',
      '<a>encoded git</a>',
      '<blockquote>quote</blockquote>',
      '<q>inline quote</q>',
      '<a href=".notes/public.md">notes</a>',
      '<blockquote cite=".notes/source.md">safe quote</blockquote>',
    ].join(''));
    expect(result).not.toContain('.vlaina');
    expect(result).not.toContain('.git');
    expect(result).not.toContain('%252egit');
  });

  it('blocks executable and network source srcset values that would be auto-loaded on open', () => {
    const result = sanitizeHtml([
      '<picture><source srcset="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+ 1x"><img src="https://example.com/safe.png"></picture>',
      '<picture><source srcset="//127.0.0.1:3000/secret.png 1x"><img src="https://example.com/safe.png"></picture>',
      '<picture><source srcset="images/descriptor-script.webp 1x javascript:alert(1)"><img src="https://example.com/safe.png"></picture>',
      '<picture><source srcset="images/invalid-descriptor.webp invalid-descriptor"><img src="https://example.com/safe.png"></picture>',
      '<picture><source srcset="safe.webp 1x, safe@2x.webp 2x"><img src="https://example.com/safe.png"></picture>',
      '<picture><source srcset="images/safe.webp 1x, ../images/safe@2x.webp 2x"><img src="https://example.com/safe.png"></picture>',
    ].join(''));

    expect(result).not.toContain('data:image');
    expect(result).not.toContain('127.0.0.1');
    expect(result).not.toContain('javascript:alert');
    expect(result).not.toContain('invalid-descriptor');
    expect(result).toContain('srcset="safe.webp 1x, safe@2x.webp 2x"');
    expect(result).toContain('srcset="images/safe.webp 1x, ../images/safe@2x.webp 2x"');
  });

  it('keeps GitHub-supported wrappers while stripping unsupported wrapper tags', () => {
    const result = sanitizeHtml('<section><div><p>text <strong>bold</strong></p></div></section>');

    expect(result).toBe(' <div><p>text <strong>bold</strong></p></div> ');
  });

  it('keeps iframe embeds while dropping sandbox escalation attempts', () => {
    const result = sanitizeHtml(
      '<iframe src="https://example.com/embed" sandbox="allow-same-origin allow-top-navigation" class="x"></iframe>',
    );

    expect(result).toBe('<iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
    expect(result).not.toContain('allow-same-origin');
    expect(result).not.toContain('allow-top-navigation');
    expect(result).not.toContain('class=');
  });

  it('drops scheme-bearing non-url attributes and sensitive iframe permissions', () => {
    const result = sanitizeHtml([
      '<abbr title="javascript:alert(1)">abbr</abbr>',
      '<abbr title="java&#10;script:alert(1)">wrapped abbr</abbr>',
      '<time datetime="data:text/html,<script>alert(1)</script>">time</time>',
      '<time datetime="da&#9;ta:text/html,<script>alert(1)</script>">wrapped time</time>',
      '<iframe src="https://example.com/embed" allow="fullscreen; camera *; microphone *; clipboard-write; encrypted-media"></iframe>',
    ].join(''));

    expect(result).toContain('<abbr>abbr</abbr>');
    expect(result).toContain('<abbr>wrapped abbr</abbr>');
    expect(result).toContain('<time>time</time>');
    expect(result).toContain('<time>wrapped time</time>');
    expect(result).toContain('allow="fullscreen; clipboard-write; encrypted-media"');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('java\nscript');
    expect(result).not.toContain('data:text/html');
    expect(result).not.toContain('camera');
    expect(result).not.toContain('microphone');
  });

  it('drops loadable url attributes outside tag-specific allowlists', () => {
    const result = sanitizeHtml([
      '<div action="/submit">div</div>',
      '<span action="relative">span</span>',
      '<img src="https://example.com/safe.png">',
      '<blockquote cite="docs/source.md">quote</blockquote>',
    ].join(''));

    expect(result).toBe(
      '<div>div</div><span>span</span><img src="https://example.com/safe.png"><blockquote cite="docs/source.md">quote</blockquote>',
    );
  });

  it('rejects local-network iframe targets that would reach device services', () => {
    expect(sanitizeHtml('<iframe src="http://0.0.0.0:8080/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[::1]:8080/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://assets.localhost/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://router/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[ff02::1]/embed"></iframe>')).toBe('');
  });

  it('removes event handlers regardless of casing', () => {
    const result = sanitizeHtml('<img src="https://example.com/a.png" oNlOaD="alert(1)"><p OnClIcK="evil()">x</p>');

    expect(result).toBe('<img src="https://example.com/a.png"><p>x</p>');
  });

  it('rejects iframe targets on private network ranges', () => {
    expect(sanitizeHtml('<iframe src="http://10.0.0.5/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://172.20.10.4/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://192.168.1.8/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://169.254.10.2/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[fe80::1]/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[fe90::1]/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[fec0::1]/embed"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://[fd12:3456:789a::1]/embed"></iframe>')).toBe('');
  });

  it('rejects control and bidi characters in urls', () => {
    expect(sanitizeHtml('<a href="java\u0000script:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://example.com/\u202Ecod.exe">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<iframe src="https://example.com/\u0000embed"></iframe>')).toBe('');
  });

  it('unwraps nested unsafe nodes without preserving dangerous descendants', () => {
    const result = sanitizeHtml('<custom><custom><script>alert(1)</script><p>safe</p></custom></custom>');

    expect(result).toBe('<p>safe</p>');
  });

  it('drops parser-promoted descendants from remove-content raw HTML tags', () => {
    const result = sanitizeHtml([
      '<svg><img src="https://example.com/svg.png"></svg>',
      '<math><img src="https://example.com/math.png"></math>',
      '<noscript><img src="https://example.com/noscript.png"></noscript>',
      '<noembed><img src="https://example.com/noembed.png"></noembed>',
      '<noframes><img src="https://example.com/noframes.png"></noframes>',
      '<img src="https://example.com/real.png">',
      '<plaintext><img src="https://example.com/plaintext.png"></plaintext>',
      '<img src="https://example.com/hidden-after-plaintext.png">',
    ].join(''));

    expect(result).toBe('<img src="https://example.com/real.png">');
  });

  it('keeps malformed dropped raw HTML tags from exposing hidden media', () => {
    const result = sanitizeHtml([
      '<svg <img src="https://example.com/svg.png"></svg>',
      '<math <img src="https://example.com/math.png"></math>',
      '<noscript <img src="https://example.com/noscript.png"></noscript>',
      '<img src="https://example.com/real.png">',
      '<script <img src="https://example.com/script.png">',
      '<img src="https://example.com/after-script.png">',
    ].join(''));

    expect(result).toBe('<img src="https://example.com/real.png">');
  });

  it('line-bounds overlong sanitizer-only raw HTML tags', () => {
    const badLine = `<svg data-value="<img src='https://example.com/hidden.png'> ${'x'.repeat(70 * 1024)}`;
    const result = sanitizeHtml([
      badLine,
      '<img src="https://example.com/real.png">',
    ].join('\n'));

    expect(result).toBe('\n<img src="https://example.com/real.png">');
    expect(result).not.toContain('hidden.png');
    expect(result).not.toContain('x'.repeat(1024));
  });

  it('keeps GitHub table attributes while discarding forbidden ones', () => {
    const result = sanitizeHtml(
      '<td width="80" height="40" colspan="2" rowspan="3" class="x" style="color:red" onclick="evil()">cell</td>',
    );

    expect(result).toBe('<td width="80" height="40" colspan="2" rowspan="3" style="color: red">cell</td>');
    expect(result).not.toContain('onclick');
  });

  it('sanitizes realistic rich-html clipboard fragments from web pages', () => {
    const result = sanitizeHtml(`
      <div class="article" data-block="hero">
        <h2 id="headline">Title</h2>
        <p style="color:red" onclick="evil()">copy <strong>this</strong> <a href="https://example.com/post" target="_blank" data-track="1">link</a></p>
        <figure class="media">
          <img src="https://example.com/a.png" alt="cover" width="1200" onerror="alert(1)">
          <figcaption>caption</figcaption>
        </figure>
        <iframe src="https://example.com/embed" sandbox="allow-same-origin allow-scripts" style="border:0"></iframe>
      </div>
    `);

    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<p style="color: red">copy <strong>this</strong> <a href="https://example.com/post">link</a></p>');
    expect(result).toContain('<img src="https://example.com/a.png" alt="cover" width="1200">');
    expect(result).toContain('<iframe src="https://example.com/embed" sandbox="allow-scripts" style="border: 0" referrerpolicy="no-referrer"></iframe>');
    expect(result).toContain('caption');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('data-');
    expect(result).not.toContain('id=');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
  });

  it('sanitizes office-style pasted html without preserving executable payloads', () => {
    const result = sanitizeHtml(`
      <html>
        <body>
          <!--StartFragment-->
          <p class="MsoNormal">Hello <span style="font-weight:bold">world</span></p>
          <o:p>meta wrapper</o:p>
          <xml><script>alert(1)</script></xml>
          <!--EndFragment-->
        </body>
      </html>
    `);

    expect(result).toContain('<p>Hello <span style="font-weight: bold">world</span></p>');
    expect(result).toContain('meta wrapper');
    expect(result).not.toContain('script');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('xml');
  });

  it('remains safe under deep nested wrappers with repeated dangerous attributes', () => {
    const payload = Array.from({ length: 80 }, (_, index) =>
      `<section class="x${index}" data-x="${index}" onclick="evil(${index})">`
    ).join('') + '<p id="target">deep</p>' + '</section>'.repeat(80);

    const result = sanitizeHtml(payload);

    expect(result).toContain('<p>deep</p>');
    expect(result).not.toContain('<section');
    expect(result).not.toContain('id=');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('data-x');
  });

  it('caps pathological nested clipboard html before recursive sanitizing exhausts the stack', () => {
    const payload = `${'<section>'.repeat(250)}<p onclick="evil()">deep</p>${'</section>'.repeat(250)}`;

    expect(() => sanitizeHtml(payload)).not.toThrow();
    expect(sanitizeHtml(payload)).not.toContain('onclick');
  });

  it('caps pathological clipboard html node counts before building unbounded sanitized output', () => {
    const payload = Array.from({ length: 20_050 }, (_, index) =>
      `<span onclick="evil(${index})">x</span>`
    ).join('');

    const result = sanitizeHtml(payload);
    const template = document.createElement('template');
    template.innerHTML = result;

    expect(template.content.querySelectorAll('span')).toHaveLength(10_000);
    expect(result).not.toContain('onclick');
  });

  it('does not rescan sanitized media children after the node budget is exhausted', () => {
    const payload = [
      '<video>',
      '<source src="https://example.com/safe.mp4">',
      '<span>x</span>'.repeat(20_050),
      '</video>',
    ].join('');

    const result = sanitizeHtml(payload);

    expect(result).toBe('');
  });

  it('drops oversized HTML attribute values before expensive sanitizer parsing', () => {
    const oversized = 'x'.repeat(16 * 1024 + 1);
    const manySrcsetCandidates = Array.from({ length: 129 }, (_, index) => `safe-${index}.webp 1x`).join(', ');
    const result = sanitizeHtml([
      `<span style="${oversized}">text</span>`,
      `<a href="${oversized}">link</a>`,
      `<img src="https://example.com/a.png" alt="${oversized}">`,
      `<source srcset="${manySrcsetCandidates}">`,
      `<iframe src="https://example.com/embed" sandbox="${oversized}"></iframe>`,
    ].join(''));
    const template = document.createElement('template');
    template.innerHTML = result;

    expect(template.content.querySelector('span')?.hasAttribute('style')).toBe(false);
    expect(template.content.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(template.content.querySelector('img')?.hasAttribute('alt')).toBe(false);
    expect(template.content.querySelector('source')?.hasAttribute('srcset')).toBe(false);
    expect(template.content.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(result).not.toContain(oversized);
  });

  it('skips oversized clipboard HTML before DOM parsing', () => {
    const payload = `${'x'.repeat(2 * 1024 * 1024 + 1)}<img src="https://example.com/a.png">`;

    expect(sanitizeHtml(payload)).toBe('');
  });

  it('never leaves inline event attributes in sanitized output for generated attribute names', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{3,10}$/),
        (suffix) => {
          const attribute = `on${suffix}`;
          const html = `<p ${attribute}="alert(1)" class="x" data-y="1">safe</p>`;
          const result = sanitizeHtml(html);
          expect(result).toBe('<p>safe</p>');
          expect(result.toLowerCase()).not.toContain(`on${suffix.toLowerCase()}=`);
        },
      ),
      { numRuns: 50 },
    );
  });
});
