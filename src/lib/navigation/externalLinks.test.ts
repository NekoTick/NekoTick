import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

const { openExternalUrlMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(),
}));

vi.mock("@/lib/desktop/shell", () => ({
  openExternalUrl: openExternalUrlMock,
}));

import {
  configureNativeExternalUrlOpener,
  normalizeExternalHref,
  openExternalHref,
  getExternalLinkProps,
} from "./externalLinks";

describe("externalLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureNativeExternalUrlOpener(null);
  });

  describe("normalizeExternalHref", () => {
    it("accepts only external-safe protocols", () => {
      expect(normalizeExternalHref("https://example.com")).toBe(
        "https://example.com/",
      );
      expect(normalizeExternalHref("http://example.com/path?a=1")).toBe(
        "http://example.com/path?a=1",
      );
      expect(normalizeExternalHref("mailto:hello@example.com")).toBe(
        "mailto:hello@example.com",
      );
      expect(normalizeExternalHref("weixin://")).toBe("weixin://");
      expect(normalizeExternalHref("weixin://dl/chat")).toBe("weixin://dl/chat");
    });

    it("rejects non-external or unsafe protocols", () => {
      expect(normalizeExternalHref("javascript:alert(1)")).toBeNull();
      expect(normalizeExternalHref("data:text/html;base64,Zm9v")).toBeNull();
      expect(normalizeExternalHref("/internal/path")).toBeNull();
      expect(normalizeExternalHref("ftp://example.com")).toBeNull();
      expect(normalizeExternalHref("   ")).toBeNull();
      expect(normalizeExternalHref(String.raw`weixin\://dl/chat`)).toBeNull();
    });

    it("rejects oversized external hrefs before URL parsing", () => {
      expect(normalizeExternalHref(`https://example.com/${"a".repeat(4096)}`)).toBeNull();
    });

    it("rejects control and bidi characters before opening external links", () => {
      expect(normalizeExternalHref("https://example.com/\u202Ecod.exe")).toBeNull();
      expect(normalizeExternalHref("https://example.com/\u0000path")).toBeNull();
      expect(normalizeExternalHref("mailto:user@example.com\r\nbcc:evil@example.com")).toBeNull();
    });

    it("rejects backslash URL syntax before browser normalization", () => {
      expect(normalizeExternalHref(String.raw`https:\example.com\path`)).toBeNull();
      expect(normalizeExternalHref(String.raw`https://example.com\@evil.test/path`)).toBeNull();
    });

    it("rejects URLs with embedded credentials", () => {
      expect(normalizeExternalHref("https://user:pass@example.com/docs")).toBeNull();
      expect(normalizeExternalHref("http://user@example.com/docs")).toBeNull();
    });

    it("rejects local-network HTTP URLs before opening external links", () => {
      expect(normalizeExternalHref("http://localhost:3000/admin")).toBeNull();
      expect(normalizeExternalHref("http://127.0.0.1:3000/admin")).toBeNull();
      expect(normalizeExternalHref("http://127.1/admin")).toBeNull();
      expect(normalizeExternalHref("http://2130706433/admin")).toBeNull();
      expect(normalizeExternalHref("http://0177.0.0.1/admin")).toBeNull();
      expect(normalizeExternalHref("http://192.168.1.8/admin")).toBeNull();
      expect(normalizeExternalHref("http://[::1]/admin")).toBeNull();
      expect(normalizeExternalHref("https://example.com/admin")).toBe("https://example.com/admin");
      expect(normalizeExternalHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    });

    it("never accepts non-http(s)/mailto prefixes for random strings", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const lower = input.trim().toLowerCase();
      const hasAllowedPrefix =
            lower.startsWith("http://") ||
            lower.startsWith("https://") ||
            lower.startsWith("mailto:") ||
            lower.startsWith("weixin:");
          if (!hasAllowedPrefix) {
            expect(normalizeExternalHref(input)).toBeNull();
          }
        }),
        { numRuns: 120 },
      );
    });
  });

  describe("openExternalHref", () => {
    it("uses the configured native opener before desktop fallbacks", async () => {
      const nativeOpen = vi.fn(async () => undefined);
      configureNativeExternalUrlOpener(nativeOpen);

      await openExternalHref("https://example.com/native");

      expect(nativeOpen).toHaveBeenCalledWith("https://example.com/native");
      expect(openExternalUrlMock).not.toHaveBeenCalled();
    });

    it("falls back when the configured native opener cannot handle the URL", async () => {
      const nativeOpen = vi.fn(async () => {
        throw new Error("native open failed");
      });
      configureNativeExternalUrlOpener(nativeOpen);
      openExternalUrlMock.mockResolvedValue(undefined);

      await openExternalHref("mailto:hello@example.com");

      expect(nativeOpen).toHaveBeenCalledWith("mailto:hello@example.com");
      expect(openExternalUrlMock).toHaveBeenCalledWith("mailto:hello@example.com");
    });

    it("uses desktop shell for valid external URLs", async () => {
      openExternalUrlMock.mockResolvedValue(undefined);

      await openExternalHref("https://example.com/docs");

      expect(openExternalUrlMock).toHaveBeenCalledTimes(1);
      expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com/docs");
    });

    it("falls back to window.open when desktop shell fails", async () => {
      openExternalUrlMock.mockRejectedValue(new Error("command unavailable"));
      const windowOpenSpy = vi
        .spyOn(window, "open")
        .mockImplementation(() => null as any);

      await openExternalHref("https://example.com/fallback");

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://example.com/fallback",
        "_blank",
        "noopener,noreferrer",
      );

      windowOpenSpy.mockRestore();
    });

    it("does nothing for invalid input and avoids desktop shell", async () => {
      await openExternalHref("javascript:alert(1)");
      expect(openExternalUrlMock).not.toHaveBeenCalled();
    });
  });

  describe("getExternalLinkProps", () => {
    it("returns safe anchor defaults for invalid href", () => {
      const props = getExternalLinkProps("javascript:alert(1)");
      expect(props.href).toBe("#");
      expect(props.target).toBe("_blank");
      expect(props.rel).toBe("noopener noreferrer");
    });

    it("returns normalized href for valid input", () => {
      const props = getExternalLinkProps("https://example.com");
      expect(props.href).toBe("https://example.com/");
    });

    it("click handlers always prevent default bubbling", () => {
      const props = getExternalLinkProps("https://example.com");
      const event = {
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      props.onClick(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    });

    it("aux-click handler only intercepts middle click", () => {
      const props = getExternalLinkProps("https://example.com");
      const leftEvent = {
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;
      const middleEvent = {
        button: 1,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      props.onAuxClick(leftEvent);
      props.onAuxClick(middleEvent);

      expect(leftEvent.preventDefault).not.toHaveBeenCalled();
      expect(leftEvent.stopPropagation).not.toHaveBeenCalled();
      expect(middleEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(middleEvent.stopPropagation).toHaveBeenCalledTimes(1);
    });
  });
});
