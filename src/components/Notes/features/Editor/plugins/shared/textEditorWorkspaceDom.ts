import type { TextEditorPopupElements } from './textEditorPopupDom';

interface CreateTextEditorWorkspaceArgs {
  elements: TextEditorPopupElements;
  ariaLabel: string;
  classPrefix: string;
  heading: string;
  inputLabel: string;
  previewLabel: string;
}

export interface TextEditorWorkspaceElements {
  workspace: HTMLElement;
  header: HTMLElement;
  heading: HTMLElement;
  editorGrid: HTMLElement;
  inputPane: HTMLElement;
  previewPane: HTMLElement;
  preview: HTMLElement;
}

function workspaceClass(baseClass: string, classPrefix: string, suffix = '') {
  return `${baseClass} ${classPrefix}${suffix}`;
}

export function createTextEditorWorkspace(
  args: CreateTextEditorWorkspaceArgs,
): TextEditorWorkspaceElements {
  const {
    elements,
    ariaLabel,
    classPrefix,
    heading: headingText,
    inputLabel,
    previewLabel,
  } = args;
  const { textarea } = elements;

  const workspace = document.createElement('section');
  workspace.className = workspaceClass('text-editor-workspace', classPrefix);
  workspace.setAttribute('aria-label', ariaLabel);

  const header = document.createElement('header');
  header.className = workspaceClass('text-editor-workspace-header', classPrefix, '-header');
  const heading = document.createElement('span');
  heading.className = workspaceClass('text-editor-workspace-heading', classPrefix, '-heading');
  heading.textContent = headingText;
  header.append(heading);

  const editorGrid = document.createElement('div');
  editorGrid.className = workspaceClass(
    'text-editor-workspace-editor-grid',
    classPrefix,
    '-editor-grid',
  );

  const inputPane = document.createElement('section');
  inputPane.className = workspaceClass('text-editor-workspace-pane', classPrefix, '-pane');
  const inputHeading = document.createElement('h2');
  inputHeading.className = workspaceClass(
    'text-editor-workspace-pane-label',
    classPrefix,
    '-pane-label',
  );
  inputHeading.textContent = inputLabel;
  inputPane.append(inputHeading, textarea);

  const previewPane = document.createElement('section');
  previewPane.className = [
    workspaceClass('text-editor-workspace-pane', classPrefix, '-pane'),
    workspaceClass('text-editor-workspace-preview-pane', classPrefix, '-preview-pane'),
  ].join(' ');
  const previewHeading = document.createElement('h2');
  previewHeading.className = workspaceClass(
    'text-editor-workspace-pane-label',
    classPrefix,
    '-pane-label',
  );
  previewHeading.textContent = previewLabel;
  const preview = document.createElement('div');
  preview.className = workspaceClass('text-editor-workspace-preview', classPrefix, '-preview');
  preview.setAttribute('aria-live', 'polite');
  previewPane.append(previewHeading, preview);

  editorGrid.append(inputPane, previewPane);
  workspace.append(header, editorGrid);

  return { workspace, header, heading, editorGrid, inputPane, previewPane, preview };
}
