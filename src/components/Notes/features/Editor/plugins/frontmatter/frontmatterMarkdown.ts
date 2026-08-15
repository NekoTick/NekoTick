const LINE_ENDING_PATTERN = /\r\n?/g;
const UTF8_BOM = '\uFEFF';
const FRONTMATTER_OPEN_PATTERN = /^---[ \t]*$/;
const FRONTMATTER_CLOSE_PATTERN = /^---[ \t]*$/;
const FRONTMATTER_LANGUAGE = 'yaml-frontmatter';
const FRONTMATTER_INTERNAL_META = 'vlaina-internal-frontmatter';
const FRONTMATTER_INTERNAL_OPEN_PATTERN =
  new RegExp(`^(\`{3,})${FRONTMATTER_LANGUAGE}[ \\t]+${FRONTMATTER_INTERNAL_META}[ \\t]*$`);
const MAX_FRONTMATTER_DELIMITER_LINE_CHARS = 1024;
const MAX_FRONTMATTER_CHARS = 256 * 1024;
const MAX_FRONTMATTER_LINES = 2048;
const MANAGED_FRONTMATTER_PREFIX = 'vlaina_';
const TRANSIENT_MANAGED_FRONTMATTER_KEYS = new Set(['vlaina_created', 'vlaina_updated']);

export function isManagedFrontmatterKey(key: string): boolean {
  return key.startsWith(MANAGED_FRONTMATTER_PREFIX);
}

function normalizeLineEndings(value: string): string {
  return value.replace(LINE_ENDING_PATTERN, '\n');
}

function stripLeadingBom(value: string): string {
  return value.startsWith(UTF8_BOM) ? value.slice(1) : value;
}

interface FrontmatterSections {
  frontmatterLines: string[];
  body: string;
  hasBodySeparator: boolean;
}

interface ReadLineResult {
  line: string;
  contentEnd: number;
  nextStart: number;
  truncated: boolean;
}

function parseTopLevelKey(line: string): string | null {
  const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
  return match?.[1] ?? null;
}

function isManagedFrontmatterLine(line: string): boolean {
  const key = parseTopLevelKey(line);
  return Boolean(key && isManagedFrontmatterKey(key));
}

function isPersistedManagedFrontmatterLine(line: string): boolean {
  const key = parseTopLevelKey(line);
  return Boolean(
    key &&
    isManagedFrontmatterKey(key) &&
    !TRANSIENT_MANAGED_FRONTMATTER_KEYS.has(key),
  );
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]?.trim() === '') {
    end -= 1;
  }
  return lines.slice(0, end);
}

function getHiddenFrontmatterSeparatorLines(lines: readonly string[]): string[] {
  const firstHiddenIndex = lines.findIndex(isPersistedManagedFrontmatterLine);
  if (firstHiddenIndex <= 0) return [];

  let separatorStart = firstHiddenIndex;
  while (separatorStart > 0 && (lines[separatorStart - 1] ?? '').trim() === '') {
    separatorStart -= 1;
  }
  return lines.slice(separatorStart, firstHiddenIndex);
}

function readLine(value: string, start: number, maxContentEnd = value.length): ReadLineResult {
  let index = start;
  while (
    index < value.length &&
    index < maxContentEnd &&
    value[index] !== '\n' &&
    value[index] !== '\r'
  ) {
    index += 1;
  }

  let nextStart = index;
  const truncated = index >= maxContentEnd && index < value.length && value[index] !== '\n' && value[index] !== '\r';
  if (!truncated && index < value.length) {
    nextStart = value[index] === '\r' && value[index + 1] === '\n'
      ? index + 2
      : index + 1;
  }

  return {
    line: value.slice(start, index),
    contentEnd: index,
    nextStart,
    truncated,
  };
}

function removeSerializedFrontmatterPadding(body: string): string {
  const newlineIndex = body.indexOf('\n');
  const firstLine = newlineIndex >= 0 ? body.slice(0, newlineIndex) : body;
  if (firstLine.trim() !== '') {
    return body;
  }
  return newlineIndex >= 0 ? body.slice(newlineIndex + 1) : '';
}

