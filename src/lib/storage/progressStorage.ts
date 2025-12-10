/**
 * Progress Storage - Layered Architecture
 * 
 * Two-layer storage system:
 * 1. User Layer:     progress/progress.md     - Clean, human-readable markdown
 * 2. Metadata Layer: .nekotick/progress.json  - App-only technical data
 * 
 * This separation allows users to read/edit their progress with any tool
 * while preserving all the technical metadata the app needs.
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { ensureDirectories, getPaths } from './paths';
import type { ProgressData } from './types';
import {
  generateUserMarkdown,
  generateExtendedMetadataJson,
  parseExtendedMetadataJson,
} from './layeredStorage';

// ============================================================================
// Main Storage Functions
// ============================================================================

/**
 * Load all progress items from storage
 * Reads from .nekotick/progress.json (the source of truth)
 */
export async function loadProgress(): Promise<ProgressData[]> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    
    // Ensure .nekotick folder exists
    if (!(await exists(paths.metadata))) {
      await mkdir(paths.metadata, { recursive: true });
    }
    
    const metadataPath = `${paths.metadata}\\progress.json`;
    
    if (await exists(metadataPath)) {
      const content = await readTextFile(metadataPath);
      const items = parseExtendedMetadataJson(content);
      console.log('[Storage] Loaded:', items.length, 'items');
      return items;
    }
    
    return [];
  } catch (error) {
    console.error('Failed to load progress:', error);
    return [];
  }
}

/**
 * Save progress items to storage
 * 
 * Writes to two locations:
 * 1. .nekotick/progress.json  - Full data for app use
 * 2. progress/progress.md     - Clean markdown for user viewing
 */
export async function saveProgress(items: ProgressData[]): Promise<void> {
  try {
    await ensureDirectories();
    const paths = await getPaths();
    
    // Ensure .nekotick folder exists
    if (!(await exists(paths.metadata))) {
      await mkdir(paths.metadata, { recursive: true });
    }
    
    const metadataPath = `${paths.metadata}\\progress.json`;
    const userFilePath = `${paths.progress}\\progress.md`;
    
    // Write metadata JSON (complete data)
    const metadataContent = generateExtendedMetadataJson(items);
    await writeTextFile(metadataPath, metadataContent);
    
    // Write user-readable markdown (clean view)
    const userContent = generateUserMarkdown(items);
    await writeTextFile(userFilePath, userContent);
    
    console.log('[Storage] Saved:', items.length, 'items (layered format)');
  } catch (error) {
    console.error('Failed to save progress:', error);
  }
}
