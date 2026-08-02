import { actions as aiActions } from '@/stores/useAIStore';
import { openaiClient } from '@/lib/ai/providers/openai';
import { type AIModel, type ChatMessage, type ChatMessageContent, type ChatSendOptions, type Provider } from '@/lib/ai/types';
import { isManagedProviderId } from '@/lib/ai/managedService';
import {
  getVerifiedModelEndpointType,
  getVerifiedProviderEndpointType,
} from '@/lib/ai/endpointFallback';
import {
  sendWithoutReplay,
  throwIfAborted,
} from './preStreamRetry';

interface EndpointFallbackClient {
  sendMessage(
    content: ChatMessageContent,
    history: ChatMessage[],
    model: AIModel,
    provider: Provider,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    options?: ChatSendOptions
  ): Promise<string>;
}

interface SendMessageWithEndpointFallbackOptions {
  content: ChatMessageContent;
  history: ChatMessage[];
  model: AIModel;
  provider: Provider;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
  options?: ChatSendOptions;
  client?: EndpointFallbackClient;
  updateProvider?: (providerId: string, updates: Partial<Provider>) => void;
}

export async function sendMessageWithEndpointFallback({
  content,
  history,
  model,
  provider,
  onChunk,
  signal,
  options,
  client = openaiClient,
  updateProvider = aiActions.updateProvider,
}: SendMessageWithEndpointFallbackOptions): Promise<string> {
  throwIfAborted(signal);
  if (import.meta.env.DEV) {
    const { maybeSendChatE2EMockMessage } = await import('@/lib/e2e/chatE2EMock');
    const e2eMockResult = await maybeSendChatE2EMockMessage({
      content,
      history,
      model,
      provider,
      onChunk,
      signal,
      options,
    });
    if (e2eMockResult.handled) {
      return e2eMockResult.content;
    }
  }

  const sendWithActiveClient: EndpointFallbackClient['sendMessage'] = (...args) => client.sendMessage(...args);
  const verifiedModelEndpointType = getVerifiedModelEndpointType(model);
  const verifiedProviderEndpointType = getVerifiedProviderEndpointType(provider);
  const isManagedProvider = isManagedProviderId(provider.id);
  if (isManagedProvider) {
    return sendWithoutReplay(
      (trackedOnChunk) => sendWithActiveClient(content, history, model, provider, trackedOnChunk, signal, options),
      onChunk,
      signal,
    );
  }

  const endpointType = verifiedModelEndpointType ?? verifiedProviderEndpointType ?? 'openai';
  const result = await sendWithoutReplay(
    (trackedOnChunk) => sendWithActiveClient(
      content,
      history,
      model,
      { ...provider, endpointType },
      trackedOnChunk,
      signal,
      options,
    ),
    onChunk,
    signal,
  );
  throwIfAborted(signal);
  if (!verifiedModelEndpointType && !verifiedProviderEndpointType) {
    updateProvider(provider.id, { endpointType: 'openai', endpointTypeCheckedAt: Date.now() });
  }
  return result;
}
