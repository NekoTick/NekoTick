import React from "react";
import { act, render, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionInsertButton } from "./SelectionInsertButton";
import {
  canStartChatSelection,
  getSelectionTextForComposer,
  isInsideAssistantMessageItem,
  isInsideSelectionExcluded,
  isInsideSelectionStartSurface,
  isInsideSelectionSurface,
  isSelectionFullyInsideChatMessages,
  MAX_CHAT_SELECTION_TEXT_CHARS,
  resolveOutsideMoveDecision,
} from "./chatSelectionBehavior";
import { useChatViewMessageActions } from "@/components/Chat/hooks/useChatViewMessageActions";

afterEach(() => {
  document.body.removeAttribute("data-chat-selection-lock");
});

async function flushAnimationFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("resolveOutsideMoveDecision", () => {
  it("does nothing when the drag did not start from chat content", () => {
    expect(resolveOutsideMoveDecision({
      isSelectingFromChat: false,
      pointerInsideSelectionSurface: false,
      isSelectionFrozen: false,
    })).toEqual({
      nextFrozen: false,
      shouldPreventDefault: false,
      shouldRestore: false,
    });
  });

  it("allows selection to keep expanding inside assistant message content", () => {
    expect(resolveOutsideMoveDecision({
      isSelectingFromChat: true,
      pointerInsideSelectionSurface: true,
      isSelectionFrozen: true,
    })).toEqual({
      nextFrozen: false,
      shouldPreventDefault: false,
      shouldRestore: false,
    });
  });

  it("freezes selection while crossing user messages or message gaps", () => {
    expect(resolveOutsideMoveDecision({
      isSelectingFromChat: true,
      pointerInsideSelectionSurface: false,
      isSelectionFrozen: false,
    })).toEqual({
      nextFrozen: true,
      shouldPreventDefault: true,
      shouldRestore: true,
    });
  });
});

