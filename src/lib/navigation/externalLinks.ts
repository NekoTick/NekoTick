import type { MouseEvent as ReactMouseEvent, MouseEventHandler } from "react";
import { openExternalUrl } from "@/lib/desktop/shell";
import { isLocalNetworkHttpUrl } from "@/lib/notes/markdown/urlSecurity";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "weixin:"]);
const ALLOWED_LINK_PREFIX_REGEX = /^(https?:\/\/|mailto:|weixin:)/i;
const UNSAFE_URL_CHARS_REGEX = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;
const MAX_EXTERNAL_HREF_CHARS = 4096;

type NativeExternalUrlOpener = (href: string) => Promise<void>;

let nativeExternalUrlOpener: NativeExternalUrlOpener | null = null;

export function configureNativeExternalUrlOpener(
  opener: NativeExternalUrlOpener | null,
): void {
  nativeExternalUrlOpener = opener;
}

export function normalizeExternalHref(href: string | null | undefined): string | null {
  if (!href) return null;
  if (href.length > MAX_EXTERNAL_HREF_CHARS) return null;
  const trimmed = href.trim();
  if (trimmed.length > MAX_EXTERNAL_HREF_CHARS) return null;
  if (UNSAFE_URL_CHARS_REGEX.test(trimmed)) {
    return null;
  }
  if (trimmed.includes("\\")) {
    return null;
  }
  if (!ALLOWED_LINK_PREFIX_REGEX.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.href);
    if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    if ((url.protocol === "http:" || url.protocol === "https:") && isLocalNetworkHttpUrl(url.toString())) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function openExternalHref(href: string | null | undefined): Promise<void> {
  const normalized = normalizeExternalHref(href);
  if (!normalized) {
    return;
  }

  if (nativeExternalUrlOpener) {
    try {
      await nativeExternalUrlOpener(normalized);
      return;
    } catch {
    }
  }

  try {
    await openExternalUrl(normalized);
    return;
  } catch {
  }

  window.open(normalized, "_blank", "noopener,noreferrer");
}

function handleExternalLinkActivation(event: ReactMouseEvent<HTMLElement>, href: string | null) {
  event.preventDefault();
  event.stopPropagation();
  if (!href) return;
  void openExternalHref(href);
}

export function getExternalLinkProps(href: string | null | undefined) {
  const safeHref = normalizeExternalHref(href);
  return {
    href: safeHref || "#",
    target: "_blank" as const,
    rel: "noopener noreferrer",
    onClick: ((event) => handleExternalLinkActivation(event, safeHref)) as MouseEventHandler<HTMLElement>,
    onAuxClick: ((event) => {
      if (event.button !== 1) return;
      handleExternalLinkActivation(event, safeHref);
    }) as MouseEventHandler<HTMLElement>,
  };
}
