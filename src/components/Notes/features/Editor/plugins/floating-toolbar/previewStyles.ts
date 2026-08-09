import type { EditorView } from '@milkdown/kit/prose/view';
import {
  convertBlockType,
  setBgColor,
  setLink,
  setTextAlignment,
  setTextColor,
  toggleMark,
} from './commands';
import type { BlockType, TextAlignment } from './types';
import {
  clearPreviewOverlay,
  hasMatchingPreview,
  renderAppliedPreview,
  renderSelectionHiddenPreview,
} from './previewAppliedRenderer';
import { commitPreview } from './previewCommit';
import { FORMAT_MARKS } from './previewStyleConstants';
import { showTextSelectionOverlayForPreview } from './previewNativeSelection';
import {
  clearSelectionColorPreview,
  refreshMatchingSelectionColorPreview,
  renderSelectionColorPreview,
} from './previewSelectionColor';
import {
  clearSelectionFormatPreview,
  refreshMatchingSelectionFormatPreview,
  renderSelectionFormatPreview,
} from './previewSelectionFormat';
import {
  clearSelectionAlignmentPreview,
  refreshMatchingSelectionAlignmentPreview,
  renderSelectionAlignmentPreview,
} from './previewSelectionAlignment';
import {
  clearSelectionBlockPreview,
  refreshMatchingSelectionBlockPreview,
  renderSelectionBlockPreview,
} from './previewSelectionBlock';

export { hasActiveAppliedPreview } from './previewAppliedRenderer';
export { hasActiveSelectionBlockPreview } from './previewSelectionBlock';

export function hasFormatPreview(action: string): boolean {
  return action in FORMAT_MARKS || action === 'link';
}

export function hasBlockPreview(blockType: BlockType): boolean {
  return (
    blockType === 'paragraph' ||
    blockType === 'heading1' ||
    blockType === 'heading2' ||
    blockType === 'heading3' ||
    blockType === 'heading4' ||
    blockType === 'heading5' ||
    blockType === 'heading6' ||
    blockType === 'bulletList' ||
    blockType === 'orderedList' ||
    blockType === 'taskList' ||
    blockType === 'blockquote' ||
    blockType === 'codeBlock'
  );
}

function clearFormatPreviewState(): boolean {
  const didClearPreview = clearPreviewOverlay();
  const didClearSelectionColorPreview = clearSelectionColorPreview();
  const didClearSelectionFormatPreview = clearSelectionFormatPreview();
  const didClearSelectionAlignmentPreview = clearSelectionAlignmentPreview();
  const didClearSelectionBlockPreview = clearSelectionBlockPreview();
  return (
    didClearPreview ||
    didClearSelectionColorPreview ||
    didClearSelectionFormatPreview ||
    didClearSelectionAlignmentPreview ||
    didClearSelectionBlockPreview
  );
}

export function applyFormatPreview(view: EditorView, action: string, isActive: boolean = false): void {
  const key = `format:${action}:${isActive}`;
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionFormatPreview(view, key)) {
    return;
  }

  clearFormatPreviewState();

  const markName = FORMAT_MARKS[action];
  if (action === 'link') {
    if (!isActive) {
      return;
    }

    const didRenderAppliedPreview = renderAppliedPreview(view, key, (previewView) => {
      setLink(previewView, null);
    });
    if (!didRenderAppliedPreview) {
      renderSelectionFormatPreview(view, 'link', true, key);
    }
    return;
  }

  if (!markName) {
    return;
  }

  const didRenderAppliedPreview = renderAppliedPreview(view, key, (previewView) => {
    toggleMark(previewView, markName);
  });
  if (!didRenderAppliedPreview) {
    renderSelectionFormatPreview(view, action, isActive, key);
  }
}

export function applyTextColorPreview(view: EditorView, color: string | null): void {
  const key = `textColor:${color ?? 'default'}`;
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionColorPreview(view, key)) {
    return;
  }

  clearFormatPreviewState();
  const didRenderAppliedPreview = renderAppliedPreview(view, key, (previewView) => {
    setTextColor(previewView, color);
  });
  if (!didRenderAppliedPreview) {
    renderSelectionColorPreview(view, 'text', color, key);
  }
}

export function applyBgColorPreview(view: EditorView, color: string | null): void {
  const key = `bgColor:${color ?? 'default'}`;
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionColorPreview(view, key)) {
    return;
  }

  clearFormatPreviewState();
  const didRenderAppliedPreview = renderAppliedPreview(view, key, (previewView) => {
    setBgColor(previewView, color);
  });
  if (!didRenderAppliedPreview) {
    renderSelectionColorPreview(view, 'bg', color, key);
  }
}

export function applyColorPickerIdlePreview(view: EditorView): void {
  const key = 'colorPicker:idle';
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionColorPreview(view, key)) {
    return;
  }

  if (!renderSelectionHiddenPreview(view, key)) {
    renderSelectionColorPreview(view, 'idle', null, key);
  }
}

export function applyAlignmentPreview(view: EditorView, alignment: TextAlignment): void {
  const key = `alignment:${alignment}`;
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionAlignmentPreview(view, key)) {
    return;
  }

  clearFormatPreviewState();
  const didRenderAppliedPreview = renderAppliedPreview(view, key, (previewView) => {
    setTextAlignment(previewView, alignment);
  });
  if (!didRenderAppliedPreview) {
    renderSelectionAlignmentPreview(view, alignment, key);
  }
}

export function applyBlockPreview(view: EditorView, blockType: BlockType): void {
  const key = `block:${blockType}`;
  if (hasMatchingPreview(view, key)) {
    return;
  }
  if (refreshMatchingSelectionBlockPreview(view, key)) {
    return;
  }

  clearFormatPreviewState();
  const apply = (previewView: EditorView) => {
    convertBlockType(previewView, blockType);
  };
  if (!renderAppliedPreview(view, key, apply)) {
    renderSelectionBlockPreview(view, key, apply);
  }
}

export function commitFormatPreview(view: EditorView, action: string, isActive: boolean = false): boolean {
  return commitPreview(view, `format:${action}:${isActive}`);
}

export function commitTextColorPreview(view: EditorView, color: string | null): boolean {
  return commitPreview(view, `textColor:${color ?? 'default'}`);
}

export function commitBgColorPreview(view: EditorView, color: string | null): boolean {
  return commitPreview(view, `bgColor:${color ?? 'default'}`);
}

export function commitAlignmentPreview(view: EditorView, alignment: TextAlignment): boolean {
  return commitPreview(view, `alignment:${alignment}`);
}

export function commitBlockPreview(view: EditorView, blockType: BlockType): boolean {
  return commitPreview(view, `block:${blockType}`);
}

export function clearFormatPreview(view: EditorView): void {
  if (clearFormatPreviewState()) {
    showTextSelectionOverlayForPreview(view);
  }
}
