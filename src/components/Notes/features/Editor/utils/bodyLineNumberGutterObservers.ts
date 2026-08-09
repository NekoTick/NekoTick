const MAX_OBSERVED_EDITOR_CHILD_RESIZE_TARGETS = 256;
const MAX_INCREMENTAL_SELECTION_SYNC_MUTATION_RECORDS = 512;

function shouldRefreshForMutation(records: MutationRecord[]) {
  for (const record of records) {
    if (!(record.target instanceof Element)) return true;

    const atomicEditorBlock = record.target.closest('.code-block-container, .frontmatter-block-container');
    if (atomicEditorBlock && atomicEditorBlock !== record.target) continue;
    return true;
  }

  return false;
}

function collectIncrementalSelectionSyncMutationElements(records: MutationRecord[]) {
  if (records.length === 0 || records.length > MAX_INCREMENTAL_SELECTION_SYNC_MUTATION_RECORDS) {
    return undefined;
  }

  const elements: Element[] = [];
  for (const record of records) {
    if (
      record.type !== 'attributes'
      || record.attributeName !== 'class'
      || !(record.target instanceof Element)
    ) {
      return undefined;
    }
    elements.push(record.target);
  }

  return elements;
}

interface ObserveBodyLineNumberGutterLayoutOptions {
  shell: HTMLElement;
  editorRoot: HTMLElement | null;
  onRefresh: (selectionSyncElements?: readonly Element[]) => void;
}

export function observeBodyLineNumberGutterLayout({
  shell,
  editorRoot,
  onRefresh,
}: ObserveBodyLineNumberGutterLayoutOptions) {
  const observedResizeTargets = new Set<Element>();

  const resizeObserver = new ResizeObserver(() => {
    onRefresh();
  });

  function syncObservedResizeTargets() {
    const nextTargets = new Set<Element>([shell]);
    if (editorRoot) {
      nextTargets.add(editorRoot);
      for (
        let index = 0;
        index < editorRoot.children.length && index < MAX_OBSERVED_EDITOR_CHILD_RESIZE_TARGETS;
        index += 1
      ) {
        const child = editorRoot.children.item(index);
        if (child) nextTargets.add(child);
      }
    }

    for (const target of observedResizeTargets) {
      if (!nextTargets.has(target)) {
        resizeObserver.unobserve(target);
        observedResizeTargets.delete(target);
      }
    }

    for (const target of nextTargets) {
      if (!observedResizeTargets.has(target)) {
        resizeObserver.observe(target);
        observedResizeTargets.add(target);
      }
    }
  }

  syncObservedResizeTargets();
  onRefresh();

  const mutationObserver = new MutationObserver((records) => {
    if (!shouldRefreshForMutation(records)) return;
    if (records.some((record) => record.type === 'childList' && record.target === editorRoot)) {
      syncObservedResizeTargets();
    }
    onRefresh(collectIncrementalSelectionSyncMutationElements(records));
  });
  if (editorRoot) {
    mutationObserver.observe(editorRoot, {
      attributes: true,
      attributeFilter: ['class', 'data-type', 'data-value', 'style'],
      childList: true,
      subtree: true,
    });
  }

  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
