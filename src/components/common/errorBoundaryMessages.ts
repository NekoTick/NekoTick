import { translate, type MessageKey } from '@/lib/i18n';

export const GITHUB_ISSUES_URL = 'https://github.com/vladelaina/vlaina/issues';
export const SUPPORT_EMAIL = 'hi@vlaina.com';
export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`;

const FALLBACK_MESSAGES = {
  'common.somethingWentWrong': 'Something went wrong',
  'common.errorReportInstruction': `Please copy this error report and email it to ${SUPPORT_EMAIL} as soon as possible. A diagnostic log was also saved in the system configuration folder.`,
  'common.logFile': 'Log file',
  'common.errorDetails': 'Error details',
  'common.copied': 'Copied',
  'common.copyErrorReport': 'Copy error report',
  'common.closeWindow': 'Close window',
  'common.minimizeWindow': 'Minimize window',
  'common.maximizeWindow': 'Maximize window',
  'common.openLogFolder': 'Open log folder',
  'common.tryAgain': 'Try again',
  'common.reload': 'Reload',
  'common.reportOnGitHub': 'Open GitHub Issues',
  'storage.saveFailed': 'Failed to save changes securely. Please try again.',
} satisfies Partial<Record<MessageKey, string>>;

export function safeTranslate(key: keyof typeof FALLBACK_MESSAGES) {
  try {
    return translate(key);
  } catch {
    return FALLBACK_MESSAGES[key];
  }
}

export function sanitizeReportLocationHref(href: string): string {
  try {
    const url = new URL(href);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}
