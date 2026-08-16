import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextEditorPopupElements } from '../shared/textEditorPopupDom';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

const mocks = vi.hoisted(() => ({
  createCachedMermaidElement: vi.fn(() => null as HTMLElement | null),
  createMermaidElement: vi.fn(() => {
    const element = document.createElement('div');
    element.className = 'mermaid-block';
    return element;
  }),
  disposeMermaidElement: vi.fn(),
  renderMermaidEditorLivePreview: vi.fn(async () => true),
}));

vi.mock('./mermaidDom', () => ({
  createCachedMermaidElement: mocks.createCachedMermaidElement,
  createMermaidElement: mocks.createMermaidElement,
  disposeMermaidElement: mocks.disposeMermaidElement,
  renderMermaidEditorLivePreview: mocks.renderMermaidEditorLivePreview,
}));

import { configureMermaidEditorWorkspace } from './mermaidEditorWorkspace';

const expectedTemplateIds = [
  'flowchart',
  'sequence',
  'class',
  'state',
  'entity-relationship',
  'user-journey',
  'gantt',
  'pie',
  'quadrant',
  'requirement',
  'git',
  'c4',
  'mindmap',
  'timeline',
  'zenuml',
  'sankey',
  'xy-chart',
  'block',
  'packet',
  'kanban',
  'architecture',
  'radar',
  'treemap',
  'tree-view',
  'event-modeling',
  'ishikawa',
  'venn',
  'wardley',
];

