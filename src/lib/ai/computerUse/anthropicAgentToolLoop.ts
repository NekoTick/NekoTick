import { AIErrorType, type ChatSendOptions } from '@/lib/ai/types';
import { createAIError } from '@/lib/ai/errors';
import { translate } from '@/lib/i18n';
import { buildWebSearchTools } from '@/lib/ai/webSearch/toolDefinitions';
import { sanitizeWebSearchStatus } from '@/lib/ai/webSearch/statusMarkup';
import type { OpenAIStreamToolResult, OpenAIToolCall, OpenAIWireMessage } from '@/lib/ai/webSearch/openAIToolTypes';
import { isSafeOpenAIToolCallId } from '@/lib/ai/webSearch/openAIToolCallIds';
import type { WebSearchStatus } from '@/lib/ai/webSearch/types';
import {
  appendSuccessfulReadSources,
  buildFinalAssistantTranscriptMessage,
  emitApiTranscript,
  hasVisibleAnswerContent,
  throwIfAborted,
  withSourceLinks,
  withStatusPrefix,
} from '@/lib/ai/webSearch/openAIToolLoopShared';
import { executeAgentToolCall } from './agentToolRuntime';
import { buildComputerUseTools, COMPUTER_USE_SYSTEM_INSTRUCTION } from './toolDefinitions';
import { serializeComputerCommandStatus } from './toolResult';
import type { ComputerCommandApprovalContext, ComputerCommandStatus } from './types';

const MAX_ANTHROPIC_AGENT_LOOPS = 8;
const MAX_ANTHROPIC_AGENT_TOOL_CALLS = 16;
const MAX_ANTHROPIC_CONTENT_BLOCKS = 32;
const MAX_ANTHROPIC_TEXT_CHARS = 1024 * 1024;

interface AnthropicAgentToolLoopOptions {
  approvalContext?: ComputerCommandApprovalContext;
  body: Record<string, unknown>;
  defaultCwd?: string;
  onChunk: (content: string) => void;
  onApiTranscript?: ChatSendOptions['onApiTranscript'];
  onCommandStatus?: (status: ComputerCommandStatus) => void;
  onWebSearchStatus?: (status: WebSearchStatus) => void;
  requestJson: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  signal?: AbortSignal;
  webSearchEnabled: boolean;
}