function hasLeadingBlankBodySeparator(body: string): boolean {
  const newlineIndex = body.indexOf('\n');
  return newlineIndex >= 0 && body.slice(0, newlineIndex).trim() === '';
}

function splitLeadingDelimitedBlock(
  markdown: string,
  isOpeningLine: (line: string) => boolean,
  isClosingLine: (line: string) => boolean,
): FrontmatterSections | null {
  const firstLine = readLine(markdown, 0, MAX_FRONTMATTER_DELIMITER_LINE_CHARS + 1);
  if (firstLine.truncated || !isOpeningLine(stripLeadingBom(firstLine.line))) {
    return null;
  }

  const frontmatterLines: string[] = [];
  let cursor = firstLine.nextStart;
  const frontmatterBudgetEnd = firstLine.nextStart + MAX_FRONTMATTER_CHARS + 1;

  while (cursor < markdown.length && frontmatterLines.length < MAX_FRONTMATTER_LINES) {
    const line = readLine(markdown, cursor, frontmatterBudgetEnd);
    if (line.truncated || line.contentEnd - firstLine.nextStart > MAX_FRONTMATTER_CHARS) {
      break;
    }

    if (isClosingLine(line.line)) {
      return {
        frontmatterLines,
        body: normalizeLineEndings(markdown.slice(line.nextStart)),
        hasBodySeparator: line.nextStart > line.contentEnd,
      };
    }

    frontmatterLines.push(line.line);
    cursor = line.nextStart;
  }

  return null;
}

function splitLeadingFrontmatter(markdown: string): FrontmatterSections | null {
  return splitLeadingDelimitedBlock(
    markdown,
    (line) => FRONTMATTER_OPEN_PATTERN.test(line),
    (line) => FRONTMATTER_CLOSE_PATTERN.test(line),
  );
}

function splitLeadingInternalFrontmatter(markdown: string): FrontmatterSections | null {
  let openingFence = '';
  return splitLeadingDelimitedBlock(
    markdown,
    (line) => {
      const match = FRONTMATTER_INTERNAL_OPEN_PATTERN.exec(line);
      openingFence = match?.[1] ?? '';
      return Boolean(openingFence);
    },
    (line) => openingFence.length > 0 && line === openingFence,
  );
}

