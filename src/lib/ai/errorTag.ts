export interface ParsedErrorTag {
  type?: string;
  code?: string;
  content: string;
}

export const MAX_ERROR_TAG_ATTRIBUTE_CHARS = 512;
export const MAX_ERROR_TAG_CONTENT_CHARS = 8192;
const MAX_ERROR_TAG_START_TAG_CHARS = 4096;
const ERROR_OPEN_TAG = '<error';
const ERROR_CLOSE_TAG = '</error>';
const ERROR_ATTRIBUTE_REGEX = /\s(type|code)="([^"]*)"/gi;
const CUSTOM_PROVIDER_ERROR_SOURCE = 'custom_provider';

interface ErrorTagMatch {
  start: number;
  startTagEnd: number;
  end: number;
  rawStartTag: string;
  rawContent: string;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function clipErrorTagAttribute(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.slice(0, MAX_ERROR_TAG_ATTRIBUTE_CHARS);
}

function clipErrorTagContent(value: string): string {
  return value.slice(0, MAX_ERROR_TAG_CONTENT_CHARS);
}

function normalizeErrorTagType(value: string | undefined): string {
  return typeof value === 'string' && value ? value.slice(0, MAX_ERROR_TAG_ATTRIBUTE_CHARS) : 'UNKNOWN';
}

function normalizeErrorTagCode(value: string | number | undefined): string {
  if (typeof value === 'string') {
    return value.slice(0, MAX_ERROR_TAG_ATTRIBUTE_CHARS);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).slice(0, MAX_ERROR_TAG_ATTRIBUTE_CHARS);
  }
  return '';
}

function findCaseInsensitive(value: string, needle: string, fromIndex: number): number {
  const needleLength = needle.length;
  const limit = value.length - needleLength;
  for (let index = Math.max(0, fromIndex); index <= limit; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needleLength; offset += 1) {
      if (value[index + offset]?.toLowerCase() !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return index;
    }
  }
  return -1;
}

function findErrorTag(content: string, fromIndex = 0): ErrorTagMatch | null {
  let cursor = fromIndex;
  while (cursor < content.length) {
    const start = findCaseInsensitive(content, ERROR_OPEN_TAG, cursor);
    if (start < 0) {
      return null;
    }
    const delimiter = content[start + ERROR_OPEN_TAG.length];
    if (delimiter !== '>' && !(delimiter && /\s/.test(delimiter))) {
      cursor = start + ERROR_OPEN_TAG.length;
      continue;
    }

    const startTagEnd = content.indexOf('>', start + ERROR_OPEN_TAG.length);
    if (startTagEnd < 0) {
      return null;
    }
    if (startTagEnd - start > MAX_ERROR_TAG_START_TAG_CHARS) {
      cursor = start + ERROR_OPEN_TAG.length;
      continue;
    }

    const closeStart = findCaseInsensitive(content, ERROR_CLOSE_TAG, startTagEnd + 1);
    if (closeStart < 0) {
      cursor = start + ERROR_OPEN_TAG.length;
      continue;
    }

    return {
      start,
      startTagEnd,
      end: closeStart + ERROR_CLOSE_TAG.length,
      rawStartTag: content.slice(start, startTagEnd + 1),
      rawContent: content.slice(startTagEnd + 1, closeStart),
    };
  }

  return null;
}

function parseErrorTagAttributes(rawStartTag: string): Pick<ParsedErrorTag, 'type' | 'code'> {
  const attributes: Pick<ParsedErrorTag, 'type' | 'code'> = {};
  ERROR_ATTRIBUTE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ERROR_ATTRIBUTE_REGEX.exec(rawStartTag)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = clipErrorTagAttribute(decodeXmlEntities(match[2] ?? ''));
    if (key === 'type') {
      attributes.type = value;
    } else if (key === 'code') {
      attributes.code = value;
    }
  }

  return attributes;
}

export function buildErrorTag(type: string | undefined, code: string | number | undefined, detail: string): string {
  const safeType = escapeXmlAttribute(normalizeErrorTagType(type));
  const safeCode = escapeXmlAttribute(normalizeErrorTagCode(code));
  const safeDetail = escapeXmlText(detail.slice(0, MAX_ERROR_TAG_CONTENT_CHARS));
  return `<error type="${safeType}" code="${safeCode}">${safeDetail}</error>`;
}

export function buildCustomProviderErrorTag(
  type: string | undefined,
  code: string | number | undefined,
  detail: string,
): string {
  const safeType = escapeXmlAttribute(normalizeErrorTagType(type));
  const safeCode = escapeXmlAttribute(normalizeErrorTagCode(code));
  return `<error type="${safeType}" code="${safeCode}" source="${CUSTOM_PROVIDER_ERROR_SOURCE}">${escapeXmlText(detail)}</error>`;
}

function isCustomProviderErrorTag(rawStartTag: string): boolean {
  return /\ssource="custom_provider"/i.test(rawStartTag);
}

export function escapeUntrustedErrorTags(content: string): string {
  return content
    .replace(/<error(?=[\s>])/gi, '&lt;error')
    .replace(/<\/error>/gi, '&lt;/error>');
}

export function parseErrorTag(content: string): ParsedErrorTag | null {
  const match = findErrorTag(content);
  if (!match) {
    return null;
  }

  const attributes = parseErrorTagAttributes(match.rawStartTag);
  const decodedContent = decodeXmlEntities(match.rawContent);
  return {
    ...attributes,
    content: isCustomProviderErrorTag(match.rawStartTag)
      ? decodedContent
      : clipErrorTagContent(decodedContent.trim() || 'Unknown error'),
  };
}

export function stripErrorTags(content: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < content.length) {
    const match = findErrorTag(content, cursor);
    if (!match) {
      output += content.slice(cursor);
      break;
    }

    output += content.slice(cursor, match.start);
    const decodedContent = decodeXmlEntities(match.rawContent);
    output += isCustomProviderErrorTag(match.rawStartTag)
      ? decodedContent
      : clipErrorTagContent(decodedContent.trim());
    cursor = match.end;
  }

  return output;
}

export function stripFirstErrorTag(content: string): string {
  const match = findErrorTag(content);
  if (!match) {
    return content;
  }

  return `${content.slice(0, match.start)}${content.slice(match.end)}`;
}
