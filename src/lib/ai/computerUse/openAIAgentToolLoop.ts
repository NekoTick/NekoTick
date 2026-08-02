import { AIErrorType, type ChatCompletionRequest } from '@/lib/ai/types';
import { createAIError } from '@/lib/ai/errors';
import { translate } from '@/lib/i18n';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { createWebSearchExecutionSession } from '@/lib/ai/webSearch/executionSession';
import { buildWebSearchTools, WEB_SEARCH_SYSTEM_INSTRUCTION } from '@/lib/ai/webSearch/toolDefinitions';
import { sanitizeWebSearchStatus } from '@/lib/ai/webSearch/statusMarkup';
import {
  consumeOpenAIStreamWithTools,
} from '@/lib/ai/webSearch/openAIStreamWithTools';
import type {
  OpenAIStreamToolResult,
  OpenAIWireMessage,
} from '@/lib/ai/webSearch/openAIToolTypes';
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
import { buildComputerUseTools, COMPUTER_USE_SYSTEM_INSTRUCTION } from './toolDefinitions';
import { executeAgentToolCall } from './agentToolRuntime';
import { serializeComputerCommandStatus } from './toolResult';
import {
  type ComputerCommandApprovalContext,
  type ComputerCommandStatus,
} from './types';

const MAX_AGENT_TOOL_LOOPS = 8;
const MAX_AGENT_TOOL_CALLS = 16;

interface AgentLoopBaseOptions {
  approvalContext?: ComputerCommandApprovalContext;
  body: ChatCompletionRequest;
  defaultCwd?: string;
  onChunk: (chunk: string) => void;
  onApiTranscript?: (messages: OpenAIWireMessage[]) => void;
  onCommandStatus?: (status: ComputerCommandStatus) => void;
  onWebSearchStatus?: (status: WebSearchStatus) => void;
  signal?: AbortSignal;
  webSearchEnabled: boolean;
}

interface StreamingAgentLoopOptions extends AgentLoopBaseOptions {
  request: (body: ChatCompletionRequest) => Promise<Response>;
}

interface StreamResultAgentLoopOptions extends AgentLoopBaseOptions {
  requestResult: (
    body: ChatCompletionRequest,
    onContent: (content: string) => void,
  ) => Promise<OpenAIStreamToolResult>;
}

function appendAgentSystemInstruction(
  messages: OpenAIWireMessage[],
  webSearchEnabled: boolean,
): OpenAIWireMessage[] {
  const content = [
    COMPUTER_USE_SYSTEM_INSTRUCTION,
    webSearchEnabled ? WEB_SEARCH_SYSTEM_INSTRUCTION : '',
  ].filter(Boolean).join(' ');
  const firstConversationMessage = messages.findIndex((message) => message.role !== 'system');
  const insertionIndex = firstConversationMessage === -1 ? messages.length : firstConversationMessage;
  return [
    ...messages.slice(0, insertionIndex),
    { role: 'system', content },
    ...messages.slice(insertionIndex),
  ];
}

function buildAgentTools(webSearchEnabled: boolean): Array<Record<string, unknown>> {
  return [
    ...buildComputerUseTools(),
    ...(webSearchEnabled ? buildWebSearchTools() : []),
  ];
}

function buildAssistantToolMessage(result: OpenAIStreamToolResult): OpenAIWireMessage {
  return {
    role: 'assistant',
    content: result.assistantContent || '',
    ...(result.reasoningContent ? { reasoning_content: result.reasoningContent } : {}),
    tool_calls: result.toolCalls,
  };
}

