import { translate } from '@/lib/i18n';
import { createDefaultMermaidThemeConfig } from '@/lib/notes/mermaid/mermaidTheme';
import { getFirstMermaidDirective } from './mermaidDirective';
import {
  waitForMermaidInteractionIdle,
  type MermaidRenderPriority,
} from './mermaidRenderScheduler';

let mermaidInstance: any = null;
let mermaidPromise: Promise<any> | null = null;
let zenumlRegistrationPromise: Promise<boolean> | null = null;
let zenumlRegistered = false;
let zenumlAvailable = true;
let mermaidAvailable = true;
let mermaidCounter = 0;
let mermaidWarmupComplete = false;
let mermaidWarmupPromise: Promise<void> | null = null;
let resolveMermaidWarmup = () => {};

type ConsoleMethodName = 'debug' | 'error' | 'info' | 'log' | 'warn';

export const MAX_MERMAID_CODE_CHARS = 20_000;
export const MERMAID_RENDER_TIMEOUT_MS = 5000;
const MERMAID_INIT_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  logLevel: 'fatal',
  fontFamily: 'inherit',
  flowchart: {
    htmlLabels: false,
  },
} as const;

const CONSOLE_METHODS_TO_SUPPRESS: ConsoleMethodName[] = ['debug', 'error', 'info', 'log', 'warn'];
const suppressedConsoleMethods = new Map<ConsoleMethodName, typeof console[ConsoleMethodName]>();
let consoleSuppressionDepth = 0;

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mermaidRenderErrorMarkup(): string {
  return `<div class="mermaid-error">${escapeHtmlText(translate('editor.mermaidRenderError'))}</div>`;
}

async function getMermaid() {
  if (!mermaidAvailable) return null;
  if (mermaidInstance) return mermaidInstance;

  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      try {
        const m = await import('mermaid');
        mermaidInstance = m.default;
        mermaidInstance.initialize(createMermaidRenderConfig());
        return mermaidInstance;
      } catch {
        mermaidAvailable = false;
        return null;
      }
    })();
  }

  return mermaidPromise;
}

function isZenumlDiagram(code: string): boolean {
  return getFirstMermaidDirective(code) === 'zenuml';
}

async function ensureZenumlExternalDiagram(mermaid: any): Promise<boolean> {
  if (zenumlRegistered) return true;
  if (!zenumlAvailable) return false;

  if (!zenumlRegistrationPromise) {
    zenumlRegistrationPromise = (async () => {
      try {
        const zenuml = await import('@mermaid-js/mermaid-zenuml');
        await mermaid.registerExternalDiagrams([zenuml.default]);
        zenumlRegistered = true;
        return true;
      } catch {
        zenumlAvailable = false;
        return false;
      }
    })();
  }

  return zenumlRegistrationPromise;
}

function createMermaidRenderConfig() {
  return {
    ...MERMAID_INIT_CONFIG,
    ...createDefaultMermaidThemeConfig(),
  };
}

async function withoutThirdPartyConsoleOutput<T>(action: () => Promise<T>): Promise<T> {
  if (consoleSuppressionDepth === 0) {
    for (const method of CONSOLE_METHODS_TO_SUPPRESS) {
      suppressedConsoleMethods.set(method, console[method]);
      console[method] = () => undefined;
    }
  }
  consoleSuppressionDepth += 1;

  try {
    return await action();
  } finally {
    consoleSuppressionDepth -= 1;
    if (consoleSuppressionDepth === 0) {
      for (const [method, originalMethod] of suppressedConsoleMethods) {
        console[method] = originalMethod;
      }
      suppressedConsoleMethods.clear();
    }
  }
}

function runWithTimeout<T>(action: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Mermaid render timed out.')));
    }, timeoutMs);

    Promise.resolve()
      .then(action)
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}

export function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${mermaidCounter++}`;
}

function createMermaidRenderContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined' || !document.body) {
    return undefined;
  }

  const container = document.createElement('div');
  container.dataset.mermaidRenderHost = 'true';
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    contain: 'layout style paint',
    left: '-10000px',
    opacity: '0',
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'absolute',
    top: '-10000px',
    width: '1200px',
  });
  document.body.appendChild(container);
  return container;
}

async function acquireMermaidWarmup(priority: MermaidRenderPriority) {
  if (mermaidWarmupComplete) return null;
  if (mermaidWarmupPromise) {
    await mermaidWarmupPromise;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await waitForMermaidInteractionIdle(priority);
    return null;
  }

  mermaidWarmupPromise = new Promise<void>((resolve) => {
    resolveMermaidWarmup = resolve;
  });
  return () => {
    mermaidWarmupComplete = true;
    resolveMermaidWarmup();
    mermaidWarmupPromise = null;
  };
}

export async function renderMermaid(
  code: string,
  id: string,
  priority: MermaidRenderPriority = 'background',
): Promise<string> {
  if (code.length > MAX_MERMAID_CODE_CHARS) {
    return `<div class="mermaid-error">${escapeHtmlText(translate('editor.mermaidRenderTooLarge'))}</div>`;
  }

  const mermaid = await getMermaid();

  if (!mermaid) {
    return `<div class="mermaid-error">${escapeHtmlText(translate('editor.mermaidNotAvailable'))}</div>`;
  }

  const releaseWarmup = await acquireMermaidWarmup(priority);
  try {
    mermaid.initialize(createMermaidRenderConfig());
    if (isZenumlDiagram(code) && !(await ensureZenumlExternalDiagram(mermaid))) {
      return mermaidRenderErrorMarkup();
    }
    const renderContainer = createMermaidRenderContainer();
    try {
      const { svg } = await withoutThirdPartyConsoleOutput<{ svg: string }>(() =>
        runWithTimeout(
          () => renderContainer
            ? mermaid.render(id, code, renderContainer)
            : mermaid.render(id, code),
          MERMAID_RENDER_TIMEOUT_MS
        )
      );
      return normalizeMermaidRenderMarkup(svg);
    } finally {
      renderContainer?.remove();
    }
  } catch {
    return mermaidRenderErrorMarkup();
  } finally {
    releaseWarmup?.();
  }
}

export function normalizeMermaidRenderMarkup(markup: string): string {
  return isMermaidSyntaxErrorMarkup(markup) ? mermaidRenderErrorMarkup() : markup;
}

function isMermaidSyntaxErrorMarkup(markup: string): boolean {
  return /class=(["'])error-(?:text|icon)\1/.test(markup)
    || markup.includes('Syntax error in text');
}
