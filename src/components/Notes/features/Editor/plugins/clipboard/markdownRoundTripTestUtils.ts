import { expect } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { tableBlock } from '@milkdown/kit/component/table-block';

import { customPlugins } from '../../config/plugins';
import { notesRemarkGfmOptions, notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { configureTheme } from '../../theme';
import {
  normalizeAlternativeMathBlockFences,
  preserveMarkdownBlankLinesForEditor,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import {
  normalizeLeadingFrontmatterMarkdown,
} from '../frontmatter/frontmatterMarkdown';
import { serializeEditorMarkdownSnapshot } from '../../utils/pendingMarkdownUpdate';
import { expectPersistedMarkdownToBeClean } from './persistedMarkdownAssertions';
import { clipboardPlugin } from './clipboardPlugin';

interface EditorRoundTripSnapshot {
  docJson: unknown;
  persisted: string;
}

interface MarkdownRoundTripCase {
  expected?: string;
  independentParts?: readonly string[];
  markdown: string;
  name: string;
}

export interface MarkdownRoundTripBatchResult {
  checked: number;
  skipped: number;
}

function prepareMarkdownForSyntaxEditor(markdown: string): string {
  return preserveMarkdownBlankLinesForEditor(
    normalizeLeadingFrontmatterMarkdown(
      normalizeAlternativeMathBlockFences(markdown)
    )
  );
}

function createSyntaxEditor(defaultValue: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
      ctx.set(remarkGFMPlugin.options.key, notesRemarkGfmOptions);
    })
    .use(clipboardPlugin)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(configureTheme)
    .use(tableBlock)
    .use(customPlugins);

  return editor;
}

function restorePersistedMarkdown(serialized: string, referenceMarkdown: string): string {
  return serializeEditorMarkdownSnapshot(serialized, referenceMarkdown);
}

async function openMarkdownThroughSyntaxEditor(markdown: string): Promise<EditorRoundTripSnapshot> {
  const preparedMarkdown = prepareMarkdownForSyntaxEditor(markdown);
  const editor = createSyntaxEditor(preparedMarkdown);
  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const serializer = editor.ctx.get(serializerCtx);
  const serialized = serializer(view.state.doc);
  const docJson = view.state.doc.toJSON();
  await editor.destroy();

  return {
    docJson,
    persisted: restorePersistedMarkdown(serialized, markdown),
  };
}

export function collectDocText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { attrs?: unknown; text?: unknown; type?: unknown; content?: unknown };
  const ownText = typeof node.text === 'string' ? node.text : '';
  const attrsText = collectAttrsText(node.attrs, node.type);
  const childText = Array.isArray(node.content)
    ? node.content.map(collectDocText).join('')
    : '';
  return ownText + attrsText + childText;
}

function collectAttrsText(attrs: unknown, nodeType: unknown): string {
  if (!attrs || typeof attrs !== 'object') return '';
  const record = attrs as Record<string, unknown>;
  const namedText = Object.entries(record)
    .filter(([key]) => key === 'alt' || key === 'title')
    .map(([, value]) => typeof value === 'string' ? value : '')
    .join('');
  const htmlText = (nodeType === 'html' || nodeType === 'html_block') && typeof record.value === 'string'
    ? extractHtmlText(record.value)
    : '';
  return namedText + htmlText;
}