async function runAgentLoop(
  options: AgentLoopBaseOptions,
  requestResult: (body: ChatCompletionRequest, onContent: (content: string) => void) => Promise<OpenAIStreamToolResult>,
): Promise<string> {
  const statuses: WebSearchStatus[] = [];
  const sourceUrls: string[] = [];
  const responseTranscript: OpenAIWireMessage[] = [];
  const deniedCommandKeys = new Set<string>();
  const webSearchSession = options.webSearchEnabled ? createWebSearchExecutionSession() : undefined;
  let commandApprovalCount = 0;
  let totalToolCalls = 0;
  let visibleContent = '';
  let messages = appendAgentSystemInstruction(
    options.body.messages as OpenAIWireMessage[],
    options.webSearchEnabled,
  );

  const emitVisible = (content = visibleContent) => {
    visibleContent = content;
    options.onChunk(withStatusPrefix(statuses, visibleContent));
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
    statuses.push(safe);
    appendSuccessfulReadSources(sourceUrls, safe);
    options.onWebSearchStatus?.(safe);
    emitVisible();
  };

  for (let loopIndex = 0; loopIndex <= MAX_AGENT_TOOL_LOOPS; loopIndex += 1) {
    throwIfAborted(options.signal);
    const result = await requestResult({
      ...options.body,
      messages: messages as ChatCompletionRequest['messages'],
      tools: buildAgentTools(options.webSearchEnabled),
      tool_choice: 'auto',
    }, (content) => emitVisible(content));
    throwIfAborted(options.signal);

    if (result.toolCalls.length === 0) {
      const answer = result.assistantContent || stripThinkingContent(result.content);
      if (!hasVisibleAnswerContent(answer)) {
        if (commandApprovalCount === 0 && loopIndex < MAX_AGENT_TOOL_LOOPS) {
          messages = [...messages, {
            role: 'system',
            content: 'Provide a visible answer now. Do not call more tools unless required to finish the user request.',
          }];
          emitVisible('');
          continue;
        }
        throw createAIError(
          AIErrorType.INVALID_REQUEST,
          translate('chat.computerUse.noVisibleAnswer'),
        );
      }
      const finalApiContent = withSourceLinks(answer, sourceUrls);
      responseTranscript.push(buildFinalAssistantTranscriptMessage(finalApiContent, result.reasoningContent));
      emitTranscript();
      const finalContent = withSourceLinks(result.content || answer, sourceUrls);
      emitVisible(finalContent);
      return withStatusPrefix(statuses, finalContent);
    }

    if (loopIndex >= MAX_AGENT_TOOL_LOOPS) {
      throw createAIError(
        AIErrorType.INVALID_REQUEST,
        translate('chat.computerUse.loopLimit'),
      );
    }

    const remainingToolCalls = Math.max(0, MAX_AGENT_TOOL_CALLS - totalToolCalls);
    if (result.toolCalls.length > remainingToolCalls) {
      throw createAIError(
        AIErrorType.INVALID_REQUEST,
        translate('chat.computerUse.toolCallLimit'),
      );
    }
    const calls = result.toolCalls;
    totalToolCalls += calls.length;
    const assistantToolMessage = buildAssistantToolMessage(result);
    messages = [...messages, assistantToolMessage];
    emitVisible('');

    for (const [callIndex, toolCall] of calls.entries()) {
      const toolMessage: OpenAIWireMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: '',
      };
      responseTranscript.push({
        role: 'assistant',
        content: callIndex === 0 ? result.assistantContent || '' : '',
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
        webSearchSession,
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
      messages = [...messages, { ...toolMessage, content: execution.content }];
      emitTranscript();
    }
  }

  throw createAIError(
    AIErrorType.INVALID_REQUEST,
    translate('chat.computerUse.loopLimit'),
  );
}

export function runOpenAIStreamingAgentToolLoop(options: StreamingAgentLoopOptions): Promise<string> {
  return runAgentLoop(options, async (body, onContent) => {
    const response = await options.request(body);
    return await consumeOpenAIStreamWithTools(response, onContent, { signal: options.signal });
  });
}

export function runOpenAIStreamResultAgentToolLoop(options: StreamResultAgentLoopOptions): Promise<string> {
  return runAgentLoop(options, options.requestResult);
}
