import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDiagnosticsLog, getDiagnosticsLogText } from '@/lib/diagnostics/diagnosticsLog';
import { reportNotesEditorFailure } from './editorFailureDiagnostics';

describe('notes editor failure diagnostics', () => {
  beforeEach(() => {
    clearDiagnosticsLog();
    delete (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop;
  });

  it('records timeout metadata without inventing an undefined error type', () => {
    reportNotesEditorFailure({
      reason: 'init-timeout',
      contentLength: 42,
      diskRevision: 3,
    });

    const report = JSON.parse(getDiagnosticsLogText());
    expect(report.entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: 'failure-init-timeout',
      details: {
        reason: 'init-timeout',
        contentLength: 42,
        diskRevision: 3,
      },
    }));
  });

  it('writes a timeout to the desktop error log with a phase and fallback message', () => {
    const reportRendererError = vi.fn().mockResolvedValue({});
    (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop = {
      platform: 'electron',
      app: { reportRendererError },
    };

    reportNotesEditorFailure({ reason: 'init-timeout' });

    expect(reportRendererError).toHaveBeenCalledWith(expect.objectContaining({
      source: 'notes-editor',
      type: 'init-timeout',
      name: 'NotesEditorFailure',
      message: 'The Markdown editor did not become ready before the fallback timeout.',
    }));
  });

  it('keeps the component stack in the desktop log but not copied diagnostics', () => {
    const reportRendererError = vi.fn().mockResolvedValue({});
    (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop = {
      platform: 'electron',
      app: { reportRendererError },
    };
    const componentStack = '\n    at MarkdownEditor (/workspace/private/MarkdownEditor.tsx:10:2)';

    reportNotesEditorFailure({
      reason: 'activation-error',
      error: new Error('Editor activation failed'),
      componentStack,
    });

    const report = JSON.parse(getDiagnosticsLogText());
    expect(report.entries).toContainEqual(expect.objectContaining({
      channel: 'notes-editor',
      event: 'failure-activation-error',
      details: expect.objectContaining({
        reason: 'activation-error',
        errorName: 'Error',
        errorMessage: 'Editor activation failed',
        hasComponentStack: true,
      }),
    }));
    expect(getDiagnosticsLogText()).not.toContain(componentStack);
    expect(reportRendererError).toHaveBeenCalledWith({
      source: 'notes-editor',
      type: 'activation-error',
      name: 'Error',
      message: 'Editor activation failed',
      stack: expect.stringContaining('Editor activation failed'),
      error: expect.any(Error),
      componentStack,
    });
  });

  it('leaves React render persistence to the error boundary', () => {
    const reportRendererError = vi.fn().mockResolvedValue({});
    (window as Window & { vlainaDesktop?: unknown }).vlainaDesktop = {
      platform: 'electron',
      app: { reportRendererError },
    };

    reportNotesEditorFailure({
      reason: 'render-error',
      error: new Error('Render failed'),
      componentStack: '\n    at MarkdownEditor',
    });

    expect(reportRendererError).not.toHaveBeenCalled();
  });
});
