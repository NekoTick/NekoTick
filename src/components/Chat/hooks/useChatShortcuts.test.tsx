import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  extractLastFencedCodeBlock,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_COPY_CHARS,
  MAX_CHAT_SHORTCUT_CODE_BLOCK_SCAN_CHARS,
  useChatShortcuts,
} from "./useChatShortcuts";

const mocked = vi.hoisted(() => ({
  toggleTemporaryChat: vi.fn(),
  createSession: vi.fn(),
  openNewChat: vi.fn(),
  switchSession: vi.fn(),
  getState: vi.fn(),
  getUIState: vi.fn(),
  writeText: vi.fn(),
  dispatchChatMessageCopied: vi.fn(),
  isComposerFocusTarget: vi.fn(),
  selectComposerInputAll: vi.fn(),
}));

vi.mock("@/stores/useAIStore", () => ({
  actions: {
    toggleTemporaryChat: mocked.toggleTemporaryChat,
    createSession: mocked.createSession,
    openNewChat: mocked.openNewChat,
    switchSession: mocked.switchSession,
  },
}));

vi.mock("@/stores/unified/useUnifiedStore", () => ({
  useUnifiedStore: {
    getState: mocked.getState,
  },
}));

vi.mock("@/stores/ai/chatState", () => ({
  useAIUIStore: {
    getState: mocked.getUIState,
  },
}));

vi.mock("@/components/Chat/common/copyFeedback", () => ({
  dispatchChatMessageCopied: mocked.dispatchChatMessageCopied,
}));

vi.mock("@/lib/ui/composerFocusRegistry", () => ({
  isComposerFocusTarget: mocked.isComposerFocusTarget,
  selectComposerInputAll: mocked.selectComposerInputAll,
}));

function TestHarness({
  onFocusInput,
  onToggleShortcuts,
  onStopGeneration,
  isGenerating = false,
  onNavigateMessages,
  enabled = true,
}: {
  onFocusInput: () => void;
  onToggleShortcuts: () => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  onNavigateMessages?: (direction: 'prev' | 'next') => void;
  enabled?: boolean;
}) {
  useChatShortcuts({ onFocusInput, onToggleShortcuts, onStopGeneration, isGenerating, onNavigateMessages }, enabled);
  return null;
}

