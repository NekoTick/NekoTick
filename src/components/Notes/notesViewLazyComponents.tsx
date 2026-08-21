import { lazy } from 'react';
import { retryDynamicImport } from '@/lib/retryDynamicImport';
import { preloadMarkdownEditor } from './features/Editor/preloadMarkdownEditor';

let embeddedChatViewModulePromise: Promise<typeof import('@/components/Chat/ChatView')> | null = null;
let embeddedChatViewModuleReady = false;

export function preloadEmbeddedChatViewModule() {
  embeddedChatViewModulePromise ??= import('@/components/Chat/ChatView').then((mod) => {
    embeddedChatViewModuleReady = true;
    return mod;
  });
  return embeddedChatViewModulePromise;
}

export function isEmbeddedChatViewModuleReady() {
  return embeddedChatViewModuleReady;
}

export const EmbeddedChatView = lazy(async () => {
  const mod = await preloadEmbeddedChatViewModule();
  return { default: mod.ChatView };
});

export const MarkdownEditor = lazy(async () => {
  const mod = await retryDynamicImport(preloadMarkdownEditor);
  return { default: mod.MarkdownEditor };
});
