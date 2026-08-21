let markdownEditorImportPromise: Promise<typeof import('./index')> | null = null;
let milkdownEditorRuntimeImportPromise: Promise<typeof import('./MilkdownEditorInner')> | null = null;

function loadMarkdownEditorModule() {
  const nextPromise = import('./index');
  const trackedPromise = nextPromise.catch((error) => {
    if (markdownEditorImportPromise === trackedPromise) {
      markdownEditorImportPromise = null;
    }
    throw error;
  });
  markdownEditorImportPromise = trackedPromise;
  return trackedPromise;
}

function loadMilkdownEditorRuntimeModule() {
  const nextPromise = import('./MilkdownEditorInner');
  const trackedPromise = nextPromise.catch((error) => {
    if (milkdownEditorRuntimeImportPromise === trackedPromise) {
      milkdownEditorRuntimeImportPromise = null;
    }
    throw error;
  });
  milkdownEditorRuntimeImportPromise = trackedPromise;
  return trackedPromise;
}

export function preloadMarkdownEditor() {
  const markdownEditorPromise = markdownEditorImportPromise ?? loadMarkdownEditorModule();

  if (!milkdownEditorRuntimeImportPromise) {
    void loadMilkdownEditorRuntimeModule().catch(() => undefined);
  }

  return markdownEditorPromise;
}
