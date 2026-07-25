import { lazy, useEffect } from 'react';
import { retryDynamicImport } from '@/lib/retryDynamicImport';

export function once<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    if (!promise) {
      const nextPromise = factory().catch((error) => {
        if (promise === nextPromise) {
          promise = null;
        }
        throw error;
      });
      promise = nextPromise;
    }
    return promise;
  };
}

export const preloadSettingsModule = once(() => import('@/components/Settings'));
export const preloadNotesViewModule = once(() => import('@/components/Notes/NotesView'));
export const preloadChatViewModule = once(() => import('@/components/Chat/ChatView'));
export const preloadWhiteboardViewModule = once(() => import('@/components/Whiteboard'));
export const preloadGraphViewModule = once(() => import('@/components/Graph'));
export const preloadNotesSidebarModule = once(() => import('@/components/Notes/features/Sidebar/NotesSidebarWrapper'));
export const preloadChatSidebarModule = once(() => import('@/components/Chat/features/Sidebar/ChatSidebar'));
export const preloadTemporaryChatToggleModule = once(() => import('@/components/Chat/features/Temporary/TitleBarTemporaryChatToggle'));
export const preloadModelSelectorModule = once(() => import('@/components/Chat/features/Input/ModelSelector'));
export const preloadNotesTabRowModule = once(() => import('@/components/Notes/features/Tabs/NotesTabRow'));
export const preloadGitTitleBarActionModule = once(() => import('@/components/Notes/features/Git'));
export const preloadAIStoreModule = once(() => import('@/stores/useAIStore'));

export const SettingsModal = lazy(async () => {
  const mod = await retryDynamicImport(preloadSettingsModule);
  return { default: mod.SettingsModal };
});

export const NotesView = lazy(async () => {
  const mod = await retryDynamicImport(preloadNotesViewModule);
  return { default: mod.NotesView };
});

export const ChatView = lazy(async () => {
  const mod = await retryDynamicImport(preloadChatViewModule);
  return { default: mod.ChatView };
});

export const WhiteboardView = lazy(async () => {
  const mod = await retryDynamicImport(preloadWhiteboardViewModule);
  return { default: mod.WhiteboardView };
});

export const WhiteboardSidebar = lazy(async () => {
  const mod = await retryDynamicImport(preloadWhiteboardViewModule);
  return { default: mod.WhiteboardSidebar };
});

export const GraphView = lazy(async () => {
  const mod = await retryDynamicImport(preloadGraphViewModule);
  return { default: mod.GraphView };
});

export const GraphSidebar = lazy(async () => {
  const mod = await retryDynamicImport(preloadGraphViewModule);
  return { default: mod.GraphSidebar };
});

export const LabView = import.meta.env.DEV
  ? lazy(async () => {
    const mod = await retryDynamicImport(() => import('@/components/Lab/LabView'));
    return { default: mod.LabView };
  })
  : null;

export const DevMainOverlay = import.meta.env.DEV
  ? lazy(async () => {
    const mod = await retryDynamicImport(() => import('@/components/Dev/DevMainOverlay'));
    return { default: mod.DevMainOverlay };
  })
  : null;

export const NotesSidebarWrapper = lazy(async () => {
  const mod = await retryDynamicImport(preloadNotesSidebarModule);
  return { default: mod.NotesSidebarWrapper };
});

export const ChatSidebar = lazy(async () => {
  const mod = await retryDynamicImport(preloadChatSidebarModule);
  return { default: mod.ChatSidebar };
});

export const TemporaryChatToggle = lazy(async () => {
  const mod = await retryDynamicImport(preloadTemporaryChatToggleModule);
  return { default: mod.TitleBarTemporaryChatToggle };
});

export const ModelSelector = lazy(async () => {
  const mod = await retryDynamicImport(preloadModelSelectorModule);
  return { default: mod.ModelSelector };
});

export const NotesTabRow = lazy(async () => {
  const mod = await retryDynamicImport(preloadNotesTabRowModule);
  return { default: mod.NotesTabRow };
});

export const GitTitleBarAction = lazy(async () => {
  const mod = await retryDynamicImport(preloadGitTitleBarActionModule);
  return { default: mod.GitTitleBarAction };
});

export function StartupViewFallback({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      onReady();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [onReady]);

  return (
    <div className="h-full bg-transparent" />
  );
}
