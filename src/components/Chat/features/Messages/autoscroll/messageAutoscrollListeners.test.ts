import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/ai/types";
import { attachMessageAutoscrollListeners } from "./messageAutoscrollListeners";

function createMessage(id: string, role: ChatMessage["role"]): ChatMessage {
  const timestamp = Date.now();
  return {
    id,
    role,
    content: id,
    modelId: "model-a",
    timestamp,
    versions: [{ content: id, createdAt: timestamp, kind: "original", subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

function createRect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 800,
    top,
    width: 800,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("attachMessageAutoscrollListeners", () => {
  it("coalesces repeated scroll geometry reads into one animation frame", () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
      frameCallbacks.delete(frameId);
    });

    const container = document.createElement("div");
    const userRow = document.createElement("div");
    const assistantRow = document.createElement("div");
    userRow.dataset.messageIndex = "0";
    assistantRow.dataset.messageIndex = "1";
    container.append(userRow, assistantRow);
    document.body.append(container);

    let scrollTop = 100;
    Object.defineProperties(container, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => 1200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = value; },
      },
    });
    const containerRectSpy = vi.spyOn(container, "getBoundingClientRect").mockReturnValue(createRect(0, 500));
    const userRectSpy = vi.spyOn(userRow, "getBoundingClientRect").mockReturnValue(createRect(100, 180));
    const assistantRectSpy = vi.spyOn(assistantRow, "getBoundingClientRect").mockReturnValue(createRect(180, 600));

    const cleanup = attachMessageAutoscrollListeners({
      container,
      detachFromStreamingFollow: vi.fn(),
      isAutoFollowRef: { current: true },
      isCurrentTurnAnchoredRef: { current: true },
      isPointerInsideScrollRootRef: { current: false },
      isStreamingRef: { current: false },
      lastObservedScrollTopRef: { current: null },
      lastTouchYRef: { current: null },
      messagesRef: { current: [createMessage("u1", "user"), createMessage("a1", "assistant")] },
      programmaticScrollTopRef: { current: null },
      setProgrammaticScrollTop: vi.fn((_container, nextScrollTop) => nextScrollTop),
      userDetachedFromCurrentTurnRef: { current: false },
    });
    containerRectSpy.mockClear();
    userRectSpy.mockClear();
    assistantRectSpy.mockClear();
    requestAnimationFrameSpy.mockClear();

    container.dispatchEvent(new Event("scroll"));
    container.dispatchEvent(new Event("scroll"));
    container.dispatchEvent(new Event("scroll"));

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(containerRectSpy).not.toHaveBeenCalled();

    const callback = frameCallbacks.values().next().value;
    expect(callback).toBeTypeOf("function");
    callback!(0);

    expect(containerRectSpy).toHaveBeenCalledTimes(1);
    expect(userRectSpy).toHaveBeenCalledTimes(1);
    expect(assistantRectSpy).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("detaches streaming follow immediately on an upward scroll", () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame");
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);
    let scrollTop = 200;
    Object.defineProperties(container, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => 700 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = value; },
      },
    });
    const detachFromStreamingFollow = vi.fn();

    const cleanup = attachMessageAutoscrollListeners({
      container,
      detachFromStreamingFollow,
      isAutoFollowRef: { current: true },
      isCurrentTurnAnchoredRef: { current: false },
      isPointerInsideScrollRootRef: { current: false },
      isStreamingRef: { current: true },
      lastObservedScrollTopRef: { current: null },
      lastTouchYRef: { current: null },
      messagesRef: { current: [] },
      programmaticScrollTopRef: { current: null },
      setProgrammaticScrollTop: vi.fn((_container, nextScrollTop) => nextScrollTop),
      userDetachedFromCurrentTurnRef: { current: false },
    });
    requestAnimationFrameSpy.mockClear();
    detachFromStreamingFollow.mockClear();

    scrollTop = 150;
    container.dispatchEvent(new Event("scroll"));

    expect(detachFromStreamingFollow).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    cleanup();
  });
});
