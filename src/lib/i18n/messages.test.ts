import { describe, expect, it } from 'vitest';
import { APP_LANGUAGES } from './languages';
import { getMessages, localizedMessages, messageKeys, type MessageKey } from './messages';

function expectLocalizedOutsideEnglish(keys: readonly MessageKey[]): void {
  const englishMessages = getMessages('en');

  for (const language of APP_LANGUAGES) {
    if (language.code === 'en') continue;
    const messages = getMessages(language.code);
    for (const key of keys) {
      expect(messages[key], `${language.code}:${key}`).not.toBe(englishMessages[key]);
    }
  }
}

describe('i18n messages', () => {
  it('provides every menu message for each supported app language', () => {
    for (const language of APP_LANGUAGES) {
      const messages = getMessages(language.code);

      for (const key of messageKeys) {
        expect(messages[key], `${language.code}:${key}`).toEqual(expect.any(String));
        expect(messages[key].trim(), `${language.code}:${key}`).not.toBe('');
      }
    }
  });

  it('keeps simplified Chinese fully localized', () => {
    const englishMessages = getMessages('en');
    const simplifiedChineseMessages = getMessages('zh-CN');
    const stableProductKeys = new Set([
      'settings.tabs.ai',
      'settings.tabs.markdown',
      'settings.about.github',
      'settings.about.discord',
      'settings.about.slack',
      'notesRoot.pathPlaceholder',
      'icon.emoji',
    ]);

    for (const key of messageKeys) {
      if (stableProductKeys.has(key)) continue;
      expect(simplifiedChineseMessages[key], key).not.toBe(englishMessages[key]);
    }
  });

  it('uses canonical Chinese list labels for editor block types', () => {
    expect(getMessages('zh-CN')).toMatchObject({
      'editor.blockType.taskList': '待办',
      'editor.blockType.bulletList': '无序列表',
      'editor.blockType.orderedList': '有序列表',
    });
    expect(getMessages('zh-Hant')).toMatchObject({
      'editor.blockType.taskList': '待辦',
      'editor.blockType.bulletList': '無序列表',
      'editor.blockType.orderedList': '有序列表',
    });
  });

  it('keeps recently added editor action labels localized outside English', () => {
    const editorActionKeys = [
      'editor.mathPlaceholder',
      'editor.mermaidPlaceholder',
      'editor.htmlBlockPlaceholder',
      'editor.frontmatterPlaceholder',
      'editor.insertImage',
      'editor.linkUrlHint',
      'editor.videoUrlPlaceholder',
      'editor.videoUrlHint',
      'editor.align',
      'editor.mermaidRenderTooLarge',
      'editor.tocEmpty',
    ] as const;

    expectLocalizedOutsideEnglish(editorActionKeys);
  });

  it('keeps the Git workflow localized outside English', () => {
    const gitWorkflowKeys = [
      'git.sync',
      'git.changes',
      'git.history',
      'git.noRemote',
      'git.noHistory',
      'git.commitMessage',
      'git.commitMessagePlaceholder',
      'git.selectAll',
      'git.selectedCount',
      'git.currentTime',
      'git.loading',
      'git.commitSuccess',
      'git.pullSuccess',
      'git.pushSuccess',
      'git.operationFailed',
      'git.saveBeforeOperationFailed',
      'git.detachedHead',
      'git.detachedUnavailable',
      'git.conflicted',
      'git.conflicts',
      'git.diverged',
      'git.unsupportedRemote',
      'git.authenticationFailed',
      'git.identityMissing',
      'git.networkUnavailable',
      'git.diffTooLarge',
      'git.retry',
      'git.diffEmpty',
      'git.resizePopover',
    ] as const;

    expectLocalizedOutsideEnglish(gitWorkflowKeys);
  });

  it('keeps user-facing account and chat error labels localized outside English', () => {
    const userFacingErrorKeys = [
      'account.error.loginFailed',
      'account.error.emailSignInFailed',
      'account.error.invalidEmailAddress',
      'account.error.alreadySignedInWithEmail',
      'account.error.sendVerificationCodeFailed',
      'account.error.webSignInUnavailable',
      'account.error.invalidVerificationCode',
      'account.error.incorrectVerificationCode',
      'account.error.invalidOrExpiredVerificationCode',
      'account.error.registrationNotAllowed',
      'account.error.tooManyVerificationRequests',
      'account.error.signOutFailed',
      'account.error.expiredVerificationCode',
      'account.error.tooManyVerificationAttempts',
      'account.error.secureStorageUnavailable',
      'account.error.network',
      'account.error.signInAgain',
      'account.error.timeout',
      'app.closeSaveFailedTitle',
      'app.closeSaveFailedDescription',
      'settings.appearance.openThemeFolderFailed',
      'notes.exportFailed',
      'asset.uploadFailed',
      'chat.error.providerNotFound',
      'chat.error.channelOff',
      'chat.error.network',
      'chat.error.customProviderConnectionFailed',
      'chat.error.timeout',
      'chat.error.authExpired',
      'chat.error.authFailed',
      'chat.error.invalidRequest',
      'chat.error.managedTextOnly',
      'chat.error.pointsExhausted',
      'chat.error.sessionLoadFailed',
      'chat.error.deleteSessionFailed',
      'chat.error.clearSessionsFailed',
      'chat.newChatTitle',
      'chat.temporaryChatTitle',
      'chat.webSearch.searching',
      'chat.webSearch.results',
      'chat.webSearch.reading',
      'chat.webSearch.complete',
      'chat.webSearch.noRelevantResults',
      'chat.webSearch.unableToReadPage',
      'chat.webSearch.blockedSource',
      'chat.webSearch.blockedPage',
      'chat.webSearch.contentTooShort',
      'chat.webSearch.pageTimedOut',
      'chat.webSearch.pageUnreachable',
      'chat.webSearch.pageHttpError',
      'chat.webSearch.unavailable',
      'chat.webSearch.unavailableForModel',
    ] as const;

    expectLocalizedOutsideEnglish(userFacingErrorKeys);
  });

  it('keeps accessibility labels localized outside English', () => {
    const accessibilityKeys = [
      'common.closeWindow',
      'common.minimizeWindow',
      'common.maximizeWindow',
      'common.delete',
      'common.icon',
      'common.preview',
      'command.paletteTitle',
      'command.paletteDescription',
      'chat.temporaryChatOn',
      'chat.copyMessage',
      'chat.editMessage',
      'chat.expandMessage',
      'chat.collapseMessage',
      'chat.regenerateResponse',
      'chat.branchConversation',
      'chat.previousMessageVersion',
      'chat.nextMessageVersion',
      'chat.removeAttachment',
      'chat.attachment',
      'chat.loadRemoteContent',
      'chat.addToFavorites',
      'chat.removeFromFavorites',
      'chat.priceTier',
      'chat.waitingForResponse',
      'icon.copyPickerLogs',
      'icon.skinToneDefault',
      'icon.skinToneLight',
      'icon.skinToneMediumLight',
      'icon.skinToneMedium',
      'icon.skinToneMediumDark',
      'icon.skinToneDark',
      'editor.markdownSourceEditor',
      'editor.dragBlock',
      'cover.imageAlt',
      'cover.frozenAlt',
      'cover.previewAlt',
      'cover.cropperAlt',
      'sidebar.openFileMenu',
      'sidebar.openFolderMenu',
    ] as const;

    expectLocalizedOutsideEnglish(accessibilityKeys);
  });

  it('keeps audited settings and asset labels localized outside English', () => {
    const auditedUiKeys = [
      'settings.appearance.colorMode',
      'settings.appearance.colorModeDescription',
      'settings.appearance.darkMode',
      'settings.appearance.display',
      'settings.appearance.lightMode',
      'settings.appearance.systemMode',
      'settings.appearance.theme',
      'settings.appearance.theme.default',
      'settings.appearance.openThemeFolder',
      'settings.appearance.themeDescription',
      'settings.ai.openaiCompatibleProvider',
      'settings.ai.openaiCompatibleProviderDescription',
      'editor.addLink',
      'editor.highlight',
      'chat.favorites',
      'chat.customModels',
      'notes.addToStarred',
      'notes.export',
      'notes.exported',
      'notes.saveOrDiscardDraftsBeforeOpeningAnotherFolder',
      'notes.copyPathFailed',
      'notes.openFileLocationFailed',
      'notes.openFolderLocationFailed',
      'notes.openInNewWindowFailed',
      'asset.onlyImageFilesSupported',
      'asset.fileExceedsMaxSize',
      'asset.uploading',
      'asset.alreadyInLibrary',
      'asset.uploadComplete',
      'sidebar.mobileTitle',
      'sidebar.mobileDescription',
    ] as const;

    expectLocalizedOutsideEnglish(auditedUiKeys);
  });

  it('uses Traditional Chinese for editor action labels', () => {
    expect(getMessages('zh-Hant')).toMatchObject({
      'editor.changeCalloutIcon': '更換標註圖示',
      'editor.images': '圖片',
      'editor.align': '對齊',
    });
  });

  it('uses sign-in copy for email-code submit buttons', () => {
    const expectedVerifyCodeLabels = {
      en: 'Verify and Sign In',
      'zh-CN': '验证并登录',
      'zh-Hant': '驗證並登入',
      ja: '認証してログイン',
      ko: '인증하고 로그인',
      fr: 'Vérifier et se connecter',
      de: 'Bestätigen und anmelden',
      es: 'Verificar e iniciar sesión',
      'pt-BR': 'Verificar e entrar',
      it: 'Verifica e accedi',
      ru: 'Подтвердить и войти',
      tr: 'Doğrula ve giriş yap',
      vi: 'Xác minh và đăng nhập',
      id: 'Verifikasi dan masuk',
      th: 'ยืนยันและเข้าสู่ระบบ',
    } as const;

    for (const language of APP_LANGUAGES) {
      expect(getMessages(language.code)['account.verifyCode'], language.code).toBe(
        expectedVerifyCodeLabels[language.code]
      );
    }
  });

  it('keeps every localized language complete before English fallback can apply', () => {
    for (const language of APP_LANGUAGES) {
      if (language.code === 'en') continue;
      const messages = localizedMessages[language.code];

      expect(Object.keys(messages).sort(), language.code).toEqual([...messageKeys].sort());
      for (const key of messageKeys) {
        expect(messages[key], `${language.code}:${key}`).toEqual(expect.any(String));
        expect(messages[key].trim(), `${language.code}:${key}`).not.toBe('');
      }
    }
  });

  it('keeps interpolation placeholders identical across localized languages', () => {
    const englishMessages = getMessages('en');
    const getPlaceholders = (message: string) => [...message.matchAll(/\{\w+\}/g)].map(([value]) => value).sort();

    for (const language of APP_LANGUAGES) {
      if (language.code === 'en') continue;
      const messages = localizedMessages[language.code];

      for (const key of messageKeys) {
        expect(getPlaceholders(messages[key]), `${language.code}:${key}`).toEqual(
          getPlaceholders(englishMessages[key])
        );
      }
    }
  });
});
