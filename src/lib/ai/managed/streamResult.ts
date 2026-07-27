import { extractOpenAIMessageFromJson } from '@/lib/ai/webSearch/openAIToolParsing';
import type { OpenAIStreamToolResult } from '@/lib/ai/webSearch/openAIToolTypes';

interface ManagedStreamResult {
  content: string;
  assistantContent?: string;
  reasoningContent?: string;
  toolCalls?: unknown[];
}

export function normalizeManagedStreamResult(
  result: ManagedStreamResult,
): OpenAIStreamToolResult {
  const parsed = extractOpenAIMessageFromJson({
    choices: [{
      message: {
        content: result.assistantContent ?? result.content,
        reasoning_content: result.reasoningContent,
        tool_calls: result.toolCalls,
      },
    }],
  });
  return {
    content: result.content,
    assistantContent: parsed.content,
    reasoningContent: parsed.reasoningContent,
    toolCalls: parsed.toolCalls,
  };
}
