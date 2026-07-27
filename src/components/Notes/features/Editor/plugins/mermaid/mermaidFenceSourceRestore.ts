import {
  isMarkdownLineInContainer,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
} from '@/lib/notes/markdown/markdownFenceProtectedLines';

interface FenceBlock {
  body: string;
  close: string;
  end: number;
  lang: string;
  open: string;
  start: number;
}

const MERMAID_ALIAS_DIRECTIVES = new Map<string, string>([
  ['info', 'info'],
  ['c4', 'C4Context'],
  ['c4context', 'C4Context'],
  ['c4container', 'C4Container'],
  ['c4component', 'C4Component'],
  ['c4dynamic', 'C4Dynamic'],
  ['c4deployment', 'C4Deployment'],
  ['flow', 'flowchart TD'],
  ['flowchart', 'flowchart TD'],
  ['flowchartv2', 'flowchart TD'],
  ['flowchartelk', 'flowchart-elk TD'],
  ['graph', 'graph TD'],
  ['sequence', 'sequenceDiagram'],
  ['sequencediagram', 'sequenceDiagram'],
  ['class', 'classDiagram'],
  ['classdiagram', 'classDiagram'],
  ['classdiagramv2', 'classDiagram-v2'],
  ['state', 'stateDiagram-v2'],
  ['statediagram', 'stateDiagram'],
  ['statediagramv2', 'stateDiagram-v2'],
  ['er', 'erDiagram'],
  ['erdiagram', 'erDiagram'],
  ['eventmodeling', 'eventModeling'],
  ['gantt', 'gantt'],
  ['pie', 'pie'],
  ['journey', 'journey'],
  ['gitgraph', 'gitGraph'],
  ['mindmap', 'mindmap'],
  ['timeline', 'timeline'],
  ['treeview', 'treeView-beta'],
  ['treeviewbeta', 'treeView-beta'],
  ['quadrant', 'quadrantChart'],
  ['quadrantchart', 'quadrantChart'],
  ['xychart', 'xychart'],
  ['xychartbeta', 'xychart-beta'],
  ['requirement', 'requirementDiagram'],
  ['requirementdiagram', 'requirementDiagram'],
  ['sankey', 'sankey'],
  ['sankeybeta', 'sankey-beta'],
  ['radar', 'radar-beta'],
  ['radarbeta', 'radar-beta'],
  ['packet', 'packet'],
  ['packetbeta', 'packet-beta'],
  ['block', 'block-beta'],
  ['blockbeta', 'block-beta'],
  ['architecture', 'architecture'],
  ['architecturebeta', 'architecture-beta'],
  ['kanban', 'kanban'],
  ['ishikawa', 'ishikawa'],
  ['ishikawabeta', 'ishikawa-beta'],
  ['venn', 'venn-beta'],
  ['vennbeta', 'venn-beta'],
  ['treemap', 'treemap'],
  ['treemapbeta', 'treemap-beta'],
  ['wardley', 'wardley-beta'],
  ['wardleybeta', 'wardley-beta'],
  ['zenuml', 'zenuml'],
]);

const MERMAID_DIRECTIVE_PATTERN =
  /^(?:architecture(?:-beta)?|block(?:-beta)?|c4(?:context|container|component|dynamic|deployment)?|classDiagram(?:-v2)?|erDiagram|eventModeling|flowchart(?:-elk)?|gantt|gitGraph|graph|info|ishikawa(?:-beta)?|journey|kanban|mindmap|packet(?:-beta)?|pie|quadrantChart|radar(?:-beta)?|requirementDiagram|sankey(?:-beta)?|sequenceDiagram|stateDiagram(?:-v2)?|timeline|treeView(?:-beta)?|treemap(?:-beta)?|venn(?:-beta)?|wardley(?:-beta)?|xychart(?:-beta)?|zenuml)\b/i;

export function restoreMermaidFenceSourceFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || (!markdown.includes('```') && !markdown.includes('~~~'))) return markdown;

  const referenceByGeneratedBody = new Map<string, FenceBlock[]>();
  for (const block of collectFenceBlocks(referenceMarkdown)) {
    if (!isMermaidFenceLanguage(block.lang)) continue;

    const generatedBody = normalizeMermaidFenceBody(block.lang, block.body);
    if (generatedBody === block.body && normalizeMermaidAlias(block.lang) === 'mermaid') continue;

    const blocks = referenceByGeneratedBody.get(generatedBody) ?? [];
    blocks.push(block);
    referenceByGeneratedBody.set(generatedBody, blocks);
  }
  if (referenceByGeneratedBody.size === 0) return markdown;

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks = collectFenceBlocks(markdown);
  let changed = false;

  for (const block of blocks.reverse()) {
    if (!isMermaidFenceLanguage(block.lang)) continue;

    const reference = referenceByGeneratedBody.get(block.body)?.pop();
    if (!reference) continue;

    lines.splice(block.start, block.end - block.start, ...blockToLines(reference));
    changed = true;
  }

  return changed ? lines.join('\n') : markdown;
}