describe('mermaidEditorWorkspace', () => {
  afterEach(() => {
    document.documentElement.lang = '';
    document.body.replaceChildren();
    mocks.createCachedMermaidElement.mockReset();
    mocks.createCachedMermaidElement.mockReturnValue(null);
    mocks.createMermaidElement.mockClear();
    mocks.disposeMermaidElement.mockReset();
    mocks.renderMermaidEditorLivePreview.mockClear();
  });

  it('builds the shared input and preview workspace with common templates', async () => {
    document.documentElement.lang = 'zh-CN';
    const elements = createTextEditorPopupElements();
    elements.textarea.value = 'flowchart TD\nA --> B';
    const notifyInput = vi.fn();
    const workspace = configureMermaidEditorWorkspace(elements, notifyInput);
    document.body.append(elements.card);

    expect(document.querySelector('.mermaid-editor-workspace-heading')).toHaveTextContent('Mermaid');
    expect(mermaidEditorTemplates.map((template) => template.id)).toEqual(expectedTemplateIds);
    expect(document.querySelectorAll('.mermaid-editor-workspace-template')).toHaveLength(28);
    expect(document.querySelectorAll('.mermaid-editor-workspace-template-preview')).toHaveLength(28);
    expect(document.querySelector<HTMLButtonElement>('[data-template-id="sequence"]'))
      ?.toHaveAttribute('aria-label', '时序图');
    expect(document.querySelector('.mermaid-editor-workspace-pane')).toContainElement(elements.textarea);
    expect(document.querySelector('.mermaid-editor-workspace-preview .mermaid-block')).toBeInTheDocument();
    expect(document.querySelector('.mermaid-editor-workspace-shortcuts-label')).not.toBeInTheDocument();
    expect(document.querySelector('.mermaid-editor-workspace-template-directive')).not.toBeInTheDocument();
    expect(mocks.createMermaidElement).toHaveBeenCalledTimes(1);
    expect(mocks.createMermaidElement).toHaveBeenCalledWith(
      'flowchart TD\nA --> B',
      { render: false },
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.renderMermaidEditorLivePreview).toHaveBeenCalledWith(expect.objectContaining({
      code: 'flowchart TD\nA --> B',
    }));
    expect(mocks.createMermaidElement).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.createMermaidElement).toHaveBeenCalledTimes(2);
    expect(mocks.createMermaidElement).toHaveBeenLastCalledWith(
      mermaidEditorTemplates[0].code,
      { preloadBackground: false, priority: 'background' },
    );

    workspace.cleanup();
    expect(mocks.disposeMermaidElement).toHaveBeenCalledTimes(2);
  });

  it('replaces the draft from a template and supports textarea indentation', () => {
    const elements = createTextEditorPopupElements();
    elements.textarea.value = 'old diagram';
    const notifyInput = vi.fn();
    const workspace = configureMermaidEditorWorkspace(elements, notifyInput);
    document.body.append(elements.card);

    document.querySelector<HTMLButtonElement>('[data-template-id="sequence"]')!.click();
    expect(elements.textarea.value).toBe(
      mermaidEditorTemplates.find((template) => template.id === 'sequence')!.code,
    );
    expect(notifyInput).toHaveBeenCalledTimes(1);

    elements.textarea.value = 'node';
    elements.textarea.setSelectionRange(4, 4);
    elements.textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));
    expect(elements.textarea.value).toBe('node  ');
    expect(notifyInput).toHaveBeenCalledTimes(2);

    document.querySelector<HTMLButtonElement>('.mermaid-editor-workspace-tool')!.click();
    expect(elements.textarea.value).toBe('');
    expect(notifyInput).toHaveBeenCalledTimes(3);

    workspace.cleanup();
  });

  it('shows cached previews immediately without restarting progressive rendering', async () => {
    mocks.createCachedMermaidElement.mockImplementation(() => {
      const element = document.createElement('div');
      element.className = 'mermaid-block';
      element.innerHTML = '<svg data-cached="true"></svg>';
      return element;
    });
    const elements = createTextEditorPopupElements();
    elements.textarea.value = 'flowchart TD\nA --> B';
    const workspace = configureMermaidEditorWorkspace(elements, vi.fn());
    document.body.append(elements.card);

    expect(mocks.createCachedMermaidElement).toHaveBeenCalledTimes(
      mermaidEditorTemplates.length + 1,
    );
    expect(mocks.createMermaidElement).not.toHaveBeenCalled();
    expect(document.querySelectorAll(
      '.mermaid-editor-workspace-template-preview [data-cached="true"]',
    )).toHaveLength(mermaidEditorTemplates.length);
    expect(document.querySelectorAll(
      '.mermaid-editor-workspace-template-preview .mermaid-placeholder',
    )).toHaveLength(0);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.createMermaidElement).not.toHaveBeenCalled();
    expect(mocks.renderMermaidEditorLivePreview).not.toHaveBeenCalled();

    workspace.cleanup();
    expect(mocks.disposeMermaidElement).toHaveBeenCalledTimes(
      mermaidEditorTemplates.length + 1,
    );
  });

  it('coalesces preview renders while keeping only the latest draft', async () => {
    const elements = createTextEditorPopupElements();
    let releaseFirstRender = () => {};
    mocks.renderMermaidEditorLivePreview.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseFirstRender = () => resolve(true);
      }),
    );
    const workspace = configureMermaidEditorWorkspace(elements, vi.fn());
    document.body.append(elements.card);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    releaseFirstRender();
    await Promise.resolve();
    mocks.renderMermaidEditorLivePreview.mockClear();
    let releaseSecondRender = () => {};
    mocks.renderMermaidEditorLivePreview.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseSecondRender = () => resolve(true);
      }),
    );

    workspace.renderPreview('older diagram');
    workspace.renderPreview('latest diagram');
    await vi.waitFor(() => {
      expect(mocks.renderMermaidEditorLivePreview).toHaveBeenCalledTimes(1);
    });

    releaseSecondRender();
    await vi.waitFor(() => {
      expect(mocks.renderMermaidEditorLivePreview).toHaveBeenLastCalledWith(expect.objectContaining({
        code: 'latest diagram',
      }));
    });
    workspace.cleanup();
  });

  it('does not render the same draft twice around the initial frame', async () => {
    const elements = createTextEditorPopupElements();
    elements.textarea.value = 'same diagram';
    let releaseRender = () => {};
    mocks.renderMermaidEditorLivePreview.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseRender = () => resolve(true);
      }),
    );
    const workspace = configureMermaidEditorWorkspace(elements, vi.fn());
    document.body.append(elements.card);
    workspace.renderPreview('same diagram');
    await vi.waitFor(() => {
      expect(mocks.renderMermaidEditorLivePreview).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.renderMermaidEditorLivePreview).toHaveBeenCalledTimes(1);
    releaseRender();
    workspace.cleanup();
  });
});
