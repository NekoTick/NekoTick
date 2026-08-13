function createAiProviderApi({ ipcRenderer, callIpcCallback, requireSafeIpcRequestId }) {
  return {
    startRequest(requestId, request) {
      return ipcRenderer.invoke('desktop:ai-provider:request:start', requireSafeIpcRequestId(requestId, 'AI provider request id'), request);
    },
    cancelRequest(requestId) {
      return ipcRenderer.invoke('desktop:ai-provider:request:cancel', requireSafeIpcRequestId(requestId, 'AI provider request id'));
    },
    acknowledgeRequestChunk(requestId, sequence) {
      return ipcRenderer.invoke(
        'desktop:ai-provider:request:ack',
        requireSafeIpcRequestId(requestId, 'AI provider request id'),
        sequence,
      );
    },
    onRequestChunk(requestId, callback) {
      const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
      const channel = `desktop:ai-provider:request:${id}:chunk`;
      const handler = (_event, payload) => callIpcCallback(callback, payload?.bytes, payload?.sequence);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
    onRequestDone(requestId, callback) {
      const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
      const channel = `desktop:ai-provider:request:${id}:done`;
      const handler = () => callIpcCallback(callback);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
    onRequestError(requestId, callback) {
      const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
      const channel = `desktop:ai-provider:request:${id}:error`;
      const handler = (_event, payload) => callIpcCallback(callback, payload);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  };
}

function invokeManagedRequest(ipcRenderer, channel, label, requestId, body) {
  if (requestId == null) {
    return ipcRenderer.invoke(channel, body);
  }
  return ipcRenderer.invoke(channel, label(requestId), body);
}

function createManagedStreamListener({ ipcRenderer, callIpcCallback, requireSafeIpcRequestId }, suffix) {
  return (requestId, callback) => {
    const id = requireSafeIpcRequestId(requestId, 'managed stream request id');
    const channel = `desktop:managed:stream:${id}:${suffix}`;
    const handler = (_event, payload) => callIpcCallback(callback, payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

function createAccountApi(deps) {
  const { ipcRenderer, requireSafeIpcRequestId } = deps;
  const managedChatRequestId = (requestId) => requireSafeIpcRequestId(requestId, 'managed chat completion request id');
  const managedWebSearchRequestId = (requestId) => requireSafeIpcRequestId(requestId, 'managed web search request id');
  const managedImageRequestId = (requestId) => requireSafeIpcRequestId(requestId, 'managed image generation request id');
  const managedImageEditRequestId = (requestId) => requireSafeIpcRequestId(requestId, 'managed image edit request id');
  const managedStreamRequestId = (requestId) => requireSafeIpcRequestId(requestId, 'managed stream request id');

  return {
    getSessionStatus() {
      return ipcRenderer.invoke('desktop:account:get-session-status');
    },
    startAuth(provider) {
      return ipcRenderer.invoke('desktop:account:start-auth', provider);
    },
    cancelAuth() {
      return ipcRenderer.invoke('desktop:account:cancel-auth');
    },
    requestEmailCode(email, locale) {
      return ipcRenderer.invoke('desktop:account:request-email-code', email, locale);
    },
    verifyEmailCode(email, code) {
      return ipcRenderer.invoke('desktop:account:verify-email-code', email, code);
    },
    disconnect() {
      return ipcRenderer.invoke('desktop:account:disconnect');
    },
    createBillingCheckout(tier) {
      return ipcRenderer.invoke('desktop:billing:create-checkout', tier);
    },
    submitFeedback(message) {
      return ipcRenderer.invoke('desktop:feedback:submit', message);
    },
    getManagedModels() {
      return ipcRenderer.invoke('desktop:managed:get-models');
    },
    getManagedModelsVersion() {
      return ipcRenderer.invoke('desktop:managed:get-models-version');
    },
    getManagedBudget() {
      return ipcRenderer.invoke('desktop:managed:get-budget');
    },
    reportManagedClientDiagnostic(body) {
      return ipcRenderer.invoke('desktop:managed:client-diagnostic', body);
    },
    managedChatCompletion(body, requestId) {
      return invokeManagedRequest(ipcRenderer, 'desktop:managed:chat-completion', managedChatRequestId, requestId, body);
    },
    cancelManagedChatCompletion(requestId) {
      return ipcRenderer.invoke('desktop:managed:chat-completion:cancel', managedChatRequestId(requestId));
    },
    managedWebSearch(body, requestId) {
      return invokeManagedRequest(ipcRenderer, 'desktop:managed:web-search', managedWebSearchRequestId, requestId, body);
    },
    cancelManagedWebSearch(requestId) {
      return ipcRenderer.invoke('desktop:managed:web-search:cancel', managedWebSearchRequestId(requestId));
    },
    managedImageGeneration(body, requestId) {
      return invokeManagedRequest(ipcRenderer, 'desktop:managed:image-generation', managedImageRequestId, requestId, body);
    },
    cancelManagedImageGeneration(requestId) {
      return ipcRenderer.invoke('desktop:managed:image-generation:cancel', managedImageRequestId(requestId));
    },
    managedImageEdit(payload, requestId) {
      return invokeManagedRequest(ipcRenderer, 'desktop:managed:image-edit', managedImageEditRequestId, requestId, payload);
    },
    cancelManagedImageEdit(requestId) {
      return ipcRenderer.invoke('desktop:managed:image-edit:cancel', managedImageEditRequestId(requestId));
    },
    startManagedChatCompletionStream(requestId, body) {
      return ipcRenderer.invoke('desktop:managed:chat-completion-stream:start', managedStreamRequestId(requestId), body);
    },
    cancelManagedChatCompletionStream(requestId) {
      return ipcRenderer.invoke('desktop:managed:chat-completion-stream:cancel', managedStreamRequestId(requestId));
    },
    onManagedStreamChunk: createManagedStreamListener(deps, 'chunk'),
    onManagedStreamDone: createManagedStreamListener(deps, 'done'),
    onManagedStreamError: createManagedStreamListener(deps, 'error'),
  };
}

module.exports = {
  createAccountApi,
  createAiProviderApi,
};
