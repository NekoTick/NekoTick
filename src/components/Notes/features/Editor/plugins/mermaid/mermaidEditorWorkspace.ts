import type { TextEditorPopupElements } from '../shared/textEditorPopupDom';
import { createTextEditorWorkspace } from '../shared/textEditorWorkspaceDom';
import {
  createMermaidElement,
  disposeMermaidElement,
  renderMermaidEditorLivePreview,
} from './mermaidDom';
import { mermaidEditorTemplates } from './mermaidEditorTemplates';

function getMermaidEditorCopy() {
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  return isChinese
    ? { templates: '全部图表', input: '输入', preview: '渲染', clear: '清空' }
    : { templates: 'All diagrams', input: 'Input', preview: 'Preview', clear: 'Clear' };
}

export function configureMermaidEditorWorkspace(
  elements: TextEditorPopupElements,
  notifyInput: () => void,
) {
  const { content, textarea } = elements;
  let isCleanedUp = false;
  let isPreviewRendering = false;
  let activePreviewCode: string | null = null;
  let queuedPreviewCode: string | null = null;
  const copy = getMermaidEditorCopy();
  const {
    workspace,
    header,
    inputPane,
    preview,
  } = createTextEditorWorkspace({
    elements,
    ariaLabel: 'Mermaid',
    classPrefix: 'mermaid-editor-workspace',
    heading: 'Mermaid',
    inputLabel: copy.input,
    previewLabel: copy.preview,
  });

  const shortcuts = document.createElement('section');
  shortcuts.className = 'mermaid-editor-workspace-shortcuts';
  shortcuts.setAttribute('aria-label', copy.templates);
  const templateList = document.createElement('div');
  templateList.className = 'mermaid-editor-workspace-template-list';
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');

  mermaidEditorTemplates.forEach((template) => {
    const label = isChinese ? template.labelZh : template.label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mermaid-editor-workspace-template';
    button.dataset.templateId = template.id;
    button.setAttribute('aria-label', label);
    const name = document.createElement('span');
    name.className = 'mermaid-editor-workspace-template-name';
    name.textContent = label;
    button.append(name);
    button.addEventListener('click', () => {
      textarea.value = template.code;
      textarea.setSelectionRange(template.code.length, template.code.length);
      textarea.focus();
      notifyInput();
    });
    templateList.append(button);
  });
  shortcuts.append(templateList);

  const tools = document.createElement('div');
  tools.className = 'mermaid-editor-workspace-tools';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'mermaid-editor-workspace-tool';
  clearButton.textContent = copy.clear;
  clearButton.setAttribute('aria-label', copy.clear);
  clearButton.addEventListener('click', () => {
    textarea.value = '';
    textarea.focus();
    notifyInput();
  });
  tools.append(clearButton);
  inputPane.append(tools);

  preview.classList.add('markdown-surface');
  const previewSurface = createMermaidElement(textarea.value, { render: false });
  previewSurface.classList.add('mermaid-editor-workspace-preview-content');
  preview.append(previewSurface);

  header.after(shortcuts);
  content.prepend(workspace);

  const handleTextareaKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText('  ', start, end, 'end');
    notifyInput();
  };
  textarea.addEventListener('keydown', handleTextareaKeyDown);

  const flushPreview = () => {
    if (isCleanedUp || isPreviewRendering || queuedPreviewCode === null) return;
    const nextCode = queuedPreviewCode;
    queuedPreviewCode = null;
    activePreviewCode = nextCode;
    isPreviewRendering = true;
    void renderMermaidEditorLivePreview({
      anchor: previewSurface,
      code: nextCode,
    })
      .catch(() => undefined)
      .finally(() => {
        isPreviewRendering = false;
        activePreviewCode = null;
        flushPreview();
      });
  };
  const renderPreview = (code: string) => {
    if (code === activePreviewCode) {
      queuedPreviewCode = null;
      return;
    }
    if (code === queuedPreviewCode) return;
    queuedPreviewCode = code;
    flushPreview();
  };
  let initialRenderFrame: number | undefined = requestAnimationFrame(() => {
    initialRenderFrame = undefined;
    renderPreview(textarea.value);
  });

  return {
    renderPreview,
    cleanup() {
      isCleanedUp = true;
      activePreviewCode = null;
      queuedPreviewCode = null;
      if (initialRenderFrame !== undefined) cancelAnimationFrame(initialRenderFrame);
      initialRenderFrame = undefined;
      textarea.removeEventListener('keydown', handleTextareaKeyDown);
      disposeMermaidElement(previewSurface);
    },
  };
}
