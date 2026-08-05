import { useEffect, useRef, useState } from 'react';
import type { Provider } from '@/lib/ai/types';
import { writeTextToClipboard } from '@/lib/clipboard';
import { MANAGED_PROVIDER_ID } from '@/lib/ai/managedService';
import { SETTINGS_BEFORE_CLOSE_EVENT } from '../../../settingsEvents';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { isBlockedNativeProviderUrl } from './nativeProviderUrlPolicy';

interface UseProviderConnectionDraftOptions {
  provider: Provider | undefined;
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  onDraftChange?: (draft: { name?: string; apiHost?: string; apiKey?: string }) => void;
  onDraftClear?: () => void;
}

export function useProviderConnectionDraft({
  provider,
  updateProvider,
  onDraftChange,
  onDraftClear,
}: UseProviderConnectionDraftOptions) {
  const [name, setName] = useState(provider?.name || '');
  const [apiKey, setApiKey] = useState(provider?.apiKey || '');
  const [apiHost, setApiHost] = useState(provider?.apiHost || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const apiKeyCopiedTimerRef = useRef<number | null>(null);
  const isConnectionComposingRef = useRef(false);
  const latestConnectionDraftRef = useRef({
    providerId: provider?.id || '',
    name: provider?.name || '',
    apiHost: provider?.apiHost || '',
    apiKey: provider?.apiKey || '',
    endpointType: provider?.endpointType,
    endpointTypeCheckedAt: provider?.endpointTypeCheckedAt,
    persistedName: provider?.name || '',
    persistedApiHost: provider?.apiHost || '',
    persistedApiKey: provider?.apiKey || '',
  });
  const syncedProviderSnapshotRef = useRef({
    providerId: provider?.id || '',
    name: provider?.name || '',
    apiHost: provider?.apiHost || '',
    apiKey: provider?.apiKey || '',
  });
  const updateProviderRef = useRef(updateProvider);
  const providerId = provider?.id;

  useEffect(() => {
    if (provider) {
      setName(provider.name);
      setApiKey(provider.apiKey || '');
      setApiHost(provider.apiHost || '');
      syncedProviderSnapshotRef.current = {
        providerId: provider.id,
        name: provider.name,
        apiHost: provider.apiHost || '',
        apiKey: provider.apiKey || '',
      };
    } else {
      setName('');
      setApiKey('');
      setApiHost('');
      syncedProviderSnapshotRef.current = {
        providerId: '',
        name: '',
        apiHost: '',
        apiKey: '',
      };
    }

    setShowApiKey(false);
    setApiKeyCopied(false);
    if (apiKeyCopiedTimerRef.current !== null) {
      window.clearTimeout(apiKeyCopiedTimerRef.current);
      apiKeyCopiedTimerRef.current = null;
    }
    onDraftClear?.();
  }, [providerId]);

  useEffect(() => {
    const nextSnapshot = {
      providerId: provider?.id || '',
      name: provider?.name || '',
      apiHost: provider?.apiHost || '',
      apiKey: provider?.apiKey || '',
    };
    const previousSnapshot = syncedProviderSnapshotRef.current;
    if (nextSnapshot.providerId !== previousSnapshot.providerId) {
      syncedProviderSnapshotRef.current = nextSnapshot;
      return;
    }

    const providerChanged =
      nextSnapshot.name !== previousSnapshot.name ||
      nextSnapshot.apiHost !== previousSnapshot.apiHost ||
      nextSnapshot.apiKey !== previousSnapshot.apiKey;
    if (!providerChanged) {
      return;
    }

    const hasLocalDraft =
      name !== previousSnapshot.name ||
      apiHost !== previousSnapshot.apiHost ||
      apiKey !== previousSnapshot.apiKey;
    if (!hasLocalDraft) {
      setName(nextSnapshot.name);
      setApiHost(nextSnapshot.apiHost);
      setApiKey(nextSnapshot.apiKey);
      onDraftClear?.();
    }

    syncedProviderSnapshotRef.current = nextSnapshot;
  }, [
    apiHost,
    apiKey,
    provider?.apiHost,
    provider?.apiKey,
    provider?.id,
    provider?.name,
    name,
    onDraftClear,
  ]);

  useEffect(() => {
    updateProviderRef.current = updateProvider;
  }, [updateProvider]);

  useEffect(() => {
    return () => {
      if (apiKeyCopiedTimerRef.current !== null) {
        window.clearTimeout(apiKeyCopiedTimerRef.current);
        apiKeyCopiedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    latestConnectionDraftRef.current = {
      providerId: provider?.id || '',
      name,
      apiHost,
      apiKey,
      endpointType: provider?.endpointType,
      endpointTypeCheckedAt: provider?.endpointTypeCheckedAt,
      persistedName: provider?.name || '',
      persistedApiHost: provider?.apiHost || '',
      persistedApiKey: provider?.apiKey || '',
    };
  }, [
    provider?.id,
    provider?.apiHost,
    provider?.apiKey,
    provider?.endpointType,
    provider?.endpointTypeCheckedAt,
    name,
    apiHost,
    apiKey,
  ]);

  useEffect(() => {
    const flushConnectionDraft = () => {
      if (isConnectionComposingRef.current) {
        return;
      }
      const draft = latestConnectionDraftRef.current;
      if (!draft.providerId || draft.providerId === MANAGED_PROVIDER_ID) {
        return;
      }
      if (isBlockedNativeProviderUrl(draft.apiHost)) {
        return;
      }
      const sameName = draft.name === draft.persistedName;
      const sameApiHost = draft.apiHost === draft.persistedApiHost;
      const sameApiKey = draft.apiKey === draft.persistedApiKey;
      if (sameName && sameApiHost && sameApiKey) {
        return;
      }
      const sameConnection = sameApiHost && sameApiKey;
      updateProviderRef.current(draft.providerId, {
        name: draft.name,
        apiHost: draft.apiHost,
        apiKey: draft.apiKey,
        endpointType: sameConnection ? draft.endpointType : undefined,
        endpointTypeCheckedAt: sameConnection ? draft.endpointTypeCheckedAt : undefined,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener(SETTINGS_BEFORE_CLOSE_EVENT, flushConnectionDraft);
    return () => {
      window.removeEventListener(SETTINGS_BEFORE_CLOSE_EVENT, flushConnectionDraft);
      flushConnectionDraft();
    };
  }, []);

  useEffect(() => {
    if (!provider) return;

    const sameName = name === provider.name;
    const sameApiHost = apiHost === (provider.apiHost || '');
    const sameApiKey = apiKey === (provider.apiKey || '');
    const sameConnection = sameApiHost && sameApiKey;
    if (sameName && sameApiHost && sameApiKey) return;
    if (isBlockedNativeProviderUrl(apiHost)) return;

    const timer = setTimeout(() => {
      if (isConnectionComposingRef.current) {
        return;
      }
      updateProvider(provider.id, {
        name,
        apiKey,
        apiHost,
        endpointType: sameConnection ? provider.endpointType : undefined,
        endpointTypeCheckedAt: sameConnection ? provider.endpointTypeCheckedAt : undefined,
        updatedAt: Date.now(),
      });
    }, 240);

    return () => clearTimeout(timer);
  }, [provider, name, apiHost, apiKey, updateProvider]);

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    onDraftChange?.({ name: nextName });
  };

  const handleApiHostChange = (nextApiHost: string) => {
    setApiHost(nextApiHost);
    onDraftChange?.({ apiHost: nextApiHost });
  };

  const handleApiKeyChange = (nextApiKey: string) => {
    setApiKey(nextApiKey);
    onDraftChange?.({ apiKey: nextApiKey });
  };

  const handleCopyApiKey = async () => {
    if (!apiKey) return;
    try {
      const didCopy = await writeTextToClipboard(apiKey);
      if (didCopy) {
        setApiKeyCopied(true);
        if (apiKeyCopiedTimerRef.current !== null) {
          window.clearTimeout(apiKeyCopiedTimerRef.current);
        }
        apiKeyCopiedTimerRef.current = window.setTimeout(() => {
          setApiKeyCopied(false);
          apiKeyCopiedTimerRef.current = null;
        }, themeUiFeedbackTokens.providerApiKeyCopyDurationMs);
      }
    } catch {}
  };

  return {
    apiHost,
    apiKey,
    apiKeyCopied,
    handleApiHostChange,
    handleApiKeyChange,
    handleCopyApiKey,
    handleNameChange,
    isConnectionComposingRef,
    name,
    setShowApiKey,
    showApiKey,
  };
}
