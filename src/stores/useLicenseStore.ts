import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// Error code to Chinese message mapping
const ERROR_MESSAGES: Record<string, string> = {
  DEVICE_LIMIT_REACHED: '设备数量已达上限，请先解绑其他设备',
  INVALID_KEY: '激活码无效，请检查输入',
  EXPIRED: '激活码已过期',
  ALREADY_ACTIVATED: '此设备已激活',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
};

function getErrorMessage(errorCode: string | null, fallback?: string): string {
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }
  return fallback || '激活失败，请稍后重试';
}

// Types matching Rust structs
interface LicenseStatus {
  is_pro: boolean;
  is_trial: boolean;
  trial_ends_at: number | null;
  license_key: string | null;
  activated_at: number | null;
  expires_at: number | null;
  last_validated_at: number | null;
  needs_validation: boolean;
  in_grace_period: boolean;
  grace_period_ends_at: number | null;
  time_tamper_detected: boolean;
}

interface ActivationResult {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
}

interface ValidationResult {
  success: boolean;
  downgraded: boolean;
  in_grace_period: boolean;
}

interface LicenseState {
  // Status
  isProUser: boolean;
  isTrial: boolean;
  trialEndsAt: number | null;
  isLoading: boolean;
  licenseKey: string | null;
  activatedAt: number | null;
  expiresAt: number | null;
  lastValidatedAt: number | null;
  inGracePeriod: boolean;
  gracePeriodEndsAt: number | null;
  needsValidation: boolean;
  timeTamperDetected: boolean;
  
  // UI state
  error: string | null;
  isActivating: boolean;
  isDeactivating: boolean;
  isValidating: boolean;
}

interface LicenseActions {
  // Actions
  checkStatus: () => Promise<void>;
  ensureTrial: () => Promise<void>;
  activate: (licenseKey: string) => Promise<boolean>;
  deactivate: () => Promise<boolean>;
  validateBackground: () => Promise<void>;
  clearError: () => void;
  getTrialDaysRemaining: () => number | null;
  getTrialHoursRemaining: () => number | null;
  getTrialSecondsRemaining: () => number | null;
  getExpiryDaysRemaining: () => number | null;
}

