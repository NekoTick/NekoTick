import { remarkPluginsCtx, schemaTimerCtx } from '@milkdown/core';
import { createTimer, type MilkdownPlugin } from '@milkdown/ctx';
import { remarkBlockAlignment } from '@/components/common/markdown/blockAlignment';

export {
  applyAlignmentCommentsToTree,
  DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT,
  extractTextAlignmentComment,
  getTextAlignmentComment,
  isTextAlignment,
  readMarkdownNodeAlignment,
  type AlignmentCommentPlacement,
  type TextAlignment,
} from '@/components/common/markdown/blockAlignment';

const blockAlignmentRemarkReady = createTimer('blockAlignmentRemarkReady');

export const remarkBlockAlignmentPlugin: MilkdownPlugin = (ctx) => {
  ctx.record(blockAlignmentRemarkReady);
  ctx.update(schemaTimerCtx, (timers) => timers.concat(blockAlignmentRemarkReady));

  return async () => {
    const remarkPlugin = {
      plugin: remarkBlockAlignment,
      options: undefined,
    };

    ctx.update(remarkPluginsCtx, (plugins) => plugins.concat(remarkPlugin as any));
    ctx.done(blockAlignmentRemarkReady);

    return () => {
      ctx.update(remarkPluginsCtx, (plugins) => plugins.filter((plugin) => plugin !== (remarkPlugin as any)));
      ctx.update(schemaTimerCtx, (timers) => timers.filter((timer) => timer !== blockAlignmentRemarkReady));
      ctx.clearTimer(blockAlignmentRemarkReady);
    };
  };
};

export const blockAlignmentPlugin = [remarkBlockAlignmentPlugin].flat();
