import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { Schema } from '@milkdown/kit/prose/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installCodeBlockCrossBoundarySelection } from './codeBlockCrossBoundarySelection';

function createTestDocument() {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block' },
      code_block: { content: 'text*', group: 'block', code: true },
      text: { group: 'inline' },
    },
  });

  return {
    schema,
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('before')),
      schema.node('code_block', null, schema.text('code')),
      schema.node('paragraph', null, schema.text('after')),
    ]),
  };
}

function createSessionFixture() {
  const { doc, schema } = createTestDocument();
  let state = EditorState.create({ doc, schema });
  const viewDOM = document.createElement('div');
  const codeBlockDOM = document.createElement('div');
  const codeMirrorDOM = document.createElement('div');
  const codeMirrorContentDOM = document.createElement('div');
  const outsideDOM = document.createElement('div');
  codeMirrorDOM.appendChild(codeMirrorContentDOM);
  codeBlockDOM.appendChild(codeMirrorDOM);
  viewDOM.appendChild(codeBlockDOM);
  document.body.append(viewDOM, outsideDOM);

  const view = {
    dom: viewDOM,
    state,
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction);
      view.state = state;
    }),
    posAtCoords: vi.fn(({ left }: { left: number; top: number }) => ({
      pos: left < 50 ? 1 : 15,
    })),
  } as any;
  const codeMirror = {
    dom: codeMirrorDOM,
    contentDOM: codeMirrorContentDOM,
    posAtCoords: vi.fn(({ x }: { x: number; y: number }) => x < 50 ? 2 : null),
  } as any;

  return {
    codeBlockDOM,
    codeMirror,
    codeMirrorContentDOM,
    outsideDOM,
    view,
    getCodeBlockPosition: () => 8,
  };
}

function createMouseEvent(
  type: 'mousedown' | 'mousemove' | 'mouseup',
  target: EventTarget,
  clientX: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
    clientX,
    clientY: 10,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('installCodeBlockCrossBoundarySelection', () => {
  it('leaves CodeMirror in control while the pointer stays inside the code block', () => {
    const fixture = createSessionFixture();
    const dispose = installCodeBlockCrossBoundarySelection({
      codeMirror: fixture.codeMirror,
      codeBlockDOM: fixture.codeBlockDOM,
      getCodeBlockPosition: fixture.getCodeBlockPosition,
      getCodeBlockText: () => 'code',
      syncCodeBlockSelection: vi.fn(),
      view: fixture.view,
    });

    fixture.codeMirrorContentDOM.dispatchEvent(
      createMouseEvent('mousedown', fixture.codeMirrorContentDOM, 20),
    );
    fixture.codeMirrorContentDOM.dispatchEvent(
      createMouseEvent('mousemove', fixture.codeMirrorContentDOM, 30),
    );

    expect(fixture.view.dispatch).not.toHaveBeenCalled();
    dispose();
  });

  it('switches to a document selection after crossing the code block boundary', () => {
    const fixture = createSessionFixture();
    const syncCodeBlockSelection = vi.fn();
    const dispose = installCodeBlockCrossBoundarySelection({
      codeMirror: fixture.codeMirror,
      codeBlockDOM: fixture.codeBlockDOM,
      getCodeBlockPosition: fixture.getCodeBlockPosition,
      getCodeBlockText: () => 'code',
      syncCodeBlockSelection,
      view: fixture.view,
    });

    fixture.codeMirrorContentDOM.dispatchEvent(
      createMouseEvent('mousedown', fixture.codeMirrorContentDOM, 20),
    );
    const move = createMouseEvent('mousemove', fixture.outsideDOM, 100);
    document.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
    expect(fixture.view.state.selection).toBeInstanceOf(TextSelection);
    expect(fixture.view.state.selection.from).toBe(11);
    expect(fixture.view.state.selection.to).toBe(15);
    expect(syncCodeBlockSelection).toHaveBeenCalledOnce();

    const reverseMove = createMouseEvent('mousemove', fixture.outsideDOM, 10);
    document.dispatchEvent(reverseMove);
    expect(reverseMove.defaultPrevented).toBe(true);
    expect(fixture.view.state.selection.from).toBe(1);
    expect(fixture.view.state.selection.to).toBe(11);

    const up = createMouseEvent('mouseup', fixture.outsideDOM, 100);
    document.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);

    const nextMove = createMouseEvent('mousemove', fixture.outsideDOM, 10);
    document.dispatchEvent(nextMove);
    expect(fixture.view.state.selection.from).toBe(11);
    expect(fixture.view.state.selection.to).toBe(15);
    dispose();
  });
});
