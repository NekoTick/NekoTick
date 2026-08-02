import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import type { AIModel, ChatMessage, Provider } from '@/lib/ai/types';
import { AIErrorType } from '@/lib/ai/types';
import { useToastStore } from '@/stores/useToastStore';
import { translate } from '@/lib/i18n';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { sendMessageWithEndpointFallback } from '@/hooks/chatService/sendMessageWithEndpointFallback';
import { getUserFacingAIError } from '@/lib/ai/errors';
import { isErrorNamed } from '@/lib/ai/errorClassification';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { isManagedBudgetExhausted } from '@/lib/ai/managedQuota';
import { applyManagedQuotaExhaustedSnapshot, useManagedAIStore } from '@/stores/useManagedAIStore';
import { parseStandaloneFencedCodeBlock } from '../../clipboard/fencedCodePaste';
import {
  buildEditorAiUserMessage,
  MAX_EDITOR_AI_INSTRUCTION_CHARS,
} from './promptBuilder';
import { EDITOR_AI_SYSTEM_PROMPT } from './promptCatalog';
import { assertEnglishPromptText } from './promptValidation';
import type { AiRequestOptions } from './selectionCommandTypes';
import {
  getAiSelectionResultTooLargeMessage,
  isAiSelectionTextTooLarge,
} from './selectionLimits';

interface AiRequestResult {
  suggestedText: string | null;
  errorMessage: string | null;
  errorType?: string | null;
  errorCode?: string | null;
}

function createSystemMessage(content: string, modelId: string): ChatMessage {
  const now = Date.now();
  return {
    id: `editor-ai-${crypto.randomUUID()}`,
    role: 'system',
    content,
    modelId,
    timestamp: now,
    versions: [{ content, createdAt: now, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

function unwrapSingleCodeFence(text: string): string {
  return parseStandaloneFencedCodeBlock(text)?.code ?? text;
}

export function normalizeAiEditedText(text: string): string {
  return unwrapSingleCodeFence(stripThinkingContent(text)).trim();
}

function getSelectedModelAndProvider(): { model: AIModel; provider: Provider } | null {
  const ai = useUnifiedStore.getState().data.ai;

  if (!ai) {
    return null;
  }

  const model = ai.selectedModelId
    ? ai.models.find((item) => item.id === ai.selectedModelId && item.enabled)
    : undefined;

  if (!model) {
    return null;
  }

  const provider = ai.providers.find((item) => item.id === model.providerId && item.enabled);
  if (!provider) {
    return null;
  }

  return { model, provider };
}

export async function requestAiEdit(
  instruction: string,
  selectedText: string,
  context?: { beforeContext?: string; afterContext?: string },
  signal?: AbortSignal,
  options?: AiRequestOptions
): Promise<AiRequestResult> {
  const trimmedInstruction = instruction.trim();
  const reportError = (message: string): AiRequestResult => {
    if (!options?.suppressToast) {
      useToastStore.getState().addToast(message, 'error', 4000);
    }
    return {
      suggestedText: null,
      errorMessage: message,
    };
  };

  try {
    if (trimmedInstruction.length > MAX_EDITOR_AI_INSTRUCTION_CHARS) {
      return reportError(translate('editor.ai.instructionTooLarge'));
    }
    assertEnglishPromptText('requestAiEdit.instruction', trimmedInstruction);
    assertEnglishPromptText('requestAiEdit.systemPrompt', EDITOR_AI_SYSTEM_PROMPT);
  } catch {
    return reportError(translate('editor.ai.promptEnglishOnly'));
  }

  const resolved = getSelectedModelAndProvider();
  if (!resolved) {
    return reportError(translate('editor.ai.modelRequired'));
  }

  const { model, provider } = resolved;
  const isManaged = isManagedProviderId(provider.id);
  if (isManaged && isManagedBudgetExhausted(useManagedAIStore.getState().budget)) {
    applyManagedQuotaExhaustedSnapshot();
    return {
      suggestedText: null,
      errorMessage: translate('chat.freeRepliesExhausted'),
      errorType: AIErrorType.QUOTA_EXHAUSTED,
      errorCode: 'quota_exhausted',
    };
  }

  const history: ChatMessage[] = [createSystemMessage(EDITOR_AI_SYSTEM_PROMPT, model.id)];
  const message = buildEditorAiUserMessage(trimmedInstruction, selectedText, context);

  try {
    const result = await sendMessageWithEndpointFallback({
      content: message,
      history,
      model,
      provider,
      onChunk: () => {},
      signal,
    });
    const normalized = normalizeAiEditedText(result);

    if (normalized.length === 0) {
      return reportError(translate('editor.ai.emptyResult'));
    }
    if (isAiSelectionTextTooLarge(normalized)) {
      return reportError(getAiSelectionResultTooLargeMessage());
    }

    return {
      suggestedText: normalized,
      errorMessage: null,
    };
  } catch (error) {
    if (isErrorNamed(error, 'AbortError')) {
      return {
        suggestedText: null,
        errorMessage: null,
      };
    }

    const normalized = getUserFacingAIError(error, { managed: isManaged });
    if (isManaged && normalized.type === AIErrorType.QUOTA_EXHAUSTED) {
      applyManagedQuotaExhaustedSnapshot();
    }
    const message = normalized.message;
    if (!options?.suppressToast) {
      useToastStore.getState().addToast(message, 'error', 4000);
    }
    return {
      suggestedText: null,
      errorMessage: message,
      errorType: normalized.type,
      errorCode: normalized.code,
    };
  }
}
