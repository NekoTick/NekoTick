/**
 * Path Management for Storage Directories
 * 
 * Uses system-standard app data location:
 * - Windows: C:\Users\{user}\AppData\Roaming\NekoTick
 * - macOS:   ~/Library/Application Support/NekoTick
 * - Linux:   ~/.local/share/NekoTick
 * 
 * This follows platform conventions and keeps user's visible folders clean.
 */

import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

// Dynamic path management - initialized on first use
let basePath: string | null = null;

/**
 * Get the base path, initializing if necessary
 * Uses system-standard app data directory for cross-platform compatibility
 */
export async function getBasePath(): Promise<string> {
  if (basePath === null) {
    const appData = await appDataDir();
    // appDataDir already returns the correct path for each platform
    // It typically ends with the app name from tauri.conf.json
    basePath = appData.endsWith('\\') || appData.endsWith('/') 
      ? appData.slice(0, -1)  // Remove trailing slash
      : appData;
  }
  return basePath;
}

/**
 * Get all storage paths dynamically
 * 
 * Structure (Unified Single-File Architecture):
 *   NekoTick/
 *   ├── .nekotick/           <- Hidden metadata
 *   │   └── data.json        <- Source of truth (all app data)
 *   └── nekotick.md          <- Human-readable backup
 */
export async function getPaths() {
  const base = await getBasePath();
  const sep = base.includes('\\') ? '\\' : '/';
  return {
    base,
    metadata: `${base}${sep}.nekotick`,
    dataJson: `${base}${sep}.nekotick${sep}data.json`,
    markdown: `${base}${sep}nekotick.md`,
  };
}

/**
 * Ensure storage directories exist
 */
export async function ensureDirectories(): Promise<void> {
  try {
    const base = await getBasePath();
    const sep = base.includes('\\') ? '\\' : '/';
    const metadataDir = `${base}${sep}.nekotick`;
    if (!(await exists(metadataDir))) {
      await mkdir(metadataDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create directories:', error);
  }
}