describe("SelectionInsertButton selection lock", () => {
  it("does not schedule selection layout on viewport changes without an active selection", () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const { unmount } = render(React.createElement(SelectionInsertButton));
    requestAnimationFrameSpy.mockClear();

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    unmount();
    requestAnimationFrameSpy.mockRestore();
  });

  it("marks its portal as a transient content layer", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));

    expect(document.querySelector('[data-chat-selection-insert-layer="true"]')).not.toBeNull();

    unmount();
  });

  it("does not enable the global selection lock while dragging inside assistant text", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
        <div data-testid="gap"></div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;

    fireEvent.mouseDown(assistantBody, { button: 0 });
    expect(document.body).not.toHaveAttribute("data-chat-selection-lock");

    fireEvent.mouseMove(assistantBody);
    expect(document.body).not.toHaveAttribute("data-chat-selection-lock");

    container.remove();
    unmount();
  });

  it("enables the global selection lock only after dragging outside the selection surface", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
        <div data-testid="gap"></div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const gap = container.querySelector('[data-testid="gap"]')!;

    fireEvent.mouseDown(assistantBody, { button: 0 });
    fireEvent.mouseMove(gap);

    expect(document.body).toHaveAttribute("data-chat-selection-lock", "1");

    container.remove();
    unmount();
    expect(document.body).not.toHaveAttribute("data-chat-selection-lock");
  });

  it("does not lock selection while dragging over blank space inside a message row", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-testid="assistant-row" data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
        <div data-testid="gap"></div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const assistantRow = container.querySelector('[data-testid="assistant-row"]')!;

    fireEvent.mouseDown(assistantBody, { button: 0 });
    fireEvent.mouseMove(assistantRow);

    expect(document.body).not.toHaveAttribute("data-chat-selection-lock");

    container.remove();
    unmount();
  });

  it("clears the current text selection when clicking blank chat space", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
        <div data-testid="gap"></div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const gap = container.querySelector('[data-testid="gap"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(assistantBody);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe("Answer");

    fireEvent.mouseDown(gap, { button: 0 });

    expect(selection.rangeCount).toBe(0);

    container.remove();
    unmount();
  });

  it("restores the last valid message text selection when the range expands into a message gap", () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
        <div data-testid="gap">gap text that should not stay selected</div>
        <div data-message-item="true" data-role="user">
          <div data-testid="user-bubble" data-chat-selection-surface="true">Question</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const gap = container.querySelector('[data-testid="gap"]')!;
    const scrollable = container.querySelector('[data-chat-scrollable="true"]')!;
    const selection = window.getSelection()!;
    const validRange = document.createRange();
    validRange.selectNodeContents(assistantBody);
    const invalidRange = document.createRange();
    invalidRange.selectNodeContents(scrollable);

    fireEvent.mouseDown(assistantBody, { button: 0 });
    selection.removeAllRanges();
    selection.addRange(validRange);
    fireEvent(document, new Event("selectionchange"));
    expect(selection.toString()).toBe("Answer");

    fireEvent.mouseMove(gap);
    selection.removeAllRanges();
    selection.addRange(invalidRange);
    fireEvent(document, new Event("selectionchange"));

    expect(selection.toString()).toBe("Answer");

    selection.removeAllRanges();
    container.remove();
    unmount();
  });

  it("checks message intersections without materializing all message rows", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(assistantBody);
    selection.removeAllRanges();
    selection.addRange(range);
    const querySelectorAllSpy = vi.spyOn(Element.prototype, "querySelectorAll");

    expect(isSelectionFullyInsideChatMessages(selection, range)).toBe(true);
    expect(querySelectorAllSpy).not.toHaveBeenCalled();

    querySelectorAllSpy.mockRestore();
    selection.removeAllRanges();
    container.remove();
  });

  it("keeps the insert button visible when the window blurs", async () => {
    const { unmount } = render(React.createElement(SelectionInsertButton));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(assistantBody);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        right: 160,
        top: 100,
        bottom: 120,
        width: 60,
        height: 20,
      }),
    });
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    await flushAnimationFrame();

    expect(document.querySelector('[data-no-focus-input="true"]')).not.toBeNull();

    fireEvent(window, new Event("blur"));

    expect(document.querySelector('[data-no-focus-input="true"]')).not.toBeNull();

    selection.removeAllRanges();
    container.remove();
    unmount();
  });

  it("clears the insert button before regenerating the selected response", async () => {
    const regenerate = vi.fn();
    function RegenerateHarness() {
      const { handleRegenerate } = useChatViewMessageActions({
        currentSessionId: "session-1",
        editMessage: vi.fn(),
        imageGallery: [],
        regenerate,
        switchMessageVersion: vi.fn(),
      });
      return React.createElement("button", {
        "data-testid": "regenerate",
        onClick: () => handleRegenerate("assistant-1"),
      });
    }

    const { getByTestId, unmount } = render(React.createElement(
      React.Fragment,
      null,
      React.createElement(SelectionInsertButton),
      React.createElement(RegenerateHarness),
    ));
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">Selected answer</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(assistantBody);
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        right: 160,
        top: 100,
        bottom: 120,
        width: 60,
        height: 20,
      }),
    });
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    await flushAnimationFrame();

    expect(document.querySelector('[data-chat-selection-insert-button="true"]')).not.toBeNull();

    fireEvent.click(getByTestId("regenerate"));
    await flushAnimationFrame();

    expect(regenerate).toHaveBeenCalledWith("assistant-1");
    expect(selection.rangeCount).toBe(0);
    expect(document.querySelector('[data-chat-selection-insert-button="true"]')).toBeNull();

    container.remove();
    unmount();
  });
});

