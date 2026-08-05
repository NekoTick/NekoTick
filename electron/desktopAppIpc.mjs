import fs from 'node:fs';

export function registerDesktopAppIpc({
  app,
  assertTrustedIpcSender,
  errorLogService,
  handleIpc,
  ipcMain,
  noteRecoveryService,
  openPathInFileManager,
  trayController,
}) {
  handleIpc('desktop:get-version', async () => {
    return app.getVersion();
  });

  handleIpc('desktop:app:set-language', async (_event, language) => {
    return trayController.setTrayLanguage(language);
  });

  handleIpc('desktop:app:get-error-log-info', async () => {
    return errorLogService.getInfo();
  });

  handleIpc('desktop:app:open-error-log-folder', async () => {
    const { logsDir } = errorLogService.getInfo();
    fs.mkdirSync(logsDir, { recursive: true });
    await openPathInFileManager(logsDir);
  });

  handleIpc('desktop:app:report-renderer-error', async (_event, payload) => {
    const logFilePath = await errorLogService.logRendererError(payload, 'renderer-reported-error');
    return {
      ...errorLogService.getInfo(),
      logFilePath,
    };
  });

  handleIpc('desktop:app:read-note-recovery', async (_event, payload) => {
    return noteRecoveryService.read(payload);
  });

  handleIpc('desktop:app:list-draft-note-recoveries', async (_event, notesPath) => {
    return noteRecoveryService.listDrafts(notesPath);
  });

  handleIpc('desktop:app:clear-note-recovery', async (_event, payload) => {
    return noteRecoveryService.clear(payload);
  });

  handleIpc('desktop:app:flush-note-recovery', async () => {
    await noteRecoveryService.flush();
  });

  ipcMain.on('desktop:app:stage-note-recovery', (event, payload) => {
    try {
      assertTrustedIpcSender(event);
      void noteRecoveryService.stage(payload).catch((error) => {
        void errorLogService.logMainError(error, 'note-recovery-stage-failed');
      });
    } catch (error) {
      void errorLogService.logMainError(error, 'note-recovery-stage-blocked');
    }
  });

  ipcMain.on('desktop:app:report-renderer-error', (event, payload) => {
    try {
      assertTrustedIpcSender(event);
      void errorLogService.logRendererError(payload, 'renderer-global-error');
    } catch (error) {
      void errorLogService.logMainError(error, 'renderer-error-report-blocked');
    }
  });
}
