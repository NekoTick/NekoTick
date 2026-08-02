import { runWebSearchToolCall } from '@/lib/ai/webSearch/toolRunner';
import { WEB_SEARCH_TOOL_NAMES } from '@/lib/ai/webSearch/toolDefinitions';
import type { WebSearchExecutionSession } from '@/lib/ai/webSearch/executionSession';
import type { WebSearchStatus } from '@/lib/ai/webSearch/types';
import type { OpenAIToolCall } from '@/lib/ai/webSearch/openAIToolTypes';
import { runDesktopComputerCommand } from './client';
import { parseComputerCommandArguments } from './toolArguments';
import { buildComputerCommandStatus, serializeComputerCommandStatus } from './toolResult';
import {
  COMPUTER_COMMAND_TOOL_NAME,
  type ComputerCommandApprovalContext,
  type ComputerCommandStatus,
} from './types';

const WEB_TOOL_NAMES = new Set<string>(Object.values(WEB_SEARCH_TOOL_NAMES));

export interface AgentToolRuntimeOptions {
  commandApprovalCount: number;
  deniedCommandKeys: Set<string>;
  approvalContext?: ComputerCommandApprovalContext;
  defaultCwd?: string;
  signal?: AbortSignal;
  webSearchEnabled: boolean;
  webSearchSession?: WebSearchExecutionSession;
  onCommandStatus: (status: ComputerCommandStatus) => void;
  onWebSearchStatus?: (status: WebSearchStatus) => void;
}

export interface AgentToolExecutionResult {
  content: string;
  localContent?: string;
  commandApprovalCount: number;
}

function commandKey(command: string, cwd: string): string {
  return `${cwd}\u0000${command}`;
}

export async function executeAgentToolCall(
  toolCall: OpenAIToolCall,
  options: AgentToolRuntimeOptions,
): Promise<AgentToolExecutionResult> {
  if (toolCall.function.name === COMPUTER_COMMAND_TOOL_NAME) {
    const args = parseComputerCommandArguments(toolCall.function.arguments);
    if (!args) {
      return {
        content: JSON.stringify({ error: 'Invalid run_command arguments.' }),
        commandApprovalCount: options.commandApprovalCount,
      };
    }
    const cwd = args.cwd || options.defaultCwd || '';
    const key = commandKey(args.command, cwd);
    if (options.deniedCommandKeys.has(key)) {
      const denied = buildComputerCommandStatus(toolCall.id, 'denied', args, {
        cwd: args.cwd || '',
        stderr: 'The user already denied this exact command during the current request.',
      });
      options.onCommandStatus(denied);
      return {
        content: serializeComputerCommandStatus(denied),
        commandApprovalCount: options.commandApprovalCount,
      };
    }
    if (options.commandApprovalCount >= 6) {
      const limited = buildComputerCommandStatus(toolCall.id, 'failed', args, {
        cwd: args.cwd || '',
        stderr: 'The per-request command approval limit was reached.',
      });
      options.onCommandStatus(limited);
      return {
        content: serializeComputerCommandStatus(limited),
        commandApprovalCount: options.commandApprovalCount,
      };
    }

    const result = await runDesktopComputerCommand(toolCall, args, {
      approvalContext: options.approvalContext,
      defaultCwd: options.defaultCwd,
      signal: options.signal,
      onCommandStatus: options.onCommandStatus,
    });
    if (result.phase === 'denied') options.deniedCommandKeys.add(key);
    return {
      content: serializeComputerCommandStatus(result, { includeFileChanges: false }),
      localContent: serializeComputerCommandStatus(result),
      commandApprovalCount: options.commandApprovalCount + 1,
    };
  }

  if (WEB_TOOL_NAMES.has(toolCall.function.name)) {
    if (!options.webSearchEnabled) {
      return {
        content: 'Tool error: Web search is not enabled for this chat.',
        commandApprovalCount: options.commandApprovalCount,
      };
    }
    return {
      content: await runWebSearchToolCall(toolCall.function, {
        onStatus: options.onWebSearchStatus,
        signal: options.signal,
        session: options.webSearchSession,
      }),
      commandApprovalCount: options.commandApprovalCount,
    };
  }

  return {
    content: `Tool error: Unsupported tool ${toolCall.function.name}.`,
    commandApprovalCount: options.commandApprovalCount,
  };
}
