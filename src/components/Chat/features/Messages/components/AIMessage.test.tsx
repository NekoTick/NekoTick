import { act } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatMessage } from "@/lib/ai/types";
import { useAccountSessionStore } from "@/stores/accountSession";
import { initialAccountSessionState } from "@/stores/accountSession/state";
import { useUIStore } from "@/stores/uiSlice";

vi.mock("@/components/Chat/features/Markdown/LazyMarkdownRenderer", () => ({
  LazyMarkdownRenderer: ({
    content,
    copiedCodeBlockId,
    onCopyCodeBlock,
    isStreaming,
    startTime,
    suspendStreamAnimation,
  }: {
    content: string;
    copiedCodeBlockId?: string | null;
    onCopyCodeBlock?: (blockId: string) => void;
    isStreaming?: boolean;
    startTime?: Date;
    suspendStreamAnimation?: boolean;
  }) => (
    <div
      data-testid="markdown"
      data-content={content}
      data-copied-code-block-id={copiedCodeBlockId ?? ""}
      data-streaming={String(Boolean(isStreaming))}
      data-start-time={startTime?.toISOString() ?? ""}
      data-suspend-stream-animation={String(Boolean(suspendStreamAnimation))}
    >
      {content}
      <button onClick={() => onCopyCodeBlock?.("m1:0")}>copy-code-block</button>
    </div>
  ),
}));

vi.mock("./MessageToolbar", () => ({
  MessageToolbar: ({
    forceVisible,
    showCopyAction,
    showVersionNavigation,
  }: {
    forceVisible?: boolean;
    showCopyAction?: boolean;
    showVersionNavigation?: boolean;
  }) => (
    <div
      data-testid="toolbar"
      data-chat-selection-excluded="true"
      data-force-visible={String(Boolean(forceVisible))}
      data-show-copy-action={String(showCopyAction ?? true)}
      data-show-version-navigation={String(showVersionNavigation ?? true)}
    >
      toolbar
    </div>
  ),
}));

vi.mock("./ErrorBlock", () => ({
  ErrorBlock: ({ content }: { content: string }) => (
    <div data-testid="error">
      {content}
    </div>
  ),
}));

import { AIMessage } from "./AIMessage";