type LicenseStore = LicenseState & LicenseActions;

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  // Initial state
  isProUser: false,
  isTrial: false,
  trialEndsAt: null,
  isLoading: true,
  licenseKey: null,
  activatedAt: null,
  expiresAt: null,
  lastValidatedAt: null,
  inGracePeriod: false,
  gracePeriodEndsAt: null,
  needsValidation: false,
  timeTamperDetected: false,
  error: null,
  isActivating: false,
  isDeactivating: false,
  isValidating: false,

  // Ensure trial is initialized (called on app startup)
  ensureTrial: async () => {
    try {
      await invoke('ensure_trial');
    } catch (err) {
      console.error('Failed to ensure trial:', err);
    }
  },

  // Check current license status
  checkStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<LicenseStatus>('get_license_status');
      set({
        isProUser: status.is_pro,
        isTrial: status.is_trial,
        trialEndsAt: status.trial_ends_at,
        licenseKey: status.license_key,
        activatedAt: status.activated_at,
        expiresAt: status.expires_at,
        lastValidatedAt: status.last_validated_at,
        inGracePeriod: status.in_grace_period,
        gracePeriodEndsAt: status.grace_period_ends_at,
        needsValidation: status.needs_validation,
        timeTamperDetected: status.time_tamper_detected,
        isLoading: false,
      });

      // Trigger background validation if needed (only for licensed users, not trial)
      if (status.needs_validation && status.is_pro && !status.is_trial) {
        get().validateBackground();
      }
    } catch (err) {
      console.error('Failed to check license status:', err);
      set({
        isProUser: false,
        isTrial: false,
        trialEndsAt: null,
        isLoading: false,
      });
    }
  },

  // Activate license
  activate: async (licenseKey: string) => {
    if (!licenseKey.trim()) {
      set({ error: '请输入激活码' });
      return false;
    }

    set({ isActivating: true, error: null });
    try {
      const result = await invoke<ActivationResult>('activate_license', {
        licenseKey: licenseKey.trim(),
      });

      if (result.success) {
        // Refresh status after activation
        await get().checkStatus();
        set({ isActivating: false });
        return true;
      } else {
        const errorMsg = getErrorMessage(result.error_code, result.error_message || undefined);
        set({ error: errorMsg, isActivating: false });
        return false;
      }
    } catch (err) {
      console.error('Activation failed:', err);
      const errorMsg = err instanceof Error && err.message.includes('network')
        ? ERROR_MESSAGES.NETWORK_ERROR
        : '激活失败，请稍后重试';
      set({ error: errorMsg, isActivating: false });
      return false;
    }
  },

  // Deactivate license (unbind device)
  deactivate: async () => {
    set({ isDeactivating: true, error: null });
    try {
      await invoke('deactivate_license');
      set({
        isProUser: false,
        isTrial: false,
        trialEndsAt: null,
        licenseKey: null,
        activatedAt: null,
        expiresAt: null,
        lastValidatedAt: null,
        inGracePeriod: false,
        gracePeriodEndsAt: null,
        needsValidation: false,
        timeTamperDetected: false,
        isDeactivating: false,
      });
      return true;
    } catch (err) {
      console.error('Deactivation failed:', err);
      set({
        error: '解绑失败，请稍后重试',
        isDeactivating: false,
      });
      return false;
    }
  },

  // Background silent validation
  validateBackground: async () => {
    set({ isValidating: true });
    try {
      const result = await invoke<ValidationResult>('validate_license_background');
      
      if (result.downgraded) {
        // License was invalidated
        set({
          isProUser: false,
          isTrial: false,
          trialEndsAt: null,
          licenseKey: null,
          activatedAt: null,
          expiresAt: null,
          lastValidatedAt: null,
          inGracePeriod: false,
          gracePeriodEndsAt: null,
          needsValidation: false,
          timeTamperDetected: false,
          isValidating: false,
        });
      } else if (result.success) {
        // Validation successful, update state
        // This also clears time tamper detection since we just validated
        set({ 
          needsValidation: false, 
          inGracePeriod: false,
          timeTamperDetected: false,
          isProUser: true,
          isValidating: false,
        });
      } else if (result.in_grace_period) {
        // In grace period, update state
        set({ inGracePeriod: true, needsValidation: false, isValidating: false });
      } else {
        // Validation failed but not downgraded (e.g., network error with time tamper)
        set({ isValidating: false });
      }
    } catch (err) {
      console.error('Background validation failed:', err);
      set({ isValidating: false });
      // Don't show error to user for background validation
    }
  },

  // Clear error message
  clearError: () => set({ error: null }),

  // Get trial days remaining
  getTrialDaysRemaining: () => {
    const { trialEndsAt, isTrial } = get();
    if (!isTrial || !trialEndsAt) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = trialEndsAt - now;
    if (remaining <= 0) return 0;
    
    return Math.ceil(remaining / (24 * 60 * 60));
  },

  // Get trial hours remaining
  getTrialHoursRemaining: () => {
    const { trialEndsAt, isTrial } = get();
    if (!isTrial || !trialEndsAt) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = trialEndsAt - now;
    if (remaining <= 0) return 0;
    
    return Math.ceil(remaining / (60 * 60));
  },

  // Get trial seconds remaining (for determining phase)
  getTrialSecondsRemaining: () => {
    const { trialEndsAt, isTrial } = get();
    if (!isTrial || !trialEndsAt) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = trialEndsAt - now;
    return remaining > 0 ? remaining : 0;
  },

  // Get expiry days remaining (for licensed users)
  getExpiryDaysRemaining: () => {
    const { expiresAt, isProUser, isTrial } = get();
    // Only for licensed users (not trial)
    if (!isProUser || isTrial || !expiresAt) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - now;
    if (remaining <= 0) return 0;
    
    return Math.ceil(remaining / (24 * 60 * 60));
  },
}));
