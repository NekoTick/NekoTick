import type { OpenAIToolCall, OpenAIWireMessage } from '@/lib/ai/webSearch/openAIToolTypes';

export const COMPUTER_COMMAND_TOOL_NAME = 'run_command';
export const COMPUTER_COMMAND_RESULT_KIND = 'vlaina-computer-command';
export const COMPUTER_COMMAND_RESULT_VERSION = 1;

export type ComputerCommandPhase =
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'denied'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted';

export interface ComputerFileChange {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  patch?: string;
  truncated?: boolean;
}

export interface ComputerCommandStatus {
  id: string;
  phase: ComputerCommandPhase;
  command: string;
  cwd: string;
  purpose?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  truncated?: boolean;
  durationMs?: number;
  fileChanges?: ComputerFileChange[];
  fileChangesTruncated?: boolean;
  updatedAt: number;
}

export interface ComputerCommandToolResult extends Omit<ComputerCommandStatus, 'id'> {
  kind: typeof COMPUTER_COMMAND_RESULT_KIND;
  version: typeof COMPUTER_COMMAND_RESULT_VERSION;
}

export interface ComputerToolLoopCallbacks {
  onApiTranscript?: (messages: OpenAIWireMessage[]) => void;
  onCommandStatus?: (status: ComputerCommandStatus) => void;
}

export interface ComputerCommandApprovalContext {
  sessionId: string;
  messageId: string;
}

export interface ComputerToolRuntimeOptions extends ComputerToolLoopCallbacks {
  approvalContext?: ComputerCommandApprovalContext;
  defaultCwd?: string;
  signal?: AbortSignal;
}

export interface ParsedComputerCommandArguments {
  command: string;
  cwd?: string;
  purpose?: string;
  timeoutSeconds?: number;
}

export type ComputerToolCall = OpenAIToolCall;