function createMessage(content: string): ChatMessage {
  const timestamp = Date.now();
  return {
    id: "m1",
    role: "assistant",
    content,
    modelId: "model-a",
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe("AIMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ languagePreference: "en" });
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      isLoading: false,
    });
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it("does not show inline loading dots when streaming content is already visible", () => {
    render(
      <AIMessage
        msg={createMessage("Processing image...")}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(document.querySelectorAll(".chat-loading-dot").length).toBe(0);
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-streaming", "true");
  });

  it("does not show inline loading dots when streaming content is empty", () => {
    render(
      <AIMessage
        msg={createMessage("")}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(document.querySelectorAll(".chat-loading-dot").length).toBe(0);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-streaming", "false");
  });

  it("keeps the markdown transition idle when the message is not loading", () => {
    render(
      <AIMessage
        msg={createMessage("Done")}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-streaming", "false");
  });

  it("passes through visible streaming text immediately", () => {
    render(
      <AIMessage
        msg={createMessage("Hello world")}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", "Hello world");
  });

  it("renders the answer steadily after thinking has completed", () => {
    render(
      <AIMessage
        msg={createMessage("<think>finished reasoning</think>Visible answer")}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-streaming", "false");
  });

  it("renders text resembling the former retry status as untrusted Markdown", () => {
    useUIStore.setState({ languagePreference: "zh-CN" });

    const content = "Service unavailable\n30秒后重试 - 第4次重试";

    render(
      <AIMessage
        msg={createMessage(content)}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", content);
  });

  it("makes the full assistant content width part of the chat selection surface", () => {
    render(
      <AIMessage
        msg={createMessage("Hello world")}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown").closest('[data-chat-selection-surface="true"]'))
      .toHaveClass("pl-[var(--vlaina-space-15px)]");
    expect(screen.getByTestId("toolbar")).toHaveAttribute("data-chat-selection-excluded", "true");
  });

  it("starts visible stream animation when content first appears instead of at message creation", () => {
    const timestamp = Date.UTC(2026, 4, 11, 6, 0, 0);
    vi.setSystemTime(new Date("2026-05-11T06:00:03.000Z"));

    render(
      <AIMessage
        msg={{ ...createMessage("Hello world"), id: "m-first-visible", timestamp }}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute(
      "data-start-time",
      "2026-05-11T06:00:03.000Z",
    );
  });

  it("preserves the visible stream animation start time across remounts", () => {
    const timestamp = Date.UTC(2026, 4, 11, 6, 0, 0);
    const msg = { ...createMessage("Hello world"), id: "m-remount", timestamp };
    vi.setSystemTime(new Date("2026-05-11T06:00:03.000Z"));

    const view = render(
      <AIMessage
        msg={msg}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute(
      "data-start-time",
      "2026-05-11T06:00:03.000Z",
    );

    view.unmount();
    vi.setSystemTime(new Date("2026-05-11T06:00:06.000Z"));

    render(
      <AIMessage
        msg={msg}
        imageGallery={[]}
        isLoading
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute(
      "data-start-time",
      "2026-05-11T06:00:03.000Z",
    );
  });

  it("passes stream animation suspension to the markdown renderer", () => {
    render(
      <AIMessage
        msg={createMessage("Hello world")}
        imageGallery={[]}
        isLoading
        suspendStreamAnimation
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-suspend-stream-animation", "true");
  });

  it("strips error tags from markdown content and renders the parsed error block", () => {
    render(
      <AIMessage
        msg={createMessage('Visible<error type="NETWORK_ERROR" code="503">Request failed</error>')}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", "Visible");
    expect(screen.getByTestId("error")).toHaveTextContent("Request failed");
  });

  it("hides pure managed model auth errors", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Sign in required</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  });

  it("hides the latest managed model auth error while signed out", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Sign in required</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  });

  it("hides the managed model auth prompt after any follow-up message is sent", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Sign in required</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        isLastMessage={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  });

  it("keeps only the latest managed model auth prompt visible", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Sign in required</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        isLastMessage={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  });

  it("hides the managed model auth error after the account is connected", () => {
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      isConnected: true,
      isLoading: false,
      provider: "google",
      primaryEmail: "user@example.com",
    });

    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Sign in required</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  });

  it("keeps the normal error block and toolbar for non-managed auth errors", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="AUTH_ERROR" code="401">Invalid API key</error>'),
          modelId: "provider-1::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("error")).toHaveTextContent("Invalid API key");
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
  });

  it("does not show the managed model billing prompt for quota errors", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="QUOTA_EXHAUSTED" code="403">点数已经用完了</error>'),
          modelId: "vlaina-managed::gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("error")).not.toHaveAttribute("data-billing-prompt");
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
  });

  it("does not show the managed model billing prompt for legacy single-colon managed model ids", () => {
    render(
      <AIMessage
        msg={{
          ...createMessage('<error type="QUOTA_EXHAUSTED" code="points_exhausted">点数已经用完了</error>'),
          modelId: "vlaina-managed:gpt-test",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("error")).not.toHaveAttribute("data-billing-prompt");
  });

  it("keeps web search results visible after sources are read", () => {
    const message = {
      ...createMessage("Answer with source."),
      webSearchStatuses: [
        { phase: 'results' as const, query: 'react', results: [{ title: 'React Docs', url: 'https://react.dev', snippet: 'Official docs', publishedAt: null }] },
        { phase: 'complete' as const, urls: ['https://react.dev'], failedSources: [{ url: 'https://fail.example', message: 'Unable to read this page.' }], metrics: { successCount: 1, failureCount: 1, durationMs: 12 } },
      ],
    };

    render(
      <AIMessage
        msg={message}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByText("Sources read")).toBeInTheDocument();
    expect(screen.queryByText("1 read")).not.toBeInTheDocument();
    expect(screen.queryByText("1 skipped")).not.toBeInTheDocument();
    const sourceLink = screen.getByRole("link", { name: /React Docs/ });
    expect(sourceLink).toHaveClass("bg-[var(--vlaina-accent-light)]");
    expect(sourceLink).toHaveClass("!text-[var(--vlaina-accent-hover)]");
    expect(screen.getByText("https://react.dev")).toBeInTheDocument();
    expect(screen.queryByText("Skipped sources")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to read this page.")).not.toBeInTheDocument();
    expect(screen.queryByText("https://fail.example")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", "Answer with source.");
  });

  it("shows skipped sources when no web search source could be read", () => {
    const message = {
      ...createMessage("No source answer."),
      webSearchStatuses: [
        { phase: 'complete' as const, urls: [], failedSources: [{ url: 'https://fail.example', message: 'Unable to read this page.' }], metrics: { successCount: 0, failureCount: 1, durationMs: 12 } },
      ],
    };

    render(
      <AIMessage
        msg={message}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByText("Skipped sources")).toBeInTheDocument();
    expect(screen.getByText("Unable to read this page.")).toBeInTheDocument();
    expect(screen.getByText("https://fail.example")).toBeInTheDocument();
  });

  it("keeps source links from every web search step visible", () => {
    const message = {
      ...createMessage("Answer with multiple sources."),
      webSearchStatuses: [
        { phase: 'results' as const, query: 'first', results: [{ title: 'First Source', url: 'https://first.example', snippet: 'First', publishedAt: null }] },
        { phase: 'complete' as const, urls: ['https://first.example'], metrics: { successCount: 1, durationMs: 12 } },
        { phase: 'results' as const, query: 'second', results: [{ title: 'Second Source', url: 'https://second.example', snippet: 'Second', publishedAt: null }] },
        { phase: 'complete' as const, urls: ['https://second.example'], metrics: { successCount: 1, durationMs: 12 } },
      ],
    };

    render(
      <AIMessage
        msg={message}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByText("First Source")).toBeInTheDocument();
    expect(screen.getByText("Second Source")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", "Answer with multiple sources.");
  });

  it("drops unsafe web search status source URLs before rendering links", () => {
    const message = {
      ...createMessage("Answer with filtered sources."),
      webSearchStatuses: [
        { phase: 'results' as const, query: 'security', results: [
          { title: 'Local Admin', url: 'http://127.0.0.1:3000/admin', snippet: 'Bad', publishedAt: null },
          { title: 'Safe Source', url: 'https://safe.example/article', snippet: 'Good', publishedAt: null },
          { title: 'Bidi Source', url: 'https://example.com/\u202Ecod.exe', snippet: 'Bad', publishedAt: null },
        ] },
        { phase: 'complete' as const, urls: ['https://safe.example/article', 'https://safe.example/from-url', 'http://router/admin'], failedSources: [
          { url: 'http://localhost/debug', message: 'Unsafe skipped' },
          { url: 'https://safe.example/fail', message: 'Safe skipped' },
        ] },
      ],
    };

    render(
      <AIMessage
        msg={message}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const safeSource = screen.getByRole("link", { name: /Safe Source/ });
    expect(safeSource).toHaveAttribute("href", "https://safe.example/article");
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://safe.example/article",
      "https://safe.example/from-url",
    ]);
    expect(screen.queryByText("Local Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Bidi Source")).not.toBeInTheDocument();
    expect(screen.queryByText("http://router/admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsafe skipped")).not.toBeInTheDocument();
    expect(screen.queryByText("http://localhost/debug")).not.toBeInTheDocument();
    expect(screen.queryByText("Safe skipped")).not.toBeInTheDocument();
    expect(screen.queryByText("https://safe.example/fail")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", "Answer with filtered sources.");
  });

  it("does not interpret legacy web search status text as message metadata", () => {
    const content = 'Visible answer.\n<web-search-status>{"phase":"searching","query":"catime"';

    render(
      <AIMessage
        msg={createMessage(content)}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", content);
  });

  it("removes legacy status markup when structured web search status is present", () => {
    const content = [
      '<web-search-status>{"phase":"searching","query":"weather"}</web-search-status>',
      '<web-search-status>{"phase":"error","query":"weather","metrics":{"resultCount":0}}</web-search-status>',
      'No current weather result is available.',
    ].join('');

    render(
      <AIMessage
        msg={{
          ...createMessage(content),
          webSearchStatuses: [{ phase: 'error', query: 'weather', metrics: { resultCount: 0 } }],
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute(
      "data-content",
      "No current weather result is available.",
    );
  });

  it("does not interpret legacy web search request text as control data", () => {
    const content = [
      'We need to search.',
      '<web_search_request>{"query":"catime","reason":"current info"}</web_search_request>',
      'Catime answer.',
    ].join('\n');

    render(
      <AIMessage
        msg={createMessage(content)}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-content", content);
  });

  it("stores copied code block feedback above the markdown renderer", () => {
    render(
      <AIMessage
        msg={createMessage("```ts\nconst a = 1;\n```")}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "copy-code-block" }));
    });

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-copied-code-block-id", "m1:0");
  });

  it("clears copied code block feedback after the timeout", () => {
    render(
      <AIMessage
        msg={createMessage("```ts\nconst a = 1;\n```")}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "copy-code-block" }));
    });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-copied-code-block-id", "");
  });

  it("resets copied code block feedback when the message changes", () => {
    const { rerender } = render(
      <AIMessage
        msg={createMessage("```ts\nconst a = 1;\n```")}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "copy-code-block" }));
    });
    expect(screen.getByTestId("markdown")).toHaveAttribute("data-copied-code-block-id", "m1:0");

    rerender(
      <AIMessage
        msg={{
          ...createMessage("Next"),
          id: "m2",
        }}
        imageGallery={[]}
        isLoading={false}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown")).toHaveAttribute("data-copied-code-block-id", "");
  });
});
