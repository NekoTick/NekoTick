import {
  appendOpenAIToolArguments,
  boundedToolString,
  limitOpenAIToolArguments,
  normalizeOpenAIToolArgumentsValue,
} from './openAIToolArguments';
import type { OpenAIToolCall } from './openAIToolTypes';
import { filterUniqueOpenAIToolCalls } from './openAIToolCallIds';
export {
  canParseOpenAIToolArguments,
  limitOpenAIToolArguments,
  normalizeOpenAIToolArgumentsValue,
  MAX_OPENAI_TOOL_ARGUMENT_CHARS,
} from './openAIToolArguments';
export { appendWebSearchSystemInstruction } from './openAIToolSystemInstruction';

export const MAX_OPENAI_TOOL_CALLS = 16;
export const MAX_DSML_TOOL_MARKUP_CHARS = 256 * 1024;
export const MAX_OPENAI_PAYLOAD_TEXT_CHARS = 1024 * 1024;
export const MAX_OPENAI_PAYLOAD_LINE_CHARS = MAX_OPENAI_PAYLOAD_TEXT_CHARS + 32;
const MAX_OPENAI_TOOL_CALL_INDEX_STRING_CHARS = 16;
const MAX_OPENAI_TEXT_NODES = 2000;
const MAX_OPENAI_TEXT_CHARS = 1024 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseOpenAIPayloadText(text: string): Record<string, unknown> | null {
  if (text.length > MAX_OPENAI_PAYLOAD_LINE_CHARS) return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed === '[DONE]') return null;
  const rawPayloadText = trimmed.startsWith('data:') ? trimmed.slice(5) : trimmed;
  if (rawPayloadText.length > MAX_OPENAI_PAYLOAD_TEXT_CHARS) return null;
  const payloadText = rawPayloadText.trim();
  if (!payloadText || payloadText === '[DONE]') return null;

  try {
    return JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseToolCallIndex(value: unknown): number | null {
  let parsed: number | null = null;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.length <= MAX_OPENAI_TOOL_CALL_INDEX_STRING_CHARS) {
    const trimmed = value.trim();
    parsed = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
  }
  return typeof parsed === 'number'
    && Number.isInteger(parsed)
    && parsed >= 0
    && parsed < MAX_OPENAI_TOOL_CALLS
    ? parsed
    : null;
}

function nextToolCallIndex(toolCalls: OpenAIToolCall[]): number {
  return toolCalls.length < MAX_OPENAI_TOOL_CALLS ? toolCalls.length : -1;
}

function resolveToolCallIndex(
  deltaCall: Record<string, unknown>,
  deltaFunction: Record<string, unknown>,
  toolCalls: OpenAIToolCall[],
): number {
  const explicitIndex = parseToolCallIndex(deltaCall.index);
  if (explicitIndex != null) {
    return explicitIndex;
  }

  const id = typeof deltaCall.id === 'string' && deltaCall.id.trim() ? deltaCall.id : '';
  if (id) {
    const existingIndex = toolCalls.findIndex((call) => call?.id === id);
    if (existingIndex >= 0) {
      return existingIndex;
    }

    const name = typeof deltaFunction.name === 'string' ? deltaFunction.name : '';
    const unidentifiedIndex = toolCalls.findIndex((call) =>
      call && !call.id && (!name || !call.function.name || call.function.name === name)
    );
    if (unidentifiedIndex >= 0) {
      return unidentifiedIndex;
    }

    return nextToolCallIndex(toolCalls);
  }

  const hasArguments = typeof deltaFunction.arguments === 'string';
  const hasName = typeof deltaFunction.name === 'string' && deltaFunction.name.trim().length > 0;
  if (hasArguments && !hasName && toolCalls.length > 0) {
    for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
      if (toolCalls[index]) {
        return index;
      }
    }
  }

  return nextToolCallIndex(toolCalls);
}

export function extractOpenAIToolCalls(payload: Record<string, unknown>, toolCalls: OpenAIToolCall[]): void {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const delta = isRecord(choice) && isRecord(choice.delta) ? choice.delta : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  const isIncremental = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
  const source = isIncremental ? delta : Array.isArray(message?.tool_calls) ? message : null;
  if (!source || !Array.isArray(source.tool_calls)) {
    return;
  }

  for (const deltaCall of source.tool_calls.slice(0, MAX_OPENAI_TOOL_CALLS)) {
    if (!isRecord(deltaCall)) continue;
    const deltaFunction = isRecord(deltaCall.function) ? deltaCall.function : {};
    const index = resolveToolCallIndex(deltaCall, deltaFunction, toolCalls);
    if (index < 0 || index >= MAX_OPENAI_TOOL_CALLS) continue;
    const existing = toolCalls[index] ?? {
      id: '',
      type: 'function' as const,
      function: { name: '', arguments: '' },
    };
    toolCalls[index] = {
      id: boundedToolString(deltaCall.id, 512) || existing.id,
      type: 'function',
      function: {
        name: boundedToolString(deltaFunction.name, 128) || existing.function.name,
        arguments: isIncremental && typeof deltaFunction.arguments === 'string'
          ? appendOpenAIToolArguments(existing.function.arguments, deltaFunction.arguments)
          : deltaFunction.arguments === undefined
            ? existing.function.arguments
            : normalizeOpenAIToolArgumentsValue(deltaFunction.arguments),
      },
    };
  }
}

