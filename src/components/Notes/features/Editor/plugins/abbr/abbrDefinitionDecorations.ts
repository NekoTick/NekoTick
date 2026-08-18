import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, type Decoration as ProseDecoration } from '@milkdown/kit/prose/view';
import {
  MAX_ABBR_DEFINITIONS,
  extractAbbrDefinitionsFromText,
} from '@/components/common/markdown/abbrMarkdown';
import { ABBR_DEF_REGEX } from '@/components/common/markdown/abbrMarkdownShared';
import {
  STOP_PROSE_SCAN,
  scanProseDescendants,
} from '../shared/boundedProseNodeScan';

function matchAbbrDefinition(text: string): RegExpExecArray | null {
  ABBR_DEF_REGEX.lastIndex = 0;
  const match = ABBR_DEF_REGEX.exec(text);
  if (!match || match.index !== 0 || match[0].length !== text.length) return null;

  const definition = extractAbbrDefinitionsFromText(text)[0];
  return definition?.abbr === match[1] ? match : null;
}

export function createAbbrDefinitionDecorations(
  doc: ProseNode,
  maxDefinitions = MAX_ABBR_DEFINITIONS,
): ProseDecoration[] {
  const decorations: ProseDecoration[] = [];
  let definitionCount = 0;

  scanProseDescendants(doc, (node, pos) => {
    if (definitionCount >= maxDefinitions) return STOP_PROSE_SCAN;

    const typedNode = node as ProseNode;
    if (
      typedNode.type.name !== 'paragraph'
      || typedNode.attrs.vlainaEscapedBlockSyntax === 'abbrDefinition'
    ) return;

    const match = matchAbbrDefinition(typedNode.textContent);
    const abbr = match?.[1];
    if (!match || !abbr) return;

    const contentFrom = pos + 1;
    const termFrom = contentFrom + 2;
    const termTo = termFrom + abbr.length;
    const sourceDecorationOptions = {
      inclusiveStart: false,
      inclusiveEnd: false,
    };

    decorations.push(
      Decoration.node(pos, pos + typedNode.nodeSize, {
        class: 'abbr-definition-line',
        'data-abbr-definition': 'true',
      }),
      Decoration.inline(contentFrom, termFrom, {
        class: 'markdown-syntax abbr-definition-syntax',
        'data-markdown-syntax': 'abbr-definition',
      }, sourceDecorationOptions),
      Decoration.inline(termFrom, termTo, {
        class: 'abbr-definition-term',
      }, sourceDecorationOptions),
      Decoration.inline(termTo, termTo + 1, {
        class: 'markdown-syntax abbr-definition-syntax',
        'data-markdown-syntax': 'abbr-definition',
      }, sourceDecorationOptions),
    );
    definitionCount += 1;
  });

  return decorations;
}
