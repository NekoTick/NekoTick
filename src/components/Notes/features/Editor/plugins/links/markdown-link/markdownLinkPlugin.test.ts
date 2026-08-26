import { describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { baseKeymap } from '@milkdown/kit/prose/commands';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener } from '@milkdown/kit/plugin/listener';
import { normalizeSerializedMarkdownDocument } from '@/lib/notes/markdown/markdownSerializationUtils';
import { customPlugins } from '../../../config/plugins';
import { configureTheme } from '../../../theme';
import {
  MAX_MARKDOWN_LINK_AUTO_COLLAPSE_MATCHES,
  MAX_MARKDOWN_LINK_DOC_SCAN_NODES,
  MAX_MARKDOWN_LINK_INPUT_LOOKBACK_CHARS,
  MAX_MARKDOWN_LINK_TEXT_SCAN_CHARS,
  RAW_MARKDOWN_LINK_TEXT_CLASS,
  collectRawMarkdownLinkMatches,
  docHasRawMarkdownLink,
  getMarkdownLinkInputTextBeforeCursor,
  isMarkdownImagePatternBeforeCursor,
  markdownLinkPlugin,
  markdownLinkPluginKey,
  rangeTouchesRawMarkdownLink,
} from './markdownLinkPlugin';
import { shouldHandleMarkdownLinkPaste } from './markdownLinkParser';

interface FakeMarkdownLinkNode {
  child?: (index: number) => FakeMarkdownLinkNode | null | undefined;
  childCount?: number;
  content?: { size?: number };
  isText?: boolean;
  nodeSize?: number;
  text?: string;
  type?: { name?: string };
}

function createTextNode(text: string): FakeMarkdownLinkNode {
  return {
    isText: true,
    nodeSize: text.length,
    text,
    type: { name: 'text' },
  };
}

function createDocNode(children: FakeMarkdownLinkNode[], onAccess?: () => void): FakeMarkdownLinkNode {
  return {
    childCount: children.length,
    child(index) {
      onAccess?.();
      return children[index];
    },
    content: {
      size: children.reduce((size, child) => size + (child.nodeSize ?? 1), 0),
    },
    type: { name: 'doc' },
  };
}

function simulatePasteText(view: any, text: string): boolean {
  const event = {
    clipboardData: {
      getData(type: string) {
        return type === 'text/plain' ? text : '';
      },
    },
    preventDefault() {},
  };

  let handled = false;
  view.someProp('handlePaste', (handlePaste: any) => {
    const didHandle = handlePaste(view, event, null);
    handled = didHandle || handled;
    return didHandle || undefined;
  });
  return handled;
}

function typeText(view: any, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      const didHandle = handleTextInput(view, from, to, text);
      handled = didHandle || handled;
      return didHandle || undefined;
    });
    if (!handled) {
      view.dispatch(view.state.tr.insertText(text, from, to));
    }
  }
}

function pressEnter(view: any): boolean {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });
  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    const didHandle = handleKeyDown(view, event);
    handled = didHandle || handled;
    return didHandle || undefined;
  });
  return handled || baseKeymap.Enter(view.state, view.dispatch, view);
}

function insertEmptyParagraphAfterDocumentEnd(view: any): void {
  const paragraphType = view.state.schema.nodes.paragraph;
  const tr = view.state.tr.insert(view.state.doc.content.size, paragraphType.create());
  const cursorPos = tr.doc.content.size - 1;
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cursorPos)));
}

async function createFullStackEditor(defaultValue = '') {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(configureTheme)
    .use(customPlugins);

  await editor.create();
  return editor;
}

function getFirstLinkHref(view: any): string | null {
  let href: string | null = null;
  view.state.doc.descendants((node: any) => {
    const link = node.marks?.find((mark: any) => mark.type.name === 'link');
    if (!link) return true;
    href = link.attrs.href;
    return false;
  });
  return href;
}

function getFirstLinkText(view: any): string | null {
  let text = '';
  view.state.doc.descendants((node: any) => {
    if (node.isText && node.marks?.some((mark: any) => mark.type.name === 'link')) {
      text += node.text ?? '';
    }
    return true;
  });
  return text || null;
}

