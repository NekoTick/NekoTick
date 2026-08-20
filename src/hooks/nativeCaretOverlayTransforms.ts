const TRANSFORM_TOLERANCE = 0.0001;

function isApproximately(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= TRANSFORM_TOLERANCE;
}

function parseTransformValues(value: string, functionName: 'matrix' | 'matrix3d'): number[] | null {
  const match = value.match(new RegExp(`^${functionName}\\((.*)\\)$`, 'i'));
  if (!match) return null;

  const values = match[1].split(/[,\s]+/).filter(Boolean).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function isTranslationOnlyTransform(value: string): boolean {
  const transform = value.trim();
  if (!transform || transform === 'none') return true;

  if (/^(?:translate(?:3d|x|y|z)?\([^)]*\)\s*)+$/i.test(transform)) {
    return true;
  }

  const matrix3d = parseTransformValues(transform, 'matrix3d');
  if (matrix3d) {
    if (matrix3d.length !== 16) return false;
    return matrix3d.every((entry, index) => {
      if (index === 12 || index === 13 || index === 14) return true;
      const expected = index === 0 || index === 5 || index === 10 || index === 15 ? 1 : 0;
      return isApproximately(entry, expected);
    });
  }

  const matrix = parseTransformValues(transform, 'matrix');
  if (matrix) {
    return matrix.length === 6 &&
      isApproximately(matrix[0], 1) &&
      isApproximately(matrix[1], 0) &&
      isApproximately(matrix[2], 0) &&
      isApproximately(matrix[3], 1);
  }

  // Unknown transform syntax is safer on the native caret than with a guessed overlay position.
  return false;
}

function isIdentityScale(value: string): boolean {
  const scale = value.trim();
  if (!scale || scale === 'none') return true;

  const values = scale.split(/[,\s]+/).filter(Boolean).map(Number);
  return values.length >= 1 && values.length <= 3 && values.every((entry) => isApproximately(entry, 1));
}

function isZeroRotation(value: string): boolean {
  const rotation = value.trim();
  if (!rotation || rotation === 'none') return true;

  const angle = rotation.split(/\s+/).at(-1) ?? '';
  const match = angle.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:deg|grad|rad|turn)?$/i);
  return match ? isApproximately(Number(match[1]), 0) : false;
}

function isIdentityZoom(value: string): boolean {
  const zoom = value.trim().toLowerCase();
  if (!zoom || zoom === 'normal' || zoom === '1' || zoom === '100%') return true;
  const numeric = Number.parseFloat(zoom);
  return Number.isFinite(numeric) && isApproximately(numeric, 1);
}

function hasUnsupportedComputedTransform(styles: CSSStyleDeclaration): boolean {
  return !isTranslationOnlyTransform(styles.transform) ||
    !isIdentityScale(styles.getPropertyValue('scale')) ||
    !isZeroRotation(styles.getPropertyValue('rotate')) ||
    (styles.perspective !== '' && styles.perspective !== 'none') ||
    !isIdentityZoom(styles.getPropertyValue('zoom'));
}

/**
 * The mirror used by the overlay is laid out in the control's untransformed coordinate system.
 * It is exact for translations, but not for scale/rotation/skew/perspective or CSS zoom.
 */
export function hasUnsupportedCaretOverlayTransform(control: Element): boolean {
  const view = control.ownerDocument.defaultView;
  if (!view) return false;

  for (let element: Element | null = control; element; element = element.parentElement) {
    if (hasUnsupportedComputedTransform(view.getComputedStyle(element))) {
      return true;
    }
  }

  return false;
}
