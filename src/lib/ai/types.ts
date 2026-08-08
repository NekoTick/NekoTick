import type { WebSearchStatus } from '@/lib/ai/webSearch/types'
import type {
  ComputerCommandApprovalContext,
  ComputerCommandStatus,
} from '@/lib/ai/computerUse/types'

export interface Provider {
  id: string
  name: string
  icon?: string
  type: 'newapi'
  endpointType?: 'openai' | 'anthropic'
  endpointTypeCheckedAt?: number
  apiHost: string
  apiKey: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface ApiTranscriptToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ApiTranscriptMessage {
  role: string
  content?: ChatMessageContent | null
  reasoning_content?: string
  tool_calls?: ApiTranscriptToolCall[]
  tool_call_id?: string
  name?: string
}

export interface AIModel {
  id: string
  apiModelId: string
  name: string
  providerId: string
  endpointType?: 'openai' | 'anthropic'
  endpointTypeCheckedAt?: number
  group?: string
  priceTier?: '$' | '$$' | '$$$' | '$$$$' | '$$$$$'
  priceScore?: number
  isFree?: boolean
  isDefault?: boolean
  enabled: boolean
  pinned?: boolean
  createdAt: number
}

export interface PersistedBenchmarkItem {
  status: 'success' | 'error'
  latency?: number
  error?: string
  checkedAt: number
}

export interface ProviderBenchmarkRecord {
  items: Record<string, PersistedBenchmarkItem>
  overall: 'idle' | 'success' | 'error'
  updatedAt: number
}

export interface ChatSession {
  id: string
  title: string
  modelId: string
  isPinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface MessageVersion {
    content: string;
    createdAt: number;
    kind: 'original' | 'regeneration' | 'edit';
    subsequentMessages: ChatMessage[]; 
    apiTranscript?: ApiTranscriptMessage[];
    webSearchStatuses?: WebSearchStatus[];
    requestContext?: ChatRequestContextSnapshot;
}

export interface ChatRequestContextSnapshot {
  text: string;
  imageSources?: string[];
  attachmentSources?: string[];
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  apiTranscript?: ApiTranscriptMessage[]
  webSearchStatuses?: WebSearchStatus[]
  imageSources?: string[]
  requestContext?: ChatRequestContextSnapshot
  modelId: string
  timestamp: number
  
  versions: MessageVersion[]
  currentVersionIndex: number
}

export type ChatMessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type ChatMessageContent = string | ChatMessageContentPart[];

export interface ChatCompletionRequest {
  model: string
  messages: ApiTranscriptMessage[]
  stream: boolean
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  tools?: Array<Record<string, any>>
  tool_choice?: 'auto' | 'none' | Record<string, any>
}

export interface ChatSendOptions {
  max_tokens?: number
  max_completion_tokens?: number
  webSearchEnabled?: boolean
  computerUseEnabled?: boolean
  computerUseCwd?: string
  computerUseApprovalContext?: ComputerCommandApprovalContext
  onWebSearchStatus?: (status: WebSearchStatus) => void
  onComputerCommandStatus?: (status: ComputerCommandStatus) => void
  onApiTranscript?: (messages: ApiTranscriptMessage[]) => void
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
}

export interface ChatCompletionStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
    }
    finish_reason: string | null
  }>
}

export enum AIErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_REQUEST = 'INVALID_REQUEST',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export interface AIError {
  type: AIErrorType
  message: string
  details?: string
  statusCode?: number
}
