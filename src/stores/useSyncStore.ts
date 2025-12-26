/**
 * Sync Store - Google Drive sync state management
 * 
 * Manages connection status, sync operations, and error states
 * for Google Drive integration.
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useLicenseStore } from './useLicenseStore';

// Types matching Rust backend
interface SyncStatus {
  connected: boolean;
  userEmail: string | null;
  lastSyncTime: number | null;
  hasRemoteData: boolean;
  remoteModifiedTime: string | null;
  folderId: string | null;
}

interface AuthResult {
  success: boolean;
  userEmail: string | null;
  error: string | null;
}

interface SyncResult {
  success: boolean;
  timestamp: number | null;
  error: string | null;
}

interface RemoteDataInfo {
  exists: boolean;
  modifiedTime: string | null;
  fileId: string | null;
}

// Sync status for UI indicator
export type SyncStatusType = 'idle' | 'pending' | 'syncing' | 'success' | 'error';

// Store state
interface SyncState {
  // Connection state
  isConnected: boolean;
  userEmail: string | null;
  
  // Sync state
  isSyncing: boolean;
  isConnecting: boolean;
  lastSyncTime: number | null;
  syncError: string | null;
  
  // Remote data info
  hasRemoteData: boolean;
  remoteModifiedTime: string | null;
  
  // Loading state
  isLoading: boolean;
  
  // Auto sync state (PRO feature)
  pendingSync: boolean;           // 是否有待同步的变更
  lastSyncAttempt: number | null; // 上次同步尝试时间戳
  syncRetryCount: number;         // 当前重试次数
  syncStatus: SyncStatusType;     // 同步状态（用于 UI 指示器）
}

// Store actions
interface SyncActions {
  // Check current status
  checkStatus: () => Promise<void>;
  
  // Connect to Google Drive
  connect: () => Promise<boolean>;
  
  // Disconnect from Google Drive
  disconnect: () => Promise<void>;
  
  // Sync local data to cloud
  syncToCloud: () => Promise<boolean>;
  
  // Restore data from cloud
  restoreFromCloud: () => Promise<boolean>;
  
  // Check if remote data exists
  checkRemoteData: () => Promise<void>;
  
  // Clear error
  clearError: () => void;
  
  // Auto sync actions
  markPendingSync: () => void;
  clearPendingSync: () => void;
  setSyncStatus: (status: SyncStatusType) => void;
  incrementRetryCount: () => void;
  resetRetryCount: () => void;
  performAutoSync: () => Promise<boolean>;
}

type SyncStore = SyncState & SyncActions;

const initialState: SyncState = {
  isConnected: false,
  userEmail: null,
  isSyncing: false,
  isConnecting: false,
  lastSyncTime: null,
  syncError: null,
  hasRemoteData: false,
  remoteModifiedTime: null,
  isLoading: true,
  pendingSync: false,
  lastSyncAttempt: null,
  syncRetryCount: 0,
  syncStatus: 'idle',
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  ...initialState,

  checkStatus: async () => {
    set({ isLoading: true });
    try {
      const status = await invoke<SyncStatus>('get_sync_status');
      set({
        isConnected: status.connected,
        userEmail: status.userEmail,
        lastSyncTime: status.lastSyncTime,
        hasRemoteData: status.hasRemoteData,
        remoteModifiedTime: status.remoteModifiedTime,
        isLoading: false,
      });
      
      // If connected, also check remote data
      if (status.connected) {
        get().checkRemoteData();
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
      set({ isLoading: false });
    }
  },

  connect: async () => {
    set({ isConnecting: true, syncError: null });
    try {
      const result = await invoke<AuthResult>('google_drive_auth');
      
      if (result.success) {
        set({
          isConnected: true,
          userEmail: result.userEmail,
          isConnecting: false,
        });
        // Check remote data after connecting
        get().checkRemoteData();
        return true;
      } else {
        set({
          syncError: result.error || 'Authorization failed',
          isConnecting: false,
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({
        syncError: errorMsg,
        isConnecting: false,
      });
      return false;
    }
  },

  disconnect: async () => {
    try {
      await invoke('google_drive_disconnect');
      set({
        isConnected: false,
        userEmail: null,
        hasRemoteData: false,
        remoteModifiedTime: null,
        syncError: null,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ syncError: errorMsg });
    }
  },

  syncToCloud: async () => {
    const state = get();
    
    // Check connection status - if not connected, try to check status first
    if (!state.isConnected) {
      set({ syncError: 'Not connected to Google Drive' });
      return false;
    }
    
    set({ isSyncing: true, syncError: null });
    try {
      const result = await invoke<SyncResult>('sync_to_drive');
      
      if (result.success) {
        set({
          lastSyncTime: result.timestamp,
          isSyncing: false,
          hasRemoteData: true,
        });
        return true;
      } else {
        set({
          syncError: result.error || 'Sync failed',
          isSyncing: false,
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({
        syncError: errorMsg,
        isSyncing: false,
      });
      return false;
    }
  },

  restoreFromCloud: async () => {
    const state = get();
    
    if (!state.isConnected) {
      set({ syncError: 'Not connected to Google Drive' });
      return false;
    }
    
    set({ isSyncing: true, syncError: null });
    try {
      const result = await invoke<SyncResult>('restore_from_drive');
      
      if (result.success) {
        set({
          lastSyncTime: result.timestamp,
          isSyncing: false,
        });
        // Reload the page to refresh data
        window.location.reload();
        return true;
      } else {
        set({
          syncError: result.error || 'Restore failed',
          isSyncing: false,
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({
        syncError: errorMsg,
        isSyncing: false,
      });
      return false;
    }
  },

  checkRemoteData: async () => {
    if (!get().isConnected) return;
    
    try {
      const info = await invoke<RemoteDataInfo>('check_remote_data');
      set({
        hasRemoteData: info.exists,
        remoteModifiedTime: info.modifiedTime,
      });
    } catch (error) {
      console.error('Failed to check remote data:', error);
    }
  },

  clearError: () => {
    set({ syncError: null });
  },

  markPendingSync: () => {
    set({ pendingSync: true, syncStatus: 'pending' });
    // 持久化到 localStorage
    localStorage.setItem('pendingSync', 'true');
  },

  clearPendingSync: () => {
    set({ pendingSync: false, syncStatus: 'idle' });
    localStorage.removeItem('pendingSync');
  },

  setSyncStatus: (status: SyncStatusType) => {
    set({ syncStatus: status });
  },

  incrementRetryCount: () => {
    set((state) => ({ syncRetryCount: state.syncRetryCount + 1 }));
  },

  resetRetryCount: () => {
    set({ syncRetryCount: 0 });
  },

  performAutoSync: async () => {
    const state = get();
    
    // 检查是否可以同步
    if (!state.isConnected) {
      console.log('[AutoSync] Not connected to Google Drive');
      return false;
    }
    
    if (state.isSyncing) {
      console.log('[AutoSync] Sync already in progress');
      return false;
    }
    
    // 检查 PRO 状态
    const { isProUser, timeTamperDetected } = useLicenseStore.getState();
    if (!isProUser) {
      console.log('[AutoSync] Not a PRO user');
      return false;
    }
    
    if (timeTamperDetected) {
      console.log('[AutoSync] Time tamper detected');
      return false;
    }
    
    set({ isSyncing: true, syncStatus: 'syncing', syncError: null, lastSyncAttempt: Date.now() });
    
    try {
      const result = await invoke<SyncResult>('auto_sync_to_drive');
      
      if (result.success) {
        set({
          lastSyncTime: result.timestamp,
          isSyncing: false,
          hasRemoteData: true,
          pendingSync: false,
          syncStatus: 'idle',
          syncRetryCount: 0,
        });
        localStorage.removeItem('pendingSync');
        console.log('[AutoSync] Sync successful');
        return true;
      } else {
        set({
          syncError: result.error || 'Auto sync failed',
          isSyncing: false,
          syncStatus: 'error',
        });
        console.error('[AutoSync] Sync failed:', result.error);
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({
        syncError: errorMsg,
        isSyncing: false,
        syncStatus: 'error',
      });
      console.error('[AutoSync] Sync error:', errorMsg);
      return false;
    }
  },
}));
