import type { ApiTranscriptMessage, ChatMessage } from './types';
import { IMAGE_PLACEHOLDER } from './prompts';
import { normalizeApiTranscriptMessages } from './apiTranscript';
import { stripThinkingContent } from './stripThinkingContent';
import { sanitizeRequestTextImageReferences } from './requestContextImageSanitizer';
import { normalizeChatRequestContextSnapshot } from './requestContextSnapshot';
import {
  COMPUTER_COMMAND_RESULT_KIND,
  COMPUTER_COMMAND_RESULT_VERSION,
} from './computerUse/types';

const ERROR_TAG_GLOBAL_REGEX = /<error(?: type="([^"]*)")?(?: code="([^"]*)")?>([\s\S]*?)<\/error>/gi;

function stripLocalComputerFileChanges(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.kind !== COMPUTER_COMMAND_RESULT_KIND ||
      parsed.version !== COMPUTER_COMMAND_RESULT_VERSION
    ) return content;
    const result = { ...parsed };
    delete result.fileChanges;
    delete result.fileChangesTruncated;
    return JSON.stringify(result);
  } catch {
    return content;
  }
}

function getHistoryContentText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }

      const record = part as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') {
        return record.text;
      }

      if (record.type === 'image_url') {
        return IMAGE_PLACEHOLDER;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function sanitizeApiTranscriptContent(
  content: ApiTranscriptMessage['content'],
): ApiTranscriptMessage['content'] {
  if (typeof content === 'string') {
    return sanitizeRequestTextImageReferences(content);
  }

  if (!Array.isArray(content)) {
    return content;
  }

  return content.map((part) => {
    if (part.type !== 'text') {
      return part;
    }
    return {
      ...part,
      text: sanitizeRequestTextImageReferences(part.text),
    };
  });
}

function sanitizeApiTranscriptTextReferences(
  transcript: ApiTranscriptMessage[] | undefined,
): ApiTranscriptMessage[] | undefined {
  if (!transcript) {
    return undefined;
  }

  return transcript.map((message) => ({
    ...message,
    content: sanitizeApiTranscriptContent(
      message.role === 'tool' && typeof message.content === 'string'
        ? stripLocalComputerFileChanges(message.content)
        : message.content,
    ),
    ...(typeof message.reasoning_content === 'string'
      ? { reasoning_content: sanitizeRequestTextImageReferences(message.reasoning_content) }
      : {}),
  }));
}

function stripVersionApiTranscripts(versions: ChatMessage['versions']): ChatMessage['versions'] {
  if (!Array.isArray(versions)) {
    return [];
  }

  return versions.map((version) => {
    const { apiTranscript: _apiTranscript, subsequentMessages, ...rest } = version;
    return {
      ...rest,
      subsequentMessages: stripMessageApiTranscripts(subsequentMessages),
    };
  });
}

function stripMessageApiTranscripts(messages: ChatMessage[] | undefined): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((message) => {
    const { apiTranscript: _apiTranscript, ...rest } = message;
    return {
      ...rest,
      versions: stripVersionApiTranscripts(message.versions),
    };
  });
}

export function sanitizeHistoryMessage(msg: ChatMessage): ChatMessage {
  const rawContent = getHistoryContentText((msg as { content?: unknown }).content);
  const contentWithoutUiErrors = msg.role === 'assistant'
    ? rawContent.replace(ERROR_TAG_GLOBAL_REGEX, '').trim()
    : rawContent;
  const apiTranscript = sanitizeApiTranscriptTextReferences(normalizeApiTranscriptMessages(
    msg.apiTranscript ?? msg.versions?.[msg.currentVersionIndex]?.apiTranscript
  ));
  const rawRequestContext = msg.role === 'user'
    ? normalizeChatRequestContextSnapshot(
        msg.requestContext ?? msg.versions?.[msg.currentVersionIndex]?.requestContext,
      )
    : undefined;
  const requestContext = rawRequestContext
    ? {
        ...rawRequestContext,
        text: sanitizeRequestTextImageReferences(rawRequestContext.text),
      }
    : undefined;

  return {
    ...msg,
    content: sanitizeRequestTextImageReferences(stripThinkingContent(contentWithoutUiErrors)),
    apiTranscript,
    requestContext,
    versions: stripVersionApiTranscripts(msg.versions),
  };
}
