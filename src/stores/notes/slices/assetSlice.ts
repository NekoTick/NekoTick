import { StateCreator } from 'zustand';
import { NotesStore } from '../types';
import { AssetEntry, UploadResult } from '@/lib/assets/types';
import { AssetService } from '@/lib/assets/AssetService';
import { useUIStore } from '@/stores/uiSlice';
import { clearImageCache } from '@/lib/assets';
import { resolveEffectiveNotesRootPath } from '../effectiveNotesRootPath';

let uploadProgressResetTimer: ReturnType<typeof setTimeout> | null = null;
export const MAX_PENDING_ASSET_LOADS = 50;
const loadAssetsInFlight = new Map<string, Promise<AssetEntry[]>>();

function clearUploadProgressResetTimer() {
  if (uploadProgressResetTimer === null) {
    return;
  }

  clearTimeout(uploadProgressResetTimer);
  uploadProgressResetTimer = null;
}

function isActiveUploadNotesRoot(state: NotesStore, notesRootPath: string) {
  return resolveEffectiveNotesRootPath({
    notesPath: state.notesPath,
    currentNotePath: state.currentNote?.path,
  }) === notesRootPath;
}

function isActiveAssetLoadScope(
  state: NotesStore,
  notesRootPath: string,
  loadKey: string,
) {
  const currentConfig = getAssetConfig();
  const currentLoadKey = getLoadAssetsKey(notesRootPath, state.currentNote?.path, currentConfig);

  return currentLoadKey === loadKey && isActiveUploadNotesRoot(state, notesRootPath);
}

function combineAndSortAssets(userAssets: AssetEntry[]): AssetEntry[] {
  return [...userAssets].sort((a, b) => b.filename.localeCompare(a.filename));
}

function getAssetConfig() {
  const uiState = useUIStore.getState();
  return {
    storageMode: uiState.imageStorageMode,
    subfolderName: uiState.imageSubfolderName,
    imageNotesRootSubfolderName: uiState.imageNotesRootSubfolderName,
    filenameFormat: uiState.imageFilenameFormat,
  };
}

function getLoadAssetsKey(notesRootPath: string, currentNotePath: string | undefined, config: ReturnType<typeof getAssetConfig>) {
  return JSON.stringify({
    notesRootPath,
    currentNotePath: currentNotePath ?? '',
    storageMode: config.storageMode,
    subfolderName: config.subfolderName,
    imageNotesRootSubfolderName: config.imageNotesRootSubfolderName,
    filenameFormat: config.filenameFormat,
  });
}

export interface AssetSlice {
  assetList: AssetEntry[];
  isLoadingAssets: boolean;
  assetLoadError: string | null;
  uploadProgress: number | null;

  loadAssets: (notesRootPath: string) => Promise<void>;
  uploadAsset: (file: File, currentNotePath?: string) => Promise<UploadResult>;
  deleteAsset: (filename: string) => Promise<void>;
  cleanupAssetTempFiles: () => Promise<void>;
  getAssetList: () => AssetEntry[];
  clearAssetUrlCache: () => void;
}

export const createAssetSlice: StateCreator<NotesStore, [], [], AssetSlice> = (set, get) => {
  let assetListScopeKey: string | null = null;
  let latestAssetLoadKey: string | null = null;

  return {
    assetList: [],
    isLoadingAssets: false,
    assetLoadError: null,
    uploadProgress: null,

    loadAssets: async (notesRootPath: string) => {
      const currentNotePath = get().currentNote?.path;
      const config = getAssetConfig();
      const loadKey = getLoadAssetsKey(notesRootPath, currentNotePath, config);
      const existingLoad = loadAssetsInFlight.get(loadKey);
      if (!existingLoad && loadAssetsInFlight.size >= MAX_PENDING_ASSET_LOADS) {
        return;
      }
      latestAssetLoadKey = loadKey;
      set({
        ...(assetListScopeKey !== null && assetListScopeKey !== loadKey
          ? { assetList: [] }
          : {}),
        isLoadingAssets: true,
        assetLoadError: null,
      });

      const context = {
        notesRootPath,
        currentNotePath,
      };
      const loadPromise = existingLoad ?? (async () => (
        combineAndSortAssets(await AssetService.list(context, config))
      ))();
      if (!existingLoad) loadAssetsInFlight.set(loadKey, loadPromise);
      try {
        const assets = await loadPromise;
        if (latestAssetLoadKey !== loadKey) return;

        if (!isActiveAssetLoadScope(get(), notesRootPath, loadKey)) {
          set({ isLoadingAssets: false });
          return;
        }

        assetListScopeKey = loadKey;
        set({ assetList: assets, isLoadingAssets: false, assetLoadError: null });
      } catch (error) {
        if (latestAssetLoadKey === loadKey) {
          if (isActiveAssetLoadScope(get(), notesRootPath, loadKey)) {
            set({
              isLoadingAssets: false,
              assetLoadError: error instanceof Error && error.message.trim()
                ? error.message.trim()
                : 'Failed to load asset library',
            });
          } else {
            set({ isLoadingAssets: false });
          }
        }
        throw error;
      } finally {
        if (loadAssetsInFlight.get(loadKey) === loadPromise) {
          loadAssetsInFlight.delete(loadKey);
        }
      }
    },

    uploadAsset: async (file: File, currentNotePath?: string): Promise<UploadResult> => {
      const { notesPath, assetList } = get();
      const config = getAssetConfig();

      const notesRootPath = resolveEffectiveNotesRootPath({ notesPath, currentNotePath });
      if (!notesRootPath) {
        return {
          success: false,
          path: null,
          isDuplicate: false,
          error: 'Opened folder path is unavailable',
        };
      }

      const context = {
        notesRootPath,
        currentNotePath,
      };

      clearUploadProgressResetTimer();
      set({ uploadProgress: 0 });

      try {
        const result = await AssetService.upload(
          file,
          context,
          config,
          assetList,
          (progress) => {
            if (isActiveUploadNotesRoot(get(), notesRootPath)) {
              set({ uploadProgress: progress });
            }
          }
        );

        if (!isActiveUploadNotesRoot(get(), notesRootPath)) {
          return result;
        }

        if (result.success) {
          assetListScopeKey = getLoadAssetsKey(notesRootPath, currentNotePath, config);
        }
        if (result.success && result.entry) {
          set((state) => ({
            assetList: [
              result.entry!,
              ...state.assetList.filter((asset) => asset.filename !== result.entry!.filename),
            ],
          }));
        }

        uploadProgressResetTimer = setTimeout(() => {
          uploadProgressResetTimer = null;
          if (isActiveUploadNotesRoot(get(), notesRootPath)) {
            set({ uploadProgress: null });
          }
        }, 500);
        return result;

      } catch (error) {
        clearUploadProgressResetTimer();
        if (isActiveUploadNotesRoot(get(), notesRootPath)) {
          set({ uploadProgress: null });
        }
        return {
          success: false,
          path: null,
          isDuplicate: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        };
      }
    },

    deleteAsset: async (filename: string) => {
      void filename;
    },

    cleanupAssetTempFiles: async () => {
      return;
    },

    getAssetList: (): AssetEntry[] => get().assetList,

    clearAssetUrlCache: () => {
      clearImageCache();
      clearUploadProgressResetTimer();
    },
  };
};
