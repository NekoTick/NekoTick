import React, { memo, useMemo, useRef } from 'react';
import { ThinkingBlock } from '@/components/Chat/features/Messages/components/ThinkingBlock';
import { extractThinkingSections } from '@/components/Chat/features/Layout/chatAssistantMarkdownParsing';
import { createMarkdownComponents } from './markdownRendererComponents';
import { canAnimateChatStreamContent, useChatStreamBlocks } from './chatStreamTextAnimation';
import 'katex/dist/katex.min.css';
import '@/components/common/markdown/markdownSurface.css';
import { compactLargeDataImageMarkdown, scrubChatInlineDataImageSyntax } from './chatInlineImageTokens';
import { MAX_CHAT_MARKDOWN_RENDER_CHARS } from './chatMarkdownRenderLimits';
import { MarkdownContent } from './MarkdownContent';
import {
  handleMarkdownHeadingDragStart,
  MAX_CHAT_MARKDOWN_SELECTION_TEXT_NODES,
} from './chatMarkdownSelectionUtils';
import { useMarkdownStreamSelection } from './useMarkdownStreamSelection';

export { MAX_CHAT_MARKDOWN_SELECTION_TEXT_NODES };

export interface MarkdownRendererProps {
  content: string;
  imageGallery?: Array<{ id: string; src: string }>;
  getImageGallery?: () => Array<{ id: string; src: string }>;
  imageIdBase?: string;
  codeBlockIdBase?: string;
  copiedCodeBlockId?: string | null;
  onCopyCodeBlock?: (blockId: string) => void;
  startTime?: Date;
  isStreaming?: boolean;
  suspendStreamAnimation?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(
  ({
    content,
    imageGallery,
    getImageGallery,
    imageIdBase,
    codeBlockIdBase,
    copiedCodeBlockId,
    onCopyCodeBlock,
    startTime,
    isStreaming = false,
    suspendStreamAnimation = false,
  }) => {
    const markdownSurfaceRef = useRef<HTMLDivElement | null>(null);
    const {
      handleSelectionMouseDown,
      handleSelectionPointerDown,
      renderedContent,
      selectionStreamClockPausedRef,
    } = useMarkdownStreamSelection({
      content,
      isStreaming,
      markdownSurfaceRef,
      suspendStreamAnimation,
    });
    const compactedContent = useMemo(
      () => renderedContent.length > MAX_CHAT_MARKDOWN_RENDER_CHARS
        ? {
            markdown: scrubChatInlineDataImageSyntax(renderedContent),
            imageSrcByToken: new Map<string, string>(),
            replaced: 0,
          }
        : compactLargeDataImageMarkdown(renderedContent),
      [renderedContent],
    );

    const { body: thinking, isComplete: isThinkingDone, markdown } = useMemo(() => {
      const sections = extractThinkingSections(compactedContent.markdown || '');
      return {
        body: sections.body || null,
        isComplete: sections.isComplete,
        markdown: sections.markdown,
      };
    }, [compactedContent.markdown]);

    const componentOptions = useMemo<Parameters<typeof createMarkdownComponents>[0]>(() => ({
      codeBlockIdBase,
      copiedCodeBlockId,
      getImageGallery,
      imageGallery,
      imageIdBase,
      imageSrcByToken: compactedContent.imageSrcByToken,
      onCopyCodeBlock,
    }), [
      codeBlockIdBase,
      copiedCodeBlockId,
      getImageGallery,
      imageGallery,
      imageIdBase,
      compactedContent.imageSrcByToken,
      onCopyCodeBlock,
    ]);

    const shouldAnimateStream = isStreaming && canAnimateChatStreamContent(markdown);
    const streamBlocks = useChatStreamBlocks(markdown, shouldAnimateStream);

    return (
      <div
        className="flex flex-col"
        onPointerDownCapture={handleSelectionPointerDown}
        onMouseDownCapture={handleSelectionMouseDown}
      >
        {thinking !== null && (
          <ThinkingBlock
            content={thinking}
            isStreaming={isStreaming && !isThinkingDone}
            isMessageStreaming={isStreaming}
            startTime={startTime}
            suspendStreamAnimation={suspendStreamAnimation}
          />
        )}

        {markdown && (
          <div
            ref={markdownSurfaceRef}
            data-chat-selection-surface="true"
            data-chat-selection-start="true"
            data-chat-markdown-live={shouldAnimateStream ? 'true' : undefined}
            onDragStartCapture={handleMarkdownHeadingDragStart}
            className={[
              'markdown-surface max-w-full break-words',
              shouldAnimateStream ? 'chat-markdown-live' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <MarkdownContent
              componentOptions={componentOptions}
              freezeRef={selectionStreamClockPausedRef}
              markdown={markdown}
              shouldAnimateStream={shouldAnimateStream}
              streamBlocks={streamBlocks}
            />
          </div>
        )}
      </div>
    );
  },
);

export default MarkdownRenderer;
