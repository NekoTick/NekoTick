import type { BodyLineNumberLabelLayout } from './bodyLineNumberLayout';

export const MAX_BODY_LINE_NUMBER_SELECTION_SCAN_ELEMENTS = 20000;

const BLOCK_SELECTION_ACTIVE_CLASS = 'editor-block-selection-active';
const BLOCK_SELECTION_LARGE_CLASS = 'editor-block-selection-large';
const BLOCK_SELECTION_PENDING_CLASS = 'editor-block-selection-pending';
const MAX_INCREMENTAL_BODY_LINE_NUMBER_SELECTION_SYNC_ELEMENTS = 512;
const targetIndexesByLayout = new WeakMap<BodyLineNumberLabelLayout, WeakMap<HTMLElement, number>>();

export function collectSelectedBlockDescendantTargets(editorRoot: HTMLElement): WeakSet<HTMLElement> {
  const selectedDescendantTargets = new WeakSet<HTMLElement>();
  const selectedElements = editorRoot.querySelectorAll<HTMLElement>('.editor-block-selected');
  const scanLimit = Math.min(selectedElements.length, MAX_BODY_LINE_NUMBER_SELECTION_SCAN_ELEMENTS);
  for (let index = 0; index < scanLimit; index += 1) {
    const node = selectedElements.item(index);
    for (
      let ancestor = node.parentElement;
      ancestor && ancestor !== editorRoot;
      ancestor = ancestor.parentElement
    ) {
      selectedDescendantTargets.add(ancestor);
    }
  }

  return selectedDescendantTargets;
}

export function shouldCollectSelectedBlockDescendantTargets(editorRoot: HTMLElement): boolean {
  return editorRoot.classList.contains(BLOCK_SELECTION_ACTIVE_CLASS)
    || editorRoot.classList.contains(BLOCK_SELECTION_LARGE_CLASS)
    || editorRoot.classList.contains(BLOCK_SELECTION_PENDING_CLASS);
}

export function isInsideSelectedBlock(
  target: HTMLElement,
  selectedDescendantTargets: WeakSet<HTMLElement> | null,
): boolean {
  return target.classList.contains('editor-block-selected')
    || target.closest('.editor-block-selected') !== null
    || selectedDescendantTargets?.has(target) === true;
}

function isInsideSelectedBlockFromCurrentDom(target: HTMLElement): boolean {
  return target.classList.contains('editor-block-selected')
    || target.closest('.editor-block-selected') !== null
    || target.querySelector('.editor-block-selected') !== null;
}

interface SyncBodyLineNumberLabelSelectionOptions {
  changedElements?: readonly Element[];
  previewSelectedElements?: readonly HTMLElement[];
}

function isInsidePreviewSelectedBlock(
  target: HTMLElement,
  selectedElements: ReadonlySet<HTMLElement>,
  selectedAncestors: WeakSet<HTMLElement>,
  editorRoot: HTMLElement,
): boolean {
  if (selectedAncestors.has(target)) return true;
  for (
    let current: HTMLElement | null = target;
    current && current !== editorRoot;
    current = current.parentElement
  ) {
    if (selectedElements.has(current)) return true;
  }
  return false;
}

function collectIncrementalSelectionSyncIndexes(
  editorRoot: HTMLElement,
  layout: BodyLineNumberLabelLayout,
  targets: readonly HTMLElement[],
  changedElements: readonly Element[] | undefined,
): Set<number> | null {
  if (!changedElements || changedElements.length === 0) {
    return null;
  }
  if (changedElements.length > MAX_INCREMENTAL_BODY_LINE_NUMBER_SELECTION_SYNC_ELEMENTS) {
    return null;
  }

  const relevantChangedElements: HTMLElement[] = [];
  for (const element of changedElements) {
    if (!(element instanceof HTMLElement) || !editorRoot.contains(element) || element === editorRoot) {
      return null;
    }
    relevantChangedElements.push(element);
  }

  let targetIndexes = targetIndexesByLayout.get(layout);
  if (!targetIndexes) {
    targetIndexes = new WeakMap();
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (target) {
        targetIndexes.set(target, index);
      }
    }
    targetIndexesByLayout.set(layout, targetIndexes);
  }

  const indexes = new Set<number>();
  for (const element of relevantChangedElements) {
    for (
      let ancestor: HTMLElement | null = element;
      ancestor && ancestor !== editorRoot;
      ancestor = ancestor.parentElement
    ) {
      const index = targetIndexes.get(ancestor);
      if (index !== undefined) {
        indexes.add(index);
      }
    }

    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const index = targetIndexes.get(node);
      if (index !== undefined) {
        indexes.add(index);
      }
    }
  }

  return indexes;
}

export function syncBodyLineNumberLabelSelection(
  editorRoot: HTMLElement | null,
  layout: BodyLineNumberLabelLayout,
  options: SyncBodyLineNumberLabelSelectionOptions = {},
): BodyLineNumberLabelLayout {
  if (!editorRoot || layout.labels.length === 0 || layout.targets.length === 0) {
    return layout;
  }

  const previewSelectedElements = options.previewSelectedElements;
  const previewSelectedSet = previewSelectedElements
    ? new Set(previewSelectedElements)
    : null;
  const previewSelectedAncestors = previewSelectedElements
    ? new WeakSet<HTMLElement>()
    : null;
  if (previewSelectedAncestors) {
    for (const element of previewSelectedElements ?? []) {
      for (
        let ancestor = element.parentElement;
        ancestor && ancestor !== editorRoot;
        ancestor = ancestor.parentElement
      ) {
        previewSelectedAncestors.add(ancestor);
      }
    }
  }

  const incrementalSyncIndexes = previewSelectedElements ? null : collectIncrementalSelectionSyncIndexes(
    editorRoot,
    layout,
    layout.targets,
    options.changedElements,
  );
  if (incrementalSyncIndexes && incrementalSyncIndexes.size === 0) {
    return layout;
  }

  const selectedDescendantTargets = !previewSelectedElements
    && incrementalSyncIndexes === null
    && shouldCollectSelectedBlockDescendantTargets(editorRoot)
    ? collectSelectedBlockDescendantTargets(editorRoot)
    : null;
  let changed = false;
  const labels = [...layout.labels];
  const indexesToSync = incrementalSyncIndexes ?? layout.labels.keys();
  for (const index of indexesToSync) {
    const label = layout.labels[index];
    if (!label) {
      continue;
    }

    const target = layout.targets[index];
    const selected = target instanceof HTMLElement
      && editorRoot.contains(target)
      && (
        previewSelectedSet && previewSelectedAncestors
          ? isInsidePreviewSelectedBlock(
              target,
              previewSelectedSet,
              previewSelectedAncestors,
              editorRoot,
            )
          : incrementalSyncIndexes
          ? isInsideSelectedBlockFromCurrentDom(target)
          : isInsideSelectedBlock(target, selectedDescendantTargets)
      );

    if (selected === (label.selected === true)) {
      continue;
    }

    changed = true;
    if (selected) {
      labels[index] = {
        ...label,
        selected: true,
      };
      continue;
    }

    labels[index] = {
      lineNumber: label.lineNumber,
      top: label.top,
      left: label.left,
    };
  }

  return changed
    ? {
        ...layout,
        labels,
      }
    : layout;
}
