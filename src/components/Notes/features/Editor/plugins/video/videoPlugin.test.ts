import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Editor,
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { useUIStore } from '@/stores/uiSlice';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { autoPairPlugin } from '../pairs/autoPairPlugin';
import {
  isSupportedVideoUrl,
  normalizeVideoUrlInput,
  parseVideoUrl,
  sanitizeVideoUrlInput,
  sanitizeVideoDebugPayload,
} from './index';
import { createVideoDom, getVideoElementAttrs, refreshVideoDomI18n } from './videoDom';
import { remarkVideoImages } from './videoMarkdown';
import { insertVideoCommand, videoPlugin } from './videoPlugin';

async function serializeVideoNode(src: string, title = '') {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '');
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark);

  for (const plugin of videoPlugin) {
    editor.use(plugin);
  }

  await editor.create();
  const schema = editor.ctx.get(editorViewCtx).state.schema;
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.video.create({ src, title }),
  ]);
  const markdown = editor.ctx.get(serializerCtx)(doc).trim();
  await editor.destroy();
  return markdown;
}

function findFirstVideoNode(doc: any) {
  let video: any = null;
  doc.descendants((node: any) => {
    if (node.type.name !== 'video') return true;
    video = node;
    return false;
  });
  return video;
}

function typeText(view: EditorView, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, text) || handled;
      return handled;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  }
}

function createVideoImageParagraph() {
  return {
    type: 'paragraph',
    children: [{
      type: 'image',
      url: 'https://example.com/video.mp4',
      alt: 'video',
      title: '',
    }],
  };
}

function createDeepVideoMarkdownTree(leaf: any) {
  let current = leaf;
  for (let index = 0; index < 205; index += 1) {
    current = {
      type: 'blockquote',
      children: [current],
    };
  }
  return {
    type: 'root',
    children: [current],
  };
}

