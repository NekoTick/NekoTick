import { isTrustedRendererUrl as isTrustedRendererUrlForConfig } from './rendererTrust.mjs';

export function createTrustedIpc({
  BrowserWindow,
  ipcMain,
  rendererDevUrl,
  rendererFile,
}) {
  const isTrustedRendererUrl = (rawUrl) => (
    isTrustedRendererUrlForConfig(rawUrl, { rendererDevUrl, rendererFile })
  );

  const resolveTrustedSenderUrl = (event) => {
    const candidates = [
      event?.senderFrame?.url,
      event?.senderFrame?.top?.url,
      event?.sender?.getURL?.(),
      BrowserWindow.fromWebContents(event?.sender ?? null)?.webContents?.getURL?.(),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return '';
  };

  const assertTrustedIpcSender = (event) => {
    const senderUrl = resolveTrustedSenderUrl(event);
    if (!isTrustedRendererUrl(senderUrl)) {
      throw new Error(`Blocked IPC from untrusted renderer: ${senderUrl || 'unknown sender'}`);
    }
  };

  const handleIpc = (channel, listener) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedIpcSender(event);
      return await listener(event, ...args);
    });
  };

  const handleSyncIpc = (channel, listener) => {
    ipcMain.on(channel, (event, ...args) => {
      try {
        assertTrustedIpcSender(event);
        event.returnValue = listener(event, ...args);
      } catch {
        event.returnValue = false;
      }
    });
  };

  return {
    assertTrustedIpcSender,
    handleIpc,
    handleSyncIpc,
    isTrustedRendererUrl,
  };
}
