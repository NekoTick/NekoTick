import { describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import {
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import {
  normalizeLeadingFrontmatterMarkdown,
  serializeLeadingFrontmatterMarkdown,
} from '../frontmatter/frontmatterMarkdown';
import { expectPersistedMarkdownToBeClean } from './persistedMarkdownAssertions';

interface ReopenSnapshot {
  docJson: unknown;
  persisted: string;
  textContent: string;
  texts: string[];
}

async function reopenMarkdown(markdown: string): Promise<ReopenSnapshot> {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, preserveMarkdownBlankLinesForEditor(
        normalizeLeadingFrontmatterMarkdown(markdown)
      ));
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm);

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const serializer = editor.ctx.get(serializerCtx);
  const docJson = view.state.doc.toJSON();
  const serialized = serializer(view.state.doc);
  await editor.destroy();
  return {
    docJson,
    persisted: stripTrailingNewlines(serializeLeadingFrontmatterMarkdown(
      normalizeSerializedMarkdownDocument(serialized),
      markdown
    )),
    textContent: view.state.doc.textContent,
    texts: docJson.content?.map((node: any) => node.content?.[0]?.text ?? '') ?? [],
  };
}

function collectListItemAttrs(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];

  const node = value as { type?: unknown; attrs?: unknown; content?: unknown };
  const ownAttrs = node.type === 'list_item' && node.attrs && typeof node.attrs === 'object'
    ? [node.attrs as Record<string, unknown>]
    : [];
  const childAttrs = Array.isArray(node.content)
    ? node.content.flatMap(collectListItemAttrs)
    : [];
  return [...ownAttrs, ...childAttrs];
}

function collectNodes(value: unknown): Array<{ type?: unknown; attrs?: unknown; text?: unknown }> {
  if (!value || typeof value !== 'object') return [];

  const node = value as { type?: unknown; attrs?: unknown; text?: unknown; content?: unknown };
  const children = Array.isArray(node.content) ? node.content.flatMap(collectNodes) : [];
  return [node, ...children];
}

function collectNodesByType(value: unknown, type: string): Array<Record<string, unknown>> {
  return collectNodes(value)
    .filter((node) => node.type === type)
    .map((node) => node as Record<string, unknown>);
}

