const MIRROR_STYLE_PROPERTIES = [
  'border-bottom-width', 'border-left-width', 'border-right-width', 'border-top-width',
  'box-sizing', 'font-family', 'font-size', 'font-stretch', 'font-style', 'font-variant',
  'font-weight', 'letter-spacing', 'line-height', 'padding-bottom', 'padding-left',
  'padding-right', 'padding-top', 'tab-size', 'text-align', 'text-indent',
  'text-transform', 'word-break', 'word-spacing',
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createTextareaOffsetMeasurer(textarea: HTMLTextAreaElement) {
  const ownerDocument = textarea.ownerDocument;
  const computedStyle = window.getComputedStyle(textarea);
  const mirror = ownerDocument.createElement('div');
  for (const property of MIRROR_STYLE_PROPERTIES) {
    mirror.style.setProperty(property, computedStyle.getPropertyValue(property));
  }
  mirror.style.position = 'fixed';
  mirror.style.left = '0';
  mirror.style.top = '0';
  mirror.style.width = `${textarea.getBoundingClientRect().width}px`;
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.pointerEvents = 'none';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = textarea.wrap === 'off' ? 'pre' : 'pre-wrap';
  ownerDocument.body.appendChild(mirror);

  const marker = ownerDocument.createElement('span');
  marker.textContent = '\u200b';
  const cache = new Map<number, number>();
  const measure = (offset: number) => {
    const normalizedOffset = clamp(Math.round(offset), 0, textarea.value.length);
    const cached = cache.get(normalizedOffset);
    if (cached !== undefined) return cached;
    mirror.replaceChildren(
      ownerDocument.createTextNode(textarea.value.slice(0, normalizedOffset)),
      marker,
      ownerDocument.createTextNode(textarea.value.slice(normalizedOffset)),
    );
    const top = marker.offsetTop;
    cache.set(normalizedOffset, top);
    return top;
  };

  return { measure, remove: () => mirror.remove() };
}

export function findSourceOffsetAtTop(
  textarea: HTMLTextAreaElement,
  localTop: number,
): { offset: number; top: number } {
  const measurer = createTextareaOffsetMeasurer(textarea);
  try {
    let low = 0;
    let high = textarea.value.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (measurer.measure(middle) <= localTop) low = middle;
      else high = middle - 1;
    }
    const rowTop = measurer.measure(low);
    high = low;
    low = 0;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (measurer.measure(middle) < rowTop) low = middle + 1;
      else high = middle;
    }
    return { offset: low, top: rowTop };
  } finally {
    measurer.remove();
  }
}
