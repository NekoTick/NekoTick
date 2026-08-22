import { remarkPluginsCtx, remarkStringifyOptionsCtx, schemaTimerCtx } from '@milkdown/core';
import { createTimer, type MilkdownPlugin } from '@milkdown/ctx';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { defaultHandlers } from 'mdast-util-to-markdown';
import {
  parseObsidianImageEmbedTarget,
  remarkObsidianImageEmbeds,
} from '@/components/common/markdown/theme-compatibility/obsidian/imageEmbed';
import { markEditorUserInput } from '../../plugins/shared/userInputEvents';

const obsidianImageEmbedsRemarkReady = createTimer('obsidianImageEmbedsRemarkReady');

export const obsidianImageEmbedPlugin: MilkdownPlugin = (ctx) => {
  ctx.record(obsidianImageEmbedsRemarkReady);
  ctx.update(schemaTimerCtx, (timers) => timers.concat(obsidianImageEmbedsRemarkReady));
  ctx.update(remarkStringifyOptionsCtx, (options) => {
    const handlers = (options.handlers ?? {}) as Record<string, unknown>;
    const imageHandler = handlers.image;
    return {
      ...options,
      handlers: {
        ...handlers,
        image: (node: any, parent: unknown, state: any, info: any) => {
          const source = node.data?.obsidianImageEmbedSource;
          if (typeof source === 'string') {
            return state.stack?.includes('tableCell') ? source.replace('|', '\\|') : source;
          }
          return typeof imageHandler === 'function'
            ? imageHandler(node, parent, state, info)
            : defaultHandlers.image(node, parent, state, info);
        },
      },
    };
  });

  return async () => {
    const remarkPlugin = {
      plugin: remarkObsidianImageEmbeds,
      options: undefined,
    };

    ctx.update(remarkPluginsCtx, (plugins) => plugins.concat(remarkPlugin as any));
    ctx.done(obsidianImageEmbedsRemarkReady);

    return () => {
      ctx.update(remarkPluginsCtx, (plugins) => plugins.filter((plugin) => plugin !== (remarkPlugin as any)));
      ctx.update(schemaTimerCtx, (timers) => timers.filter((timer) => timer !== obsidianImageEmbedsRemarkReady));
      ctx.clearTimer(obsidianImageEmbedsRemarkReady);
    };
  };
};

const obsidianImageEmbedPattern = /!\[\[([^\]\n]{1,4096})\]\]$/;
const MAX_OBSIDIAN_IMAGE_INPUT_CHARS = 4_102;

function isEscapedInputMatch(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

export const obsidianImageEmbedInputPlugin = $prose(() => new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      if (view.composing || text !== ']' || from !== to) return false;

      const { state } = view;
      const imageType = state.schema.nodes.image;
      const parentOffset = state.selection.$from.parentOffset;
      if (!imageType || parentOffset !== from - state.selection.$from.start()) return false;

      const textBefore = state.selection.$from.parent.textBetween(
        Math.max(0, parentOffset - MAX_OBSIDIAN_IMAGE_INPUT_CHARS),
        parentOffset,
        undefined,
        '\uFFFC',
      ) + text;
      const match = obsidianImageEmbedPattern.exec(textBefore);
      const image = parseObsidianImageEmbedTarget(match?.[1] ?? '');
      if (!match || !image || isEscapedInputMatch(textBefore, match.index)) return false;

      const start = from - (match[0].length - text.length);
      const replaceTo = state.doc.textBetween(to, Math.min(to + 1, state.doc.content.size)) === ']'
        ? to + 1
        : to;
      markEditorUserInput(view);
      view.dispatch(state.tr.replaceWith(start, replaceTo, imageType.create({
        src: image.src,
        alt: image.alt,
        title: image.title,
        width: image.obsidianEmbed.width,
        persistedSrc: image.src,
        obsidianEmbed: image.obsidianEmbed,
      })));
      return true;
    },
  },
}));
