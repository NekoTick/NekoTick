import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from '@/components/Chat/common/messageClipboard';

vi.mock('@/components/Chat/common/LocalImage', () => ({
  LocalImage: ({ onResolvedSrc: _onResolvedSrc, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
    alt?: string;
    onResolvedSrc?: (src: string | null) => void;
    src: string;
  }) => (
    <img data-testid="local-image" {...props} alt={props.alt || 'image'} />
  ),
}));

vi.mock('./components/ChatImageViewer', () => ({
  ChatImageViewer: () => null,
}));

import MarkdownRenderer from './MarkdownRenderer';
import { createMarkdownComponents } from './markdownRendererComponents';

describe('MarkdownRenderer images', () => {
  it('removes KaTeX source annotations from read-only markdown output', () => {
    const { container } = render(<MarkdownRenderer content={'Before $x% hidden_secret_marker$ after'} />);

    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('application/x-tex');
    expect(container.innerHTML).not.toContain('hidden_secret_marker');
  });

  it('uses the shared KaTeX macros in read-only markdown output', () => {
    const { container } = render(<MarkdownRenderer content={'$\\R$'} />);

    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.innerHTML).toContain('mathbb');
  });


  it('renders generated base64 image markdown as an image', () => {
    render(<MarkdownRenderer content="![Generated image](<data:image/png;base64,abc123>)" />);

    expect(screen.getByTestId('local-image')).toHaveAttribute('src', 'data:image/png;base64,abc123');
    expect(screen.queryByText('[Image unavailable]')).not.toBeInTheDocument();
  });

  it('compacts large inline base64 image markdown before rendering', () => {
    const src = `data:image/png;base64,${'a'.repeat(60_000)}`;

    render(<MarkdownRenderer content={`![Generated image](<${src}>)`} />);

    expect(screen.getByTestId('local-image')).toHaveAttribute('src', src);
  });

  it('compacts large inline base64 image html before rendering', () => {
    const src = `data:image/png;base64,${'a'.repeat(60_000)}`;

    render(<MarkdownRenderer content={`<img src="${src}" alt="Generated image">`} />);

    expect(screen.getByTestId('local-image')).toHaveAttribute('src', src);
  });

  it('does not render ordinary asset protocol image markdown', () => {
    render(<MarkdownRenderer content="![Generated image](<asset://localhost/image.png>)" />);

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(screen.getByText('[Image unavailable]')).toBeInTheDocument();
  });

  it('does not render relative directory image markdown', () => {
    render(<MarkdownRenderer content="![Generated image](images/demo.png)" />);

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(screen.getByText('[Image unavailable]')).toBeInTheDocument();
  });

  it('still renders legacy unwrapped base64 image markdown', () => {
    render(<MarkdownRenderer content="![Generated image](data:image/png;base64,abc123)" />);

    expect(screen.getByTestId('local-image')).toHaveAttribute('src', 'data:image/png;base64,abc123');
  });

  it('caps markdown image component creation for image-heavy messages', () => {
    const components = createMarkdownComponents({ imageIdBase: 'a1' });
    const renderedImages = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_SOURCES + 2 },
      (_value, index) => components.img({
        alt: `image ${index}`,
        src: `https://example.com/${index}.png`,
      }),
    );

    expect(renderedImages.filter(Boolean)).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_SOURCES);
    expect(renderedImages[MAX_CHAT_MESSAGE_IMAGE_SOURCES]).toBeNull();
    expect(renderedImages[MAX_CHAT_MESSAGE_IMAGE_SOURCES + 1]).toBeNull();
  });

  it('renders Notes inline color and underline markdown through the shared pipeline', () => {
    render(
      <MarkdownRenderer
        content={'++under++ <span style="color: #123456">text</span> <mark style="background-color: var(--note-color)">bg</mark>'}
      />
    );

    expect(screen.getByText('under').tagName.toLowerCase()).toBe('u');
    expect(screen.getByText('text')).toHaveAttribute('data-text-color', '#123456');
    expect(screen.getByText('text')).toHaveStyle({ color: '#123456' });
    expect(screen.getByText('bg').tagName.toLowerCase()).toBe('mark');
    expect(screen.getByText('bg')).toHaveAttribute('data-bg-color', 'var(--note-color)');
    expect(screen.getByText('bg')).toHaveStyle({ backgroundColor: 'var(--note-color)' });
  });

  it('preserves escaped Notes inline mark delimiters as literal text', () => {
    render(<MarkdownRenderer content={'\\==mark== \\++under++ X\\^2^ H\\~2~O'} />);

    expect(screen.getByText('==mark== ++under++ X^2^ H~2~O')).toBeInTheDocument();
    expect(screen.queryByText('mark')).not.toBeInTheDocument();
    expect(screen.queryByText('under')).not.toBeInTheDocument();
  });

  it('drops unsafe declarations from raw color styles instead of reusing arbitrary style payloads', () => {
    render(<MarkdownRenderer content={'<span style="color: red; background-image: url(https://example.com/x.png)">bad</span>'} />);

    expect(screen.getByText('bad').getAttribute('style')).toContain('color: red');
    expect(screen.getByText('bad').getAttribute('style')).not.toContain('background-image');
  });

  it('keeps safe raw style declarations with CSS whitespace around the colon', () => {
    render(<MarkdownRenderer content={'<span style="color : #123456"><em>nested</em></span>'} />);

    expect(screen.getByText('nested').closest('span')).toHaveStyle({ color: '#123456' });
  });

  it('sanitizes raw picture srcset candidates before rendering', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<picture>',
          '<source srcset="//127.0.0.1:3000/secret.png 1x, https://example.com/a.webp 2x">',
          '<img src="https://example.com/fallback.png" alt="fallback">',
          '</picture>',
          '<picture>',
          '<source srcset="images/safe.webp 1x, https://example.com/safe@2x.webp 2x">',
          '<img src="https://example.com/safe.png" alt="safe">',
          '</picture>',
          '<picture>',
          '<source srcset="data:image/png;base64,abc 1x, DATA:IMAGE/WEBP;BASE64,def 2x">',
          '<img src="https://example.com/data.png" alt="data">',
          '</picture>',
        ].join('')}
      />
    );

    const sources = Array.from(container.querySelectorAll('source'));
    expect(sources[0]).not.toHaveAttribute('srcset');
    expect(sources[1]).toHaveAttribute('srcset', 'images/safe.webp 1x, https://example.com/safe@2x.webp 2x');
    expect(sources[2]).toHaveAttribute('srcset', 'data:image/png;base64,abc 1x, data:image/webp;base64,def 2x');
    expect(container.innerHTML).not.toContain('127.0.0.1');
  });

  it('sanitizes raw media URL attributes before rendering', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<video src="http://127.0.0.1:3000/secret.mp4" poster="http://localhost:3000/poster.png" controls></video>',
          '<audio src="javascript:alert(1)" controls></audio>',
          '<picture>',
          '<source src="http://192.168.1.8/secret.webp" srcset="//127.0.0.1:3000/secret.webp 1x">',
          '<img src="https://example.com/fallback.png" alt="fallback">',
          '</picture>',
        ].join('')}
      />
    );

    expect(container.innerHTML).not.toContain('127.0.0.1');
    expect(container.innerHTML).not.toContain('localhost');
    expect(container.innerHTML).not.toContain('192.168.1.8');
    expect(container.innerHTML).not.toContain('javascript:alert');
  });

  it('loads sanitized raw HTML iframes only after explicit user action', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<figure><figcaption>Caption</figcaption></figure>',
          '<time datetime="2026-05-06">today</time><wbr>',
          '<iframe src="https://example.com/embed" sandbox="allow-same-origin allow-scripts" allow="fullscreen; camera *; microphone *; clipboard-write" srcdoc="<script>alert(1)</script>" referrerpolicy="unsafe-url"></iframe>',
          '<iframe src="http://127.0.0.1:3000/admin"></iframe>',
          '<video src="https://example.com/movie.mp4" poster="http://localhost:3000/poster.png" controls></video>',
          '<audio src="http://router/audio.mp3" controls></audio>',
          '<track src="javascript:alert(1)" kind="captions">',
        ].join('')}
      />
    );

    expect(container.querySelector('figure figcaption')).toHaveTextContent('Caption');
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-05-06');
    expect(container.querySelector('wbr')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).not.toContain('https://example.com/embed');

    fireEvent.click(screen.getByRole('button', { name: 'Load remote content' }));

    expect(container.querySelector('iframe[src="https://example.com/embed"]')).toHaveAttribute('sandbox', 'allow-scripts');
    expect(container.querySelector('iframe[src="https://example.com/embed"]')).toHaveAttribute('allow', 'fullscreen');
    expect(container.querySelector('iframe[src="https://example.com/embed"]')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(container.querySelector('iframe[src^="http://127.0.0.1"]')).toBeNull();
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://example.com/movie.mp4');
    expect(container.querySelector('video')).not.toHaveAttribute('poster');
    expect(container.querySelector('audio')).not.toHaveAttribute('src');
    expect(container.querySelector('track')).not.toHaveAttribute('src');
    expect(container.innerHTML).not.toContain('allow-same-origin');
    expect(container.innerHTML).not.toContain('camera');
    expect(container.innerHTML).not.toContain('microphone');
    expect(container.innerHTML).not.toContain('unsafe-url');
    expect(container.innerHTML).not.toContain('srcdoc');
    expect(container.innerHTML).not.toContain('localhost');
    expect(container.innerHTML).not.toContain('router');
    expect(container.innerHTML).not.toContain('javascript:alert');
  });

  it('renders video markdown outside paragraph elements', () => {
    const { container } = render(
      <MarkdownRenderer content={'![video](https://example.com/movie.mp4)'} />
    );

    const videoBlock = container.querySelector('.video-block');
    expect(videoBlock).toBeInTheDocument();
    expect(videoBlock?.closest('p')).toBeNull();
  });

  it('drops dangerous schemes from non-url raw HTML attributes', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<abbr title="javascript:alert(1)" aria-label="data:text/html,<script>alert(1)</script>">abbr</abbr>',
          '<abbr title="java&#10;script:alert(1)" aria-label="da&#9;ta:text/html,<script>alert(1)</script>">wrapped abbr</abbr>',
          '<time datetime="data:text/html,<script>alert(1)</script>">time</time>',
          '<time datetime="da&#9;ta:text/html,<script>alert(1)</script>">wrapped time</time>',
          '<span title="safe text">safe</span>',
        ].join('')}
      />
    );

    expect(container.querySelector('abbr')).not.toHaveAttribute('title');
    expect(container.querySelector('abbr')).not.toHaveAttribute('aria-label');
    expect(container.querySelectorAll('abbr')[1]).not.toHaveAttribute('title');
    expect(container.querySelectorAll('abbr')[1]).not.toHaveAttribute('aria-label');
    expect(container.querySelectorAll('time')[0]).not.toHaveAttribute('datetime');
    expect(container.querySelectorAll('time')[1]).not.toHaveAttribute('datetime');
    expect(container.querySelector('span')).toHaveAttribute('title', 'safe text');
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.innerHTML).not.toContain('data:text/html');
  });

  it('keeps safe relative raw HTML media sources in read-only markdown', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<video src="media/demo.mp4" controls><source src="media/fallback.webm" type="video/webm"><track src="media/captions.vtt" kind="captions"></video>',
          '<audio src="./media/demo.mp3" controls></audio>',
        ].join('')}
      />
    );

    expect(container.querySelector('video')).toHaveAttribute('src', 'media/demo.mp4');
    expect(container.querySelector('video source')).toHaveAttribute('src', 'media/fallback.webm');
    expect(container.querySelector('video track')).toHaveAttribute('src', 'media/captions.vtt');
    expect(container.querySelector('audio')).toHaveAttribute('src', './media/demo.mp3');
  });

  it('drops document-relative raw HTML iframe sources and gates protocol-relative sources', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<iframe src="#self"></iframe>',
          '<iframe src="?embed"></iframe>',
          '<iframe src="embed.html"></iframe>',
          '<iframe src="./embed.html"></iframe>',
          '<iframe src="//example.com/embed"></iframe>',
        ].join('')}
      />
    );

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Load remote content' }));
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://example.com/embed');
    expect(container.innerHTML).not.toContain('#self');
    expect(container.innerHTML).not.toContain('?embed');
    expect(container.innerHTML).not.toContain('embed.html');
  });

  it('drops internal relative raw HTML media paths in read-only markdown', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<img src=".vlaina/private.png" alt="hidden">',
          '<img src="docs/.GIT/private.png" alt="hidden">',
          '<picture>',
          '<source src=".vlaina/private.webp" srcset="docs/%252egit/private.webp 1x">',
          '<img src=".notes/safe.png" alt="safe">',
          '</picture>',
          '<video poster="%2evlaina/private.png"><source src="docs/.git/private.mp4"></video>',
          '<track src=".vlaina/private.vtt" kind="captions">',
        ].join('')}
      />
    );

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(container.querySelector('source')).not.toHaveAttribute('src');
    expect(container.querySelector('source')).not.toHaveAttribute('srcset');
    expect(container.querySelector('video')).not.toHaveAttribute('poster');
    expect(container.querySelector('video source')).not.toHaveAttribute('src');
    expect(container.querySelector('track')).not.toHaveAttribute('src');
    expect(container.innerHTML).not.toContain('.vlaina');
    expect(container.innerHTML).not.toContain('.GIT');
    expect(container.innerHTML).not.toContain('%2evlaina');
    expect(container.innerHTML).not.toContain('%252egit');
  });

  it('does not render images nested inside raw html dropped by the sanitizer', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<svg><image href="https://example.com/svg.png"></image></svg>',
          '<noscript><img src="https://example.com/noscript.png"></noscript>',
          '<math><img src="https://example.com/math.png"></math>',
          '<noembed><img src="https://example.com/noembed.png"></noembed>',
          '<noframes><img src="https://example.com/noframes.png"></noframes>',
          '<img src="https://example.com/real.png" alt="real">',
          '<plaintext><img src="https://example.com/plaintext.png"></plaintext>',
        ].join('\n')}
      />
    );

    expect(screen.getAllByTestId('local-image')).toHaveLength(1);
    expect(screen.getByTestId('local-image')).toHaveAttribute('src', 'https://example.com/real.png');
    expect(container.textContent).toContain('<noembed>');
    expect(container.textContent).toContain('<noframes>');
    expect(container.textContent).toContain('<plaintext>');
  });

  it('does not render images hidden inside malformed dropped raw html tags', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<svg <img src="https://example.com/svg.png"></svg>',
          '<math <img src="https://example.com/math.png"></math>',
          '<noscript <img src="https://example.com/noscript.png"></noscript>',
          '<img src="https://example.com/real.png" alt="real">',
          '<script <img src="https://example.com/script.png">',
          '<img src="https://example.com/after-script.png" alt="after">',
        ].join('\n')}
      />
    );

    expect(screen.getAllByTestId('local-image')).toHaveLength(1);
    expect(screen.getByTestId('local-image')).toHaveAttribute('src', 'https://example.com/real.png');
    expect(container.querySelector('img[src="https://example.com/script.png"]')).toBeNull();
    expect(container.querySelector('img[src="https://example.com/after-script.png"]')).toBeNull();
  });

  it('sanitizes raw cite URL attributes before rendering', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '<q cite="//example.com/protocol-relative">protocol</q>',
          '<q cite="javascript:alert(1)">script</q>',
          '<q cite="https://example.com/source">safe</q>',
        ].join(' ')}
      />
    );

    const quotes = Array.from(container.querySelectorAll('q'));
    expect(quotes[0]).toHaveAttribute('cite', 'https://example.com/protocol-relative');
    expect(quotes[1]).not.toHaveAttribute('cite');
    expect(quotes[2]).toHaveAttribute('cite', 'https://example.com/source');
    expect(container.innerHTML).not.toContain('javascript:alert');
  });

  it('strips arbitrary raw div data attributes from read-only markdown', () => {
    const { container } = render(
      <MarkdownRenderer content={'<div data-token="hidden_secret_marker" data-track="1">safe div</div>'} />
    );

    const div = screen.getByText('safe div');
    expect(div.tagName.toLowerCase()).toBe('div');
    expect(div).not.toHaveAttribute('data-token');
    expect(div).not.toHaveAttribute('data-track');
    expect(container.innerHTML).not.toContain('hidden_secret_marker');
  });

  it('reuses Notes image width, alignment, and crop attributes safely', () => {
    render(
      <MarkdownRenderer
        content={'<img src="https://example.com/a.png" alt="diagram" width="66%" align="right" data-vlaina-crop="1,2,80,90,1.5" />'}
      />
    );

    expect(screen.getByTestId('local-image')).toHaveStyle({ width: '66%' });
    expect(screen.getByTestId('local-image')).toHaveAttribute('data-vlaina-crop', '1.000000,2.000000,80.000000,90.000000,1.500000');
    expect(screen.getByTestId('local-image').parentElement?.parentElement).toHaveClass('justify-end');
  });

  it('reuses Notes block alignment comments for read-only markdown', () => {
    render(<MarkdownRenderer content={'Aligned paragraph\n\n<!--align:center-->'} />);

    expect(screen.getByText('Aligned paragraph')).toHaveAttribute('data-text-align', 'center');
    expect(screen.getByText('Aligned paragraph')).toHaveStyle({ textAlign: 'center' });
  });

  it('reuses Notes abbreviation definitions for read-only markdown', () => {
    render(<MarkdownRenderer content={'*[HTML]: Hyper Text Markup Language\n\nHTML works.'} />);

    expect(screen.getByText('HTML')).toHaveAttribute('title', 'Hyper Text Markup Language');
    expect(screen.getByText('HTML').tagName.toLowerCase()).toBe('abbr');
    expect(screen.queryByText(/\*\[HTML\]/)).not.toBeInTheDocument();
  });

  it('preserves escaped Notes block shortcut markdown as literal text', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'\\*[HTML]: Hyper Text Markup Language\n\nHTML works.\n\n\\[TOC]\n\nTerm\n\\: Definition'}
      />
    );

    expect(container).toHaveTextContent('*[HTML]: Hyper Text Markup Language');
    expect(container).toHaveTextContent('HTML works.');
    expect(container).toHaveTextContent('[TOC]');
    expect(container).toHaveTextContent('Term');
    expect(container).toHaveTextContent(': Definition');
    expect(screen.queryByText('HTML')?.tagName.toLowerCase()).not.toBe('abbr');
    expect(screen.queryByText('TOC', { selector: 'a' })).not.toBeInTheDocument();
    expect(container.querySelector('dl')).not.toBeInTheDocument();
  });

  it('reuses Notes TOC shortcuts for read-only markdown', () => {
    const { container } = render(<MarkdownRenderer content={'[TOC]\n\n## Alpha\n\n### Beta'} />);

    const alphaLink = screen.getByText('Alpha', { selector: 'a' });
    const alphaHeading = screen.getByText('Alpha', { selector: 'h2' });
    expect(alphaLink).toHaveAttribute('href', `#${alphaHeading.id}`);
    expect(screen.getByText('Beta', { selector: 'a' })).toHaveClass('toc-link');
    expect(alphaHeading).toHaveAttribute('id');
    expect(container.querySelector('.toc-block')).toHaveAttribute('data-type', 'toc');
  });

  it('reuses Notes callout blockquotes for read-only markdown', () => {
    const { container } = render(<MarkdownRenderer content={'> 💡 Tip body'} />);

    expect(container.querySelector('.callout')).toHaveAttribute('data-type', 'callout');
    expect(container.querySelector('.callout-icon')).toHaveTextContent('💡');
    expect(screen.getByText('Tip body')).toBeInTheDocument();
  });

  it('keeps ordinary read-only blockquotes from being parsed as callouts', () => {
    const { container } = render(
      <MarkdownRenderer content={'> 1. Keep this quoted\n\n> Note: also quoted\n\n> © Copyright\n\n> ™ Trademark'} />
    );

    expect(container.querySelector('.callout')).not.toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
    expect(container).toHaveTextContent('Keep this quoted');
    expect(container).toHaveTextContent('Note: also quoted');
    expect(container).toHaveTextContent('© Copyright');
    expect(container).toHaveTextContent('™ Trademark');
  });

  it('reuses Notes pseudo definition list rendering for read-only markdown', () => {
    render(<MarkdownRenderer content={'Term\n: Definition'} />);

    expect(screen.getByText('Term').tagName.toLowerCase()).toBe('dt');
    expect(screen.getByText('Definition').closest('dd')).toHaveClass('definition-desc');
  });
});
