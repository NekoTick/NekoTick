import {
  themeDomStyleTokens,
  themeRenderingTokens,
  themeStyleResetTokens,
  themeTextAreaTokens,
} from '@/styles/themeTokens';

const CARET_VISIBILITY_SCOPE_SELECTOR = '[data-chat-input="true"]';

const TEXT_INPUT_TYPES = new Set([
  '',
  'search',
  'tel',
  'text',
  'url',
]);

const COPIED_STYLE_PROPERTIES = [
  'boxSizing',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontVariantNumeric',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontSynthesis',
  'fontWeight',
  'fontStretch',
  'textRendering',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'textAlign',
  'direction',
  'wordSpacing',
  'wordBreak',
  'hyphens',
  'tabSize',
] as const;

const SINGLE_LINE_INPUT_CARET_HEIGHT_RATIO = 0.56;

export type TextControl = HTMLInputElement | HTMLTextAreaElement;

export function isTextControl(element: Element | null): element is TextControl {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return TEXT_INPUT_TYPES.has(element.type);
}

function parsePx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveLineHeight(styles: CSSStyleDeclaration): number {
  const lineHeight = parsePx(styles.lineHeight);
  if (lineHeight > 0) return lineHeight;
  const fontSize = parsePx(styles.fontSize);
  return fontSize > 0 ? fontSize * 1.2 : 16;
}

function copyTextMetrics(source: CSSStyleDeclaration, target: HTMLElement): void {
  for (const property of COPIED_STYLE_PROPERTIES) {
    target.style[property] = source[property];
  }
}

function getCollapsedSelectionStart(control: TextControl): number | null {
  try {
    const selectionStart = control.selectionStart;
    const selectionEnd = control.selectionEnd;
    if (selectionStart !== null && selectionEnd !== null) {
      return selectionStart === selectionEnd ? selectionStart : null;
    }
  } catch {
    // Browsers do not expose collapsed text selection APIs for every input type.
  }
  return null;
}