function fireKeydown(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

function createState(overrides?: any) {
  return {
    data: {
      ai: {
        messages: {
          "session-1": [{ id: "m1", role: "user", content: "hello" }],
        },
        sessions: [
          { id: "session-1", updatedAt: 20 },
          { id: "session-2", updatedAt: 10 },
        ],
        ...overrides,
      },
    },
  };
}

function createUIState(overrides?: any) {
  return {
    temporaryChatEnabled: false,
    currentSessionId: "session-1",
    ...overrides,
  };
}

function setup(options?: {
  state?: any;
  uiState?: any;
  isGenerating?: boolean;
  onNavigateMessages?: (direction: 'prev' | 'next') => void;
  enabled?: boolean;
}) {
  const onFocusInput = vi.fn();
  const onToggleShortcuts = vi.fn();
  const onStopGeneration = vi.fn();
  const onNavigateMessages = options?.onNavigateMessages ?? vi.fn();
  mocked.getState.mockReturnValue(options?.state ?? createState());
  mocked.getUIState.mockReturnValue(options?.uiState ?? createUIState());

  const rendered = render(
    <TestHarness
      onFocusInput={onFocusInput}
      onToggleShortcuts={onToggleShortcuts}
      onStopGeneration={onStopGeneration}
      isGenerating={options?.isGenerating ?? false}
      onNavigateMessages={onNavigateMessages}
      enabled={options?.enabled}
    />,
  );

  return { ...rendered, onFocusInput, onNavigateMessages, onToggleShortcuts, onStopGeneration };
}

describe("useChatShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked.getState.mockReturnValue(createState());
    mocked.getUIState.mockReturnValue(createUIState());
    mocked.isComposerFocusTarget.mockReturnValue(false);
    mocked.selectComposerInputAll.mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mocked.writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as any).vlainaDesktop;
  });

  it("intercepts Ctrl+J to block browser default behavior", () => {
    setup();

    const event = fireKeydown({ key: "j", ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.getState).not.toHaveBeenCalled();
    expect(mocked.toggleTemporaryChat).not.toHaveBeenCalled();
    expect(mocked.createSession).not.toHaveBeenCalled();
  });

  it("handles Ctrl+Shift+/ to open shortcuts dialog", () => {
    const { onToggleShortcuts } = setup();

    const event = fireKeydown({ key: "?", code: "Slash", ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onToggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("handles Shift+Escape to focus input", () => {
    const { onFocusInput } = setup();

    const event = fireKeydown({ key: "Escape", shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });

  it("stops the current response on Escape while generating", () => {
    const { onStopGeneration } = setup({ isGenerating: true });

    const event = fireKeydown({ key: "Escape" });

    expect(event.defaultPrevented).toBe(true);
    expect(onStopGeneration).toHaveBeenCalledTimes(1);
  });

  it("does not handle shortcuts while IME composition is active", () => {
    const { onStopGeneration, onFocusInput, onToggleShortcuts } = setup({ isGenerating: true });

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onStopGeneration).not.toHaveBeenCalled();
    expect(onFocusInput).not.toHaveBeenCalled();
    expect(onToggleShortcuts).not.toHaveBeenCalled();
  });

  it("does not intercept Escape inside a dialog", () => {
    const { onStopGeneration } = setup({ isGenerating: true });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onStopGeneration).not.toHaveBeenCalled();
  });

  it("intercepts Ctrl+A to select composer content instead of selecting page text", () => {
    const { onFocusInput } = setup();

    const event = fireKeydown({ key: "a", ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.selectComposerInputAll).toHaveBeenCalledTimes(1);
    expect(onFocusInput).not.toHaveBeenCalled();
  });

  it("opens temporary chat on Ctrl+Shift+J when temporary mode is disabled", () => {
    const { onFocusInput } = setup({
      state: createState(),
      uiState: createUIState({ temporaryChatEnabled: false }),
    });

    const event = fireKeydown({ key: "j", ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.toggleTemporaryChat).toHaveBeenCalledWith(true);
    expect(mocked.createSession).not.toHaveBeenCalled();
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });

  it("exits temporary chat to a blank normal draft on Ctrl+Shift+J when current temporary chat is empty", () => {
    const { onFocusInput } = setup({
      state: createState({
        messages: { "temp-1": [] },
      }),
      uiState: createUIState({
        temporaryChatEnabled: true,
        currentSessionId: "temp-1",
      }),
    });

    fireKeydown({ key: "j", ctrlKey: true, shiftKey: true });

    expect(mocked.openNewChat).toHaveBeenCalledTimes(1);
    expect(mocked.toggleTemporaryChat).not.toHaveBeenCalled();
    expect(mocked.createSession).not.toHaveBeenCalled();
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh temporary chat on Ctrl+Shift+J when current temporary chat is not empty", () => {
    const { onFocusInput } = setup({
      state: createState({
        messages: { "temp-1": [{ id: "x", role: "user", content: "occupied" }] },
      }),
      uiState: createUIState({
        temporaryChatEnabled: true,
        currentSessionId: "temp-1",
      }),
    });

    fireKeydown({ key: "j", ctrlKey: true, shiftKey: true });

    expect(mocked.createSession).toHaveBeenCalledWith("New");
    expect(mocked.toggleTemporaryChat).not.toHaveBeenCalled();
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });

  it("handles Ctrl+Shift+O to open a new normal chat", () => {
    const { onFocusInput } = setup();

    const event = fireKeydown({ key: "o", ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.openNewChat).toHaveBeenCalledTimes(1);
    expect(onFocusInput).toHaveBeenCalledTimes(1);
  });

  it("copies last assistant response without think content on Ctrl+Shift+C", async () => {
    setup({
      state: createState({
        messages: {
          "session-1": [
            { id: "u1", role: "user", content: "ask" },
            { id: "a1", role: "assistant", content: "Visible<think>hidden</think> answer" },
          ],
        },
      }),
    });

    const event = fireKeydown({ key: "c", ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.writeText).toHaveBeenCalledWith("Visible answer");
    await waitFor(() => {
      expect(mocked.dispatchChatMessageCopied).toHaveBeenCalledWith("a1");
    });
  });

  it("does not let user-configured chat copy shortcuts steal editable copy", async () => {
    localStorage.setItem("vlaina-shortcuts", JSON.stringify([
      { id: "copyLastResponse", keys: ["Ctrl", "C"] },
    ]));
    setup({
      state: createState({
        messages: {
          "session-1": [
            { id: "u1", role: "user", content: "ask" },
            { id: "a1", role: "assistant", content: "answer" },
          ],
        },
      }),
    });

    const input = document.createElement("textarea");
    document.body.appendChild(input);

    try {
      const event = new KeyboardEvent("keydown", {
        key: "c",
        code: "KeyC",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(mocked.writeText).not.toHaveBeenCalled();
      expect(mocked.dispatchChatMessageCopied).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it("does not let earlier chat shortcut branches steal editable copy", async () => {
    localStorage.setItem("vlaina-shortcuts", JSON.stringify([
      { id: "focusChatInput", keys: ["Ctrl", "C"] },
      { id: "openNewChat", keys: ["Ctrl", "X"] },
    ]));
    const { onFocusInput } = setup();

    const input = document.createElement("textarea");
    document.body.appendChild(input);

    try {
      const copyEvent = new KeyboardEvent("keydown", {
        key: "c",
        code: "KeyC",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const cutEvent = new KeyboardEvent("keydown", {
        key: "x",
        code: "KeyX",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      input.dispatchEvent(copyEvent);
      input.dispatchEvent(cutEvent);

      expect(copyEvent.defaultPrevented).toBe(false);
      expect(cutEvent.defaultPrevented).toBe(false);
      expect(onFocusInput).not.toHaveBeenCalled();
      expect(mocked.openNewChat).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it("extracts the last completed fenced code block with matching fence closers", () => {
    expect(extractLastFencedCodeBlock([
      "````ts",
      "```",
      "",
      "const first = 1;",
      "````",
      "",
      "~~~sh",
      "echo second",
      "~~~~",
      "",
      "```js",
      "unfinished",
    ].join("\n"))).toBe("echo second");
  });

  it("extracts the last fenced code block without splitting the full message into lines", () => {
    const split = vi.spyOn(String.prototype, "split").mockImplementation(() => {
      throw new Error("Markdown should be scanned line by line");
    });

    try {
      expect(extractLastFencedCodeBlock("```ts\r\nconst value = 1;\r\n```")).toBe("const value = 1;");
    } finally {
      split.mockRestore();
    }
  });

  it("extracts the last fenced code block from a bounded tail window", () => {
    const markdown = [
      "```ts",
      "const old = 1;",
      "```",
      "x".repeat(MAX_CHAT_SHORTCUT_CODE_BLOCK_SCAN_CHARS + 10),
      "```ts",
      "const recent = 2;",
      "```",
    ].join("\n");

    expect(extractLastFencedCodeBlock(markdown)).toBe("const recent = 2;");
  });

  it("does not return partial oversized fenced code blocks", () => {
    const markdown = [
      "```txt",
      "x".repeat(MAX_CHAT_SHORTCUT_CODE_BLOCK_COPY_CHARS + 1),
      "```",
    ].join("\n");

    expect(extractLastFencedCodeBlock(markdown)).toBeNull();
  });

  it("copies the last code block without closing on shorter fence content", () => {
    setup({
      state: createState({
        messages: {
          "session-1": [
            { id: "u1", role: "user", content: "ask" },
            {
              id: "a1",
              role: "assistant",
              content: [
                "````ts",
                "```",
                "",
                "const value = 1;",
                "````",
              ].join("\n"),
            },
          ],
        },
      }),
    });

    const event = fireKeydown({ key: ";", ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.writeText).toHaveBeenCalledWith(["```", "", "const value = 1;"].join("\n"));
  });

  it("delegates user-message navigation without scanning mounted DOM rows", () => {
    const onNavigateMessages = vi.fn();
    setup({ onNavigateMessages });
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker');

    const previousEvent = fireKeydown({ key: "ArrowUp", shiftKey: true });
    const nextEvent = fireKeydown({ key: "ArrowDown", shiftKey: true });

    expect(previousEvent.defaultPrevented).toBe(true);
    expect(nextEvent.defaultPrevented).toBe(true);
    expect(onNavigateMessages).toHaveBeenNthCalledWith(1, 'prev');
    expect(onNavigateMessages).toHaveBeenNthCalledWith(2, 'next');
    expect(createTreeWalkerSpy).not.toHaveBeenCalled();
    createTreeWalkerSpy.mockRestore();
  });

  it("uses the same session order as the chat sidebar for Ctrl+Tab navigation", () => {
    (window as any).vlainaDesktop = { platform: "electron" };

    setup({
      state: createState({
        sessions: [
          { id: "session-1", updatedAt: 20, createdAt: 1, title: "one", modelId: "m" },
          { id: "temp-session-1", updatedAt: 999, createdAt: 1, title: "temp", modelId: "m" },
          { id: "session-2", updatedAt: 10, createdAt: 1, title: "two", modelId: "m", isPinned: true },
          { id: "session-3", updatedAt: 30, createdAt: 1, title: "three", modelId: "m" },
        ],
      }),
      uiState: createUIState({ currentSessionId: "session-1" }),
    });

    const event = fireKeydown({ key: "Tab", ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mocked.switchSession).toHaveBeenCalledWith("session-2");
  });

  it("does not switch chat sessions on Ctrl+Tab inside a dialog", () => {
    (window as any).vlainaDesktop = { platform: "electron" };

    setup({
      state: createState({
        sessions: [
          { id: "session-1", updatedAt: 20, createdAt: 1, title: "one", modelId: "m" },
          { id: "session-2", updatedAt: 10, createdAt: 1, title: "two", modelId: "m" },
        ],
      }),
      uiState: createUIState({ currentSessionId: "session-1" }),
    });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(mocked.switchSession).not.toHaveBeenCalled();
  });

  it("does nothing when shortcuts are disabled", () => {
    const { onToggleShortcuts, onFocusInput } = setup({ enabled: false });

    const event = fireKeydown({ key: "/", ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(onToggleShortcuts).not.toHaveBeenCalled();
    expect(onFocusInput).not.toHaveBeenCalled();
  });
});
