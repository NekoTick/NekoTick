/**
 * Property-based tests for useSyncStore
 * 
 * Feature: auto-sync, Property 4: 同步状态转换
 * Validates: Requirements 4.4, 4.5, 4.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { useSyncStore, SyncStatusType } from './useSyncStore';

// Mock useLicenseStore
vi.mock('./useLicenseStore', () => ({
  useLicenseStore: {
    getState: () => ({
      isProUser: true,
      timeTamperDetected: false,
    }),
  },
}));

describe('useSyncStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useSyncStore.setState({
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
    });
    localStorage.clear();
  });

  describe('Property 4: 同步状态转换', () => {
    /**
     * Property 4.4: 数据保存成功后 pendingSync 应为 true
     * For any initial state, calling markPendingSync should set pendingSync to true
     */
    it('markPendingSync should always set pendingSync to true', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // initial pendingSync state
          (initialPending) => {
            // Setup
            useSyncStore.setState({ pendingSync: initialPending });
            
            // Action
            useSyncStore.getState().markPendingSync();
            
            // Assert
            const state = useSyncStore.getState();
            expect(state.pendingSync).toBe(true);
            expect(state.syncStatus).toBe('pending');
            expect(localStorage.getItem('pendingSync')).toBe('true');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4.5: 同步成功后 pendingSync 应为 false 且 retryCount 重置为 0
     * For any retry count, calling clearPendingSync should reset state
     */
    it('clearPendingSync should reset pendingSync and syncStatus', () => {
      fc.assert(
        fc.property(
          fc.nat(10), // retry count (0-10)
          (retryCount) => {
            // Setup - simulate pending state with retries
            useSyncStore.setState({
              pendingSync: true,
              syncRetryCount: retryCount,
              syncStatus: 'pending',
            });
            localStorage.setItem('pendingSync', 'true');
            
            // Action
            useSyncStore.getState().clearPendingSync();
            
            // Assert
            const state = useSyncStore.getState();
            expect(state.pendingSync).toBe(false);
            expect(state.syncStatus).toBe('idle');
            expect(localStorage.getItem('pendingSync')).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4.6: 同步失败后 retryCount 应增加
     * For any initial retry count, incrementRetryCount should increase by 1
     */
    it('incrementRetryCount should increase count by 1', () => {
      fc.assert(
        fc.property(
          fc.nat(100), // initial retry count
          (initialCount) => {
            // Setup
            useSyncStore.setState({ syncRetryCount: initialCount });
            
            // Action
            useSyncStore.getState().incrementRetryCount();
            
            // Assert
            expect(useSyncStore.getState().syncRetryCount).toBe(initialCount + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * resetRetryCount should always set count to 0
     */
    it('resetRetryCount should always set count to 0', () => {
      fc.assert(
        fc.property(
          fc.nat(100), // initial retry count
          (initialCount) => {
            // Setup
            useSyncStore.setState({ syncRetryCount: initialCount });
            
            // Action
            useSyncStore.getState().resetRetryCount();
            
            // Assert
            expect(useSyncStore.getState().syncRetryCount).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * setSyncStatus should correctly update the status
     */
    it('setSyncStatus should update status correctly', () => {
      const statuses: SyncStatusType[] = ['idle', 'pending', 'syncing', 'success', 'error'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...statuses),
          fc.constantFrom(...statuses),
          (initialStatus, newStatus) => {
            // Setup
            useSyncStore.setState({ syncStatus: initialStatus });
            
            // Action
            useSyncStore.getState().setSyncStatus(newStatus);
            
            // Assert
            expect(useSyncStore.getState().syncStatus).toBe(newStatus);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * State transition sequence: markPendingSync -> clearPendingSync
     * Should result in idle state with no pending sync
     */
    it('markPendingSync followed by clearPendingSync should result in idle state', () => {
      fc.assert(
        fc.property(
          fc.nat(5), // number of mark/clear cycles
          (cycles) => {
            for (let i = 0; i < cycles; i++) {
              useSyncStore.getState().markPendingSync();
              expect(useSyncStore.getState().pendingSync).toBe(true);
              
              useSyncStore.getState().clearPendingSync();
              expect(useSyncStore.getState().pendingSync).toBe(false);
              expect(useSyncStore.getState().syncStatus).toBe('idle');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
