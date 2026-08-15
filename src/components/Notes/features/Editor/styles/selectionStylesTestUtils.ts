import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDITOR_STYLES_ROOT = resolve(
  process.cwd(),
  'src/components/Notes/features/Editor/styles',
);

export function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n');
}

export function readStyleFile(name: string) {
  return normalizeLineEndings(readFileSync(resolve(EDITOR_STYLES_ROOT, name), 'utf8'));
}

export function readBlockSelectionStyle() {
  return [
    'block-selection.css',
    'block-selection-list.css',
    'block-selection-rich.css',
    'block-selection-table.css',
    'block-selection-final.css',
    'block-selection-atomic-rich.css',
  ].map(readStyleFile).join('\n');
}

export function readThemeStyle() {
  return normalizeLineEndings(readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8'));
}

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

export function readTextSelectionOverlaySource() {
  const root = 'src/components/Notes/features/Editor/plugins/selection';
  return [
    'textSelectionOverlayPlugin.ts',
    'textSelectionOverlayState.ts',
    'textSelectionOverlayDecorations.ts',
    'textSelectionLayer.ts',
    'textSelectionLayerRects.ts',
    'textSelectionOverlayKeyboard.ts',
    'textSelectionOverlayPointerHandlers.ts',
    'textSelectionOverlayPointerRelease.ts',
  ].map((fileName) => readSource(`${root}/${fileName}`)).join('\n');
}

export function readSharedBlockNodeTypesSource() {
  return readSource('src/components/Notes/features/Editor/plugins/shared/blockNodeTypes.ts');
}

export function readAiReviewSelectionSource() {
  return readSource('src/components/Notes/features/Editor/plugins/floating-toolbar/ai/reviewSelection.ts');
}

export function readLinkTooltipSource() {
  return readSource('src/components/Notes/features/Editor/plugins/links/tooltip/linkTooltipPlugin.tsx');
}

export function readLinkTooltipStateSource() {
  return readSource('src/components/Notes/features/Editor/plugins/links/tooltip/linkTooltipState.ts');
}

export function readLinkTooltipEditorSource() {
  return readSource('src/components/Notes/features/Editor/plugins/links/tooltip/components/LinkEditor.tsx');
}

export function readMilkdownLinkTooltipThemeSource() {
  return readSource('vendor/milkdown/packages/crepe/src/theme/common/link-tooltip.css');
}
