import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateTaskCheckboxBounds, resolveTaskCheckboxTarget } from './taskCheckboxHitArea';

function setRect(element: Element, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = vi.fn(() => ({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
    bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON: () => ({}),
  } as DOMRect));
}

describe('taskCheckboxHitArea', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives checkbox bounds from the text block start', () => {
    expect(
      calculateTaskCheckboxBounds({
        textLeft: 132,
        gap: 8,
        checkboxSize: 16,
      })
    ).toEqual({
      left: 108,
      right: 124,
    });
  });

  it('supports centered or right-aligned task rows with shifted text start', () => {
    expect(
      calculateTaskCheckboxBounds({
        textLeft: 280,
        gap: 8,
        checkboxSize: 16,
      })
    ).toEqual({
      left: 256,
      right: 272,
    });
  });

  it('resolves a nested task checkbox even when the event target is the parent list item', () => {
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => ({
      ...getComputedStyle(element),
      columnGap: '8px',
      gap: '8px',
      width: pseudoElt ? '16px' : '',
    } as CSSStyleDeclaration));

    document.body.innerHTML = `
      <ul id="root">
        <li data-item-type="task">
          <p>parent</p>
          <ul>
            <li data-item-type="task" id="nested-task"><p>child</p></li>
          </ul>
        </li>
      </ul>
    `;

    const root = document.getElementById('root') as HTMLElement;
    const parentTask = root.querySelector('li[data-item-type="task"]') as HTMLElement;
    const nestedTask = document.getElementById('nested-task') as HTMLElement;
    const [parentText, nestedText] = Array.from(root.querySelectorAll('p'));

    setRect(parentText, { left: 100, top: 10, width: 60, height: 20 });
    setRect(nestedText, { left: 130, top: 40, width: 50, height: 20 });

    expect(resolveTaskCheckboxTarget(root, parentTask, 114, 50)).toBe(nestedTask);
  });

  it('does not scan task items when the pointer target is outside a list', () => {
    document.body.innerHTML = `
      <div id="root">
        <p id="paragraph">ordinary text</p>
        <ul><li data-item-type="task"><p>task</p></li></ul>
      </div>
    `;

    const root = document.getElementById('root') as HTMLElement;
    const paragraph = document.getElementById('paragraph') as HTMLElement;
    const taskText = root.querySelector('li[data-item-type="task"] > p') as HTMLElement;
    const taskRect = vi.spyOn(taskText, 'getBoundingClientRect');

    expect(resolveTaskCheckboxTarget(root, paragraph, 120, 20)).toBeNull();
    expect(taskRect).not.toHaveBeenCalled();
  });
});
