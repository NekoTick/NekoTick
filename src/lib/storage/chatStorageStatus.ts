export type ChatStorageStatus = 'saveFailed';

type ChatStorageStatusSnapshot = Readonly<Record<string, ChatStorageStatus>>;
type ChatStorageStatusListener = () => void;

let snapshot: ChatStorageStatusSnapshot = {};
const listeners = new Set<ChatStorageStatusListener>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

export function getChatStorageStatusSnapshot(): ChatStorageStatusSnapshot {
  return snapshot;
}

export function subscribeChatStorageStatus(listener: ChatStorageStatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportChatStorageSaveFailure(sessionId: string): void {
  if (snapshot[sessionId] === 'saveFailed') {
    return;
  }
  snapshot = { ...snapshot, [sessionId]: 'saveFailed' };
  emitChange();
}

export function clearChatStorageStatus(sessionId: string): void {
  if (!snapshot[sessionId]) {
    return;
  }
  const next = { ...snapshot };
  delete next[sessionId];
  snapshot = next;
  emitChange();
}
