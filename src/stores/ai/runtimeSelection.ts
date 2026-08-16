interface RestorableChatSelectionState {
  sessions?: Array<{ id: string }>;
  currentSessionId?: string | null;
}

export function resolveRestoredChatSessionId(
  aiData: RestorableChatSelectionState | null | undefined,
  lastChatSessionId: string | null | undefined,
): string | null {
  const sessions = aiData?.sessions || [];
  const hasSession = (sessionId: string | null | undefined) =>
    Boolean(sessionId && sessions.some((session) => session.id === sessionId));

  if (hasSession(lastChatSessionId)) {
    return lastChatSessionId || null;
  }

  return hasSession(aiData?.currentSessionId) ? aiData?.currentSessionId ?? null : null;
}
