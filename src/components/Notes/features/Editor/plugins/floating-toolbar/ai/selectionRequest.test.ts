import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_SELECTION_RESULT_TOO_LARGE_MESSAGE,
  AI_SELECTION_TOO_LARGE_MESSAGE,
  MAX_AI_SELECTION_EDIT_CHARS,
} from './selectionLimits';
import {
  MAX_EDITOR_AI_CONTEXT_CHARS,
  MAX_EDITOR_AI_INSTRUCTION_CHARS,
} from './promptBuilder';

const mockAddToast = vi.fn();
const mockSendMessageWithEndpointFallback = vi.fn();
const mockGetSerializedSelectionText = vi.fn(() => 'Selected text');
const mockGetSerializedSelectionContext = vi.fn(() => ({
  beforeContext: '',
  afterContext: '',
}));
const mockHasSelectedBlocks = vi.fn(() => false);
const mockManagedAIState = {
  budget: null as null | {
    active: boolean;
    usedPercent: number;
    remainingPercent: number;
    status: string;
  },
  applyBudgetSnapshot: vi.fn((budget: {
    active: boolean;
    usedPercent: number;
    remainingPercent: number;
    status: string;
  }) => {
    mockManagedAIState.budget = budget;
  }),
};
const mockAIState = {
  selectedModelId: 'model-1',
  models: [{
    id: 'model-1',
    apiModelId: 'model-1',
    name: 'Model 1',
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
  }],
  providers: [{
    id: 'provider-1',
    name: 'Provider 1',
    type: 'newapi',
    apiHost: 'https://example.invalid',
    apiKey: 'test-key',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }],
};

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mockAddToast,
    }),
  },
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: {
    getState: () => ({
      data: {
        ai: mockAIState,
      },
    }),
  },
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  applyManagedQuotaExhaustedSnapshot: () => mockManagedAIState.applyBudgetSnapshot({
    active: false,
    usedPercent: 100,
    remainingPercent: 0,
    status: 'exhausted',
  }),
  useManagedAIStore: {
    getState: () => mockManagedAIState,
  },
}));

vi.mock('@/hooks/chatService/sendMessageWithEndpointFallback', () => ({
  sendMessageWithEndpointFallback: (...args: Parameters<typeof mockSendMessageWithEndpointFallback>) =>
    mockSendMessageWithEndpointFallback(...args),
}));

vi.mock('../../cursor/blockSelectionPluginState', () => ({
  hasSelectedBlocks: (...args: Parameters<typeof mockHasSelectedBlocks>) => mockHasSelectedBlocks(...args),
}));

vi.mock('./selectionEditing', () => ({
  getSerializedSelectionText: (...args: Parameters<typeof mockGetSerializedSelectionText>) =>
    mockGetSerializedSelectionText(...args),
  getSerializedSelectionContext: (...args: Parameters<typeof mockGetSerializedSelectionContext>) =>
    mockGetSerializedSelectionContext(...args),
}));

import {
  createAiSelectionSuggestionResult,
  retryAiSelectionSuggestionResult,
} from './selectionRequest';

function createView(from: number, to: number) {
  return {
    state: {
      selection: { from, to },
    },
  };
}

