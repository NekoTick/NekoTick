/**
 * Property-based tests for SyncButton
 * 
 * Feature: auto-sync
 * Property 2: 手动同步按钮可见性
 * Property 3: 同步状态视觉反馈
 * Validates: Requirements 2.1, 2.7, 2.8, 3.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { SyncButton } from './SyncButton';
import type { SyncStatusType } from '@/stores/useSyncStore';

// Mock stores with proper types
interface MockSyncStore {
  isConnected: boolean;
  isSyncing: boolean;
  syncStatus: SyncStatusType;
  pendingSync: boolean;
  syncToCloud: ReturnType<typeof vi.fn>;
  syncError: string | null;
}

interface MockLicenseStore {
  isProUser: boolean;
}

const mockSyncStore: MockSyncStore = {
  isConnected: true,
  isSyncing: false,
  syncStatus: 'idle',
  pendingSync: false,
  syncToCloud: vi.fn(),
  syncError: null,
};

const mockLicenseStore: MockLicenseStore = {
  isProUser: false,
};

vi.mock('@/stores/useSyncStore', () => ({
  useSyncStore: () => mockSyncStore,
}));

vi.mock('@/stores/useLicenseStore', () => ({
  useLicenseStore: () => mockLicenseStore,
}));

describe('SyncButton', () => {
  beforeEach(() => {
    // Reset mocks
    mockSyncStore.isConnected = true;
    mockSyncStore.isSyncing = false;
    mockSyncStore.syncStatus = 'idle';
    mockSyncStore.pendingSync = false;
    mockSyncStore.syncError = null;
    mockLicenseStore.isProUser = false;
  });

  describe('Property 2: 手动同步按钮可见性', () => {
    /**
     * Property 2.1, 2.7, 2.8: Button visibility based on user state
     * For any combination of (PRO/non-PRO) × (connected/not connected),
     * button should only be visible when: non-PRO AND connected
     */
    it('should only be visible for non-PRO users connected to Google Drive', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isProUser
          fc.boolean(), // isConnected
          (isProUser, isConnected) => {
            // Setup
            mockLicenseStore.isProUser = isProUser;
            mockSyncStore.isConnected = isConnected;

            // Render
            const { container } = render(<SyncButton />);

            // Expected visibility: non-PRO AND connected
            const shouldBeVisible = !isProUser && isConnected;

            if (shouldBeVisible) {
              // Button should be rendered
              expect(container.querySelector('button')).not.toBeNull();
            } else {
              // Button should not be rendered
              expect(container.querySelector('button')).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * PRO users should never see the button
     */
    it('should never show for PRO users regardless of connection status', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isConnected
          (isConnected) => {
            mockLicenseStore.isProUser = true;
            mockSyncStore.isConnected = isConnected;

            const { container } = render(<SyncButton />);
            expect(container.querySelector('button')).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Disconnected users should never see the button
     */
    it('should never show when not connected to Google Drive', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isProUser
          (isProUser) => {
            mockLicenseStore.isProUser = isProUser;
            mockSyncStore.isConnected = false;

            const { container } = render(<SyncButton />);
            expect(container.querySelector('button')).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: 同步状态视觉反馈', () => {
    /**
     * Property 3.2: Visual states
     * For any sync status, the button should show appropriate visual feedback
     */
    it('should show pending indicator when pendingSync is true', () => {
      mockSyncStore.pendingSync = true;
      mockSyncStore.syncStatus = 'pending';

      const { container } = render(<SyncButton />);
      
      // Should have a pending indicator dot
      const dot = container.querySelector('.bg-blue-500');
      expect(dot).not.toBeNull();
    });

    it('should show error indicator when syncStatus is error', () => {
      mockSyncStore.syncStatus = 'error';
      mockSyncStore.syncError = 'Some error';

      const { container } = render(<SyncButton />);
      
      // Should have an error indicator dot
      const dot = container.querySelector('.bg-red-500');
      expect(dot).not.toBeNull();
    });

    it('should show spinning animation when syncing', () => {
      mockSyncStore.isSyncing = true;

      const { container } = render(<SyncButton />);
      
      // Should have animate-spin class
      const spinningIcon = container.querySelector('.animate-spin');
      expect(spinningIcon).not.toBeNull();
    });

    it('should show normal state when idle and no pending sync', () => {
      mockSyncStore.syncStatus = 'idle';
      mockSyncStore.pendingSync = false;
      mockSyncStore.syncError = null;

      const { container } = render(<SyncButton />);
      
      // Should not have any indicator dots
      const blueDot = container.querySelector('.bg-blue-500');
      const redDot = container.querySelector('.bg-red-500');
      expect(blueDot).toBeNull();
      expect(redDot).toBeNull();
    });

    /**
     * Status combinations should produce correct visual states
     */
    it('should handle all status combinations correctly', () => {
      const statuses = ['idle', 'pending', 'syncing', 'success', 'error'] as const;
      
      fc.assert(
        fc.property(
          fc.constantFrom(...statuses),
          fc.boolean(), // pendingSync
          fc.boolean(), // isSyncing
          (status, pendingSync, isSyncing) => {
            mockSyncStore.syncStatus = status;
            mockSyncStore.pendingSync = pendingSync;
            mockSyncStore.isSyncing = isSyncing;
            mockSyncStore.syncError = status === 'error' ? 'Error' : null;

            const { container } = render(<SyncButton />);
            const button = container.querySelector('button');
            
            // Button should always be rendered (for non-PRO connected users)
            expect(button).not.toBeNull();

            // If syncing, should show spinning animation
            if (isSyncing) {
              expect(container.querySelector('.animate-spin')).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
