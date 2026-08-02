const {
  createAccountApi,
  createAiProviderApi,
  createComputerApi,
  createWebSearchApi,
} = require('./preloadRequestApis.cjs');

function createDesktopApi(deps) {
  const {
    callIpcCallback,
    createRendererErrorReport,
    hostPlatform,
    ipcRenderer,
    normalizeDesktopBinaryWritePayload,
    normalizeDesktopTextWritePayload,
    onOpenMarkdownFile,
    requireSafeIpcRequestId,
    webUtils,
  } = deps;

  return {
    platform: 'electron',
    getPlatform() {
      return ipcRenderer.invoke('desktop:get-platform');
    },
    window: {
      minimize() {
        return ipcRenderer.invoke('desktop:window:minimize');
      },
      toggleMaximize() {
        return ipcRenderer.invoke('desktop:window:maximize-toggle');
      },
      close() {
        return ipcRenderer.invoke('desktop:window:close');
      },
      confirmClose() {
        return ipcRenderer.invoke('desktop:window:confirm-close');
      },
      isMaximized() {
        return ipcRenderer.invoke('desktop:window:is-maximized');
      },
      setResizable(resizable) {
        return ipcRenderer.invoke('desktop:window:set-resizable', resizable);
      },
      setMaximizable(maximizable) {
        return ipcRenderer.invoke('desktop:window:set-maximizable', maximizable);
      },
      setMinSize(width, height) {
        return ipcRenderer.invoke('desktop:window:set-min-size', width, height);
      },
      setSize(width, height) {
        return ipcRenderer.invoke('desktop:window:set-size', width, height);
      },
      setThemeColors(colors) {
        return ipcRenderer.invoke('desktop:window:set-theme-colors', colors);
      },
      setTitleBarOverlayVisible(visible) {
        return ipcRenderer.invoke('desktop:window:set-titlebar-overlay-visible', visible);
      },
      center() {
        return ipcRenderer.invoke('desktop:window:center');
      },
      getSize() {
        return ipcRenderer.invoke('desktop:window:get-size');
      },
      getLabel() {
        return ipcRenderer.invoke('desktop:window:get-label');
      },
      focus(label) {
        return ipcRenderer.invoke('desktop:window:focus', label);
      },
      toggleFullscreen() {
        return ipcRenderer.invoke('desktop:window:toggle-fullscreen');
      },
      create(options) {
        return ipcRenderer.invoke('desktop:window:create', options);
      },
      onCloseRequested(callback) {
        const handler = () => callIpcCallback(callback);
        ipcRenderer.on('desktop:window:close-requested', handler);
        return () => {
          ipcRenderer.removeListener('desktop:window:close-requested', handler);
        };
      },
    },
    shortcuts: {
      onOpenMarkdownFile(callback) {
        const channel = 'desktop:shortcut:open-markdown-file';
        const handler = () => callIpcCallback(callback);
        ipcRenderer.on(channel, handler);
        return () => {
          ipcRenderer.removeListener(channel, handler);
        };
      },
    },
    shell: {
      openExternal(url) {
        return ipcRenderer.invoke('desktop:shell:open-external', url);
      },
      openPath(filePath) {
        return ipcRenderer.invoke('desktop:shell:open-path', filePath);
      },
      trashItem(filePath) {
        return ipcRenderer.invoke('desktop:shell:trash-item', filePath);
      },
      revealItem(filePath) {
        return ipcRenderer.invoke('desktop:shell:reveal-item', filePath);
      },
    },
    clipboard: {
      readImage() {
        return ipcRenderer.invoke('desktop:clipboard:read-image');
      },
      writeText(text) {
        return ipcRenderer.invoke('desktop:clipboard:write-text', text);
      },
      writeTextSync(text) {
        return ipcRenderer.sendSync('desktop:clipboard:write-text-sync', text) === true;
      },
      writeImage(dataUrl) {
        return ipcRenderer.invoke('desktop:clipboard:write-image', dataUrl);
      },
    },
    media: {
      resolveVideoUrl(url) {
        return ipcRenderer.invoke('desktop:media:resolve-video-url', url);
      },
      diagnoseUrl(url) {
        return ipcRenderer.invoke('desktop:media:diagnose-url', url);
      },
      capturePage(rect) {
        return ipcRenderer.invoke('desktop:media:capture-page', rect);
      },
    },
    app: {
      getVersion() {
        return ipcRenderer.invoke('desktop:get-version');
      },
      setLanguage(language) {
        return ipcRenderer.invoke('desktop:app:set-language', language);
      },
      findMarkdownGitRoot(filePath) {
        return ipcRenderer.invoke('desktop:app:find-markdown-git-root', filePath);
      },
      onOpenMarkdownFile(callback) {
        return onOpenMarkdownFile(callback, callIpcCallback);
      },
      reportStartupReady() {
        ipcRenderer.send('desktop:startup-ready');
      },
      getErrorLogInfo() {
        return ipcRenderer.invoke('desktop:app:get-error-log-info');
      },
      openErrorLogFolder() {
        return ipcRenderer.invoke('desktop:app:open-error-log-folder');
      },
      reportRendererError(details) {
        return ipcRenderer.invoke('desktop:app:report-renderer-error', createRendererErrorReport(details));
      },
    },
    git: {
      status(rootPath) {
        return ipcRenderer.invoke('desktop:git:status', rootPath);
      },
      fetch(rootPath) {
        return ipcRenderer.invoke('desktop:git:fetch', rootPath);
      },
      workingDiff(rootPath, filePaths) {
        return ipcRenderer.invoke('desktop:git:working-diff', rootPath, filePaths);
      },
      history(rootPath, limit) {
        return ipcRenderer.invoke('desktop:git:history', rootPath, limit);
      },
      commitDiff(rootPath, hash) {
        return ipcRenderer.invoke('desktop:git:commit-diff', rootPath, hash);
      },
      commit(rootPath, options) {
        return ipcRenderer.invoke('desktop:git:commit', rootPath, options);
      },
      pull(rootPath) {
        return ipcRenderer.invoke('desktop:git:pull', rootPath);
      },
      push(rootPath) {
        return ipcRenderer.invoke('desktop:git:push', rootPath);
      },
    },
    update: {
      check() {
        return ipcRenderer.invoke('desktop:update:check');
      },
      getPolicy() {
        return ipcRenderer.invoke('desktop:update:get-policy');
      },
      download(updateInfo) {
        return ipcRenderer.invoke('desktop:update:download', updateInfo);
      },
      openDownloaded(updateInfo) {
        return ipcRenderer.invoke('desktop:update:open-downloaded', updateInfo);
      },
      deleteDownloaded(updateInfoOrFilePath) {
        return ipcRenderer.invoke('desktop:update:delete-downloaded', updateInfoOrFilePath);
      },
    },
    export: {
      htmlToPdf(html, options) {
        return ipcRenderer.invoke('desktop:export:html-to-pdf', html, options);
      },
    },
    aiProvider: createAiProviderApi(deps),
    computer: hostPlatform === 'linux' ? createComputerApi(deps) : undefined,
    webSearch: createWebSearchApi(deps),
    dragDrop: {
      getPathForFile(file) {
        return webUtils.getPathForFile(file);
      },
      authorizePath(filePath) {
        return ipcRenderer.invoke('desktop:drag-drop:authorize-path', filePath);
      },
    },
    dialog: {
      open(options) {
        return ipcRenderer.invoke('desktop:dialog:open', options);
      },
      save(options) {
        return ipcRenderer.invoke('desktop:dialog:save', options);
      },
      message(message, options) {
        return ipcRenderer.invoke('desktop:dialog:message', message, options);
      },
      confirm(message, options) {
        return ipcRenderer.invoke('desktop:dialog:confirm', message, options);
      },
    },
    fs: {
      readBinaryFile(filePath, maxBytes) {
        return ipcRenderer.invoke('desktop:fs:read-binary', filePath, maxBytes);
      },
      readTextFile(filePath, maxBytes) {
        return ipcRenderer.invoke('desktop:fs:read-text', filePath, maxBytes);
      },
      writeBinaryFile(filePath, bytes) {
        return ipcRenderer.invoke('desktop:fs:write-binary', filePath, normalizeDesktopBinaryWritePayload(bytes));
      },
      writeTextFile(filePath, content, options) {
        return ipcRenderer.invoke(
          'desktop:fs:write-text',
          filePath,
          normalizeDesktopTextWritePayload(content, options?.maxBytes),
          options,
        );
      },
      writeTextFileIfUnchanged(filePath, expectedContent, content) {
        return ipcRenderer.invoke(
          'desktop:fs:write-text-if-unchanged',
          filePath,
          expectedContent === null ? null : normalizeDesktopTextWritePayload(expectedContent),
          normalizeDesktopTextWritePayload(content),
        );
      },
      exists(filePath) {
        return ipcRenderer.invoke('desktop:fs:exists', filePath);
      },
      mkdir(filePath, recursive) {
        return ipcRenderer.invoke('desktop:fs:mkdir', filePath, recursive);
      },
      deleteFile(filePath) {
        return ipcRenderer.invoke('desktop:fs:delete-file', filePath);
      },
      deleteDir(filePath, recursive) {
        return ipcRenderer.invoke('desktop:fs:delete-dir', filePath, recursive);
      },
      listDir(filePath, maxEntries) {
        return ipcRenderer.invoke('desktop:fs:list-dir', filePath, maxEntries);
      },
      rename(oldPath, newPath) {
        return ipcRenderer.invoke('desktop:fs:rename', oldPath, newPath);
      },
      copyFile(sourcePath, targetPath, maxBytes) {
        if (maxBytes === undefined) {
          return ipcRenderer.invoke('desktop:fs:copy-file', sourcePath, targetPath);
        }
        return ipcRenderer.invoke('desktop:fs:copy-file', sourcePath, targetPath, maxBytes);
      },
      stat(filePath) {
        return ipcRenderer.invoke('desktop:fs:stat', filePath);
      },
      watch(filePath, callback, options) {
        return ipcRenderer.invoke('desktop:fs:watch', filePath, options).then((watchId) => {
          const id = requireSafeIpcRequestId(watchId, 'file watch id');
          const channel = `desktop:fs:watch:${id}`;
          const handler = (_event, payload) => callIpcCallback(callback, payload);
          ipcRenderer.on(channel, handler);

          return async () => {
            ipcRenderer.removeListener(channel, handler);
            await ipcRenderer.invoke('desktop:fs:unwatch', id);
          };
        });
      },
    },
    path: {
      join(...segments) {
        return ipcRenderer.invoke('desktop:path:join', ...segments);
      },
      appDataDir() {
        return ipcRenderer.invoke('desktop:path:app-data');
      },
      homeDir() {
        return ipcRenderer.invoke('desktop:path:home');
      },
      toFileUrl(filePath) {
        return ipcRenderer.invoke('desktop:path:to-file-url', filePath);
      },
    },
    secrets: {
      getAIProviderSecrets(providerIds) {
        return ipcRenderer.invoke('desktop:secrets:get-ai-provider-secrets', providerIds);
      },
      setAIProviderSecret(providerId, apiKey) {
        return ipcRenderer.invoke('desktop:secrets:set-ai-provider-secret', providerId, apiKey);
      },
      deleteAIProviderSecret(providerId) {
        return ipcRenderer.invoke('desktop:secrets:delete-ai-provider-secret', providerId);
      },
    },
    account: createAccountApi(deps),
  };
}

module.exports = {
  createDesktopApi,
};
