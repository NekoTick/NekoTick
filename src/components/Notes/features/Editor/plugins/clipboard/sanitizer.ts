import {
  GITHUB_ALLOWED_HTML_TAGS,
  GITHUB_ALLOWED_LINK_PROTOCOLS,
  GITHUB_ALLOWED_MEDIA_PROTOCOLS,
  GITHUB_DROP_WITH_CONTENT_TAGS,
  GITHUB_LOADABLE_OR_URL_ATTRIBUTES,
  GITHUB_WRAP_CONTENT_WITH_WHITESPACE_TAGS,
  hasGithubProtocol,
  hasGithubUrlScheme,
  isGithubHtmlAttributeValueAllowed,
  isGithubAllowedAttribute,
  isGithubSrcsetAttribute,
  isGithubTagSpecificUrlAttribute,
  isGithubUrlAttribute,
  normalizeGithubSrcset,
  normalizeGithubUrl,
  sanitizeGithubIframeAllow,
  sanitizeGithubIframeSandbox,
  sanitizeGithubStyle,
} from '@/lib/notes/markdown/githubHtmlPolicy';
import { isLocalNetworkHttpUrl } from '@/lib/notes/markdown/urlSecurity';
import { stripGithubDroppedRawHtmlContent } from '@/lib/notes/markdown/githubRawHtml';
import {
  applyClipboardStylePolicy,
  isClipboardPresentationAttribute,
  isHiddenClipboardElement,
  normalizeClipboardTableAlignment,
} from './clipboardPresentationPolicy';

const MAX_SANITIZE_DEPTH = 200;
const MAX_SANITIZE_NODES = 20_000;
const MAX_SANITIZE_HTML_CHARS = 2 * 1024 * 1024;
const PRE_INITIAL_NEWLINE_SENTINEL = '\uE000VLAINA_PRE_INITIAL_NEWLINE\uE000';

interface SanitizeContext {
  visitedNodes: number;
  stripPresentationStyles: boolean;
}

function canVisitNode(context: SanitizeContext) {
  context.visitedNodes += 1;
  return context.visitedNodes <= MAX_SANITIZE_NODES;
}

function hasSanitizeBudget(context: SanitizeContext): boolean {
  return context.visitedNodes < MAX_SANITIZE_NODES;
}

function sanitizeChildren(
  source: Element | DocumentFragment,
  target: Element | DocumentFragment,
  context: SanitizeContext,
  depth: number,
): void {
  for (let child = source.firstChild; child && hasSanitizeBudget(context); child = child.nextSibling) {
    const sanitizedChild = sanitizeNode(child, context, depth);
    if (sanitizedChild) {
      target.appendChild(sanitizedChild);
    }
  }
}

function hasSanitizedSourceWithSrc(element: Element, context: SanitizeContext): boolean {
  const stack = Array.from(element.children);
  while (stack.length > 0 && hasSanitizeBudget(context)) {
    const child = stack.pop();
    if (!child) {
      continue;
    }

    if (child.tagName.toLowerCase() === 'source' && child.hasAttribute('src')) {
      return true;
    }

    for (let index = child.children.length - 1; index >= 0; index -= 1) {
      stack.push(child.children[index]);
    }
  }

  return false;
}

