import { useCallback, useEffect, useRef } from 'react';
import { actions as aiActions } from '@/stores/useAIStore';
import { copyMessageContentToClipboard } from '@/components/Chat/common/messageClipboard';
import { clearChatTextSelection } from '@/components/Chat/features/Messages/components/chatSelectionBehavior';

type ChatImageGalleryItem = {
  id: string;
  src: string;
};

export function useChatViewMessageActions(args: {
  currentSessionId: string | null;
  editMessage: (messageId: string, newContent: string) => void;
  imageGallery: ChatImageGalleryItem[];
  onBeforeEdit?: (messageId: string) => void;
  onBeforeRegenerate?: (messageId: string) => void;
  regenerate: (messageId: string) => void;
  switchMessageVersion: (sessionId: string, messageId: string, versionIndex: number) => void;
}) {
  const { currentSessionId, editMessage, imageGallery, onBeforeEdit, onBeforeRegenerate, regenerate, switchMessageVersion } = args;
  const regenerateRef = useRef(regenerate);
  const editMessageRef = useRef(editMessage);
  const switchMessageVersionRef = useRef(switchMessageVersion);
  const currentSessionIdRef = useRef(currentSessionId);
  const imageGalleryRef = useRef(imageGallery);
  const onBeforeEditRef = useRef(onBeforeEdit);
  const onBeforeRegenerateRef = useRef(onBeforeRegenerate);

  useEffect(() => {
    regenerateRef.current = regenerate;
  }, [regenerate]);

  useEffect(() => {
    editMessageRef.current = editMessage;
  }, [editMessage]);

  useEffect(() => {
    switchMessageVersionRef.current = switchMessageVersion;
  }, [switchMessageVersion]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    imageGalleryRef.current = imageGallery;
  }, [imageGallery]);

  useEffect(() => {
    onBeforeEditRef.current = onBeforeEdit;
    onBeforeRegenerateRef.current = onBeforeRegenerate;
  }, [onBeforeEdit, onBeforeRegenerate]);

  const copyToClipboard = useCallback((text: string) => copyMessageContentToClipboard(text), []);
  const getImageGallery = useCallback(() => imageGalleryRef.current, []);
  const handleRegenerate = useCallback((messageId: string) => {
    clearChatTextSelection();
    onBeforeRegenerateRef.current?.(messageId);
    regenerateRef.current(messageId);
  }, []);
  const handleFork = useCallback((messageId: string) => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    aiActions.forkSessionFromMessage(sessionId, messageId);
  }, []);
  const handleEdit = useCallback((messageId: string, newContent: string) => {
    onBeforeEditRef.current?.(messageId);
    editMessageRef.current(messageId, newContent);
  }, []);
  const handleSwitchVersion = useCallback((messageId: string, versionIndex: number) => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    switchMessageVersionRef.current(sessionId, messageId, versionIndex);
  }, []);

  return {
    copyToClipboard,
    getImageGallery,
    handleEdit,
    handleFork,
    handleRegenerate,
    handleSwitchVersion,
  };
}
