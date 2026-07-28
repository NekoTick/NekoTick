import { isNonNumberedMarkdownBodyLinePlaceholder } from './bodyLineNumbers';

export const MAX_BODY_LINE_NUMBER_TARGETS = 5000;
export const MAX_BODY_LINE_NUMBER_LIST_SCAN_ELEMENTS = 10000;

const HIDDEN_DEFINITION_TEXT_PATTERN = /^(?:\[[^\]\n]+]:\s+\S|\*\[[^\]\n]+]:\s+\S)/;

function isNonNumberedPlaceholderElement(element: HTMLElement): boolean {
  return element.dataset.type === 'html-block'
    && isNonNumberedMarkdownBodyLinePlaceholder(element.dataset.value ?? '');
}

function isHiddenDefinitionElement(element: HTMLElement): boolean {
  return HIDDEN_DEFINITION_TEXT_PATTERN.test((element.textContent ?? '').trim());
}

function shouldSkipBodyLineNumberTarget(element: HTMLElement): boolean {
  return element.classList.contains('frontmatter-block-container')
    || isNonNumberedPlaceholderElement(element)
    || isHiddenDefinitionElement(element);
}

function isCodeBlockTarget(element: HTMLElement): boolean {
  return element.classList.contains('code-block-container')
    || element.matches('pre[data-language], pre.code-block-wrapper');
}

function collectCodeBlockLineNumberTargets(codeBlock: HTMLElement): HTMLElement[] {
  const codeRoot = codeBlock.querySelector<HTMLElement>('.cm-content')
    ?? codeBlock.querySelector<HTMLElement>('.code-block-lazy-preview, pre, code')
    ?? codeBlock;
  const lines = Array.from(codeRoot.querySelectorAll<HTMLElement>('.cm-line'))
    .filter((line) =>
      line.closest('.code-block-container, pre[data-language], pre.code-block-wrapper') === codeBlock
      && line.closest('.cm-gutters, .cm-gutter, .cm-lineNumbers') === null
    );

  if (lines.length > 0) return lines;
  return [codeRoot];
}

function isTableBlockTarget(element: HTMLElement): boolean {
  return element.classList.contains('milkdown-table-block') || element.tagName.toLowerCase() === 'table';
}

function collectTableRowLineNumberTargets(tableBlock: HTMLElement): HTMLElement[] {
  const table = tableBlock.tagName.toLowerCase() === 'table'
    ? tableBlock
    : tableBlock.querySelector<HTMLElement>('table');
  if (!table) return [tableBlock];

  const rows = Array.from(table.querySelectorAll<HTMLElement>('tr'))
    .filter((row) => row.closest('table') === table);
  return rows.length > 0 ? rows : [tableBlock];
}

function collectListItemLineNumberTargets(list: HTMLElement, targets: HTMLElement[]): void {
  const walker = list.ownerDocument.createTreeWalker(list, NodeFilter.SHOW_ELEMENT);
  let scanned = 0;
  for (
    let node = walker.nextNode();
    node && targets.length < MAX_BODY_LINE_NUMBER_TARGETS && scanned < MAX_BODY_LINE_NUMBER_LIST_SCAN_ELEMENTS;
    node = walker.nextNode()
  ) {
    scanned += 1;
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName.toLowerCase() !== 'li') continue;
    if (node.closest('.frontmatter-block-container')) continue;
    if (isNonNumberedPlaceholderElement(node)) continue;
    if (isHiddenDefinitionElement(node)) continue;
    targets.push(node);
  }
}

export function collectBodyLineNumberTargets(editorRoot: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [];

  for (let index = 0; index < editorRoot.children.length && targets.length < MAX_BODY_LINE_NUMBER_TARGETS; index += 1) {
    const child = editorRoot.children.item(index);
    if (!(child instanceof HTMLElement)) continue;
    if (shouldSkipBodyLineNumberTarget(child)) continue;
    if (isCodeBlockTarget(child)) {
      for (const lineTarget of collectCodeBlockLineNumberTargets(child)) {
        if (targets.length >= MAX_BODY_LINE_NUMBER_TARGETS) break;
        targets.push(lineTarget);
      }
      continue;
    }
    if (isTableBlockTarget(child)) {
      for (const rowTarget of collectTableRowLineNumberTargets(child)) {
        if (targets.length >= MAX_BODY_LINE_NUMBER_TARGETS) break;
        targets.push(rowTarget);
      }
      continue;
    }

    const tagName = child.tagName.toLowerCase();
    if (tagName === 'ul' || tagName === 'ol') {
      collectListItemLineNumberTargets(child, targets);
      continue;
    }

    targets.push(child);
  }

  return targets;
}
