import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBlock } from "./ErrorBlock";
import { ACCOUNT_LOGIN_REQUESTED_EVENT } from "@/lib/account/sessionEvent";

describe("ErrorBlock", () => {
  it("marks readable error text as a chat selection surface", () => {
    render(<ErrorBlock content="My brain needs a breather. Try again in a moment." />);

    expect(screen.getByText("My brain needs a breather. Try again in a moment."))
      .toHaveAttribute("data-chat-selection-surface", "true");
    expect(screen.getByText("My brain needs a breather. Try again in a moment."))
      .toHaveAttribute("data-chat-selection-start", "true");
  });

  it("renders URLs as inert error text", () => {
    render(<ErrorBlock content="Read https://example.com/docs then retry." />);

    expect(screen.getByText("Read https://example.com/docs then retry.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a sign-in prompt that opens the account login flow", () => {
    const onLoginRequested = vi.fn();
    window.addEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);

    try {
      render(<ErrorBlock content="Sign in required." showLoginPrompt />);
      fireEvent.click(screen.getByRole("button"));
    } finally {
      window.removeEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);
    }

    expect(onLoginRequested).toHaveBeenCalledTimes(1);
  });
});