describe("chat selection surfaces", () => {
  it("starts from message content surfaces", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-message-item="true" data-role="assistant">
        <div data-testid="assistant-title" data-chat-selection-excluded="true">Reasoning</div>
        <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
      </div>
      <div data-message-item="true" data-role="user">
          <div data-testid="user-bubble" data-chat-selection-surface="true" data-chat-selection-start="true">Question</div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantTitle = container.querySelector('[data-testid="assistant-title"]');
    const assistantBody = container.querySelector('[data-testid="assistant-body"]');
    const userBubble = container.querySelector('[data-testid="user-bubble"]');

    expect(canStartChatSelection(assistantBody)).toBe(true);
    expect(canStartChatSelection(assistantTitle)).toBe(false);
    expect(canStartChatSelection(userBubble)).toBe(true);
    expect(isInsideSelectionExcluded(assistantTitle)).toBe(true);

    container.remove();
  });

  it("allows user bubbles as extension surfaces after selection has started", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-message-item="true" data-role="assistant">
        <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
      </div>
      <div data-message-item="true" data-role="user">
        <div data-testid="user-bubble" data-chat-selection-surface="true" data-chat-selection-start="true">Question</div>
      </div>
      <div data-testid="gap"></div>
    `;
    document.body.appendChild(container);

    const assistantBody = container.querySelector('[data-testid="assistant-body"]');
    const userBubble = container.querySelector('[data-testid="user-bubble"]');
    const gap = container.querySelector('[data-testid="gap"]');

    expect(isInsideAssistantMessageItem(assistantBody)).toBe(true);
    expect(isInsideSelectionSurface(assistantBody)).toBe(true);
    expect(isInsideSelectionStartSurface(assistantBody)).toBe(true);
    expect(isInsideSelectionSurface(userBubble)).toBe(true);
    expect(isInsideSelectionSurface(gap)).toBe(false);

    container.remove();
  });

  it("does not start from controls inside assistant content surfaces", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-message-item="true" data-role="assistant">
        <div data-chat-selection-surface="true" data-chat-selection-start="true">
          <p data-testid="assistant-text">Answer</p>
          <button data-testid="copy-button">Copy</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const assistantText = container.querySelector('[data-testid="assistant-text"]');
    const copyButton = container.querySelector('[data-testid="copy-button"]');

    expect(canStartChatSelection(assistantText)).toBe(true);
    expect(isInsideSelectionSurface(copyButton)).toBe(false);
    expect(isInsideSelectionExcluded(copyButton)).toBe(true);
    expect(canStartChatSelection(copyButton)).toBe(false);

    container.remove();
  });

  it("does not start a chat selection from widened assistant row padding", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-message-item="true" data-role="assistant">
        <div data-testid="assistant-wide-surface" data-chat-selection-surface="true">
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const wideSurface = container.querySelector('[data-testid="assistant-wide-surface"]');
    const assistantBody = container.querySelector('[data-testid="assistant-body"]');

    expect(isInsideSelectionSurface(wideSurface)).toBe(true);
    expect(isInsideSelectionStartSurface(wideSurface)).toBe(false);
    expect(canStartChatSelection(wideSurface)).toBe(false);
    expect(canStartChatSelection(assistantBody)).toBe(true);

    container.remove();
  });

  it("does not treat collapsed thinking inside a widened assistant surface as selectable", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-message-item="true" data-role="assistant">
        <div data-testid="assistant-wide-surface" data-chat-selection-surface="true">
          <div data-testid="collapsed-thinking" data-chat-thinking-collapsed="true">
            <div data-testid="thinking-text">Hidden reasoning</div>
          </div>
          <div data-testid="assistant-body" data-chat-selection-surface="true" data-chat-selection-start="true">Answer</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const thinkingText = container.querySelector('[data-testid="thinking-text"]');
    const assistantBody = container.querySelector('[data-testid="assistant-body"]');

    expect(isInsideSelectionSurface(thinkingText)).toBe(false);
    expect(isInsideSelectionStartSurface(thinkingText)).toBe(false);
    expect(canStartChatSelection(thinkingText)).toBe(false);
    expect(canStartChatSelection(assistantBody)).toBe(true);

    container.remove();
  });

  it("filters collapsed thinking and controls out of the composer insertion text", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true">
            <div data-chat-thinking-collapsed="true">
              <p>Hidden reasoning</p>
            </div>
            <div data-chat-selection-excluded="true">Toolbar label</div>
            <div data-chat-selection-surface="true" data-chat-selection-start="true">
              <p>Visible answer</p>
              <button>Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const scrollable = container.querySelector('[data-chat-scrollable="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(scrollable);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.toString()).toContain("Hidden reasoning");
    expect(getSelectionTextForComposer(selection, range)).toBe("Visible answer");

    selection.removeAllRanges();
    container.remove();
  });

  it("filters code block chrome out of the composer insertion text", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <p>Before</p>
            <div class="code-block-chrome">
              <div class="code-block-chrome-header" data-chat-selection-excluded="true">
                <div class="code-block-chrome-language">
                  <span class="code-block-chrome-language-label">code</span>
                </div>
                <button>Copy</button>
              </div>
              <div class="code-block-chrome-body"><pre class="code-block-chrome-line-numbers" data-chat-selection-excluded="true">1</pre><code>const value = 1;</code></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.toString()).toContain("code");
    const composerText = getSelectionTextForComposer(selection, range);
    expect(composerText).toContain("Before");
    expect(composerText).toContain("const value = 1;");
    expect(composerText).not.toContain("code");
    expect(composerText).not.toContain("Copy");
    expect(composerText).not.toMatch(/^1$/m);

    selection.removeAllRanges();
    container.remove();
  });

  it("filters aria-hidden visual text out of the composer insertion text", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <span>Visible</span>
            <span aria-hidden="true">Decorative duplicate</span>
            <span>Text</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.toString()).toContain("Decorative duplicate");
    const composerText = getSelectionTextForComposer(selection, range);
    expect(composerText).toContain("Visible");
    expect(composerText).toContain("Text");
    expect(composerText).not.toContain("Decorative duplicate");

    selection.removeAllRanges();
    container.remove();
  });

  it("filters embedded media placeholders out of the composer insertion text", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <p>Before</p>
            <div class="mermaid-block" data-chat-selection-excluded="true">Rendered diagram label</div>
            <div class="video-block" data-chat-selection-excluded="true">Open video</div>
            <span data-chat-selection-excluded="true">[Image unavailable]</span>
            <p>After</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);

    const composerText = getSelectionTextForComposer(selection, range);
    expect(composerText).toContain("Before");
    expect(composerText).toContain("After");
    expect(composerText).not.toContain("Rendered diagram label");
    expect(composerText).not.toContain("Open video");
    expect(composerText).not.toContain("Image unavailable");

    selection.removeAllRanges();
    container.remove();
  });

  it("filters selection text without materializing excluded elements", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <p>Visible answer</p>
            <span data-chat-selection-excluded="true">Hidden label</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);
    const querySelectorAllSpy = vi.spyOn(Element.prototype, "querySelectorAll");

    expect(getSelectionTextForComposer(selection, range)).toBe("Visible answer");
    expect(querySelectorAllSpy).not.toHaveBeenCalled();

    querySelectorAllSpy.mockRestore();
    selection.removeAllRanges();
    container.remove();
  });

  it("filters selection text without reading the full native selection string", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <p>Visible answer</p>
            <span data-chat-selection-excluded="true">Hidden label</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);
    const toStringSpy = vi.spyOn(selection, "toString").mockImplementation(() => {
      throw new Error("selection.toString should not be used for filtered selections");
    });

    try {
      expect(getSelectionTextForComposer(selection, range)).toBe("Visible answer");
    } finally {
      toStringSpy.mockRestore();
      selection.removeAllRanges();
      container.remove();
    }
  });

  it("caps filtered composer insertion text from oversized selections", () => {
    const container = document.createElement("div");
    const visibleText = "a".repeat(MAX_CHAT_SELECTION_TEXT_CHARS + 16);
    container.innerHTML = `
      <div data-chat-scrollable="true">
        <div data-message-item="true" data-role="assistant">
          <div data-chat-selection-surface="true" data-chat-selection-start="true">
            <p>${visibleText}</p>
            <span data-chat-selection-excluded="true">Hidden label</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const messageBody = container.querySelector('[data-chat-selection-start="true"]')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(messageBody);
    selection.removeAllRanges();
    selection.addRange(range);

    const composerText = getSelectionTextForComposer(selection, range);
    expect(composerText).toHaveLength(MAX_CHAT_SELECTION_TEXT_CHARS);
    expect(composerText).not.toContain("Hidden label");

    selection.removeAllRanges();
    container.remove();
  });
});
