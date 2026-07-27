import { Fragment } from '@milkdown/kit/prose/model';
import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { markEditorUserInput } from '../shared/userInputEvents';
import { normalizeVideoAttrs } from './videoDom';
import { sanitizeVideoUrlInput } from './videoUrl';
import { moveSelectionAfterInsertedNode } from '../shared/insertedNodeSelection';

const MAX_VIDEO_MARKDOWN_INPUT_CHARS = 8_192;
const markdownImagePattern = /^!\[(?<alt>.*?)]\((?<src><(?:\\.|[^>\n])+>|[^\s)]+)(?:\s+"(?<title>[^"]+)")?\)$/;
const markdownDestinationEscapePattern = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

function normalizeMarkdownDestination(value: string): string {
  const trimmed = value.trim();
  const destination = trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  return destination.replace(markdownDestinationEscapePattern, '$1');
}

function handleVideoMarkdownTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (view.composing || text !== ')') return false;

  const { state } = view;
  const { selection } = state;
  const paragraphType = state.schema.nodes.paragraph;
  const videoType = state.schema.nodes.video;
  if (!selection.empty || !paragraphType || !videoType) return false;
  if (from !== selection.from || to !== selection.to) return false;

  const source = selection.$from.parent;
  if (source.type !== paragraphType) return false;
  if (source.content.size >= MAX_VIDEO_MARKDOWN_INPUT_CHARS) return false;
  if (source.textContent.length !== source.content.size) return false;

  const suffix = source.textBetween(selection.$from.parentOffset, source.content.size, '', '');
  if (suffix !== '' && suffix !== ')') return false;
  const textBefore = source.textBetween(0, selection.$from.parentOffset, '', '');
  const markdown = `${textBefore}${text}`;
  const match = markdownImagePattern.exec(markdown);
  const src = sanitizeVideoUrlInput(normalizeMarkdownDestination(match?.groups?.src ?? ''));
  if (!match || !src) return false;

  const alt = match.groups?.alt ?? '';
  const title = match.groups?.title || (alt !== 'video' ? alt : '');
  const video = videoType.create(normalizeVideoAttrs({ src, title }));
  const trailingParagraph = paragraphType.create();
  const parentDepth = selection.$from.depth - 1;
  const parent = selection.$from.node(parentDepth);
  const fromIndex = selection.$from.index(parentDepth);
  const hasFollowingSibling = fromIndex + 1 < parent.childCount;
  const replacement = Fragment.fromArray(
    hasFollowingSibling ? [video] : [video, trailingParagraph],
  );
  if (!parent.canReplace(fromIndex, fromIndex + 1, replacement)) return false;

  const blockFrom = selection.$from.before(selection.$from.depth);
  const blockTo = selection.$from.after(selection.$from.depth);
  const tr = state.tr.replaceWith(blockFrom, blockTo, replacement);
  const movedTr = moveSelectionAfterInsertedNode({
    tr,
    nodePos: blockFrom,
    insertedNodeFallback: video,
    paragraphType,
  });
  markEditorUserInput(view);
  view.dispatch(movedTr.scrollIntoView());
  return true;
}

export const videoMarkdownInputPlugin = $prose(() => new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      return handleVideoMarkdownTextInput(view, from, to, text);
    },
  },
}));
