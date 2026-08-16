import type { RefObject } from "react";
import type { ChatMessage } from "@/lib/ai/types";

export interface UseMessageAutoscrollOptions {
  active?: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  chatId: string | null;
  estimateMessageHeight?: (message: ChatMessage, isStreaming: boolean, containerWidth: number) => number;
  estimateLoadingHeight?: () => number;
  showLoading?: boolean;
}

export interface MessageAutoscrollBehavior {
  handleEditMessage: (messageId: string) => void;
  handleNewUserMessage: () => void;
  handleRegenerateMessage: (messageId: string) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  spacerHeight: number;
  currentTurnTopSpacerHeight: number;
}

export type CurrentTurnAnchorMode = "near-composer" | "top";

export type MutableValue<T> = { current: T };