function sanitizeElement(element: Element, context: SanitizeContext, depth: number): Node | null {
  if (depth > MAX_SANITIZE_DEPTH) {
    return null;
  }

  if (context.stripPresentationStyles && isHiddenClipboardElement(element)) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();
  const attributeNames = element.getAttributeNames();

  if (GITHUB_DROP_WITH_CONTENT_TAGS.has(tagName)) {
    return null;
  }

  if (attributeNames.some((attributeName) => attributeName.startsWith('<!--'))) {
    return null;
  }

  if (!GITHUB_ALLOWED_HTML_TAGS.has(tagName)) {
    const fragment = document.createDocumentFragment();
    if (GITHUB_WRAP_CONTENT_WITH_WHITESPACE_TAGS.has(tagName)) {
      fragment.appendChild(document.createTextNode(' '));
    }
    sanitizeChildren(element, fragment, context, depth + 1);
    if (GITHUB_WRAP_CONTENT_WITH_WHITESPACE_TAGS.has(tagName)) {
      fragment.appendChild(document.createTextNode(' '));
    }
    return fragment;
  }

  const sanitized = document.createElement(tagName);
  for (const attributeName of attributeNames) {
    const normalizedAttribute = attributeName.toLowerCase();
    if (!isGithubAllowedAttribute(tagName, normalizedAttribute)) {
      continue;
    }

    const value = element.getAttribute(attributeName);
    if (value === null) {
      continue;
    }

    if (
      context.stripPresentationStyles
      && isClipboardPresentationAttribute(tagName, normalizedAttribute)
    ) {
      continue;
    }

    if (
      GITHUB_LOADABLE_OR_URL_ATTRIBUTES.has(normalizedAttribute)
      && !isGithubTagSpecificUrlAttribute(tagName, normalizedAttribute)
    ) {
      continue;
    }

    if (normalizedAttribute === 'style') {
      const sanitizedStyle = sanitizeGithubStyle(value);
      if (sanitizedStyle) {
        sanitized.setAttribute('style', sanitizedStyle);
        if (context.stripPresentationStyles) {
          applyClipboardStylePolicy(tagName, sanitized);
        }
      }
      continue;
    }

    if (isGithubUrlAttribute(tagName, normalizedAttribute)) {
      const protocols = tagName === 'a' ? GITHUB_ALLOWED_LINK_PROTOCOLS : GITHUB_ALLOWED_MEDIA_PROTOCOLS;
      const normalizedUrl = normalizeGithubUrl(value, protocols, {
        allowPlainRelative: tagName !== 'iframe',
        allowProtocolRelative: tagName !== 'a',
        blockLocalNetwork: tagName !== 'a',
      });
      if (normalizedUrl) {
        if (
          tagName === 'a' &&
          /^https?:\/\//i.test(normalizedUrl) &&
          isLocalNetworkHttpUrl(normalizedUrl)
        ) {
          continue;
        }
        sanitized.setAttribute(normalizedAttribute, normalizedUrl);
      }
      continue;
    }

    if (isGithubSrcsetAttribute(tagName, normalizedAttribute)) {
      const normalizedSrcset = normalizeGithubSrcset(value);
      if (normalizedSrcset) {
        sanitized.setAttribute(normalizedAttribute, normalizedSrcset);
      }
      continue;
    }

    if (!isGithubHtmlAttributeValueAllowed(value)) {
      continue;
    }

    if (hasGithubProtocol(value)) {
      continue;
    }

    if (hasGithubUrlScheme(value)) {
      continue;
    }

    if (tagName === 'iframe' && normalizedAttribute === 'allow') {
      const sanitizedAllow = sanitizeGithubIframeAllow(value);
      if (sanitizedAllow) {
        sanitized.setAttribute(normalizedAttribute, sanitizedAllow);
      }
      continue;
    }

    sanitized.setAttribute(normalizedAttribute, value);
  }

  if (context.stripPresentationStyles) {
    normalizeClipboardTableAlignment(tagName, sanitized);
  }

  if (tagName === 'iframe') {
    if (!sanitized.hasAttribute('src')) {
      return null;
    }
    sanitized.setAttribute('sandbox', sanitizeGithubIframeSandbox(element.getAttribute('sandbox')));
    sanitized.setAttribute('referrerpolicy', 'no-referrer');
  }
  sanitizeChildren(element, sanitized, context, depth + 1);
  if ((tagName === 'video' || tagName === 'audio') && !sanitized.hasAttribute('src') && !hasSanitizedSourceWithSrc(sanitized, context)) {
    return null;
  }
  return sanitized;
}

function sanitizeNode(node: Node, context: SanitizeContext, depth: number): Node | null {
  if (!canVisitNode(context)) {
    return null;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '');
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return sanitizeElement(node as Element, context, depth);
  }

  return null;
}

function sanitizeHtmlContent(html: string, stripPresentationStyles: boolean): string {
  if (!html) return html;
  if (html.length > MAX_SANITIZE_HTML_CHARS) return '';

  try {
    const template = document.createElement('template');
    template.innerHTML = protectPreInitialNewlines(stripGithubDroppedRawHtmlContent(html));

    const output = document.createElement('template');
    sanitizeChildren(template.content, output.content, { visitedNodes: 0, stripPresentationStyles }, 1);
    return restorePreInitialNewlines(output.innerHTML);
  } catch {
    return '';
  }
}

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlContent(html, false);
}

export function sanitizeClipboardHtml(html: string): string {
  return sanitizeHtmlContent(html, true);
}

function protectPreInitialNewlines(html: string): string {
  return html.replace(/(<pre(?:\s[^>]*)?>)\n/gi, `$1${PRE_INITIAL_NEWLINE_SENTINEL}`);
}

function restorePreInitialNewlines(html: string): string {
  return html.replaceAll(PRE_INITIAL_NEWLINE_SENTINEL, '\n');
}
