import { act, createRef } from "react";
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatMessage } from "@/lib/ai/types";
import { useAccountSessionStore } from "@/stores/accountSession";
import { initialAccountSessionState } from "@/stores/accountSession/state";

const { messageItemSpy } = vi.hoisted(() => ({
  messageItemSpy: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./components/MessageItem", () => ({
  MessageItem: (props: any) => {
    messageItemSpy(props);
    return <div data-testid={`message-item-${props.msg.id}`} />;
  },
}));

vi.mock("@/components/Chat/features/Messages/components/ChatLoading", () => ({
  ChatLoading: () => <div data-testid="chat-loading" />,
}));

import { MessageList } from "./MessageList";
import type { ChatMessageNavigationHandler } from './MessageListTypes';

function createMessage(id: string, role: ChatMessage["role"]): ChatMessage {
  const content = `${role}-${id}`;
  const timestamp = Date.now();
  return {
    id,
    role,
    content,
    modelId: "model-a",
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

function createManagedAuthMessage(id: string): ChatMessage {
  const timestamp = Date.now();
  const content = '<error type="AUTH_ERROR" code="401">Sign in required</error>';
  return {
    id,
    role: "assistant",
    content,
    modelId: "vlaina-managed::gpt-test",
    timestamp,
    versions: [{ content, createdAt: timestamp, kind: 'original' as const, subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

describe("MessageList", () => {
  beforeEach(() => {
    messageItemSpy.mockClear();
    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders an empty hidden scroll container when there are no messages", () => {
    const containerRef = createRef<HTMLDivElement>();

    render(
      <MessageList
        messages={[]}
        getImageGallery={() => []}
        isSessionActive={false}
        showLoading={false}
        spacerHeight={24}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const scrollable = document.querySelector('[data-chat-scrollable="true"]');
    expect(scrollable).not.toBeNull();
    expect(scrollable).toHaveClass("opacity-[var(--vlaina-opacity-0)]");
    expect(scrollable).toHaveClass("pointer-events-none");
    expect(scrollable).toHaveStyle({ overflowAnchor: "none" });
    expect(messageItemSpy).not.toHaveBeenCalled();
  });

  it("marks only the last message as loading when the session is active", () => {
    const messages = [
      createMessage("u1", "user"),
      createMessage("a1", "assistant"),
      createMessage("a2", "assistant"),
    ];

    render(
      <MessageList
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={createRef<HTMLDivElement>()}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(messageItemSpy).toHaveBeenCalledTimes(3);
    expect(messageItemSpy.mock.calls[0][0]).toMatchObject({ msg: messages[0], isLoading: false });
    expect(messageItemSpy.mock.calls[1][0]).toMatchObject({ msg: messages[1], isLoading: false });
    expect(messageItemSpy.mock.calls[2][0]).toMatchObject({ msg: messages[2], isLoading: true });
    expect(messageItemSpy.mock.calls[0][0]).toMatchObject({ isLastMessage: false });
    expect(messageItemSpy.mock.calls[1][0]).toMatchObject({ isLastMessage: false });
    expect(messageItemSpy.mock.calls[2][0]).toMatchObject({ isLastMessage: true });
    expect(document.querySelector('[data-chat-scrollable="true"]')).toHaveAttribute('aria-busy', 'true');
  });

  it("passes handlers and image gallery getter through to each message item", () => {
    const onCopy = vi.fn();
    const onRegenerate = vi.fn();
    const onEdit = vi.fn();
    const onSwitchVersion = vi.fn();
    const getImageGallery = vi.fn(() => [{ id: "img-1", src: "https://example.com/1.png" }]);

    render(
      <MessageList
        messages={[createMessage("a1", "assistant")]}
        getImageGallery={getImageGallery}
        isSessionActive={false}
        showLoading={false}
        spacerHeight={10}
        containerRef={createRef<HTMLDivElement>()}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        onEdit={onEdit}
        onSwitchVersion={onSwitchVersion}
      />,
    );

    expect(messageItemSpy.mock.calls[0][0]).toMatchObject({
      getImageGallery,
      onCopy,
      onRegenerate,
      onEdit,
      onSwitchVersion,
    });
  });

  it("filters older managed auth prompts before building visible rows", () => {
    const messages = [
      createMessage("u1", "user"),
      createManagedAuthMessage("a-auth-1"),
      createMessage("u2", "user"),
      createManagedAuthMessage("a-auth-2"),
    ];

    render(
      <MessageList
        messages={messages}
        getImageGallery={() => []}
        isSessionActive={false}
        showLoading={false}
        spacerHeight={0}
        containerRef={createRef<HTMLDivElement>()}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    const renderedIds = messageItemSpy.mock.calls.map(([props]) => props.msg.id);
    expect(renderedIds).toEqual(["u1", "u2", "a-auth-2"]);
    const renderedIndexes = Array.from(document.querySelectorAll('[data-message-index]'))
      .map((node) => node.getAttribute('data-message-index'));
    expect(renderedIndexes).toEqual(["0", "2", "3"]);
    expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      msg: expect.objectContaining({ id: "a-auth-2" }),
      isLastMessage: true,
    });
  });


  it("does not rerender message items when parent rerenders with identical props", () => {
    const messages = [createMessage("a1", "assistant")];
    const containerRef = createRef<HTMLDivElement>();
    const getImageGallery = vi.fn(() => []);
    const onCopy = vi.fn();
    const onRegenerate = vi.fn();
    const onSwitchVersion = vi.fn();

    const view = render(
      <MessageList
        messages={messages}
        getImageGallery={getImageGallery}
        isSessionActive={false}
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        onSwitchVersion={onSwitchVersion}
      />,
    );

    expect(messageItemSpy).toHaveBeenCalledTimes(1);

    view.rerender(
      <MessageList
        messages={messages}
        getImageGallery={getImageGallery}
        isSessionActive={false}
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        onSwitchVersion={onSwitchVersion}
      />,
    );

    expect(messageItemSpy).toHaveBeenCalledTimes(1);
  });

  it("does not replace cached viewport metrics with zero while inactive", async () => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    let clientWidth = 640;
    let clientHeight = 480;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => clientWidth,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => clientHeight,
    });

    try {
      const messages = [createMessage("u1", "user")];
      const containerRef = createRef<HTMLDivElement>();
      const view = render(
        <MessageList
          active
          messages={messages}
          getImageGallery={() => []}
          isSessionActive={false}
          showLoading={false}
          spacerHeight={0}
          containerRef={containerRef}
          onCopy={() => {}}
          onRegenerate={() => {}}
          onSwitchVersion={() => {}}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        userBubbleContainerWidth: 640,
      });

      clientWidth = 0;
      clientHeight = 0;
      view.rerender(
        <MessageList
          active={false}
          messages={messages}
          getImageGallery={() => []}
          isSessionActive={false}
          showLoading={false}
          spacerHeight={0}
          containerRef={containerRef}
          onCopy={() => {}}
          onRegenerate={() => {}}
          onSwitchVersion={() => {}}
        />,
      );

      expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        userBubbleContainerWidth: 640,
      });
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", widthDescriptor);
      }
      if (heightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", heightDescriptor);
      }
    }
  });

  it("shows the trailing loading indicator when requested", () => {
    render(
      <MessageList
        messages={[createMessage("a1", "assistant")]}
        getImageGallery={() => []}
        isSessionActive={false}
        showLoading
        spacerHeight={0}
        containerRef={createRef<HTMLDivElement>()}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();
    expect(document.querySelector('[data-chat-scrollable="true"]')).toHaveAttribute('aria-busy', 'true');
  });

  it("navigates to virtualized user prompts using the full frame layout", () => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get: () => 3500 });

    try {
      const longAssistant = createMessage('a1', 'assistant');
      longAssistant.content = 'Long response line.\n'.repeat(2500);
      const navigationRef = createRef<ChatMessageNavigationHandler>();
      const containerRef = createRef<HTMLDivElement>();
      render(
        <MessageList
          messages={[
            createMessage('u1', 'user'),
            longAssistant,
            createMessage('u2', 'user'),
          ]}
          getImageGallery={() => []}
          isSessionActive={false}
          showLoading={false}
          spacerHeight={0}
          containerRef={containerRef}
          navigationRef={navigationRef}
          onCopy={() => {}}
          onRegenerate={() => {}}
          onSwitchVersion={() => {}}
        />,
      );

      expect(screen.queryByTestId('message-item-u1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-item-u2')).not.toBeInTheDocument();
      const scrollTo = vi.fn();
      Object.defineProperty(containerRef.current!, 'scrollTo', { configurable: true, value: scrollTo });

      navigationRef.current?.('prev');
      expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 12, behavior: 'smooth' });

      navigationRef.current?.('next');
      expect(scrollTo.mock.calls[1]?.[0].behavior).toBe('smooth');
      expect(scrollTo.mock.calls[1]?.[0].top).toBeGreaterThan(3500);
    } finally {
      if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
      if (scrollTopDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollTop', scrollTopDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop');
    }
  });

  it("keeps the row ResizeObserver stable across streaming message updates", () => {
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(_callback: ResizeObserverCallback) {
        ResizeObserverMock.instances.push(this);
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const containerRef = createRef<HTMLDivElement>();
    const messages = [createMessage("u1", "user"), createMessage("a1", "assistant")];
    const view = render(
      <MessageList
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );
    const observerCountAfterInitialRender = ResizeObserverMock.instances.length;

    view.rerender(
      <MessageList
        messages={[
          messages[0]!,
          {
            ...messages[1]!,
            content: `${messages[1]!.content} streamed`,
          },
        ]}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(observerCountAfterInitialRender).toBeGreaterThan(0);
    expect(ResizeObserverMock.instances).toHaveLength(observerCountAfterInitialRender);

    view.unmount();

    expect(ResizeObserverMock.instances.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("does not keep a row ResizeObserver running while inactive", () => {
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(_callback: ResizeObserverCallback) {
        ResizeObserverMock.instances.push(this);
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const containerRef = createRef<HTMLDivElement>();
    const messages = [createMessage("u1", "user"), createMessage("a1", "assistant")];
    const view = render(
      <MessageList
        active={false}
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(ResizeObserverMock.instances).toHaveLength(0);

    view.rerender(
      <MessageList
        active
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(ResizeObserverMock.instances.length).toBeGreaterThan(0);

    view.rerender(
      <MessageList
        active={false}
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(ResizeObserverMock.instances.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("suspends the active assistant stream animation while the user is scrolling", () => {
    vi.useFakeTimers();
    const messages = [createMessage("u1", "user"), createMessage("a1", "assistant")];
    const containerRef = createRef<HTMLDivElement>();

    render(
      <MessageList
        messages={messages}
        getImageGallery={() => []}
        isSessionActive
        showLoading={false}
        spacerHeight={0}
        containerRef={containerRef}
        onCopy={() => {}}
        onRegenerate={() => {}}
        onSwitchVersion={() => {}}
      />,
    );

    expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      msg: messages[1],
      suspendStreamAnimation: false,
    });

    const scrollable = document.querySelector('[data-chat-scrollable="true"]')!;
    fireEvent.scroll(scrollable);

    expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      msg: messages[1],
      suspendStreamAnimation: true,
    });

    act(() => {
      vi.advanceTimersByTime(181);
    });

    expect(messageItemSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      msg: messages[1],
      suspendStreamAnimation: false,
    });
  });
});