interface AnthropicParsedResult extends OpenAIStreamToolResult {
  blocks: Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildAnthropicAgentTools(webSearchEnabled: boolean): Array<Record<string, unknown>> {
  const tools = [
    ...buildComputerUseTools(),
    ...(webSearchEnabled ? buildWebSearchTools() : []),
  ];
  return tools.flatMap((tool) => {
    const fn = isRecord(tool.function) ? tool.function : null;
    if (!fn || typeof fn.name !== 'string' || !isRecord(fn.parameters)) return [];
    return [{
      name: fn.name,
      ...(typeof fn.description === 'string' ? { description: fn.description } : {}),
      input_schema: fn.parameters,
    }];
  });
}

function parseAnthropicResult(payload: Record<string, unknown>): AnthropicParsedResult {
  const rawBlocks = Array.isArray(payload.content)
    ? payload.content.slice(0, MAX_ANTHROPIC_CONTENT_BLOCKS)
    : [];
  const blocks: Array<Record<string, unknown>> = [];
  const toolCalls: OpenAIToolCall[] = [];
  const toolCallIds = new Set<string>();
  const text: string[] = [];
  const reasoning: string[] = [];
  let remainingTextChars = MAX_ANTHROPIC_TEXT_CHARS;

  for (const rawBlock of rawBlocks) {
    if (!isRecord(rawBlock) || typeof rawBlock.type !== 'string') continue;
    if (rawBlock.type === 'text' && typeof rawBlock.text === 'string') {
      const value = rawBlock.text.slice(0, remainingTextChars);
      if (!value) continue;
      remainingTextChars -= value.length;
      text.push(value);
      blocks.push({ type: 'text', text: value });
      continue;
    }
    if (rawBlock.type === 'thinking' && typeof rawBlock.thinking === 'string') {
      const value = rawBlock.thinking.slice(0, remainingTextChars);
      if (!value) continue;
      remainingTextChars -= value.length;
      reasoning.push(value);
      blocks.push({ type: 'thinking', thinking: value });
      continue;
    }
    if (
      rawBlock.type === 'tool_use' &&
      isSafeOpenAIToolCallId(rawBlock.id) &&
      !toolCallIds.has(rawBlock.id) &&
      typeof rawBlock.name === 'string'
    ) {
      let input: Record<string, unknown> = {};
      let args = '{}';
      try {
        const candidate = isRecord(rawBlock.input) ? rawBlock.input : {};
        const serialized = JSON.stringify(candidate);
        if (serialized.length <= 64 * 1024) {
          input = candidate;
          args = serialized;
        }
      } catch {}
      const id = rawBlock.id.slice(0, 512);
      const name = rawBlock.name.slice(0, 128);
      if (!id || !name) continue;
      toolCallIds.add(id);
      toolCalls.push({ id, type: 'function', function: { name, arguments: args } });
      blocks.push({ type: 'tool_use', id, name, input });
    }
  }

  const assistantContent = text.join('');
  const reasoningContent = reasoning.join('\n\n');
  return {
    blocks,
    assistantContent,
    reasoningContent,
    toolCalls,
    content: reasoningContent
      ? `<think>${reasoningContent}</think>${assistantContent}`
      : assistantContent,
  };
}

function appendAgentInstruction(body: Record<string, unknown>): string {
  const existing = typeof body.system === 'string' ? body.system.trim() : '';
  return [
    existing,
    COMPUTER_USE_SYSTEM_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
}

export async function runAnthropicAgentToolLoop(options: AnthropicAgentToolLoopOptions): Promise<string> {
  const messages = Array.isArray(options.body.messages) ? [...options.body.messages] : [];
  const responseTranscript: OpenAIWireMessage[] = [];
  const webStatuses: WebSearchStatus[] = [];
  const sourceUrls: string[] = [];
  const deniedCommandKeys = new Set<string>();
  let commandApprovalCount = 0;
  let totalToolCalls = 0;
  let visibleContent = '';

  const emitVisible = (content = visibleContent) => {
    visibleContent = content;
    options.onChunk(withStatusPrefix(webStatuses, visibleContent));
  };
  const emitTranscript = (allowAborted = false) => {
    if (allowAborted) {
      options.onApiTranscript?.(responseTranscript);
      return;
    }
    emitApiTranscript(options.onApiTranscript, options.signal, responseTranscript);
  };
  const emitWebStatus = (status: WebSearchStatus) => {
    const safe = sanitizeWebSearchStatus(status);
    if (!safe) return;
    webStatuses.push(safe);
    appendSuccessfulReadSources(sourceUrls, safe);
    options.onWebSearchStatus?.(safe);
    emitVisible();
  };

  for (let loopIndex = 0; loopIndex <= MAX_ANTHROPIC_AGENT_LOOPS; loopIndex += 1) {
    throwIfAborted(options.signal);
    const payload = await options.requestJson({
      ...options.body,
      messages,
      system: appendAgentInstruction(options.body),
      stream: false,
      tools: buildAnthropicAgentTools(options.webSearchEnabled),
      tool_choice: { type: 'auto' },
    });
    throwIfAborted(options.signal);
    const result = parseAnthropicResult(payload);

    if (result.toolCalls.length === 0) {
      if (!hasVisibleAnswerContent(result.assistantContent)) {
        if (commandApprovalCount === 0 && loopIndex < MAX_ANTHROPIC_AGENT_LOOPS) {
          messages.push({
            role: 'user',
            content: 'Provide a visible answer now. Do not call more tools unless required to finish the request.',
          });
          emitVisible('');
          continue;
        }
        throw createAIError(
          AIErrorType.INVALID_REQUEST,
          translate('chat.computerUse.noVisibleAnswer'),
        );
      }
      const finalApiContent = withSourceLinks(result.assistantContent, sourceUrls);
      responseTranscript.push(buildFinalAssistantTranscriptMessage(finalApiContent, result.reasoningContent));
      emitTranscript();
      const finalContent = withSourceLinks(result.content, sourceUrls);
      emitVisible(finalContent);
      return withStatusPrefix(webStatuses, finalContent);
    }

    if (loopIndex >= MAX_ANTHROPIC_AGENT_LOOPS) {
      throw createAIError(
        AIErrorType.INVALID_REQUEST,
        translate('chat.computerUse.loopLimit'),
      );
    }

    const remainingToolCalls = Math.max(0, MAX_ANTHROPIC_AGENT_TOOL_CALLS - totalToolCalls);
    if (result.toolCalls.length > remainingToolCalls) {
      throw createAIError(
        AIErrorType.INVALID_REQUEST,
        translate('chat.computerUse.toolCallLimit'),
      );
    }
    const calls = result.toolCalls;
    totalToolCalls += calls.length;
    messages.push({ role: 'assistant', content: result.blocks });
    emitVisible('');

    const anthropicToolResults: Array<Record<string, unknown>> = [];
    for (const [callIndex, toolCall] of calls.entries()) {
      const toolMessage: OpenAIWireMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: '',
      };
      responseTranscript.push({
        role: 'assistant',
        content: callIndex === 0 ? result.assistantContent : '',
        ...(callIndex === 0 && result.reasoningContent
          ? { reasoning_content: result.reasoningContent }
          : {}),
        tool_calls: [toolCall],
      }, toolMessage);
      const execution = await executeAgentToolCall(toolCall, {
        approvalContext: options.approvalContext,
        commandApprovalCount,
        deniedCommandKeys,
        defaultCwd: options.defaultCwd,
        signal: options.signal,
        webSearchEnabled: options.webSearchEnabled,
        onWebSearchStatus: emitWebStatus,
        onCommandStatus: (status) => {
          toolMessage.content = serializeComputerCommandStatus(status);
          options.onCommandStatus?.(status);
          const terminal = status.phase !== 'awaiting_approval' && status.phase !== 'running';
          emitTranscript(options.signal?.aborted === true && terminal);
        },
      });
      commandApprovalCount = execution.commandApprovalCount;
      toolMessage.content = execution.localContent ?? execution.content;
      anthropicToolResults.push({
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: execution.content,
      });
      emitTranscript();
    }
    messages.push({ role: 'user', content: anthropicToolResults });
  }

  throw createAIError(
    AIErrorType.INVALID_REQUEST,
    translate('chat.computerUse.loopLimit'),
  );
}