describe('selectionRequest', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    mockSendMessageWithEndpointFallback.mockReset();
    mockSendMessageWithEndpointFallback.mockResolvedValue('Updated text');
    mockGetSerializedSelectionText.mockClear();
    mockGetSerializedSelectionText.mockReturnValue('Selected text');
    mockGetSerializedSelectionContext.mockClear();
    mockGetSerializedSelectionContext.mockReturnValue({
      beforeContext: '',
      afterContext: '',
    });
    mockHasSelectedBlocks.mockClear();
    mockHasSelectedBlocks.mockReturnValue(false);
    mockManagedAIState.budget = null;
    mockManagedAIState.applyBudgetSnapshot.mockClear();
    mockAIState.selectedModelId = 'model-1';
    mockAIState.models = [{
      id: 'model-1',
      apiModelId: 'model-1',
      name: 'Model 1',
      providerId: 'provider-1',
      enabled: true,
      createdAt: 1,
    }];
    mockAIState.providers = [{
      id: 'provider-1',
      name: 'Provider 1',
      type: 'newapi',
      apiHost: 'https://example.invalid',
      apiKey: 'test-key',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    }];
  });

  it('does not serialize or send oversized text selections', async () => {
    const result = await createAiSelectionSuggestionResult(
      createView(1, MAX_AI_SELECTION_EDIT_CHARS + 2) as never,
      'Edit the selected text.'
    );

    expect(result).toEqual({
      suggestion: null,
      errorMessage: AI_SELECTION_TOO_LARGE_MESSAGE,
    });
    expect(mockGetSerializedSelectionText).not.toHaveBeenCalled();
    expect(mockSendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(AI_SELECTION_TOO_LARGE_MESSAGE, 'warning');
  });

  it('does not build suggestions from oversized model output', async () => {
    mockSendMessageWithEndpointFallback.mockResolvedValueOnce(
      'x'.repeat(MAX_AI_SELECTION_EDIT_CHARS + 1)
    );

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toEqual({
      suggestion: null,
      errorMessage: AI_SELECTION_RESULT_TOO_LARGE_MESSAGE,
      errorType: undefined,
      errorCode: undefined,
    });
    expect(mockSendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('does not send oversized AI edit instructions', async () => {
    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'a'.repeat(MAX_EDITOR_AI_INSTRUCTION_CHARS + 1),
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toEqual({
      suggestion: null,
      errorMessage: 'AI instruction is too large.',
      errorType: undefined,
      errorCode: undefined,
    });
    expect(mockSendMessageWithEndpointFallback).not.toHaveBeenCalled();
  });

  it('stores bounded context from provided selection sources', async () => {
    const beforeContext = 'b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 20);
    const afterContext = 'a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 20);

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      {
        from: 1,
        to: 14,
        originalText: 'Selected text',
        beforeContext,
        afterContext,
      },
      undefined,
      { suppressToast: true }
    );

    const sentContent = mockSendMessageWithEndpointFallback.mock.calls[0]?.[0]?.content;
    expect(sentContent).toContain('b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS));
    expect(sentContent).not.toContain('b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 1));
    expect(sentContent).toContain('a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS));
    expect(sentContent).not.toContain('a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 1));
    expect(result.suggestion).toMatchObject({
      originalText: 'Selected text',
      suggestedText: 'Updated text',
      beforeContext: 'b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS),
      afterContext: 'a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS),
    });
  });

  it('does not send managed editor AI requests when managed quota is already exhausted', async () => {
    mockAIState.selectedModelId = 'vlaina-managed::model-1';
    mockAIState.models = [{
      id: 'vlaina-managed::model-1',
      apiModelId: 'model-1',
      name: 'Model 1',
      providerId: 'vlaina-managed',
      enabled: true,
      createdAt: 1,
    }];
    mockAIState.providers = [{
      id: 'vlaina-managed',
      name: 'vlaina',
      type: 'newapi',
      apiHost: 'https://api.vlaina.com/v1',
      apiKey: '',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    }];
    mockManagedAIState.budget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toMatchObject({
      suggestion: null,
      errorType: 'QUOTA_EXHAUSTED',
    });
    expect(mockSendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(mockManagedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('marks managed quota exhausted when editor AI receives a quota error', async () => {
    mockAIState.selectedModelId = 'vlaina-managed::model-1';
    mockAIState.models = [{
      id: 'vlaina-managed::model-1',
      apiModelId: 'model-1',
      name: 'Model 1',
      providerId: 'vlaina-managed',
      enabled: true,
      createdAt: 1,
    }];
    mockAIState.providers = [{
      id: 'vlaina-managed',
      name: 'vlaina',
      type: 'newapi',
      apiHost: 'https://api.vlaina.com/v1',
      apiKey: '',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    }];
    mockSendMessageWithEndpointFallback.mockRejectedValueOnce(Object.assign(
      new Error('MANAGED_QUOTA_EXHAUSTED'),
      { errorCode: 'points_exhausted', statusCode: 403 },
    ));

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toMatchObject({
      suggestion: null,
      errorType: 'QUOTA_EXHAUSTED',
    });
    expect(mockManagedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('preserves custom provider desktop transport failures', async () => {
    mockSendMessageWithEndpointFallback.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED"
      ),
    );

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toEqual({
      suggestion: null,
      errorMessage: "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED",
      errorType: 'NETWORK_ERROR',
      errorCode: 'ai_provider_connection_failed',
    });
  });

  it('preserves custom provider upstream editor AI errors', async () => {
    mockSendMessageWithEndpointFallback.mockRejectedValueOnce(new Error('Custom upstream validation failed'));

    const result = await createAiSelectionSuggestionResult(
      createView(1, 14) as never,
      'Edit the selected text.',
      undefined,
      undefined,
      { suppressToast: true }
    );

    expect(result).toEqual({
      suggestion: null,
      errorMessage: 'Custom upstream validation failed',
      errorType: 'SERVER_ERROR',
      errorCode: '',
    });
  });

  it('bounds legacy retry context before sending and storing the next suggestion', async () => {
    const beforeContext = 'b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 20);
    const afterContext = 'a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 20);

    const result = await retryAiSelectionSuggestionResult(
      {
        requestKey: 'request',
        from: 1,
        to: 14,
        instruction: 'Edit the selected text.',
        commandId: null,
        toneId: null,
        originalText: 'Selected text',
        beforeContext,
        afterContext,
        suggestedText: 'Previous text',
      },
      undefined,
      { suppressToast: true }
    );

    const sentContent = mockSendMessageWithEndpointFallback.mock.calls[0]?.[0]?.content;
    expect(sentContent).toContain('b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS));
    expect(sentContent).not.toContain('b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 1));
    expect(sentContent).toContain('a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS));
    expect(sentContent).not.toContain('a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS + 1));
    expect(result.suggestion).toMatchObject({
      originalText: 'Selected text',
      suggestedText: 'Updated text',
      beforeContext: 'b'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS),
      afterContext: 'a'.repeat(MAX_EDITOR_AI_CONTEXT_CHARS),
    });
  });
});
