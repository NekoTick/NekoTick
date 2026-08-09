import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LazyMarkdownRenderer } from '@/components/Chat/features/Markdown/LazyMarkdownRenderer';
import { MessageToolbar } from './MessageToolbar';
import { ErrorBlock } from './ErrorBlock';
import type { ChatMessage } from '@/lib/ai/types';
import { parseErrorTag, stripFirstErrorTag } from '@/lib/ai/errorTag';
import { isManagedModelId } from '@/lib/ai/managedService';
import { stripWebSearchStatusMarkup } from '@/lib/ai/webSearch/statusMarkup';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { extractThinkingSections } from '@/components/Chat/features/Layout/chatAssistantMarkdownParsing';
import { WebSearchStatusBlock } from '@/components/Chat/features/WebSearch/WebSearchStatusBlock';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { extractComputerCommandStatuses } from '@/lib/ai/computerUse/transcript';
import { ComputerCommandStatusBlock } from '@/components/Chat/features/ComputerUse/ComputerCommandStatusBlock';

interface ChatImageGalleryItem {
  id: string;
  src: string;
}

type ChatImageGalleryGetter = () => ChatImageGalleryItem[];

const STREAM_START_CACHE_LIMIT = 200;
const visibleStreamStartTimeByMessageId = new Map<string, number>();

function rememberVisibleStreamStartTime(messageId: string): Date {
  const cached = visibleStreamStartTimeByMessageId.get(messageId);
  if (cached !== undefined) {
    visibleStreamStartTimeByMessageId.delete(messageId);
    visibleStreamStartTimeByMessageId.set(messageId, cached);
    return new Date(cached);
  }

  const startedAt = Date.now();
  if (visibleStreamStartTimeByMessageId.size >= STREAM_START_CACHE_LIMIT) {
    const oldestMessageId = visibleStreamStartTimeByMessageId.keys().next().value;
    if (oldestMessageId !== undefined) {
      visibleStreamStartTimeByMessageId.delete(oldestMessageId);
    }
  }
  visibleStreamStartTimeByMessageId.set(messageId, startedAt);
  return new Date(startedAt);
}

interface AIMessageProps {
  msg: ChatMessage;
  imageGallery?: ChatImageGalleryItem[];
  getImageGallery?: ChatImageGalleryGetter;
  isLoading: boolean;
  isLastMessage?: boolean;
  suspendStreamAnimation?: boolean;
  onCopy: (text: string) => Promise<boolean | void> | boolean | void;
  onFork?: () => void;
  onRegenerate: () => void;
  onSwitchVersion: (targetIndex: number) => void;
}