describe('markdown blank line reopen regressions', () => {
  it.each([
    {
      name: 'bullet',
      markdown: '-',
      expectedNode: { type: 'bullet_list' },
    },
    {
      name: 'ordered',
      markdown: '1.',
      expectedNode: { type: 'ordered_list' },
    },
    {
      name: 'nested bullet',
      markdown: '- parent\n  -',
      expectedNode: { type: 'bullet_list' },
    },
    {
      name: 'blockquote bullet',
      markdown: '> -',
      expectedNode: { type: 'bullet_list' },
    },
  ] as Array<{
    name: string;
    markdown: string;
    expectedPersisted?: string;
    expectedNode: { type: string };
  }>)('reopens an empty $name list item as a list', async ({ markdown, expectedPersisted, expectedNode }) => {
    const snapshot = await reopenMarkdown(markdown);

    expect(collectNodes(snapshot.docJson)).toContainEqual(expect.objectContaining(expectedNode));
    expect(snapshot.persisted).toBe(expectedPersisted ?? markdown);
    expectPersistedMarkdownToBeClean(snapshot.persisted);
  });

  it.each([
    {
      name: 'unchecked',
      markdown: '- [ ]',
      checked: false,
    },
    {
      name: 'checked',
      markdown: '- [x]',
      checked: true,
    },
    {
      name: 'nested unchecked',
      markdown: '- parent\n  - [ ]',
      checked: false,
    },
    {
      name: 'blockquote unchecked',
      markdown: '> - [ ]',
      checked: false,
    },
  ] as Array<{
    name: string;
    markdown: string;
    expectedPersisted?: string;
    checked: boolean;
  }>)('reopens an empty $name task item as a checkbox', async ({ markdown, expectedPersisted, checked }) => {
    const snapshot = await reopenMarkdown(markdown);

    expect(collectListItemAttrs(snapshot.docJson)).toContainEqual(
      expect.objectContaining({ checked })
    );
    expect(snapshot.persisted).toBe(expectedPersisted ?? markdown);
    expectPersistedMarkdownToBeClean(snapshot.persisted);
  });

  it('keeps paragraph trailing backslashes visible inside mixed markdown notes', async () => {
    const markdown = [
      '# Heading',
      '',
      '底线（-/=）方式（**不推荐**）：\\',
      '',
      '- item\\',
    ].join('\n');

    const snapshot = await reopenMarkdown(markdown);

    expect(snapshot.textContent).toContain('底线（-/=）方式（不推荐）：\\');
    expect(snapshot.persisted).toContain('底线（-/=）方式（**不推荐**）：\\');
  });

  it.each([
    {
      name: 'ordinary paragraph breaks',
      markdown: ['1', '', '2', '', '3'].join('\n'),
      texts: ['1', '', '2', '', '3'],
    },
    {
      name: 'one empty paragraph between typed lines',
      markdown: ['1', '', '2', '', '', '3'].join('\n'),
      texts: ['1', '', '2', '', '', '3'],
    },
    {
      name: 'two empty paragraphs between typed lines',
      markdown: ['1', '', '2', '', '', '', '3'].join('\n'),
      texts: ['1', '', '2', '', '', '', '3'],
    },
    {
      name: 'frontmatter plus one empty body paragraph',
      markdown: [
        '---',
        'vlaina_icon: "note"',
        '---',
        '1',
        '',
        '2',
        '',
        '',
        '3',
      ].join('\n'),
      texts: ['1', '', '2', '', '', '3'],
    },
    {
      name: 'hidden cover and icon frontmatter with source body separator',
      markdown: [
        '---',
        'vlaina_cover: "assets/cover.png" x=50 y=50 height=220 scale=1',
        'vlaina_icon: "🍓"',
        '---',
        '',
        'First paragraph after hidden metadata.',
      ].join('\n'),
      texts: ['First paragraph after hidden metadata.'],
    },
  ])('reopens and immediately resaves stable blank lines: $name', async ({ markdown, texts }) => {
    const firstReopen = await reopenMarkdown(markdown);
    expect(firstReopen.texts).toEqual(texts);
    expect(firstReopen.persisted).toBe(markdown);
    expectPersistedMarkdownToBeClean(firstReopen.persisted);

    const secondReopen = await reopenMarkdown(firstReopen.persisted);
    expect(secondReopen.texts).toEqual(texts);
    expect(secondReopen.persisted).toBe(firstReopen.persisted);
  });

  it('reopens markdown blank lines between list items as visible editor paragraphs without saving br tags', async () => {
    const markdown = ['- one', '', '', '- two', '', '', '', '- three'].join('\n');

    const snapshot = await reopenMarkdown(markdown);

    expect(snapshot.texts).toContain('');
    expect(snapshot.persisted).toBe(markdown);
    expectPersistedMarkdownToBeClean(snapshot.persisted);
  });

  it('parses editor-only list gap placeholder lines as editable list items', async () => {
    const snapshot = await reopenMarkdown(['- one', '', '', '- two'].join('\n'));

    expect(collectNodesByType(snapshot.docJson, 'list_item')).toHaveLength(4);
    expect(snapshot.textContent).toContain('\u2800');
    expect(snapshot.persisted).toBe(['- one', '', '', '- two'].join('\n'));
    expectPersistedMarkdownToBeClean(snapshot.persisted);
  });

  it('parses task-list gap placeholder lines as editable list items', async () => {
    const snapshot = await reopenMarkdown(['- [ ] one', '', '', '- [ ] two'].join('\n'));

    expect(collectNodesByType(snapshot.docJson, 'list_item')).toHaveLength(4);
    expect(snapshot.textContent).toContain('\u2800');
    expect(snapshot.persisted).toBe(['- [ ] one', '', '', '- [ ] two'].join('\n'));
    expectPersistedMarkdownToBeClean(snapshot.persisted);
  });
});
