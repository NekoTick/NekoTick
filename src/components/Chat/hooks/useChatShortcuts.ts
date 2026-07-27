import { useEffect } from 'react';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { actions as aiActions } from '@/stores/useAIStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useAIUIStore } from '@/stores/ai/chatState';
import { isToggleShortcutsBinding, matchesShortcutBinding } from '@/lib/shortcuts';
import { shouldBlockBrowserReservedShortcut } from '@/lib/shortcuts/browserGuards';
import { isEventInsideDialog } from '@/lib/shortcuts/dialogGuards';
import {
  isEditableShortcutTarget,
  shouldSkipShortcutForEditableSystemShortcut,
} from '@/lib/shortcuts/editableGuards';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { writeTextToClipboard } from '@/lib/clipboard';
import { dispatchChatMessageCopied } from '@/components/Chat/common/copyFeedback';
import { copyMessageContentToClipboard } from '@/components/Chat/common/messageClipboard';
import { isComposerFocusTarget, selectComposerInputAll } from '@/lib/ui/composerFocusRegistry';
import {
  runOpenNewChatShortcut,
  runTemporaryChatWelcomeShortcut,
} from '@/components/Chat/features/Temporary/temporaryChatCommands';
import { getNavigableChatSidebarSessions } from '@/components/Chat/features/Sidebar/chatSidebarSearch';
import {
  extractLastFencedCodeBlock,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_COPY_CHARS,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_SCAN_CHARS,
} from './chatShortcutCodeBlocks';

export {
  extractLastFencedCodeBlock,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_COPY_CHARS,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_SCAN_CHARS,
};

interface UseChatShortcutsOptions {
  onFocusInput: () => void;
  onToggleShortcuts: () => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  onNavigateMessages?: (direction: 'prev' | 'next') => void;
}

function findLastAssistantMessage<T extends { role?: string }>(messages: T[]): T | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') {
      return message;
    }
  }
  return null;
}

export function useChatShortcuts(
  { onFocusInput, onNavigateMessages, onToggleShortcuts, onStopGeneration, isGenerating = false }: UseChatShortcutsOptions,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      if (e.isComposing) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (shouldBlockBrowserReservedShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isToggleShortcutsBinding(e)) {
        e.preventDefault();
        onToggleShortcuts();
        return;
      }

      if (isEventInsideDialog(e.target)) {
        return;
      }

      if (shouldSkipShortcutForEditableSystemShortcut(e)) {
        return;
      }

      if (matchesShortcutBinding(e, 'stopResponse') && isGenerating) {
        e.preventDefault();
        e.stopPropagation();
        onStopGeneration?.();
        return;
      }

      if (matchesShortcutBinding(e, 'focusChatInput')) {
        e.preventDefault();
        onFocusInput();
        return;
      }

      if (matchesShortcutBinding(e, 'openNewChat')) {
        e.preventDefault();
        runOpenNewChatShortcut();
        onFocusInput();
        return;
      }

      if (isMod && !e.shiftKey && !e.altKey && key === 'a') {
        if (isEditableShortcutTarget(e.target) && !isComposerFocusTarget(e.target)) {
          return;
        }
        e.preventDefault();
        if (!selectComposerInputAll()) {
          onFocusInput();
        }
        return;
      }

      if (matchesShortcutBinding(e, 'toggleTemporaryChatWelcome')) {
        e.preventDefault();
        runTemporaryChatWelcomeShortcut();
        onFocusInput();
        return;
      }

      if (matchesShortcutBinding(e, 'previousMessage')) {
        if (isEditableShortcutTarget(e.target)) {
          return;
        }
        e.preventDefault();
        onNavigateMessages?.('prev');
        return;
      }

      if (matchesShortcutBinding(e, 'nextMessage')) {
        if (isEditableShortcutTarget(e.target)) {
          return;
        }
        e.preventDefault();
        onNavigateMessages?.('next');
        return;
      }

      if (matchesShortcutBinding(e, 'nextChatSession') || matchesShortcutBinding(e, 'previousChatSession')) {
          if (!hasElectronDesktopBridge()) return;

          e.preventDefault();
          const state = useUnifiedStore.getState();
          const sessions = getNavigableChatSidebarSessions(state.data.ai?.sessions || []);
          const currentId = useAIUIStore.getState().currentSessionId;
          
          if (sessions.length < 2) return;

          const currentIndex = sessions.findIndex((session) => session.id === currentId);
          let nextIndex;

          if (matchesShortcutBinding(e, 'previousChatSession')) {
              nextIndex = currentIndex > 0 ? currentIndex - 1 : sessions.length - 1;
          } else {
              nextIndex = currentIndex < sessions.length - 1 ? currentIndex + 1 : 0;
          }

          const nextId = sessions[nextIndex]?.id;
          if (!nextId) return;
          aiActions.switchSession(nextId);
          onFocusInput();
          return;
      }

      const state = useUnifiedStore.getState();
      const ai = state.data.ai;
      const currentId = useAIUIStore.getState().currentSessionId;
      if (!ai || !currentId) return;

      const currentMsgs = ai.messages[currentId] || [];

      if (matchesShortcutBinding(e, 'deleteChat')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-delete-chat', { detail: { id: currentId } }));
        return;
      }

      if (matchesShortcutBinding(e, 'copyLastResponse')) {
        e.preventDefault();
        const lastAI = findLastAssistantMessage(currentMsgs);
        if (lastAI) {
          try {
            const copyRequest = copyMessageContentToClipboard(stripThinkingContent(lastAI.content));
            void Promise.resolve(copyRequest)
              .then((didCopy) => {
                if (didCopy) {
                  dispatchChatMessageCopied(lastAI.id);
                }
              })
              .catch((_error) => {
              });
          } catch (error) {
          }
        }
        return;
      }

      if (matchesShortcutBinding(e, 'copyLastCodeBlock')) {
        e.preventDefault();
        const lastAI = findLastAssistantMessage(currentMsgs);
        if (lastAI) {
          const visibleContent = stripThinkingContent(lastAI.content);
          const lastCode = extractLastFencedCodeBlock(visibleContent);
          if (lastCode !== null) {
            try {
              const copyRequest = writeTextToClipboard(lastCode);
              void Promise.resolve(copyRequest)
                .catch((_error) => {
                });
            } catch (error) {
            }
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isGenerating, onFocusInput, onNavigateMessages, onStopGeneration, onToggleShortcuts]);
}
