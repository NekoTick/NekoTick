import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TemporaryChatToggle } from "./TemporaryChatToggle";

const mocks = vi.hoisted(() => ({
  useUnifiedStore: vi.fn(),
  useAIUIStore: vi.fn(),
  promoteTemporarySession: vi.fn(),
  toggleTemporaryChat: vi.fn(),
  openNewChat: vi.fn(),
  generateAutoTitle: vi.fn(),
}));

vi.mock("@/stores/useAIStore", () => ({
  actions: {
    promoteTemporarySession: (...args: unknown[]) => mocks.promoteTemporarySession(...args),
    toggleTemporaryChat: (...args: unknown[]) => mocks.toggleTemporaryChat(...args),
    openNewChat: (...args: unknown[]) => mocks.openNewChat(...args),
  },
}));

vi.mock("@/stores/unified/useUnifiedStore", () => ({
  useUnifiedStore: mocks.useUnifiedStore,
}));

vi.mock("@/stores/ai/chatState", () => ({
  useAIUIStore: mocks.useAIUIStore,
}));

vi.mock("@/hooks/chatService/useAutoTitle", () => ({
  useAutoTitle: () => ({
    generateAutoTitle: mocks.generateAutoTitle,
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/shortcut-keys", () => ({
  ShortcutKeys: ({ keys }: { keys: string[] }) => <span>{keys.join("+")}</span>,
}));

vi.mock("@/components/ui/icons", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid="icon">{name}</span>,
}));

function createStore(overrides?: Record<string, unknown>) {
  return {
    data: {
      ai: {
        temporaryChatEnabled: true,
        currentSessionId: "temp-session-1",
        sessions: [
          {
            id: "temp-session-1",
            modelId: "model-1",
          },
        ],
        messages: {
          "temp-session-1": [
            {
              id: "u1",
              role: "user",
              content: "![image](asset://x)\n\nDraft an API design",
              modelId: "model-1",
              timestamp: 1,
            },
          ],
        },
        providers: [
          {
            id: "provider-1",
            enabled: true,
          },
        ],
        models: [
          {
            id: "model-1",
            apiModelId: "model-1",
            providerId: "provider-1",
          },
        ],
        selectedModelId: "model-1",
      },
    },
    generatingSessions: {},
    ...overrides,
  };
}

function createUIState(store: ReturnType<typeof createStore>, overrides?: Record<string, unknown>) {
  const ai = store.data.ai;
  return {
    generatingSessions: store.generatingSessions as Record<string, boolean>,
    currentSessionId: ai.currentSessionId,
    temporaryChatEnabled: ai.temporaryChatEnabled,
    ...overrides,
  };
}

describe("TemporaryChatToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.promoteTemporarySession.mockResolvedValue(null);
  });

  it("promotes temporary chat and triggers auto title generation in promote mode", async () => {
    const store = createStore();
    const uiState = createUIState(store);
    mocks.promoteTemporarySession.mockResolvedValue("session-123");
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="promote" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Keep this chat" }),
    );

    expect(mocks.promoteTemporarySession).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mocks.generateAutoTitle).toHaveBeenCalledWith(
        "session-123",
        "provider-1",
        "model-1",
      );
    });
  });

  it("skips auto title generation when selected model is unavailable", async () => {
    const store = createStore({
      data: {
        ai: {
          temporaryChatEnabled: true,
          currentSessionId: "temp-session-1",
          sessions: [],
          messages: {
            "temp-session-1": [],
          },
          providers: [],
          models: [],
          selectedModelId: null,
        },
      },
    });
    const uiState = createUIState(store);
    mocks.promoteTemporarySession.mockResolvedValue("session-123");
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="promote" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Keep this chat" }),
    );

    expect(mocks.promoteTemporarySession).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mocks.promoteTemporarySession).toHaveBeenCalledTimes(1);
    });
    expect(mocks.generateAutoTitle).not.toHaveBeenCalled();
  });

  it("toggle mode enables temporary chat when currently disabled", () => {
    const store = createStore({
      data: {
        ai: {
          temporaryChatEnabled: false,
          currentSessionId: "session-1",
          messages: { "session-1": [] },
        },
      },
    });
    const uiState = createUIState(store);
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="toggle" />);
    expect(screen.getByText("Enable temporary chat")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+J")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable temporary chat" }));

    expect(mocks.toggleTemporaryChat).toHaveBeenCalledWith(true);
  });

  it("toggle mode exits to a blank regular chat when no user message exists", () => {
    const store = createStore({
      data: {
        ai: {
          temporaryChatEnabled: true,
          currentSessionId: "temp-session-1",
          messages: { "temp-session-1": [] },
        },
      },
    });
    const uiState = createUIState(store);
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="toggle" />);
    expect(screen.getByText("Disable temporary chat")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+J")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Temporary chat is on" }));

    expect(mocks.openNewChat).toHaveBeenCalledTimes(1);
    expect(mocks.toggleTemporaryChat).not.toHaveBeenCalled();
  });

  it("uses UI selection state when persisted chat selection is stale", () => {
    const store = createStore({
      data: {
        ai: {
          temporaryChatEnabled: false,
          currentSessionId: "session-1",
          messages: {
            "session-1": [
              {
                id: "u1",
                role: "user",
                content: "Persisted session",
                timestamp: 1,
              },
            ],
            "temp-session-1": [],
          },
        },
      },
    });
    const uiState = createUIState(store, {
      currentSessionId: "temp-session-1",
      temporaryChatEnabled: true,
    });
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="toggle" />);
    fireEvent.click(screen.getByRole("button", { name: "Temporary chat is on" }));

    expect(mocks.openNewChat).toHaveBeenCalledTimes(1);
    expect(mocks.toggleTemporaryChat).not.toHaveBeenCalled();
  });

  it("toggle mode does not disable temporary chat when current temporary session already has user messages", () => {
    const store = createStore();
    const uiState = createUIState(store);
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="toggle" />);
    fireEvent.click(screen.getByRole("button", { name: "Temporary chat is on" }));

    expect(mocks.toggleTemporaryChat).not.toHaveBeenCalled();
    expect(mocks.openNewChat).not.toHaveBeenCalled();
  });

  it("promote button stays clickable while session is generating and defers title generation", async () => {
    const store = createStore({
      generatingSessions: {
        "temp-session-1": true,
      },
    });
    const uiState = createUIState(store);
    mocks.promoteTemporarySession.mockResolvedValue("session-123");
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mocks.useAIUIStore.mockImplementation((selector: (state: typeof uiState) => unknown) => selector(uiState));

    render(<TemporaryChatToggle mode="promote" />);
    const button = screen.getByRole("button", {
      name: "Keep this chat",
    });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(mocks.promoteTemporarySession).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mocks.promoteTemporarySession).toHaveBeenCalledTimes(1);
    });
    expect(mocks.generateAutoTitle).not.toHaveBeenCalled();
  });
});