export function extractOpenAIText(value: unknown): string {
  if (typeof value === 'string') return value;

  const parts: string[] = [];
  const stack = [value];
  let visitedNodes = 0;
  let textLength = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    visitedNodes += 1;
    if (visitedNodes > MAX_OPENAI_TEXT_NODES) {
      return '';
    }

    if (typeof current === 'string') {
      textLength += current.length;
      if (textLength > MAX_OPENAI_TEXT_CHARS) {
        return '';
      }
      parts.push(current);
      continue;
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }

    if (!isRecord(current)) {
      continue;
    }

    if (typeof current.text === 'string') {
      stack.push(current.text);
    } else if (typeof current.content === 'string') {
      stack.push(current.content);
    }
  }

  return parts.join('');
}

function dsmlPattern(name: string): string {
  return `<[|｜]{2}\\s*DSML\\s*[|｜]{2}\\s*${name}`;
}

const DSML_TOOL_CALLS_BLOCK_RE = new RegExp(
  `${dsmlPattern('tool_calls')}[^>]*>[\\s\\S]*?<\\/[|｜]{2}\\s*DSML\\s*[|｜]{2}\\s*tool_calls\\s*>`,
  'gi',
);

const DSML_INVOKE_RE = new RegExp(
  `${dsmlPattern('invoke')}\\s+name=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/[|｜]{2}\\s*DSML\\s*[|｜]{2}\\s*invoke\\s*>`,
  'gi',
);

const DSML_PARAMETER_RE = new RegExp(
  `${dsmlPattern('parameter')}\\s+name=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/[|｜]{2}\\s*DSML\\s*[|｜]{2}\\s*parameter\\s*>`,
  'gi',
);

export function stripDsmlToolCallMarkup(content: string): string {
  if (content.length > MAX_DSML_TOOL_MARKUP_CHARS) {
    return content;
  }
  return content.replace(DSML_TOOL_CALLS_BLOCK_RE, '').trim();
}

function extractDsmlToolCalls(content: string): OpenAIToolCall[] {
  if (content.length > MAX_DSML_TOOL_MARKUP_CHARS) {
    return [];
  }

  const calls: OpenAIToolCall[] = [];
  for (const block of content.matchAll(DSML_TOOL_CALLS_BLOCK_RE)) {
    if (calls.length >= MAX_OPENAI_TOOL_CALLS) break;
    const blockText = block[0];
    for (const invoke of blockText.matchAll(DSML_INVOKE_RE)) {
      if (calls.length >= MAX_OPENAI_TOOL_CALLS) break;
      const name = boundedToolString(invoke[1]?.trim(), 128);
      const body = invoke[2] ?? '';
      if (!name) continue;
      const args: Record<string, string> = {};
      for (const parameter of body.matchAll(DSML_PARAMETER_RE)) {
        const key = boundedToolString(parameter[1]?.trim(), 128);
        if (!key) continue;
        args[key] = limitOpenAIToolArguments((parameter[2] ?? '').trim());
      }
      calls.push({
        id: `dsml_${calls.length}`,
        type: 'function',
        function: {
          name,
          arguments: normalizeOpenAIToolArgumentsValue(args),
        },
      });
    }
  }
  return calls;
}

export function extractOpenAIMessageFromJson(payload: Record<string, unknown>): {
  content: string;
  reasoningContent: string;
  toolCalls: OpenAIToolCall[];
} {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : {};
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const rawContent = extractOpenAIText(message.content);
  const dsmlToolCalls = extractDsmlToolCalls(rawContent);

  const toolCalls: OpenAIToolCall[] = [];
  const rawToolCallCount = Math.min(rawToolCalls.length, MAX_OPENAI_TOOL_CALLS);
  for (let index = 0; index < rawToolCallCount; index += 1) {
    const rawCall = rawToolCalls[index];
    if (!isRecord(rawCall) || !isRecord(rawCall.function)) continue;
    const id = boundedToolString(rawCall.id, 512);
    const name = boundedToolString(rawCall.function.name, 128);
    const args = normalizeOpenAIToolArgumentsValue(rawCall.function.arguments);
    if (!id || !name) continue;
    toolCalls.push({ id, type: 'function', function: { name, arguments: args } });
  }

  return {
    content: stripDsmlToolCallMarkup(rawContent),
    reasoningContent: extractOpenAIText(message.reasoning_content ?? message.reasoning),
    toolCalls: filterUniqueOpenAIToolCalls(
      toolCalls.concat(dsmlToolCalls),
    ).slice(0, MAX_OPENAI_TOOL_CALLS),
  };
}