function createMirror(
  control: TextControl,
  styles: CSSStyleDeclaration,
  controlRect: DOMRect,
): HTMLDivElement {
  const mirror = control.ownerDocument.createElement('div');
  copyTextMetrics(styles, mirror);
  mirror.style.position = themeDomStyleTokens.positionFixed;
  mirror.style.visibility = themeRenderingTokens.visibilityHidden;
  mirror.style.pointerEvents = themeStyleResetTokens.pointerEventsNone;
  mirror.style.whiteSpace = control instanceof HTMLTextAreaElement
    ? styles.whiteSpace || themeRenderingTokens.whiteSpacePreWrap
    : themeRenderingTokens.whiteSpacePre;
  mirror.style.overflowWrap = control instanceof HTMLTextAreaElement
    ? styles.overflowWrap || themeRenderingTokens.overflowWrapBreakWord
    : themeRenderingTokens.overflowWrapNormal;
  mirror.style.overflow = themeTextAreaTokens.overflowHidden;
  const borderWidth = parsePx(styles.borderLeftWidth) + parsePx(styles.borderRightWidth);
  const paddingWidth = parsePx(styles.paddingLeft) + parsePx(styles.paddingRight);
  const borderBoxWidth = control.clientWidth > 0
    ? control.clientWidth + borderWidth
    : controlRect.width;
  const mirrorWidth = styles.boxSizing === 'content-box'
    ? borderBoxWidth - borderWidth - paddingWidth
    : borderBoxWidth;
  mirror.style.width = `${Math.max(0, mirrorWidth)}px`;
  mirror.style.top = themeDomStyleTokens.sizeZero;
  mirror.style.left = themeDomStyleTokens.sizeZero;
  mirror.style.zIndex = themeDomStyleTokens.zIndexBehindString;
  return mirror;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveCaretVisibilityScope(control: TextControl): Element {
  return control.closest(CARET_VISIBILITY_SCOPE_SELECTOR) ?? control;
}

function getElementFromPointIgnoringCaret(
  doc: Document,
  x: number,
  y: number,
  caret: HTMLElement | null,
): Element | null | undefined {
  const elementFromPoint = doc.elementFromPoint?.bind(doc);
  if (!elementFromPoint) {
    return undefined;
  }

  if (!caret) {
    return elementFromPoint(x, y);
  }

  const previousDisplay = caret.style.display;
  caret.style.display = themeStyleResetTokens.displayNone;
  try {
    return elementFromPoint(x, y);
  } finally {
    caret.style.display = previousDisplay;
  }
}

export function isCaretOverlayVisuallyVisible(
  control: TextControl,
  overlayRect: { left: number; top: number; height: number },
  caret: HTMLElement | null,
): boolean {
  const doc = control.ownerDocument;
  const controlRect = control.getBoundingClientRect();
  const pointY = overlayRect.top + overlayRect.height / 2;

  if (
    !Number.isFinite(overlayRect.left) ||
    !Number.isFinite(pointY) ||
    overlayRect.left < controlRect.left ||
    overlayRect.left > controlRect.right ||
    pointY < controlRect.top ||
    pointY > controlRect.bottom
  ) {
    return false;
  }

  const pointX = clamp(
    overlayRect.left,
    controlRect.left,
    Math.max(controlRect.left, controlRect.right - 1),
  );
  const visiblePointY = clamp(
    pointY,
    controlRect.top,
    Math.max(controlRect.top, controlRect.bottom - 1),
  );
  const hitElement = getElementFromPointIgnoringCaret(doc, pointX, visiblePointY, caret);
  if (hitElement === undefined) {
    return true;
  }
  if (!hitElement) {
    return false;
  }

  if (hitElement === control || control.contains(hitElement)) {
    return true;
  }

  const scope = resolveCaretVisibilityScope(control);
  return scope !== control && scope.contains(hitElement);
}

function resolveSingleLineInputCaretHeight(
  controlRect: DOMRect,
  contentHeight: number,
  markerHeight: number,
  lineHeight: number,
): number {
  const boundedContentHeight = contentHeight > 0 ? contentHeight : controlRect.height;
  const controlScaledHeight = controlRect.height * SINGLE_LINE_INPUT_CARET_HEIGHT_RATIO;
  const inputHeight = Math.min(boundedContentHeight, controlScaledHeight);
  return Math.max(markerHeight, lineHeight, inputHeight);
}

function createCaretMarker(control: TextControl, lineHeight: number): HTMLSpanElement {
  const marker = control.ownerDocument.createElement('span');
  if (control instanceof HTMLInputElement) {
    marker.style.display = themeDomStyleTokens.displayInlineBlock;
    marker.style.width = themeDomStyleTokens.sizeZero;
    marker.style.height = `${lineHeight}px`;
    marker.style.margin = themeDomStyleTokens.sizeZero;
    marker.style.padding = themeDomStyleTokens.sizeZero;
    marker.style.overflow = themeTextAreaTokens.overflowHidden;
    marker.style.letterSpacing = themeDomStyleTokens.sizeZero;
    marker.style.verticalAlign = themeRenderingTokens.verticalAlignBaseline;
    return marker;
  }

  marker.textContent = '\u200b';
  return marker;
}

export function getControlCaretRect(control: TextControl): { left: number; top: number; bottom: number } | null {
  const selectionStart = getCollapsedSelectionStart(control);
  if (selectionStart === null) return null;

  const styles = control.ownerDocument.defaultView?.getComputedStyle(control);
  if (!styles) return null;

  const controlRect = control.getBoundingClientRect();
  if (controlRect.width <= 0 || controlRect.height <= 0) return null;
  const lineHeight = resolveLineHeight(styles);

  const mirror = createMirror(control, styles, controlRect);
  const textBeforeCaret = control.value.slice(0, selectionStart);
  const textAfterCaret = control.value.slice(selectionStart);
  if (textBeforeCaret.length > 0) {
    mirror.appendChild(control.ownerDocument.createTextNode(textBeforeCaret));
  }

  const marker = createCaretMarker(control, lineHeight);
  mirror.appendChild(marker);
  if (textAfterCaret.length > 0) {
    mirror.appendChild(control.ownerDocument.createTextNode(textAfterCaret));
  }
  control.ownerDocument.body.appendChild(mirror);

  let markerRect: DOMRect;
  try {
    markerRect = marker.getBoundingClientRect();
  } finally {
    mirror.remove();
  }

  const borderLeft = parsePx(styles.borderLeftWidth);
  const borderTop = parsePx(styles.borderTopWidth);
  const paddingLeft = parsePx(styles.paddingLeft);
  const paddingTop = parsePx(styles.paddingTop);
  const paddingBottom = parsePx(styles.paddingBottom);
  const borderBottom = parsePx(styles.borderBottomWidth);
  const fallbackLeft = controlRect.left + borderLeft + paddingLeft;
  const fallbackTop = controlRect.top + borderTop + paddingTop;
  const left = controlRect.left + markerRect.left - parsePx(mirror.style.left) - control.scrollLeft;
  const markerHeight = markerRect.height;
  const measuredTop = controlRect.top + markerRect.top - parsePx(mirror.style.top) - control.scrollTop;
  const contentTop = controlRect.top + borderTop + paddingTop;
  const contentHeight = controlRect.height - borderTop - borderBottom - paddingTop - paddingBottom;
  const inputCaretHeight = control instanceof HTMLInputElement
    ? resolveSingleLineInputCaretHeight(controlRect, contentHeight, markerHeight, lineHeight)
    : markerHeight;
  const top = control instanceof HTMLInputElement && inputCaretHeight > 0 && contentHeight > 0
    ? contentTop + (contentHeight - inputCaretHeight) / 2
    : measuredTop;

  return {
    left: Number.isFinite(left) ? left : fallbackLeft,
    top: Number.isFinite(top) ? top : fallbackTop,
    bottom: Number.isFinite(top) && inputCaretHeight > 0
      ? top + inputCaretHeight
      : fallbackTop + lineHeight,
  };
}