describe('shouldHandleMarkdownLinkPaste', () => {
  it('stops scanning for raw markdown links after the first match', () => {
    let accessed = 0;
    const doc = createDocNode([
      createTextNode('[Docs](https://example.com)'),
      createTextNode('[Later](https://later.example)'),
    ], () => {
      accessed += 1;
    });

    expect(docHasRawMarkdownLink(doc as any)).toBe(true);
    expect(accessed).toBe(1);
  });

  it('caps raw markdown link presence scans by node count', () => {
    let accessed = 0;
    const doc = createDocNode([
      ...Array.from({ length: MAX_MARKDOWN_LINK_DOC_SCAN_NODES }, () => createTextNode('plain')),
      createTextNode('[Later](https://later.example)'),
    ], () => {
      accessed += 1;
    });

    expect(docHasRawMarkdownLink(doc as any)).toBe(false);
    expect(accessed).toBe(MAX_MARKDOWN_LINK_DOC_SCAN_NODES);
  });

  it('caps raw markdown link auto-collapse candidates collected in one pass', () => {
    const doc = createDocNode(Array.from(
      { length: MAX_MARKDOWN_LINK_AUTO_COLLAPSE_MATCHES + 2 },
      (_value, index) => createTextNode(`[Link ${index}](https://example.com/${index})`)
    ));

    expect(collectRawMarkdownLinkMatches(doc as any)).toHaveLength(MAX_MARKDOWN_LINK_AUTO_COLLAPSE_MATCHES);
  });

  it('bounds raw markdown link presence scans within a single large text node', () => {
    const doc = createDocNode([
      createTextNode(`${'x'.repeat(MAX_MARKDOWN_LINK_TEXT_SCAN_CHARS)} [Later](https://later.example)`),
    ]);

    expect(docHasRawMarkdownLink(doc as any)).toBe(false);
  });

  it('bounds raw markdown link collection within a single large text node', () => {
    const doc = createDocNode([
      createTextNode(`${'x'.repeat(MAX_MARKDOWN_LINK_TEXT_SCAN_CHARS)} [Later](https://later.example)`),
    ]);

    expect(collectRawMarkdownLinkMatches(doc as any)).toEqual([]);
  });

  it('stops raw markdown link range prechecks after the first match', () => {
    let accessed = 0;
    const doc = createDocNode([
      createTextNode('[Docs](https://example.com)'),
      ...Array.from({ length: MAX_MARKDOWN_LINK_DOC_SCAN_NODES }, () => createTextNode('plain')),
    ], () => {
      accessed += 1;
    });

    expect(rangeTouchesRawMarkdownLink(doc as any, 0, doc.content?.size ?? 0, false)).toBe(true);
    expect(accessed).toBe(1);
  });

  it('bounds markdown link input lookback text reads', () => {
    const textBetweenCalls: Array<[number, number, string | null | undefined, string | null | undefined]> = [];
    const parent = {
      textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: string | null) {
        textBetweenCalls.push([from, to, blockSeparator, leafText]);
        return '[Docs](https://example.com)';
      },
    };
    const parentOffset = MAX_MARKDOWN_LINK_INPUT_LOOKBACK_CHARS + 500;

    expect(getMarkdownLinkInputTextBeforeCursor(parent, parentOffset)).toBe('[Docs](https://example.com)');
    expect(textBetweenCalls).toEqual([[500, parentOffset, '\0', '\0']]);
  });

  it('handles single-line markdown link text', () => {
    expect(shouldHandleMarkdownLinkPaste('Read [Docs](https://example.com)')).toBe(true);
  });

  it('does not handle markdown image syntax as a link paste', () => {
    expect(
      shouldHandleMarkdownLinkPaste('![百度](https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png "百度一下，你就知道")'),
    ).toBe(false);
    expect(shouldHandleMarkdownLinkPaste('before ![Alt](image.png) after')).toBe(false);
  });

  it('does not handle standalone URLs as markdown links', () => {
    expect(shouldHandleMarkdownLinkPaste('https://example.com')).toBe(false);
    expect(shouldHandleMarkdownLinkPaste('http://example.test:8317')).toBe(false);
  });

  it('handles localized markdown link text', () => {
    expect(shouldHandleMarkdownLinkPaste('阅读【文档】（https://example.com）')).toBe(true);
    expect(shouldHandleMarkdownLinkPaste('阅读[文档】（https://example.com)')).toBe(true);
  });

  it('does not handle multiline markdown content', () => {
    expect(
      shouldHandleMarkdownLinkPaste('# Title\n\n[Docs](https://example.com)\n- item'),
    ).toBe(false);
  });

  it('does not handle structural markdown line with link', () => {
    expect(shouldHandleMarkdownLinkPaste('# [Docs](https://example.com)')).toBe(false);
    expect(shouldHandleMarkdownLinkPaste('- [Docs](https://example.com)')).toBe(false);
    expect(shouldHandleMarkdownLinkPaste('＃ 【文档】（https://example.com）')).toBe(false);
  });

  it('does not handle standalone fenced code block payload', () => {
    expect(
      shouldHandleMarkdownLinkPaste('```markdown\n[Docs](https://example.com)\n```'),
    ).toBe(false);
  });

  it('pastes markdown links into the current empty line instead of the previous line tail', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'first');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    insertEmptyParagraphAfterDocumentEnd(view);

    expect(simulatePasteText(view, '[Docs](https://example.com)')).toBe(true);

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).textContent).toBe('first');
    expect(view.state.doc.child(1).textContent).toBe('Docs');

    await editor.destroy();
  });

  it('pastes unsafe markdown links as plain text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Bad](javascript:alert)')).toBe(true);

    expect(view.state.doc.textContent).toBe('Bad');
    const linkMark = view.state.schema.marks.link;
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, linkMark)).toBe(false);

    await editor.destroy();
  });

  it('pastes entity-encoded unsafe markdown links as plain text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Bad](javascript&colon;alert)')).toBe(true);

    expect(view.state.doc.textContent).toBe('Bad');
    const linkMark = view.state.schema.marks.link;
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, linkMark)).toBe(false);

    await editor.destroy();
  });

  it('pastes escaped unsafe markdown links as plain text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, String.raw`[Bad](javascript\:alert)`)).toBe(true);

    expect(view.state.doc.textContent).toBe('Bad');
    const linkMark = view.state.schema.marks.link;
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, linkMark)).toBe(false);

    await editor.destroy();
  });

  it('pastes protocol-relative markdown links as plain text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Bad](//example.com)')).toBe(true);

    expect(view.state.doc.textContent).toBe('Bad');
    const linkMark = view.state.schema.marks.link;
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, linkMark)).toBe(false);

    await editor.destroy();
  });

  it('pastes internal relative markdown links as plain text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Secret](.vlaina/workspace.md) [Git](docs/.git/config.md)')).toBe(true);

    expect(view.state.doc.textContent).toBe('Secret Git');
    const linkMark = view.state.schema.marks.link;
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, linkMark)).toBe(false);

    await editor.destroy();
  });

  it('pastes markdown links with titles using only the href for the link mark', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](https://example.com "Docs title")')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](https://example.com)');

    await editor.destroy();
  });

  it('pastes weixin markdown links as link marks', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[wx](weixin://)')).toBe(true);

    expect(view.state.doc.textContent).toBe('wx');
    expect(getFirstLinkHref(view)).toBe('weixin://');
    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[wx](weixin://)');

    await editor.destroy();
  });

  it('collapses typed weixin markdown links on newline as link marks', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[wx](weixin://)\n');

    expect(view.state.doc.textContent).toBe('wx\n');
    expect(getFirstLinkHref(view)).toBe('weixin://');

    await editor.destroy();
  });

  it('collapses typed weixin markdown links when Enter splits the paragraph', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[wx](weixin://)');
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(getFirstLinkHref(view)).toBe('weixin://');
    expect(pressEnter(view)).toBe(true);

    expect(view.state.doc.childCount).toBe(2);
    expect(getFirstLinkText(view)).toBe('wx');
    expect(getFirstLinkHref(view)).toBe('weixin://');

    await editor.destroy();
  });

  it('collapses typed weixin markdown links on Enter with the full editor plugin stack', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[wx](weixin://)');
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(getFirstLinkHref(view)).toBe('weixin://');
    expect(pressEnter(view)).toBe(true);

    expect(view.state.doc.childCount).toBe(2);
    expect(getFirstLinkText(view)).toBe('wx');
    expect(getFirstLinkHref(view)).toBe('weixin://');

    await editor.destroy();
  });

  it('collapses typed plain relative markdown links on Enter with the full editor plugin stack', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[1](1)');
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(getFirstLinkHref(view)).toBe('1');
    expect(pressEnter(view)).toBe(true);

    expect(view.state.doc.childCount).toBe(2);
    expect(getFirstLinkText(view)).toBe('1');
    expect(getFirstLinkHref(view)).toBe('1');

    await editor.destroy();
  });

  it('decorates safe raw markdown link text while editing', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[xs](ds');
    const insertPos = view.state.selection.from;
    const tr = view.state.tr.insertText(')', insertPos);
    tr.setSelection(TextSelection.create(tr.doc, 2));
    view.dispatch(tr);

    const rawLinkText = view.dom.querySelector<HTMLElement>(`.${RAW_MARKDOWN_LINK_TEXT_CLASS}`);
    expect(rawLinkText?.textContent).toBe('xs');
    expect(rawLinkText?.getAttribute('data-href')).toBe('ds');
    expect(view.dom.querySelector('a[href]')).toBeNull();

    await editor.destroy();
  });

  it('does not decorate unsafe raw markdown link text as a link while editing', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[Bad](javascript:alert)');

    expect(view.dom.querySelector(`.${RAW_MARKDOWN_LINK_TEXT_CLASS}`)).toBeNull();

    await editor.destroy();
  });

  it.each([
    ['[Docs](https://example.com)', 'Docs', 'https://example.com'],
    ['[Mail](mailto:user@example.com)', 'Mail', 'mailto:user@example.com'],
    ['[wx](weixin://)', 'wx', 'weixin://'],
    ['[1](1)', '1', '1'],
    ['[Heading](#section)', 'Heading', '#section'],
    ['[Relative](docs/page.md)', 'Relative', 'docs/page.md'],
    ['[Dot](./docs/page.md)', 'Dot', './docs/page.md'],
    ['[Parent](../docs/page.md)', 'Parent', '../docs/page.md'],
    ['[Paren](docs/a(b).md)', 'Paren', 'docs/a(b).md'],
    ['[Title](https://example.com "Docs")', 'Title', 'https://example.com'],
    ['【全角】（1）', '全角', '1'],
    ['【wx】（weixin://）', 'wx', 'weixin://'],
    ['【外链】（https://example.com）', '外链', 'https://example.com'],
    ['[半全角]（1）', '半全角', '1'],
    ['【半全角】(1)', '半全角', '1'],
    ['【标题】（https://example.com "Docs"）', '标题', 'https://example.com'],
  ])('collapses a completed typed markdown link without requiring Enter: %s', async (source, text, href) => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, source);
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(getFirstLinkText(view)).toBe(text);
    expect(getFirstLinkHref(view)).toBe(href);

    await editor.destroy();
  });

  it('keeps text typed after an auto-collapsed markdown link outside the link mark', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[Docs](docs.md) after');

    const link = view.dom.querySelector<HTMLAnchorElement>('a[href="docs.md"]');
    const trailingText = view.state.doc.firstChild?.lastChild;
    expect(link?.textContent).toBe('Docs');
    expect(trailingText?.text).toBe(' after');
    expect(trailingText?.marks.some((mark) => mark.type.name === 'link')).toBe(false);

    await editor.destroy();
  });

  it('collapses completed unsafe markdown links as plain text without requiring Enter', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[Bad](javascript:alert)');
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.textContent).toBe('Bad');
    expect(getFirstLinkHref(view)).toBeNull();

    await editor.destroy();
  });

  it('collapses completed unsafe localized markdown links as plain text without requiring Enter', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '【Bad】（javascript:alert）');
    expect(markdownLinkPluginKey.getState(view.state)?.hasRawMarkdownLink).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.textContent).toBe('Bad');
    expect(getFirstLinkHref(view)).toBeNull();

    await editor.destroy();
  });

  it('pastes angle-bracket markdown link destinations without persisting brackets in href', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](<https://example.com/path>)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](https://example.com/path)');

    await editor.destroy();
  });

  it('pastes angle-bracket markdown link destinations with escaped brackets', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, String.raw`[Docs](<docs/a-\>.md>)`)).toBe(true);

    expect(getFirstLinkHref(view)).toBe('docs/a->.md');
    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](docs/a->.md)');

    await editor.destroy();
  });

  it('unescapes markdown punctuation in explicit link destinations', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, String.raw`[Docs](https\://example.com/a\?q\=1\&b\=2)`)).toBe(true);

    expect(getFirstLinkHref(view)).toBe('https://example.com/a?q=1&b=2');
    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe(String.raw`[Docs](https://example.com/a?q=1\&b=2)`);

    await editor.destroy();
  });

  it('normalizes non-markdown bare domains in explicit markdown links', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](cati.me)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](https://cati.me)');

    await editor.destroy();
  });

  it('preserves explicit relative markdown file links that look like bare domains', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](catim.md) [Guide](guide.markdown#intro)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](catim.md) [Guide](guide.markdown#intro)');

    await editor.destroy();
  });

  it('preserves explicit nested relative markdown links', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](docs/safe.md)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](docs/safe.md)');

    await editor.destroy();
  });

  it('preserves explicit markdown links with balanced parentheses in the destination', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](docs/a(b).md)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(getFirstLinkHref(view)).toBe('docs/a(b).md');
    expect(serializer(view.state.doc).trim()).toBe(String.raw`[Docs](docs/a\(b\).md)`);

    await editor.destroy();
  });

  it('unescapes balanced parentheses in explicit markdown link destinations', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, String.raw`[Docs](docs/a\(b\).md)`)).toBe(true);

    expect(getFirstLinkHref(view)).toBe('docs/a(b).md');
    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe(String.raw`[Docs](docs/a\(b\).md)`);

    await editor.destroy();
  });

  it('decodes entity references in explicit markdown link destinations', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[Docs](docs&sol;safe&period;md)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(serializer(view.state.doc).trim()).toBe('[Docs](docs/safe.md)');

    await editor.destroy();
  });

  it('pastes markdown mailto links but persists matching email labels as plain emails', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(markdownLinkPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '[v.lad.el.a.ina@gmail.com](mailto:v.lad.el.a.ina@gmail.com)')).toBe(true);

    const serializer = editor.ctx.get(serializerCtx);
    expect(normalizeSerializedMarkdownDocument(serializer(view.state.doc)).trim()).toBe(
      'v.lad.el.a.ina@gmail.com'
    );

    await editor.destroy();
  });
});

