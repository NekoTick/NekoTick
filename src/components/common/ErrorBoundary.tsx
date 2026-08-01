import { Component, Fragment, version as reactVersion, type ErrorInfo, type ReactNode } from 'react';
import { writeTextToClipboard } from '@/lib/clipboard';
import { getElectronBridge } from '@/lib/electron/bridge';
import { ErrorWindowChrome } from './ErrorBoundaryChrome';
import { GITHUB_ISSUES_URL, SUPPORT_EMAIL, SUPPORT_EMAIL_HREF, safeTranslate, sanitizeReportLocationHref } from './errorBoundaryMessages';
import { prepareNotesForReload } from '@/stores/notes/prepareNotesForReload';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
  appVersion: string | null;
  logFilePath: string | null;
  reportedAt: string | null;
  isReloading: boolean;
  reloadFailed: boolean;
}

const SUPPORT_EMAIL_LINK_CLASS =
  'inline p-0 font-medium text-[var(--vlaina-accent)] underline-offset-4 hover:text-[var(--vlaina-accent-hover)] hover:underline';

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    componentStack: '',
    copied: false,
    appVersion: null,
    logFilePath: null,
    reportedAt: null,
    isReloading: false,
    reloadFailed: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      componentStack: '',
      copied: false,
      appVersion: null,
      logFilePath: null,
      reportedAt: new Date().toISOString(),
      isReloading: false,
      reloadFailed: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[vlaina] React error boundary caught an error:', error, info);
    }

    const componentStack = info.componentStack ?? '';
    const reportedAt = new Date().toISOString();
    this.setState({ componentStack, reportedAt });

    const desktopApp = getElectronBridge()?.app;
    void Promise.all([
      desktopApp?.getVersion?.().catch(() => null) ?? Promise.resolve(null),
      desktopApp?.reportRendererError?.({
        source: 'react-error-boundary',
        type: 'react',
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack,
        error,
        reactVersion,
        buildMode: import.meta.env.MODE,
        isDev: import.meta.env.DEV,
        isProd: import.meta.env.PROD,
      }).catch(() => null) ?? Promise.resolve(null),
    ]).then(([appVersion, logInfo]) => {
      this.setState({
        appVersion,
        logFilePath: logInfo?.logFilePath ?? logInfo?.currentLogFilePath ?? null,
      });
    });
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({
        error: null,
        componentStack: '',
        copied: false,
        appVersion: null,
        logFilePath: null,
        reportedAt: null,
        isReloading: false,
        reloadFailed: false,
      });
    }
  }

  private handleReload = async () => {
    if (this.state.isReloading) return;

    this.setState({ isReloading: true, reloadFailed: false });
    const isSafeToReload = await prepareNotesForReload();
    if (!isSafeToReload) {
      this.setState({ isReloading: false, reloadFailed: true });
      return;
    }
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({
      error: null,
      componentStack: '',
      copied: false,
      appVersion: null,
      logFilePath: null,
      reportedAt: null,
      isReloading: false,
      reloadFailed: false,
    });
  };

  private buildErrorReport = () => {
    const { error, componentStack, appVersion, reportedAt } = this.state;
    if (!error) return '';

    const lines = [
      'vlaina error report',
      `Time: ${reportedAt ?? new Date().toISOString()}`,
      `Version: ${appVersion ?? 'unknown'}`,
      `React: ${reactVersion}`,
      `Build: mode=${import.meta.env.MODE} dev=${String(import.meta.env.DEV)} prod=${String(import.meta.env.PROD)}`,
      `Support email: ${SUPPORT_EMAIL}`,
      `URL: ${sanitizeReportLocationHref(window.location.href)}`,
      `User agent: ${navigator.userAgent}`,
      `Language: ${navigator.language}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`,
      `Online: ${navigator.onLine}`,
      `Document: visibility=${document.visibilityState} focus=${String(document.hasFocus())}`,
      '',
      `${error.name || 'Error'}: ${error.message || 'Unknown error'}`,
      '',
      'Stack:',
      error.stack || '(none)',
      '',
      'Component stack:',
      componentStack || '(none)',
    ];

    return lines.join('\n');
  };

  private handleCopyErrorReport = async () => {
    const copied = await writeTextToClipboard(this.buildErrorReport());
    if (!copied) return;

    this.setState({ copied: true });
    window.setTimeout(() => {
      this.setState({ copied: false });
    }, 1200);
  };

  private handleOpenLogFolder = () => {
    void getElectronBridge()?.app?.openErrorLogFolder?.().catch(() => undefined);
  };

  private handleOpenGitHubIssues = () => {
    const shell = getElectronBridge()?.shell;
    if (shell?.openExternal) {
      void shell.openExternal(GITHUB_ISSUES_URL).catch(() => undefined);
      return;
    }

    try {
      window.open(GITHUB_ISSUES_URL, '_blank', 'noopener,noreferrer');
    } catch {
    }
  };

  private handleOpenSupportEmail = () => {
    const shell = getElectronBridge()?.shell;
    if (shell?.openExternal) {
      void shell.openExternal(SUPPORT_EMAIL_HREF).catch(() => undefined);
      return;
    }

    try {
      window.open(SUPPORT_EMAIL_HREF, '_blank', 'noopener,noreferrer');
    } catch {
    }
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorReport = this.buildErrorReport();
      const errorReportInstruction = safeTranslate('common.errorReportInstruction');
      const errorReportInstructionParts = errorReportInstruction.split(SUPPORT_EMAIL);

      return (
        <div className="flex h-full min-h-screen w-full flex-col bg-background">
          <ErrorWindowChrome />
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="w-full max-w-3xl space-y-4 text-left">
              <h2 className="text-lg font-semibold text-foreground">
                {safeTranslate('common.somethingWentWrong')}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {errorReportInstructionParts.map((part, index) => (
                  <Fragment key={`${part}-${index}`}>
                    {part}
                    {index < errorReportInstructionParts.length - 1 ? (
                      <button
                        type="button"
                        onClick={this.handleOpenSupportEmail}
                        className={SUPPORT_EMAIL_LINK_CLASS}
                      >
                        {SUPPORT_EMAIL}
                      </button>
                    ) : null}
                  </Fragment>
                ))}
              </p>
              {this.state.logFilePath ? (
                <p className="break-all text-xs text-muted-foreground">
                  {safeTranslate('common.logFile')}: {this.state.logFilePath}
                </p>
              ) : null}
              {this.state.reloadFailed ? (
                <p role="alert" className="text-sm text-destructive">
                  {safeTranslate('storage.saveFailed')}
                </p>
              ) : null}
              <div>
                <div className="mb-2 text-sm font-medium text-foreground">
                  {safeTranslate('common.errorDetails')}
                </div>
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-3 text-left text-xs leading-5 text-muted-foreground">
                  {errorReport}
                </pre>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={this.handleCopyErrorReport}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  {this.state.copied
                    ? safeTranslate('common.copied')
                    : safeTranslate('common.copyErrorReport')}
                </button>
                {getElectronBridge()?.app?.openErrorLogFolder ? (
                  <button
                    type="button"
                    onClick={this.handleOpenLogFolder}
                    className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
                  >
                    {safeTranslate('common.openLogFolder')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={this.handleDismiss}
                  className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
                >
                  {safeTranslate('common.tryAgain')}
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  disabled={this.state.isReloading}
                  className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
                >
                  {safeTranslate('common.reload')}
                </button>
              </div>
              <button
                type="button"
                onClick={this.handleOpenGitHubIssues}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {safeTranslate('common.reportOnGitHub')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