describe('videoPlugin URL support', () => {
  beforeEach(() => {
    useUIStore.setState({ languagePreference: 'en' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('supports youtube, bilibili, and direct video URLs', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://www.youtube.com/watch?si=abc&v=dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://www.youtube.com/v/dQw4w9WgXcQ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1xx411c7mD&p=1&danmaku=0&autoplay=0',
    });
    expect(parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD?p=2')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1xx411c7mD&p=2&danmaku=0&autoplay=0',
    });
    expect(parseVideoUrl('https://www.bilibili.com/video/BV1KPJx6NEtQ/?spm_id_from=333.1007.tianma.1-1-1.click&vd_source=secret')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1KPJx6NEtQ&p=1&danmaku=0&autoplay=0',
    });
    expect(parseVideoUrl('https://player.bilibili.com/player.html?isOutside=true&aid=123&bvid=BV1xx411c7mD&cid=456&p=2')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1xx411c7mD&p=2&danmaku=0&autoplay=0&aid=123&cid=456',
    });
    expect(parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD?p=1e2')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1xx411c7mD&p=1&danmaku=0&autoplay=0',
    });
    expect(parseVideoUrl('https://player.bilibili.com/player.html?isOutside=true&aid=0x7b&bvid=BV1xx411c7mD&cid=456&p=0x2')).toEqual({
      type: 'bilibili',
      embedUrl: 'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1xx411c7mD&p=1&danmaku=0&autoplay=0&cid=456',
    });
    expect(parseVideoUrl('https://example.com/video.webm?token=1')).toEqual({
      type: 'direct',
      embedUrl: 'https://example.com/video.webm?token=1',
    });
  });

  it('rejects non-video URLs instead of creating a blank embed', () => {
    expect(isSupportedVideoUrl('https://example.com/article')).toBe(false);
    expect(isSupportedVideoUrl('https://example.com/path/bilibili.com/video/BV1xx411c7mD')).toBe(false);
    expect(isSupportedVideoUrl('https://example.com/?next=https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false);
  });

  it('rejects local file and private-network direct video URLs', () => {
    expect(parseVideoUrl('file:///tmp/secret.mp4')).toBeNull();
    expect(parseVideoUrl('data:video/mp4;base64,AAAA')).toBeNull();
    expect(parseVideoUrl('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoUrl('file://bilibili.com/video/BV1xx411c7mD')).toBeNull();
    expect(parseVideoUrl('https://user:pass@example.com/video.mp4')).toBeNull();
    expect(parseVideoUrl('https://127.0.0.1@example.com/video.mp4')).toBeNull();
    expect(parseVideoUrl('https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoUrl('http://localhost:3000/secret.mp4')).toBeNull();
    expect(parseVideoUrl('http://127.0.0.1:3000/secret.mp4')).toBeNull();
    expect(parseVideoUrl('http://192.168.1.8/secret.mp4')).toBeNull();
    expect(parseVideoUrl('http://10.0.0.5/secret.webm')).toBeNull();
    expect(parseVideoUrl('http://[::ffff:7f00:1]/secret.webm')).toBeNull();
    expect(parseVideoUrl(String.raw`https:\example.com\video.mp4`)).toBeNull();
    expect(parseVideoUrl(String.raw`https\://example.com/video.mp4`)).toBeNull();
    expect(parseVideoUrl(String.raw`https://example.com\@evil.test/video.mp4`)).toBeNull();
  });

  it('normalizes pasted URLs and rejects log blobs', () => {
    expect(normalizeVideoUrlInput('  https://www.bilibili.com/video/BV1xx411c7mD  ')).toBe(
      'https://www.bilibili.com/video/BV1xx411c7mD'
    );
    expect(parseVideoUrl('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ')).toEqual({
      type: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0',
    });
    expect(isSupportedVideoUrl('[2026-05-03T12:41:17.327Z] chatScroll:programmatic-scroll {\n  "scrollTop": 1012\n}')).toBe(false);
    expect(isSupportedVideoUrl(`https://example.com/${'a'.repeat(2050)}.mp4`)).toBe(false);
    expect(isSupportedVideoUrl('https://example.com/\u202Ecod.mp4')).toBe(false);
    expect(isSupportedVideoUrl('https://example.com/\u0000video.mp4')).toBe(false);
    expect(normalizeVideoUrlInput(`${' '.repeat(2049)}https://example.com/video.mp4`)).toBeNull();
  });

  it('sanitizes video URLs before they enter editor state', () => {
    expect(sanitizeVideoUrlInput('  https://example.com/video.mp4  ')).toBe('https://example.com/video.mp4');
    expect(sanitizeVideoUrlInput('', { allowEmpty: true })).toBe('');

    expect(sanitizeVideoUrlInput('')).toBeNull();
    expect(sanitizeVideoUrlInput(' '.repeat(2049), { allowEmpty: true })).toBeNull();
    expect(sanitizeVideoUrlInput('https://example.com/article')).toBeNull();
    expect(sanitizeVideoUrlInput('javascript:alert(1)')).toBeNull();
    expect(sanitizeVideoUrlInput('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(sanitizeVideoUrlInput('https://user:pass@example.com/video.mp4')).toBeNull();
    expect(sanitizeVideoUrlInput('http://127.0.0.1:3000/secret.mp4')).toBeNull();
    expect(sanitizeVideoUrlInput(String.raw`https:\example.com\video.mp4`)).toBeNull();
  });

  it('rejects non-string video URL inputs without coercion', () => {
    const input = {
      toString() {
        throw new Error('video URL coercion');
      },
    };

    expect(normalizeVideoUrlInput(input)).toBeNull();
    expect(parseVideoUrl(input)).toBeNull();
    expect(isSupportedVideoUrl(input)).toBe(false);
    expect(sanitizeVideoUrlInput(input)).toBeNull();
  });

  it('redacts video URL debug payloads', () => {
    expect(sanitizeVideoDebugPayload({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD?vd_source=secret&spm_id_from=333',
      resolved: {
        resolvedUrl: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&cid=456&token=secret',
      },
    })).toEqual({
      url: {
        value: 'https://www.bilibili.com/video/BV1xx411c7mD?vd_source=%5Bredacted%5D&spm_id_from=%5Bredacted%5D',
        length: 76,
        hasNewline: false,
        truncated: false,
      },
      resolved: {
        resolvedUrl: {
          value: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&cid=456&token=%5Bredacted%5D',
          length: 78,
          hasNewline: false,
          truncated: false,
        },
      },
    });
  });

  it('renders supported public video URLs in editor video blocks', () => {
    const youtube = createVideoDom({
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: '',
      width: 560,
      height: 315,
    });
    const direct = createVideoDom({
      src: 'https://example.com/video.mp4',
      title: '',
      width: 560,
      height: 315,
    });

    const youtubeFrame = youtube.querySelector('iframe');
    expect(youtubeFrame).toBeInstanceOf(HTMLIFrameElement);
    expect(youtubeFrame).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0'
    );
    expect(youtubeFrame).toHaveAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    expect(youtubeFrame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    expect(youtubeFrame?.getAttribute('allow')).not.toContain('camera');
    expect(youtubeFrame?.getAttribute('allow')).not.toContain('microphone');
    expect(youtube.querySelector('video')).toBeNull();
    expect(youtube.textContent).not.toContain('Remote video blocked');
    expect(direct.querySelector('iframe')).toBeNull();
    expect(direct.querySelector('video')).toBeInstanceOf(HTMLVideoElement);
    expect(direct.querySelector('video')).toHaveAttribute('src', 'https://example.com/video.mp4');
    expect(direct.textContent).not.toContain('Remote video blocked');
  });

  it('does not register global video debug listeners while video debug logging is disabled', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    createVideoDom({
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: '',
      width: 560,
      height: 315,
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'securitypolicyviolation',
      expect.any(Function),
    );
    addEventListenerSpy.mockRestore();
  });

  it('stores editor video source metadata without leaking it into wrapper attributes', () => {
    const src = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&token=secret';
    const dom = createVideoDom({
      src,
      title: 'private title',
      width: 640,
      height: 360,
    });

    expect(dom).not.toHaveAttribute('data-src');
    expect(dom).not.toHaveAttribute('data-title');
    expect(dom).toHaveAttribute('data-width', '640');
    expect(dom).toHaveAttribute('data-height', '360');
    expect(getVideoElementAttrs(dom)).toEqual({
      src,
      title: 'private title',
      width: 640,
      height: 360,
    });
    expect(dom.outerHTML).not.toContain('token=secret');
    expect(dom.outerHTML).not.toContain('private title');
  });

  it('refreshes localized video placeholder copy after language changes', () => {
    const dom = createVideoDom({
      src: '',
      title: '',
      width: 560,
      height: 315,
    });

    expect(dom.querySelector('.video-placeholder')).toHaveTextContent('No video URL');

    useUIStore.setState({ languagePreference: 'zh-CN' });
    refreshVideoDomI18n(dom);

    expect(dom.querySelector('.video-placeholder')).toHaveTextContent('没有视频 URL');
  });

  it('refreshes localized unsupported video URL copy after language changes', () => {
    const dom = createVideoDom({
      src: 'https://example.com/article',
      title: '',
      width: 560,
      height: 315,
    });

    expect(dom.querySelector('.video-error')).toHaveTextContent('Unsupported video URL: https://example.com/article');

    useUIStore.setState({ languagePreference: 'zh-CN' });
    refreshVideoDomI18n(dom);

    expect(dom.querySelector('.video-error')).toHaveTextContent('不支持的视频 URL：https://example.com/article');
  });

  it('normalizes non-string video dimension attrs without coercion', () => {
    const dimension = {
      toString() {
        throw new Error('video dimension coercion');
      },
    };

    const dom = createVideoDom({
      src: 'https://example.com/video.mp4',
      title: '',
      width: dimension,
      height: dimension,
    } as never);

    expect(dom).toHaveAttribute('data-width', '560');
    expect(dom).toHaveAttribute('data-height', '315');
    expect(getVideoElementAttrs(dom)).toMatchObject({
      width: 560,
      height: 315,
    });
  });

  it('keeps parsing legacy video wrapper attributes', () => {
    const dom = document.createElement('div');
    dom.dataset.src = 'https://example.com/video.mp4';
    dom.dataset.title = 'Legacy video';
    dom.dataset.width = '640';
    dom.dataset.height = '360';

    expect(getVideoElementAttrs(dom)).toEqual({
      src: 'https://example.com/video.mp4',
      title: 'Legacy video',
      width: 640,
      height: 360,
    });
  });

  it('normalizes oversized legacy video wrapper attributes', () => {
    const dom = document.createElement('div');
    dom.dataset.src = 'https://example.com/video.mp4';
    dom.dataset.title = 'x'.repeat(300);
    dom.dataset.width = '999999';
    dom.dataset.height = '-1';

    expect(getVideoElementAttrs(dom)).toEqual({
      src: 'https://example.com/video.mp4',
      title: 'x'.repeat(256),
      width: 4096,
      height: 315,
    });
  });

  it('rejects non-decimal legacy video wrapper dimensions', () => {
    const dom = document.createElement('div');
    dom.dataset.src = 'https://example.com/video.mp4';
    dom.dataset.width = '1e3';
    dom.dataset.height = '360px';

    expect(getVideoElementAttrs(dom)).toEqual({
      src: 'https://example.com/video.mp4',
      title: '',
      width: 560,
      height: 315,
    });
  });

  it('normalizes video titles while parsing markdown image syntax', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, `![fallback](https://example.com/video.mp4 "${'x'.repeat(300)}")`);
      })
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const video = findFirstVideoNode(view.state.doc);

    expect(video?.attrs).toMatchObject({
      src: 'https://example.com/video.mp4',
      title: 'x'.repeat(256),
      width: 560,
      height: 315,
    });

    await editor.destroy();
  });

  it('creates a video node from a solitary typed markdown image', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, ''))
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '![video](https://example.com/video.mp4)');

    const video = findFirstVideoNode(view.state.doc);
    expect(video?.attrs).toMatchObject({
      src: 'https://example.com/video.mp4',
      title: '',
      width: 560,
      height: 315,
    });
    expect(view.state.doc.firstChild?.type.name).toBe('video');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('creates a typed video while consuming an auto-paired closing parenthesis', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, ''))
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }
    editor.use(autoPairPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '![video](https://example.com/video.mp4)');

    expect(view.state.doc.firstChild?.type.name).toBe('video');
    expect(view.state.doc.firstChild?.attrs.src).toBe('https://example.com/video.mp4');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('keeps typed inline and unsupported markdown images as images', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, ''))
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    typeText(view, 'Intro ![clip](https://example.com/video.mp4) outro');
    typeText(view, ' ![article](https://example.com/article)');

    expect(findFirstVideoNode(view.state.doc)).toBeNull();
    const imageSources: string[] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageSources.push(node.attrs.src);
      return true;
    });
    expect(imageSources).toEqual([
      'https://example.com/video.mp4',
      'https://example.com/article',
    ]);

    await editor.destroy();
  });

  it('skips video image markdown transforms for over-budget trees', () => {
    const tree = createDeepVideoMarkdownTree(createVideoImageParagraph());

    remarkVideoImages()(tree);

    expect(JSON.stringify(tree)).not.toContain('"type":"video"');
  });

  it('does not persist the default video alt text as a title', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '![video](https://example.com/video.mp4)');
      })
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const video = findFirstVideoNode(view.state.doc);

    expect(video?.attrs.title).toBe('');

    await editor.destroy();
  });

  it('keeps video URL images inline when they are part of a paragraph', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'Intro ![clip](https://example.com/video.mp4) outro');
      })
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(findFirstVideoNode(view.state.doc)).toBeNull();
    expect(view.state.doc.textContent).toContain('Intro');
    expect(view.state.doc.textContent).toContain('outro');

    await editor.destroy();
  });

  it('keeps a solitary video image in the required first paragraph of a list item', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, '- ![clip](https://example.com/video.mp4)'))
      .use(commonmark);
    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const listItem = view.state.doc.firstChild?.firstChild;

    expect(listItem?.type.name).toBe('list_item');
    expect(listItem?.firstChild?.type.name).toBe('paragraph');
    expect(listItem?.firstChild?.firstChild?.type.name).toBe('image');
    expect(findFirstVideoNode(view.state.doc)).toBeNull();

    await editor.destroy();
  });

  it('converts a solitary video image after the required first list-item paragraph', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(
        defaultValueCtx,
        '- List item intro\n\n  ![clip](https://example.com/video.mp4)',
      ))
      .use(commonmark);
    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const listItem = view.state.doc.firstChild?.firstChild;
    expect(listItem?.firstChild?.type.name).toBe('paragraph');
    expect(listItem?.child(1).type.name).toBe('video');
    expect(findFirstVideoNode(view.state.doc)?.attrs.src).toBe('https://example.com/video.mp4');

    await editor.destroy();
  });

  it('serializes supported video nodes as markdown image syntax', async () => {
    await expect(serializeVideoNode(' https://example.com/video.mp4 ', 'Demo video')).resolves.toBe(
      '![video](https://example.com/video.mp4 "Demo video")'
    );
  });

  it('drops unsupported video node URLs during markdown serialization', async () => {
    await expect(serializeVideoNode('javascript:alert(1)')).resolves.toBe('');
    await expect(serializeVideoNode('http://127.0.0.1:3000/secret.mp4')).resolves.toBe('');
    await expect(serializeVideoNode('https://example.com/article')).resolves.toBe('');
  });

  it('does not insert unsupported video command URLs into the document', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();

    const commands = editor.ctx.get(commandsCtx);
    const view = editor.ctx.get(editorViewCtx);
    const userInputListener = vi.fn();
    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(commands.call(insertVideoCommand.key, 'javascript:alert(1)')).toBe(false);
    expect(findFirstVideoNode(view.state.doc)).toBeNull();
    expect(userInputListener).not.toHaveBeenCalled();

    expect(commands.call(insertVideoCommand.key, ' https://example.com/video.mp4 ')).toBe(true);
    const video = findFirstVideoNode(view.state.doc);
    expect(video?.type.name).toBe('video');
    expect(video?.attrs.src).toBe('https://example.com/video.mp4');
    expect(userInputListener).toHaveBeenCalledTimes(1);

    view.dom.removeEventListener('editor:block-user-input', userInputListener);
    await editor.destroy();
  });

  it('keeps the cursor out of a following heading after inserting a video command', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of videoPlugin) {
      editor.use(plugin);
    }

    await editor.create();

    const commands = editor.ctx.get(commandsCtx);
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph.create();
    const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Heading'));
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [paragraph, heading]));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

    expect(commands.call(insertVideoCommand.key, 'https://example.com/video.mp4')).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('video');
    expect(view.state.doc.child(1).type.name).toBe('heading');
    expect(view.state.doc.child(1).textContent).toBe('Heading');
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node).toBe(view.state.doc.child(0));

    await editor.destroy();
  });
});