describe('markdownLinkPlugin text input', () => {
  it('collapses a markdown link before a trailing space and leaves the caret outside it', async () => {
    const editor = await createFullStackEditor();
    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '[xx](yy)');
    const beforeSpaceParagraph = view.state.doc.firstChild!;
    expect(view.state.selection.from).toBe(beforeSpaceParagraph.nodeSize - 1);
    typeText(view, ' ');

    const link = view.dom.querySelector<HTMLAnchorElement>('a[href="yy"]');
    const paragraph = view.state.doc.firstChild!;
    const trailingSpace = paragraph.lastChild!;
    expect(link?.textContent).toBe('xx');
    expect(trailingSpace.text).toBe(' ');
    expect(trailingSpace.marks.some((mark) => mark.type.name === 'link')).toBe(false);
    expect(view.state.selection.from).toBe(paragraph.nodeSize - 1);

    await editor.destroy();
  });

  it('detects markdown image syntax with paragraph-relative positions', () => {
    const textBefore = 'prefix ![Alt](image.png)';
    const fullMatch = '[Alt](image.png)';

    expect(isMarkdownImagePatternBeforeCursor(textBefore, fullMatch)).toBe(true);
    expect(isMarkdownImagePatternBeforeCursor('[Alt](image.png)', fullMatch)).toBe(false);
  });
});
