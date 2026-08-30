import { EditorState } from '@codemirror/state';
import { EditorView as CodeMirror } from '@codemirror/view';
import { forceParsing } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARET_BLINK_HELD_ATTR, CARET_BLINK_HOLD_DELAY_MS } from '@/lib/ui/caretOverlayStyles';
import {
  createCodeBlockEditorTheme,
  resolveCodeBlockBlankContentClickPosition,
} from './codeBlockEditorTheme';
import { codeBlockCompatibilityHighlightStyle } from './codeBlockCompatibilityHighlightStyle';
import { codeBlockLanguageLoader } from '../codeBlockLanguageLoader';

afterEach(() => {
  vi.useRealTimers();
});

describe('codeBlockEditorTheme', () => {
  it('adds Obsidian code block alias classes to CodeMirror lines', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'one\ntwo',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    const lines = Array.from(cm.dom.querySelectorAll('.cm-line'));
    expect(lines).toHaveLength(2);
    expect(lines[0].classList.contains('HyperMD-codeblock')).toBe(true);
    expect(lines[0].classList.contains('HyperMD-codeblock-bg')).toBe(true);
    expect(lines[0].classList.contains('cm-hmd-codeblock')).toBe(true);
    expect(lines[0].classList.contains('HyperMD-codeblock-begin')).toBe(true);
    expect(lines[0].classList.contains('HyperMD-codeblock-begin-bg')).toBe(true);
    expect(lines[1].classList.contains('HyperMD-codeblock')).toBe(true);
    expect(lines[1].classList.contains('HyperMD-codeblock-bg')).toBe(true);
    expect(lines[1].classList.contains('cm-hmd-codeblock')).toBe(true);
    expect(lines[1].classList.contains('HyperMD-codeblock-end')).toBe(true);
    expect(lines[1].classList.contains('HyperMD-codeblock-end-bg')).toBe(true);

    cm.destroy();
    host.remove();
  });

  it('marks selected CodeMirror text without replacing syntax colors', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'const value = 1;',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    cm.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(cm.dom.querySelectorAll('.editor-code-selection-text')).toHaveLength(1);

    cm.dispatch({ selection: { anchor: 5, head: 5 } });

    expect(cm.dom.querySelectorAll('.editor-code-selection-text')).toHaveLength(0);

    cm.destroy();
    host.remove();
  });

  it('marks non-empty selections so the code caret can be hidden while text is selected', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'const value = 1;',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    cm.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(cm.dom.classList.contains('editor-code-selection-active')).toBe(true);

    cm.dispatch({ selection: { anchor: 5, head: 5 } });

    expect(cm.dom.classList.contains('editor-code-selection-active')).toBe(false);
    cm.destroy();
    host.remove();
  });

  it('releases the code caret blink hold while text is selected', () => {
    vi.useFakeTimers();

    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'const value = 1;',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    cm.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    cm.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(cm.dom.classList.contains('editor-code-selection-active')).toBe(true);
    expect(cm.dom.hasAttribute(CARET_BLINK_HELD_ATTR)).toBe(false);
    expect(Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .filter((cssText) => cssText.includes('editor-code-selection-active'))
      .join('\n')).toContain('opacity: 0');

    cm.destroy();
    host.remove();
  });

  it('places the cursor at the clicked line end when selected code is cleared by a content blank click', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        selection: { anchor: 0, head: 5 },
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const secondLine = cm.state.doc.line(2);
    const lineBlockSpy = vi
      .spyOn(cm, 'lineBlockAtHeight')
      .mockReturnValue({ from: secondLine.from } as ReturnType<CodeMirror['lineBlockAtHeight']>);
    vi.spyOn(cm, 'documentTop', 'get').mockReturnValue(10);

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientY: 34,
    });
    cm.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lineBlockSpy).toHaveBeenCalledWith(24);
    expect(cm.state.selection.main.from).toBe(secondLine.to);
    expect(cm.state.selection.main.to).toBe(secondLine.to);

    cm.destroy();
    host.remove();
  });

  it('leaves ordinary code line clicks to CodeMirror native selection handling', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const line = cm.contentDOM.querySelector('.cm-line');
    expect(line).toBeInstanceOf(HTMLElement);
    const posAtCoordsSpy = vi.spyOn(cm, 'posAtCoords');
    vi.spyOn(cm, 'coordsAtPos').mockReturnValue({
      left: 80,
      right: 80,
      top: 10,
      bottom: 24,
    } as DOMRect);

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 40,
    });
    Object.defineProperty(event, 'target', {
      value: line,
    });

    expect(resolveCodeBlockBlankContentClickPosition(cm, event)).toBeNull();
    expect(posAtCoordsSpy).not.toHaveBeenCalled();

    cm.destroy();
    host.remove();
  });

  it('uses line end for clicks in the empty area to the right of rendered code text', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const firstLine = cm.state.doc.line(1);
    vi.spyOn(cm, 'lineBlockAtHeight')
      .mockReturnValue({ from: firstLine.from } as ReturnType<CodeMirror['lineBlockAtHeight']>);
    vi.spyOn(cm, 'coordsAtPos').mockReturnValue({
      left: 40,
      right: 40,
      top: 10,
      bottom: 24,
    } as DOMRect);
    vi.spyOn(cm, 'documentTop', 'get').mockReturnValue(0);

    const line = cm.contentDOM.querySelector('.cm-line');
    expect(line).toBeInstanceOf(HTMLElement);

    const blankEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 96,
      clientY: 18,
    });
    line!.dispatchEvent(blankEvent);

    expect(blankEvent.defaultPrevented).toBe(true);
    expect(cm.state.selection.main.from).toBe(firstLine.to);

    const textEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 24,
      clientY: 18,
    });
    Object.defineProperty(textEvent, 'target', {
      value: line,
    });

    expect(resolveCodeBlockBlankContentClickPosition(cm, textEvent)).toBeNull();

    cm.destroy();
    host.remove();
  });

  it('keeps drag selection working when it starts in the trailing area of a code line', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const lastLine = cm.state.doc.line(2);
    const line = cm.contentDOM.querySelectorAll('.cm-line')[1];
    vi.spyOn(cm, 'lineBlockAtHeight')
      .mockReturnValue({ from: lastLine.from } as ReturnType<CodeMirror['lineBlockAtHeight']>);
    vi.spyOn(cm, 'coordsAtPos').mockReturnValue({
      left: 40,
      right: 40,
      top: 10,
      bottom: 24,
    } as DOMRect);
    vi.spyOn(cm, 'documentTop', 'get').mockReturnValue(0);
    vi.spyOn(cm, 'posAtCoords').mockReturnValue(1);

    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 96,
      clientY: 18,
    });
    Object.defineProperty(mouseDown, 'target', { value: line });
    const selectionStyle = cm.state.facet(CodeMirror.mouseSelectionStyle)
      .map((makeStyle) => makeStyle(cm, mouseDown))
      .find((style) => style !== null);
    expect(selectionStyle).toBeDefined();

    const selection = selectionStyle!.get(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 4,
      buttons: 1,
    }), false, false);

    expect(selection.ranges[0]?.anchor).toBe(lastLine.to);
    expect(selection.ranges[0]?.head).toBe(1);
    cm.destroy();
    host.remove();
  });

  it('collapses selected code at the clicked selected text position', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        selection: { anchor: 0, head: 11 },
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const posAtCoordsSpy = vi.spyOn(cm, 'posAtCoords').mockReturnValue(9);
    const posAtDomSpy = vi.spyOn(cm, 'posAtDOM');
    const originalCaretPositionFromPoint = (
      document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint;
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({
        offsetNode: cm.contentDOM,
        offset: 0,
      })),
    });

    try {
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 64,
        clientY: 24,
      });
      cm.contentDOM.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(posAtCoordsSpy).toHaveBeenCalledWith({ x: 64, y: 24 });
      expect(posAtDomSpy).not.toHaveBeenCalledWith(cm.contentDOM, 0);
      expect(cm.state.selection.main.from).toBe(9);
      expect(cm.state.selection.main.to).toBe(9);
    } finally {
      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: originalCaretPositionFromPoint,
      });
      cm.destroy();
      host.remove();
    }
  });

  it('collapses selected code from the selection overlay layer at the clicked position', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        selection: { anchor: 0, head: 11 },
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const overlay = document.createElement('div');
    overlay.className = 'cm-selectionBackground';
    cm.dom.appendChild(overlay);
    const posAtCoordsSpy = vi.spyOn(cm, 'posAtCoords').mockReturnValue(9);
    const posAtDomSpy = vi.spyOn(cm, 'posAtDOM');
    const originalCaretPositionFromPoint = (
      document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint;
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({
        offsetNode: cm.contentDOM,
        offset: 0,
      })),
    });

    try {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 64,
        clientY: 24,
      });
      overlay.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(posAtCoordsSpy).toHaveBeenCalledWith({ x: 64, y: 24 });
      expect(posAtDomSpy).not.toHaveBeenCalledWith(cm.contentDOM, 0);
      expect(cm.state.selection.main.from).toBe(9);
      expect(cm.state.selection.main.to).toBe(9);
    } finally {
      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: originalCaretPositionFromPoint,
      });
      cm.destroy();
      host.remove();
    }
  });

  it('resolves selection overlay clicks from CodeMirror coordinates before browser caret fallback', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'first\nsecond',
        selection: { anchor: 0, head: 11 },
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });
    const overlay = document.createElement('div');
    overlay.className = 'cm-selectionBackground';
    cm.dom.appendChild(overlay);
    const secondLine = cm.state.doc.line(2);
    const posAtCoordsSpy = vi.spyOn(cm, 'posAtCoords').mockReturnValue(secondLine.from + 3);
    const posAtDomSpy = vi.spyOn(cm, 'posAtDOM');
    const originalElementFromPoint = document.elementFromPoint;
    const originalCaretPositionFromPoint = (
      document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint;

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => overlay),
    });
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({
        offsetNode: cm.contentDOM,
        offset: 0,
      })),
    });

    try {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 34,
        clientY: 28,
      });
      overlay.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(posAtCoordsSpy).toHaveBeenCalledWith({ x: 34, y: 28 });
      expect(posAtDomSpy).not.toHaveBeenCalledWith(cm.contentDOM, 0);
      expect(cm.state.selection.main.from).toBe(secondLine.from + 3);
      expect(cm.state.selection.main.to).toBe(secondLine.from + 3);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
      Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: originalCaretPositionFromPoint,
      });
      cm.destroy();
      host.remove();
    }
  });

  it('holds the CodeMirror caret visible while keyboard navigation is moving it', () => {
    vi.useFakeTimers();

    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'abc',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    cm.dispatch({ selection: { anchor: 1 } });

    expect(cm.dom.getAttribute(CARET_BLINK_HELD_ATTR)).toBe('true');

    vi.advanceTimersByTime(CARET_BLINK_HOLD_DELAY_MS - 1);
    cm.dispatch({ selection: { anchor: 2 } });
    vi.advanceTimersByTime(CARET_BLINK_HOLD_DELAY_MS - 1);
    expect(cm.dom.getAttribute(CARET_BLINK_HELD_ATTR)).toBe('true');

    vi.advanceTimersByTime(1);
    expect(cm.dom.hasAttribute(CARET_BLINK_HELD_ATTR)).toBe(false);

    cm.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      isComposing: true,
    }));
    cm.dispatch({ selection: { anchor: 1 } });
    vi.advanceTimersByTime(CARET_BLINK_HOLD_DELAY_MS * 2);
    expect(cm.dom.hasAttribute(CARET_BLINK_HELD_ATTR)).toBe(false);

    cm.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    cm.dispatch({ selection: { anchor: 1 } });
    vi.advanceTimersByTime(CARET_BLINK_HOLD_DELAY_MS * 2);
    expect(cm.dom.getAttribute(CARET_BLINK_HELD_ATTR)).toBe('true');

    cm.contentDOM.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    vi.advanceTimersByTime(CARET_BLINK_HOLD_DELAY_MS);
    expect(cm.dom.hasAttribute(CARET_BLINK_HELD_ATTR)).toBe(false);

    cm.destroy();
    host.remove();
  });

  it('adds Obsidian and CodeMirror 5 token alias classes without replacing syntax colors', async () => {
    const jsonLanguage = await codeBlockLanguageLoader.load('json');
    expect(jsonLanguage).toBeDefined();

    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: '{"name": "Ada", "count": 1, "ok": true}',
        extensions: [
          jsonLanguage!,
          ...createCodeBlockEditorTheme(),
        ],
      }),
    });

    expect(forceParsing(cm, cm.state.doc.length, 1000)).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(cm.dom.querySelector('.cm-property')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.cm-string')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.cm-number')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.cm-atom')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.token.property')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.token.string')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.token.number')).toBeInstanceOf(HTMLElement);
    expect(cm.dom.querySelector('.token.boolean')).toBeInstanceOf(HTMLElement);

    cm.destroy();
    host.remove();

    const javascriptLanguage = await codeBlockLanguageLoader.load('javascript');
    expect(javascriptLanguage).toBeDefined();

    const javascriptHost = document.createElement('div');
    document.body.appendChild(javascriptHost);

    const javascriptCm = new CodeMirror({
      parent: javascriptHost,
      state: EditorState.create({
        doc: 'const value = count + 1;',
        extensions: [
          javascriptLanguage!,
          ...createCodeBlockEditorTheme(),
        ],
      }),
    });

    expect(forceParsing(javascriptCm, javascriptCm.state.doc.length, 1000)).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(javascriptCm.dom.querySelector('.cm-variable-2')).toBeInstanceOf(HTMLElement);
    expect(javascriptCm.dom.querySelector('.token.variable')).toBeInstanceOf(HTMLElement);

    javascriptCm.destroy();
    javascriptHost.remove();
  });

  it('keeps Prism aliases merged with CodeMirror aliases for specific token tags', () => {
    const methodClass = codeBlockCompatibilityHighlightStyle.style([tags.function(tags.propertyName)]);
    const localVariableClass = codeBlockCompatibilityHighlightStyle.style([tags.local(tags.variableName)]);
    const standardPropertyClass = codeBlockCompatibilityHighlightStyle.style([tags.standard(tags.propertyName)]);
    const modifierClass = codeBlockCompatibilityHighlightStyle.style([tags.modifier]);
    const escapeClass = codeBlockCompatibilityHighlightStyle.style([tags.escape]);
    const labelClass = codeBlockCompatibilityHighlightStyle.style([tags.labelName]);

    expect(methodClass).toContain('cm-property');
    expect(methodClass).toContain('token property');
    expect(methodClass).toContain('token method');
    expect(methodClass).toContain('token property-access');
    expect(localVariableClass).toContain('cm-variable');
    expect(localVariableClass).toContain('token variable');
    expect(localVariableClass).toContain('token dom');
    expect(localVariableClass).toContain('token parameter');
    expect(standardPropertyClass).toContain('cm-property');
    expect(standardPropertyClass).toContain('token builtin');
    expect(modifierClass).toContain('cm-keyword');
    expect(modifierClass).toContain('token keyword');
    expect(modifierClass).toContain('token important');
    expect(escapeClass).toContain('cm-string-2');
    expect(escapeClass).toContain('token regex');
    expect(escapeClass).toContain('token entity');
    expect(labelClass).toContain('cm-qualifier');
    expect(labelClass).toContain('token namespace');
    expect(labelClass).toContain('token entity');
  });

  it('adds the CodeMirror 6 special character alias used by Obsidian themes', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cm = new CodeMirror({
      parent: host,
      state: EditorState.create({
        doc: 'a\u200bb',
        extensions: [...createCodeBlockEditorTheme()],
      }),
    });

    const specialCharacter = cm.dom.querySelector('.cm-specialChar');
    expect(specialCharacter).toBeInstanceOf(HTMLElement);
    expect(specialCharacter?.getAttribute('aria-label')).toContain('zero width space');

    cm.destroy();
    host.remove();
  });
});