function collectFenceBlocks(markdown: string): FenceBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: FenceBlock[] = [];
  let active: {
    blockquoteDepth: number;
    containerIndent: number;
    length: number;
    marker: string;
    open: string;
    start: number;
    lang: string;
  } | null = null;
  let bodyStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (active && !isMarkdownLineInContainer(line, active)) {
      active = null;
    }

    if (active) {
      if (parseMarkdownContainerFenceCloseLine(line, active)) {
        blocks.push({
          body: lines.slice(bodyStart, index).join('\n'),
          close: line,
          end: index + 1,
          lang: active.lang,
          open: active.open,
          start: active.start,
        });
        active = null;
      }
      continue;
    }

    const fence = parseMarkdownContainerFenceLine(line);
    if (fence && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1)) {
      active = {
        blockquoteDepth: fence.blockquoteDepth,
        containerIndent: fence.containerIndent,
        lang: line.slice(fence.infoStart).trim().split(/\s+/, 1)[0] ?? '',
        length: fence.length,
        marker: fence.marker,
        open: line,
        start: index,
      };
      bodyStart = index + 1;
    }
  }

  return blocks;
}

function blockToLines(block: FenceBlock): string[] {
  return [block.open, ...block.body.split('\n'), block.close];
}

function normalizeMermaidFenceBody(language: string, body: string): string {
  const normalizedBody = normalizeLeadingDirectiveAlias(body);
  if (!normalizedBody.trim() || hasMermaidDirective(normalizedBody)) {
    return normalizedBody;
  }

  const directive = MERMAID_ALIAS_DIRECTIVES.get(normalizeMermaidAlias(language));
  return directive ? addDirectiveAfterPrefix(normalizedBody, directive) : normalizedBody;
}

function normalizeLeadingDirectiveAlias(body: string): string {
  const { prefix, rest } = splitMermaidPrefix(body);
  const firstLineMatch = /^([ \t]*)([^\n]*?)([ \t]*)(\n|$)/.exec(rest);
  if (!firstLineMatch) return body;

  const [, indent = '', directive = '', trailingSpace = '', newline = ''] = firstLineMatch;
  const trimmedDirective = directive.trim();
  const directiveTokens = trimmedDirective.split(/\s+/);
  const [aliasToken = '', directionToken = ''] = directiveTokens;
  const normalizedAlias = normalizeMermaidAlias(aliasToken);
  const normalizedDirection = directionToken.toUpperCase();

  if (
    directiveTokens.length === 2 &&
    ['BT', 'LR', 'RL', 'TB', 'TD'].includes(normalizedDirection) &&
    (normalizedAlias === 'flow' || normalizedAlias === 'flowchartv2' || normalizedAlias === 'flowchartelk')
  ) {
    const standardDirective = normalizedAlias === 'flowchartelk'
      ? `flowchart-elk ${normalizedDirection}`
      : `flowchart ${normalizedDirection}`;
    return `${prefix}${indent}${standardDirective}${trailingSpace}${newline}${rest.slice(firstLineMatch[0].length)}`;
  }

  if (directiveTokens.length !== 1) return body;

  const standardDirective = MERMAID_ALIAS_DIRECTIVES.get(normalizedAlias);
  if (!standardDirective || standardDirective === trimmedDirective) return body;

  return `${prefix}${indent}${standardDirective}${trailingSpace}${newline}${rest.slice(firstLineMatch[0].length)}`;
}

function splitMermaidPrefix(body: string): { prefix: string; rest: string } {
  let prefix = '';
  let rest = body;

  if (rest.startsWith('---\n')) {
    const closingIndex = rest.indexOf('\n---', 4);
    if (closingIndex >= 0) {
      const closeEnd = rest.indexOf('\n', closingIndex + 1);
      const end = closeEnd >= 0 ? closeEnd + 1 : rest.length;
      prefix += rest.slice(0, end);
      rest = rest.slice(end);
    }
  }

  while (/^(?:%%\{[\s\S]*?\}%%|%%[^\n]*)(?:\n|$)/.test(rest)) {
    const match = /^(?:%%\{[\s\S]*?\}%%|%%[^\n]*)(?:\n|$)/.exec(rest);
    if (!match) break;
    prefix += match[0];
    rest = rest.slice(match[0].length);
  }

  return { prefix, rest };
}

function addDirectiveAfterPrefix(body: string, directive: string): string {
  const { prefix, rest } = splitMermaidPrefix(body);
  return `${prefix}${directive}\n${rest}`;
}

function hasMermaidDirective(body: string): boolean {
  const { rest } = splitMermaidPrefix(body);
  return MERMAID_DIRECTIVE_PATTERN.test(rest.trimStart());
}

function isMermaidFenceLanguage(language: string): boolean {
  const alias = normalizeMermaidAlias(language);
  return alias === 'mermaid' || alias === 'mmd' || MERMAID_ALIAS_DIRECTIVES.has(alias);
}

function normalizeMermaidAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}