export function AIMessage({
  msg,
  imageGallery,
  getImageGallery,
  isLoading,
  suspendStreamAnimation = false,
  onCopy,
  onFork,
  onRegenerate,
  onSwitchVersion
}: AIMessageProps) {
  const [copiedCodeBlockId, setCopiedCodeBlockId] = useState<string | null>(null);
  const copiedCodeBlockTimerRef = useRef<number | null>(null);
  const contentMayContainControlMarkup = msg.content.includes('<');
  const {
    errorType,
    errorCode,
    errorContent,
    webSearchStatuses,
    contentWithoutError,
  } = useMemo(() => {
    if (!contentMayContainControlMarkup) {
      return {
        errorType: undefined,
        errorCode: undefined,
        errorContent: null,
        webSearchStatuses: msg.webSearchStatuses || [],
        contentWithoutError: msg.content,
      };
    }

    const parsedError = parseErrorTag(msg.content);
    const nextErrorContent = parsedError?.content ?? null;
    const withoutError = nextErrorContent
      ? stripFirstErrorTag(msg.content)
      : msg.content;
    const visibleContent = msg.webSearchStatuses?.length
      ? stripWebSearchStatusMarkup(withoutError)
      : withoutError;
    return {
      errorType: parsedError?.type,
      errorCode: parsedError?.code,
      errorContent: nextErrorContent,
      webSearchStatuses: msg.webSearchStatuses || [],
      contentWithoutError: visibleContent,
    };
  }, [contentMayContainControlMarkup, msg.content, msg.webSearchStatuses]);
  const contentWithoutThinking = useMemo(
    () => contentMayContainControlMarkup
      ? stripThinkingContent(contentWithoutError)
      : contentWithoutError.trim(),
    [contentMayContainControlMarkup, contentWithoutError],
  );
  const thinkingSections = contentMayContainControlMarkup
    ? extractThinkingSections(contentWithoutError)
    : null;
  const hasCompletedThinking = Boolean(thinkingSections?.body) && thinkingSections?.isComplete === true;
  const isStreamingContentVisible = isLoading && contentWithoutError.trim().length > 0 && !hasCompletedThinking;
  const computerCommandStatuses = useMemo(() => extractComputerCommandStatuses(
    msg.apiTranscript ?? msg.versions?.[msg.currentVersionIndex]?.apiTranscript,
    isLoading,
  ), [isLoading, msg.apiTranscript, msg.currentVersionIndex, msg.versions]);
  const isEmptyCompletedResponse = !isLoading && contentWithoutThinking.length === 0;
  const visibleContent = contentWithoutError || ' ';
  const isManagedAuthErrorMessage = errorType === 'AUTH_ERROR'
    && isManagedModelId(msg.modelId);
  const shouldHideManagedAuthError = isManagedAuthErrorMessage;
  const shouldForceToolbarVisible = isEmptyCompletedResponse && !isManagedAuthErrorMessage;
  const startTime = useMemo(() => {
    if (isStreamingContentVisible) {
      return rememberVisibleStreamStartTime(msg.id);
    }

    return msg.timestamp ? new Date(msg.timestamp) : undefined;
  }, [isStreamingContentVisible, msg.id, msg.timestamp]);

  useEffect(() => {
    setCopiedCodeBlockId(null);
    if (copiedCodeBlockTimerRef.current !== null) {
      window.clearTimeout(copiedCodeBlockTimerRef.current);
      copiedCodeBlockTimerRef.current = null;
    }
  }, [msg.id]);

  useEffect(() => {
    return () => {
      if (copiedCodeBlockTimerRef.current !== null) {
        window.clearTimeout(copiedCodeBlockTimerRef.current);
      }
    };
  }, []);

  const handleCodeBlockCopy = useCallback((blockId: string) => {
    setCopiedCodeBlockId(blockId);
    if (copiedCodeBlockTimerRef.current !== null) {
      window.clearTimeout(copiedCodeBlockTimerRef.current);
    }
    copiedCodeBlockTimerRef.current = window.setTimeout(() => {
      setCopiedCodeBlockId((currentBlockId) => currentBlockId === blockId ? null : currentBlockId);
      copiedCodeBlockTimerRef.current = null;
    }, themeUiFeedbackTokens.copyFeedbackDurationMs);
  }, []);

  if (
    shouldHideManagedAuthError &&
    contentWithoutThinking.length === 0 &&
    computerCommandStatuses.length === 0
  ) {
    return null;
  }

  return (
    <div className="w-full pl-[var(--vlaina-space-15px)]" data-chat-selection-surface="true">
        <div className="[&>*:last-child]:mb-0">
            <WebSearchStatusBlock
                statuses={webSearchStatuses}
                isWaitingForAnswer={isLoading && contentWithoutThinking.length === 0}
            />
            <ComputerCommandStatusBlock
                isLoading={isLoading}
                statuses={computerCommandStatuses}
            />
            <LazyMarkdownRenderer
                content={visibleContent}
                imageGallery={imageGallery}
                getImageGallery={getImageGallery}
                imageIdBase={msg.id}
                codeBlockIdBase={msg.id}
                copiedCodeBlockId={copiedCodeBlockId}
                onCopyCodeBlock={handleCodeBlockCopy}
                startTime={startTime}
                isStreaming={isStreamingContentVisible}
                suspendStreamAnimation={suspendStreamAnimation}
            />
        </div>

        {errorContent && !shouldHideManagedAuthError && (
            <div className="mt-2">
                <ErrorBlock 
                    type={errorType} 
                    code={errorCode} 
                    content={errorContent}
                />
            </div>
        )}

        <MessageToolbar
                msg={msg}
                isLoading={isLoading}
                forceVisible={shouldForceToolbarVisible}
                showCopyAction={!isManagedAuthErrorMessage}
                showVersionNavigation={!isManagedAuthErrorMessage}
                onCopy={onCopy}
                onFork={isManagedAuthErrorMessage ? undefined : onFork}
                onRegenerate={onRegenerate}
                onSwitchVersion={onSwitchVersion}
            />
    </div>
  );
}
