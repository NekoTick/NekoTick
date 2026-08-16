import {
  isMermaidFenceLanguage,
  normalizeMermaidFenceLanguage,
} from './mermaidLanguage';
import { parseStandaloneFencedCodeBlock } from '../clipboard/fencedCodePaste';
import {
  findLeadingFlowchartDirectiveLine,
  hasClassicFlowchartSyntax,
  normalizeClassicFlowchartCode,
  startsWithClassicFlowchartNode,
} from './mermaidClassicFlowchart';
import { splitLeadingMermaidPrefix } from './mermaidFencePrefix';

const MERMAID_DIAGRAM_DIRECTIVE_PATTERN = new RegExp(
  [
    '^\\s*',
    '(?:---\\r?\\n[\\s\\S]*?\\r?\\n---\\s*)?',
    '(?:(?:%%\\{[\\s\\S]*?\\}%%|%%[^\\r\\n]*)\\s*)*',
    '(?:architecture(?:-beta)?|block(?:-beta)?|c4(?:context|container|component|dynamic|deployment)?|classDiagram(?:-v2)?|erDiagram|eventModeling|flowchart(?:-elk)?|gantt|gitGraph|graph|info|ishikawa(?:-beta)?|journey|kanban|mindmap|packet(?:-beta)?|pie|quadrantChart|radar(?:-beta)?|requirementDiagram|sankey(?:-beta)?|sequenceDiagram|stateDiagram(?:-v2)?|timeline|treeView(?:-beta)?|treemap(?:-beta)?|venn(?:-beta)?|wardley(?:-beta)?|xychart(?:-beta)?|zenuml)\\b',
  ].join(''),
  'i'
);

const STANDARD_DIRECTIVE_BY_LANGUAGE = new Map<string, string>([
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
  ['eventmodeling', 'eventmodeling'],
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
  ['packet', 'packet'],
  ['packetbeta', 'packet-beta'],
  ['radar', 'radar-beta'],
  ['radarbeta', 'radar-beta'],
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

const FIRST_LINE_PATTERN = /^([ \t]*)([^\r\n]*?)([ \t]*)(\r?\n|$)/;
const FLOW_DIRECTION_TOKENS = new Set(['BT', 'LR', 'RL', 'TB', 'TD']);

function normalizeMermaidDirectiveAlias(directive: string) {
  return directive.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeLeadingDirectiveAlias(code: string) {
  const { prefix, body } = splitLeadingMermaidPrefix(code);
  const firstLineMatch = FIRST_LINE_PATTERN.exec(body);
  if (!firstLineMatch) {
    return code;
  }

  const [, indent = '', directive = '', trailingSpace = '', newline = ''] = firstLineMatch;
  const trimmedDirective = directive.trim();
  if (!trimmedDirective) {
    return code;
  }

  const directiveTokens = trimmedDirective.split(/\s+/);
  if (directiveTokens.length > 1) {
    const [aliasToken = '', directionToken = ''] = directiveTokens;
    const normalizedAlias = normalizeMermaidDirectiveAlias(aliasToken);
    const normalizedDirection = directionToken.toUpperCase();
    if (
      directiveTokens.length === 2
      && FLOW_DIRECTION_TOKENS.has(normalizedDirection)
      && (
        normalizedAlias === 'flow'
        || normalizedAlias === 'flowchartv2'
        || normalizedAlias === 'flowchartelk'
      )
    ) {
      const standardDirective =
        normalizedAlias === 'flow' || normalizedAlias === 'flowchartv2'
          ? `flowchart ${normalizedDirection}`
          : `flowchart-elk ${normalizedDirection}`;
      return `${prefix}${indent}${standardDirective}${trailingSpace}${newline}${body.slice(firstLineMatch[0].length)}`;
    }
    return code;
  }

  const standardDirective = STANDARD_DIRECTIVE_BY_LANGUAGE.get(
    normalizeMermaidDirectiveAlias(trimmedDirective)
  );
  if (!standardDirective || standardDirective === trimmedDirective) {
    return code;
  }

  return `${prefix}${indent}${standardDirective}${trailingSpace}${newline}${body.slice(firstLineMatch[0].length)}`;
}

export function normalizeMermaidCodeForRender(code: string) {
  const normalizedCode = normalizeMermaidEditorCodeInput(code);
  const { body } = splitLeadingMermaidPrefix(normalizedCode);
  const lines = body.split(/\r?\n/);
  const leadingDirective = findLeadingFlowchartDirectiveLine(lines);

  if (startsWithClassicFlowchartNode(normalizedCode)) {
    return normalizeClassicFlowchartCode(normalizedCode);
  }

  if (leadingDirective && hasClassicFlowchartSyntax(lines, leadingDirective.index)) {
    return normalizeClassicFlowchartCode(normalizedCode);
  }

  return normalizedCode;
}

function addMermaidDirectiveAfterPrefix(code: string, directive: string) {
  const { prefix, body } = splitLeadingMermaidPrefix(code);
  return `${prefix}${directive}\n${body}`;
}

export function createMermaidFenceStarterCode(language: string | null | undefined) {
  const standardDirective = STANDARD_DIRECTIVE_BY_LANGUAGE.get(
    normalizeMermaidFenceLanguage(language)
  );
  return standardDirective ? `${standardDirective}\n` : '';
}

export function normalizeMermaidFenceCode(language: string | null | undefined, code: string) {
  const normalizedLanguage = normalizeMermaidFenceLanguage(language);
  const normalizedCode = normalizeLeadingDirectiveAlias(code);

  if (!normalizedCode.trim() || MERMAID_DIAGRAM_DIRECTIVE_PATTERN.test(normalizedCode)) {
    return normalizedCode;
  }

  const standardDirective = STANDARD_DIRECTIVE_BY_LANGUAGE.get(normalizedLanguage);
  if (standardDirective) {
    return addMermaidDirectiveAfterPrefix(normalizedCode, standardDirective);
  }

  return normalizedCode;
}

export function normalizeMermaidEditorCodeInput(input: string) {
  const fencedPayload = parseStandaloneFencedCodeBlock(input);
  if (!fencedPayload) {
    return normalizeMermaidFenceCode('mermaid', input);
  }

  const language = fencedPayload.language ?? '';
  if (!isMermaidFenceLanguage(language)) {
    return input;
  }

  return normalizeMermaidFenceCode(language, fencedPayload.code);
}