function getInternalFrontmatterFence(frontmatterLines: readonly string[]): string {
  let longestBacktickRun = 0;
  for (const line of frontmatterLines) {
    for (const run of line.match(/`+/g) ?? []) {
      longestBacktickRun = Math.max(longestBacktickRun, run.length);
    }
  }

  return '`'.repeat(Math.max(3, longestBacktickRun + 1));
}

function buildFrontmatterBlock(
  frontmatterLines: string[],
  body: string,
  fenced: boolean,
  options?: { preserveEmpty?: boolean; preserveBodySeparator?: boolean }
): string {
  if (frontmatterLines.length === 0 && !options?.preserveEmpty) {
    return body;
  }

  const internalFence = fenced ? getInternalFrontmatterFence(frontmatterLines) : '';
  const opening = fenced ? `${internalFence}${FRONTMATTER_LANGUAGE} ${FRONTMATTER_INTERNAL_META}` : '---';
  const closing = fenced ? internalFence : '---';
  const frontmatter = [opening, ...frontmatterLines, closing].join('\n');

  return body || options?.preserveBodySeparator ? `${frontmatter}\n${body}` : frontmatter;
}

export function normalizeLeadingFrontmatterMarkdown(markdown: string): string {
  const sections = splitLeadingFrontmatter(markdown);
  if (!sections) {
    return normalizeLineEndings(markdown);
  }

  const hasHiddenFrontmatterLines = sections.frontmatterLines.some((line) => isManagedFrontmatterLine(line));
  const visibleFrontmatterLines = sections.frontmatterLines.filter((line) => !isManagedFrontmatterLine(line));
  const normalizedVisibleFrontmatterLines = hasHiddenFrontmatterLines
    ? trimTrailingBlankLines(visibleFrontmatterLines)
    : visibleFrontmatterLines;
  const body = hasHiddenFrontmatterLines && normalizedVisibleFrontmatterLines.length === 0
    ? removeSerializedFrontmatterPadding(sections.body)
    : sections.body;

  return buildFrontmatterBlock(normalizedVisibleFrontmatterLines, body, true, {
    preserveEmpty: !hasHiddenFrontmatterLines,
    preserveBodySeparator: sections.hasBodySeparator,
  });
}

interface SerializeLeadingFrontmatterOptions {
  removeSerializerPadding?: boolean;
}

export function serializeLeadingFrontmatterMarkdown(
  markdown: string,
  referenceMarkdown?: string,
  options: SerializeLeadingFrontmatterOptions = {}
): string {
  const normalized = normalizeLineEndings(markdown);
  const referenceSections = referenceMarkdown ? splitLeadingFrontmatter(referenceMarkdown) : null;
  const hiddenFrontmatterLines = referenceSections
    ? referenceSections.frontmatterLines.filter((line) => isPersistedManagedFrontmatterLine(line))
    : [];
  const referenceVisibleFrontmatterLines = referenceSections
    ? trimTrailingBlankLines(referenceSections.frontmatterLines.filter((line) => !isManagedFrontmatterLine(line)))
    : [];
  const referenceHiddenSeparatorLines = referenceSections
    ? getHiddenFrontmatterSeparatorLines(referenceSections.frontmatterLines)
    : [];
  const shouldRestoreHiddenOnlyBodySeparator =
    Boolean(
      referenceSections &&
      hiddenFrontmatterLines.length > 0 &&
      referenceVisibleFrontmatterLines.length === 0 &&
      hasLeadingBlankBodySeparator(referenceSections.body)
    );
  const sections = splitLeadingInternalFrontmatter(markdown);

  if (!sections) {
    return hiddenFrontmatterLines.length > 0
      ? buildFrontmatterBlock(
        hiddenFrontmatterLines,
        shouldRestoreHiddenOnlyBodySeparator ? `\n${normalized}` : normalized,
        false,
        { preserveBodySeparator: true },
      )
      : normalized;
  }

  const visibleFrontmatterLines = sections.frontmatterLines.filter((line) => !isManagedFrontmatterLine(line));
  const hasCurrentTrailingSeparator =
    visibleFrontmatterLines.length > 0
    && visibleFrontmatterLines[visibleFrontmatterLines.length - 1]?.trim() === '';
  const hiddenSeparatorLines =
    visibleFrontmatterLines.length > 0
    && hiddenFrontmatterLines.length > 0
    && !hasCurrentTrailingSeparator
      ? referenceHiddenSeparatorLines
      : [];
  const mergedFrontmatterLines = [
    ...visibleFrontmatterLines,
    ...hiddenSeparatorLines,
    ...hiddenFrontmatterLines,
  ];
  const body = options.removeSerializerPadding
    ? removeSerializedFrontmatterPadding(sections.body)
    : sections.body;

  return buildFrontmatterBlock(
    mergedFrontmatterLines,
    body,
    false,
    { preserveEmpty: true, preserveBodySeparator: sections.hasBodySeparator }
  );
}

export function isFrontmatterShortcutText(text: string): boolean {
  return FRONTMATTER_OPEN_PATTERN.test(text);
}

export function isFrontmatterFenceLanguage(language: unknown): boolean {
  return typeof language === 'string' && language.trim().toLowerCase() === FRONTMATTER_LANGUAGE;
}

export function isInternalFrontmatterFence(language: unknown, meta: unknown): boolean {
  return isFrontmatterFenceLanguage(language) &&
    typeof meta === 'string' &&
    meta.trim() === FRONTMATTER_INTERNAL_META;
}

export function getFrontmatterFenceLanguage(): string {
  return FRONTMATTER_LANGUAGE;
}

export function getFrontmatterFenceMeta(): string {
  return FRONTMATTER_INTERNAL_META;
}
