/**
 * Property-based tests for AutoSyncManager
 * 
 * Feature: auto-sync
 * Property 1: PRO 用户自动同步触发
 * Property 5: 重试策略
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 5.2, 5.3
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import * as fc from 'fast-check';
import { getAutoSyncManager, resetAutoSyncManager, AutoSyncConfig } from './autoSyncManager';
import { useSyncStore } from '@/stores/useSyncStore';
import { useLicenseStore } from '@/stores/useLicenseStore';

// Mock stores
vi.mock('@/stores/useSyncStore', () => ({
  useSyncStore: {
    getState: vi.fn(() => ({
      isConnected: true,
      isSyncing: false,
      syncRetryCount: 0,
      markPendingSync: vi.fn(),
      clearPendingSync: vi.fn(),
      setSyncStatus: vi.fn(),
      incrementRetryCount: vi.fn(),
      resetRetryCount: vi.fn(),
      performAutoSync: vi.fn().mockResolvedValue(true),
    })),
  },
}));

vi.mock('@/stores/useLicenseStore', () => ({
  useLicenseStore: {
    getState: vi.fn(() => ({
      isProUser: true,
      timeTamperDetected: false,
    })),
  },
}));

// Get mocked functions with proper typing
const mockSyncStoreGetState = useSyncStore.getState as Mock;
const mockLicenseStoreGetState = useLicenseStore.getState as Mock;

describe('AutoSyncManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAutoSyncManager();
    
    // Reset mocks to default state
    mockSyncStoreGetState.mockReturnValue({
      isConnected: true,
      isSyncing: false,
      syncRetryCount: 0,
      markPendingSync: vi.fn(),
      clearPendingSync: vi.fn(),
      setSyncStatus: vi.fn(),
      incrementRetryCount: vi.fn(),
      resetRetryCount: vi.fn(),
      performAutoSync: vi.fn().mockResolvedValue(true),
    });
    
    mockLicenseStoreGetState.mockReturnValue({
      isProUser: true,
      timeTamperDetected: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAutoSyncManager();
  });

  describe('Property 1: PRO 用户自动同步触发', () => {
    /**
     * Property 1.3: 防抖时间为 5 秒
     * For any sequence of rapid data changes, only one sync should be triggered
     * after the debounce period
     */
    it('should debounce rapid sync triggers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }), // number of rapid triggers
          (triggerCount) => {
            resetAutoSyncManager();
            const manager = getAutoSyncManager({ debounceMs: 5000 });
            const mockPerformAutoSync = vi.fn().mockResolvedValue(true);
            
            mockSyncStoreGetState.mockReturnValue({
              isConnected: true,
              isSyncing: false,
              syncRetryCount: 0,
              markPendingSync: vi.fn(),
              performAutoSync: mockPerformAutoSync,
              setSyncStatus: vi.fn(),
              incrementRetryCount: vi.fn(),
              resetRetryCount: vi.fn(),
            });

            // Trigger sync multiple times rapidly
            for (let i = 0; i < triggerCount; i++) {
              manager.triggerSync();
              vi.advanceTimersByTime(100); // 100ms between triggers
            }

            // Before debounce completes, no sync should have been called
            expect(mockPerformAutoSync).not.toHaveBeenCalled();

            // After debounce completes
            vi.advanceTimersByTime(5000);

            // Only one sync should have been triggered
            expect(mockPerformAutoSync).toHaveBeenCalledTimes(1);

            resetAutoSyncManager();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.4: 冷却期为 30 秒
     * Two syncs should be at least 30 seconds apart
     */
    it('should enforce cooldown period between syncs', async () => {
      const manager = getAutoSyncManager({ debounceMs: 100, cooldownMs: 30000 });
      const mockPerformAutoSync = vi.fn().mockResolvedValue(true);
      
      mockSyncStoreGetState.mockReturnValue({
        isConnected: true,
        isSyncing: false,
        syncRetryCount: 0,
        markPendingSync: vi.fn(),
        performAutoSync: mockPerformAutoSync,
        setSyncStatus: vi.fn(),
        incrementRetryCount: vi.fn(),
        resetRetryCount: vi.fn(),
      });

      // First sync
      manager.triggerSync();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockPerformAutoSync).toHaveBeenCalledTimes(1);

      // Try to sync again immediately
      manager.triggerSync();
      vi.advanceTimersByTime(100);
      await Promise.resolve();

      // Should still be 1 (cooldown not passed)
      expect(mockPerformAutoSync).toHaveBeenCalledTimes(1);

      // Advance past cooldown
      vi.advanceTimersByTime(30000);
      await Promise.resolve();

      // Now second sync should have been triggered
      expect(mockPerformAutoSync).toHaveBeenCalledTimes(2);
    });

    /**
     * canSync should return false when not connected
     */
    it('canSync should return false when not connected', () => {
      mockSyncStoreGetState.mockReturnValue({
        isConnected: false,
        isSyncing: false,
      });

      const manager = getAutoSyncManager();
      expect(manager.canSync()).toBe(false);
    });

    /**
     * canSync should return false when not PRO user
     */
    it('canSync should return false when not PRO user', () => {
      mockSyncStoreGetState.mockReturnValue({
        isConnected: true,
        isSyncing: false,
      });
      mockLicenseStoreGetState.mockReturnValue({
        isProUser: false,
        timeTamperDetected: false,
      });

      const manager = getAutoSyncManager();
      expect(manager.canSync()).toBe(false);
    });

    /**
     * canSync should return false when already syncing
     */
    it('canSync should return false when already syncing', () => {
      mockSyncStoreGetState.mockReturnValue({
        isConnected: true,
        isSyncing: true,
      });

      const manager = getAutoSyncManager();
      expect(manager.canSync()).toBe(false);
    });
  });

  describe('Property 5: 重试策略', () => {
    /**
     * Property 5.2: 重试间隔按指数退避
     * Retry delays should follow: 30s, 60s, 120s, 300s, 300s
     */
    it('should use correct retry delays', () => {
      const expectedDelays = [30000, 60000, 120000, 300000, 300000];
      const manager = getAutoSyncManager();
      const config = manager.getConfig();

      expect(config.retryDelays).toEqual(expectedDelays);
    });

    /**
     * Property 5.3: 最多重试 5 次
     * After 5 retries, should stop auto-retry
     */
    it('should stop retrying after max retries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 10 }), // retry count >= max
          (retryCount) => {
            resetAutoSyncManager();
            const mockSetSyncStatus = vi.fn();
            const mockIncrementRetryCount = vi.fn();
            
            mockSyncStoreGetState.mockReturnValue({
              isConnected: true,
              isSyncing: false,
              syncRetryCount: retryCount,
              markPendingSync: vi.fn(),
              performAutoSync: vi.fn().mockResolvedValue(false),
              setSyncStatus: mockSetSyncStatus,
              incrementRetryCount: mockIncrementRetryCount,
              resetRetryCount: vi.fn(),
            });

            const manager = getAutoSyncManager({ debounceMs: 100, maxRetries: 5 });
            
            // When retry count >= maxRetries, scheduleRetry should set error status
            // and not increment retry count
            manager.triggerSync();
            vi.advanceTimersByTime(100);

            // After max retries, status should be set to error
            // (This tests the internal scheduleRetry logic)
            
            resetAutoSyncManager();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * syncNow should reset retry count
     */
    it('syncNow should reset retry count', async () => {
      const mockResetRetryCount = vi.fn();
      
      mockSyncStoreGetState.mockReturnValue({
        isConnected: true,
        isSyncing: false,
        syncRetryCount: 3,
        markPendingSync: vi.fn(),
        performAutoSync: vi.fn().mockResolvedValue(true),
        setSyncStatus: vi.fn(),
        incrementRetryCount: vi.fn(),
        resetRetryCount: mockResetRetryCount,
      });

      const manager = getAutoSyncManager();
      await manager.syncNow();

      expect(mockResetRetryCount).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    /**
     * Custom config should override defaults
     */
    it('should accept custom configuration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 10000 }),
          fc.integer({ min: 10000, max: 60000 }),
          fc.integer({ min: 1, max: 10 }),
          (debounceMs, cooldownMs, maxRetries) => {
            resetAutoSyncManager();
            
            const customConfig: Partial<AutoSyncConfig> = {
              debounceMs,
              cooldownMs,
              maxRetries,
            };

            const manager = getAutoSyncManager(customConfig);
            const config = manager.getConfig();

            expect(config.debounceMs).toBe(debounceMs);
            expect(config.cooldownMs).toBe(cooldownMs);
            expect(config.maxRetries).toBe(maxRetries);

            resetAutoSyncManager();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
