import { act } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatMessage } from "@/lib/ai/types";
import { dispatchChatMessageCopied } from "@/components/Chat/common/copyFeedback";

vi.mock("@/components/ui/icons", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { MessageToolbar } from "./MessageToolbar";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const content = overrides.content ?? "Answer";
  const timestamp = overrides.timestamp ?? Date.now();
  return {
    id: overrides.id ?? "m1",
    role: overrides.role ?? "assistant",
    content,
    modelId: overrides.modelId ?? "model-a",
    timestamp,
    ...(overrides.imageSources !== undefined ? { imageSources: overrides.imageSources } : {}),
    versions:
      overrides.versions ?? [{ content, createdAt: timestamp, kind: "original", subsequentMessages: [] }],
    currentVersionIndex: overrides.currentVersionIndex ?? 0,
  };
}

describe("MessageToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not render while loading", () => {
    const { container } = render(
      <MessageToolbar
        msg={createMessage()}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("reveals hover-only actions when keyboard focus enters the toolbar", () => {
    const { container } = render(
      <MessageToolbar
        msg={createMessage()}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(container.querySelector('[data-chat-message-action="copy"]')?.parentElement)
      .toHaveClass('focus-within:opacity-[var(--vlaina-opacity-100)]');
  });

  it("copies thinking-stripped content and shows temporary copied feedback", async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageToolbar
        msg={createMessage({ content: "Answer\n<think>hidden</think>" })}
        isLoading={false}
        onCopy={onCopy}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[0]);
    });

    expect(onCopy).toHaveBeenCalledWith("Answer");
    expect(screen.getByTestId("icon-common.check")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1360);
    });

    expect(screen.getByTestId("icon-common.copy")).toBeInTheDocument();
  });

  it("reacts to the copied shortcut event for the current message", () => {
    render(
      <MessageToolbar
        msg={createMessage()}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    act(() => {
      dispatchChatMessageCopied("m1");
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByTestId("icon-common.check")).toBeInTheDocument();
  });

  it("calls regenerate and adjacent version switches", () => {
    const onRegenerate = vi.fn();
    const onSwitchVersion = vi.fn();

    render(
      <MessageToolbar
        msg={createMessage({
          content: "v2",
          versions: [
            { content: "v1", createdAt: 1, kind: "original", subsequentMessages: [] },
            { content: "v2", createdAt: 2, kind: "regeneration", subsequentMessages: [] },
            { content: "v3", createdAt: 3, kind: "regeneration", subsequentMessages: [] },
          ],
          currentVersionIndex: 1,
        })}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={onRegenerate}
        onSwitchVersion={onSwitchVersion}
      />,
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[3]);

    expect(onSwitchVersion).toHaveBeenNthCalledWith(1, 0);
    expect(onSwitchVersion).toHaveBeenNthCalledWith(2, 2);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("disables version navigation at the edges", () => {
    render(
      <MessageToolbar
        msg={createMessage({
          versions: [
            { content: "v1", createdAt: 1, kind: "original", subsequentMessages: [] },
            { content: "v2", createdAt: 2, kind: "regeneration", subsequentMessages: [] },
          ],
          currentVersionIndex: 0,
        })}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("does not show version navigation for untyped storage artifacts", () => {
    render(
      <MessageToolbar
        msg={createMessage({
          versions: [
            { content: "sync snapshot 1", createdAt: 1, subsequentMessages: [] },
            { content: "sync snapshot 2", createdAt: 2, subsequentMessages: [] },
          ] as unknown as ChatMessage["versions"],
          currentVersionIndex: 0,
        })}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByText("1/2")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("can render only the regenerate action", () => {
    const onRegenerate = vi.fn();

    render(
      <MessageToolbar
        msg={createMessage({
          content: "v2",
          versions: [
            { content: "v1", createdAt: 1, kind: "original", subsequentMessages: [] },
            { content: "v2", createdAt: 2, kind: "regeneration", subsequentMessages: [] },
          ],
          currentVersionIndex: 1,
        })}
        isLoading={false}
        showCopyAction={false}
        showVersionNavigation={false}
        onCopy={() => {}}
        onRegenerate={onRegenerate}
        onSwitchVersion={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(screen.queryByTestId("icon-common.copy")).not.toBeInTheDocument();

    fireEvent.click(buttons[0]);

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("renders the branch action after regenerate", () => {
    const onFork = vi.fn();

    render(
      <MessageToolbar
        msg={createMessage()}
        isLoading={false}
        onCopy={() => {}}
        onFork={onFork}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const actions = screen.getAllByRole("button").map((button) => button.dataset.chatMessageAction);
    expect(actions).toEqual(["copy", "regenerate", "fork"]);
    expect(screen.getByTestId("icon-chat.branch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Branch conversation" }));

    expect(onFork).toHaveBeenCalledTimes(1);
  });
});