function extractHtmlText(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

export async function expectStableMarkdownRoundTrip(
  markdown: string,
  expected = markdown,
  expectedText?: string,
): Promise<void> {
  await expectStableMarkdownRoundTripWith(
    openMarkdownThroughSyntaxEditor,
    markdown,
    expected,
    expectedText,
  );
}

export async function expectStableMarkdownRoundTrips(
  testCases: readonly MarkdownRoundTripCase[],
): Promise<MarkdownRoundTripBatchResult> {
  const editor = createSyntaxEditor('');
  await editor.create();

  try {
    const parser = editor.ctx.get(parserCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const openMarkdown = async (markdown: string): Promise<EditorRoundTripSnapshot> => {
      const preparedMarkdown = prepareMarkdownForSyntaxEditor(markdown);
      const doc = parser(preparedMarkdown);
      const serialized = serializer(doc);
      const persisted = restorePersistedMarkdown(serialized, markdown);
      return {
        docJson: doc.toJSON(),
        persisted,
      };
    };

    const failures: string[] = [];
    let firstFailure: unknown;
    let checked = 0;
    let skipped = 0;
    for (const testCase of testCases) {
      if (testCase.independentParts) {
        const combinedContent = getDocContent(
          parser(prepareMarkdownForSyntaxEditor(testCase.markdown)).toJSON()
        );
        const independentContent = testCase.independentParts.flatMap((part) =>
          getDocContent(parser(prepareMarkdownForSyntaxEditor(part)).toJSON())
        );
        if (JSON.stringify(combinedContent) !== JSON.stringify(independentContent)) {
          skipped += 1;
          continue;
        }
      }

      checked += 1;
      try {
        await expectStableMarkdownRoundTripWith(
          openMarkdown,
          testCase.markdown,
          testCase.expected ?? testCase.markdown,
          undefined,
          testCase.name,
        );
      } catch (error) {
        firstFailure ??= error;
        failures.push(testCase.name);
      }
    }
    if (firstFailure instanceof Error) {
      firstFailure.message = `${firstFailure.message}\nFailing cases: ${failures.join(', ')}`;
      throw firstFailure;
    }
    expect(failures).toEqual([]);
    return { checked, skipped };
  } finally {
    await editor.destroy();
  }
}

function getDocContent(docJson: unknown): unknown[] {
  if (!docJson || typeof docJson !== 'object') return [];
  const content = (docJson as { content?: unknown }).content;
  return Array.isArray(content)
    ? content
      .filter((node) => !isInternalEditorDocNode(node))
      .map(stripIndependentComparisonMetadata)
    : [];
}

function stripIndependentComparisonMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIndependentComparisonMetadata);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      key === 'vlainaSourceTightBefore' || key === 'vlainaSourceHtmlBlankLineCountAfter'
        ? []
        : [[key, stripIndependentComparisonMetadata(nestedValue)]]
    )
  );
}

function isInternalEditorDocNode(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const node = value as { attrs?: { value?: unknown }; type?: unknown };
  return (node.type === 'html' || node.type === 'html_block')
    && typeof node.attrs?.value === 'string'
    && /^<!--\s*vlaina-(?:markdown|rendered-html-boundary)-/i.test(node.attrs.value.trim());
}

async function expectStableMarkdownRoundTripWith(
  openMarkdown: (markdown: string) => Promise<EditorRoundTripSnapshot>,
  markdown: string,
  expected: string,
  expectedText?: string,
  message?: string,
): Promise<void> {
  const firstOpen = await openMarkdown(markdown);
  const firstPersisted = stripTrailingNewlines(firstOpen.persisted);
  const normalizedInput = stripTrailingNewlines(markdown);
  expectPersistedMarkdownToBeClean(firstPersisted);
  expect(firstPersisted, message).toBe(expected);
  if (expectedText) {
    expect(collectDocText(firstOpen.docJson), message).toContain(expectedText);
  }

  const secondOpen = await openMarkdown(firstPersisted);
  const secondPersisted = stripTrailingNewlines(secondOpen.persisted);
  expectPersistedMarkdownToBeClean(secondPersisted);
  expect(secondPersisted, message).toBe(firstPersisted);

  if (firstPersisted === normalizedInput) {
    expect(secondOpen.docJson, message).toEqual(firstOpen.docJson);
    return;
  }

  const thirdOpen = await openMarkdown(secondPersisted);
  const thirdPersisted = stripTrailingNewlines(thirdOpen.persisted);
  expectPersistedMarkdownToBeClean(thirdPersisted);
  expect(thirdPersisted, message).toBe(secondPersisted);
  expect(thirdOpen.docJson, message).toEqual(secondOpen.docJson);
}

export async function expectConvergentPersistedMarkdownRoundTrip(
  markdown: string,
  expectedFirstPersisted = markdown,
  expectedText?: string,
): Promise<void> {
  const firstOpen = await openMarkdownThroughSyntaxEditor(markdown);
  const firstPersisted = stripTrailingNewlines(firstOpen.persisted);
  expectPersistedMarkdownToBeClean(firstPersisted);
  expect(firstPersisted).toBe(expectedFirstPersisted);
  if (expectedText) {
    expect(collectDocText(firstOpen.docJson)).toContain(expectedText);
  }

  const secondOpen = await openMarkdownThroughSyntaxEditor(firstPersisted);
  const secondPersisted = stripTrailingNewlines(secondOpen.persisted);
  expectPersistedMarkdownToBeClean(secondPersisted);

  const thirdOpen = await openMarkdownThroughSyntaxEditor(secondPersisted);
  const thirdPersisted = stripTrailingNewlines(thirdOpen.persisted);
  expectPersistedMarkdownToBeClean(thirdPersisted);
  expect(thirdPersisted).toBe(secondPersisted);
}
