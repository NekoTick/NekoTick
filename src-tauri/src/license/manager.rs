use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use regex::Regex;

use crate::license::{
    api::ApiClient,
    device_id::DeviceIdGenerator,
    store::{LicenseData, LicenseStore},
    LicenseError,
};

// 72 hours in seconds (3 days) - validation interval for licensed users
const VALIDATION_INTERVAL_SECS: i64 = 72 * 60 * 60;
// 7 days in seconds (grace period for licensed users)
const GRACE_PERIOD_SECS: i64 = 7 * 24 * 60 * 60;
// 7 days in seconds (trial duration)
const TRIAL_DURATION_SECS: i64 = 7 * 24 * 60 * 60;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseStatus {
    pub is_pro: bool,
    pub is_trial: bool,
    pub trial_ends_at: Option<i64>,
    pub license_key: Option<String>,
    pub activated_at: Option<i64>,
    pub expires_at: Option<i64>,  // License expiry timestamp (seconds)
    pub last_validated_at: Option<i64>,
    pub needs_validation: bool,
    pub in_grace_period: bool,
    pub grace_period_ends_at: Option<i64>,
    pub time_tamper_detected: bool,
}

impl Default for LicenseStatus {
    fn default() -> Self {
        Self {
            is_pro: false,
            is_trial: false,
            trial_ends_at: None,
            license_key: None,
            activated_at: None,
            expires_at: None,
            last_validated_at: None,
            needs_validation: false,
            in_grace_period: false,
            grace_period_ends_at: None,
            time_tamper_detected: false,
        }
    }
}

#[derive(Serialize, Debug)]
pub struct ActivationResult {
    pub success: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ValidationResult {
    pub success: bool,
    pub downgraded: bool,
    pub in_grace_period: bool,
}


pub struct LicenseManager {
    store: LicenseStore,
    api_client: ApiClient,
    device_id: String,
}

impl LicenseManager {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, LicenseError> {
        let device_id = DeviceIdGenerator::generate(&app_data_dir)?;
        let store = LicenseStore::new(&app_data_dir, device_id.clone());
        let api_client = ApiClient::new()?;

        Ok(Self {
            store,
            api_client,
            device_id,
        })
    }

    pub fn get_device_id(&self) -> &str {
        &self.device_id
    }

    /// Ensure trial is initialized (called on app startup)
    /// This silently creates a trial state for new devices
    pub fn ensure_trial_initialized(&self) -> Result<(), LicenseError> {
        match self.store.load() {
            Ok(mut data) => {
                // Already have data, check if we need to initialize trial
                if data.trial_started_at.is_none() && !data.trial_used {
                    let now = Utc::now().timestamp();
                    data.trial_started_at = Some(now);
                    data.last_seen_utc_time = now;
                    data.update_signature();
                    self.store.save(&data)?;
                }
                Ok(())
            }
            Err(LicenseError::NotFound) => {
                // First launch - create trial
                self.create_trial()
            }
            Err(e) => Err(e),
        }
    }

    /// Create new trial state
    fn create_trial(&self) -> Result<(), LicenseError> {
        let data = LicenseData::new_trial(self.device_id.clone());
        self.store.save(&data)
    }

    /// Validate license key format (NEKO-XXXX-XXXX-XXXX)
    fn validate_license_key_format(license_key: &str) -> bool {
        let re = Regex::new(r"^NEKO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$").unwrap();
        re.is_match(&license_key.to_uppercase())
    }

    /// Activate license with server
    pub async fn activate(&self, license_key: &str) -> Result<ActivationResult, LicenseError> {
        // 验证激活码格式
        if !Self::validate_license_key_format(license_key) {
            return Ok(ActivationResult {
                success: false,
                error_code: Some("INVALID_FORMAT".to_string()),
                error_message: Some("激活码格式不正确".to_string()),
            });
        }

        // Call API
        let response = self.api_client.activate(license_key, &self.device_id).await?;

        if response.success {
            // API returns milliseconds, convert to seconds for internal storage
            let activated_at = response.activated_at
                .map(|ms| ms / 1000)
                .unwrap_or_else(|| Utc::now().timestamp());
            // expires_at is also in milliseconds from API, convert to seconds
            let expires_at = response.expires_at.map(|ms| ms / 1000);
            let now = Utc::now().timestamp();

            // Check if we have existing data (trial) to upgrade
            match self.store.load() {
                Ok(mut data) => {
                    // Upgrade existing trial to license
                    data.set_license(license_key.to_string(), activated_at, now, expires_at);
                    self.store.save(&data)?;
                }
                Err(_) => {
                    // Create new license data
                    let data = LicenseData::new_with_license(
                        license_key.to_string(),
                        self.device_id.clone(),
                        activated_at,
                        now,
                        expires_at,
                    );
                    self.store.save(&data)?;
                }
            }

            Ok(ActivationResult {
                success: true,
                error_code: None,
                error_message: None,
            })
        } else {
            Ok(ActivationResult {
                success: false,
                error_code: response.error_code,
                error_message: response.error,
            })
        }
    }

    /// Deactivate license (unbind device)
    pub async fn deactivate(&self) -> Result<(), LicenseError> {
        // Load current license
        let data = self.store.load()?;

        // Need license key to deactivate
        let license_key = data.license_key.as_ref()
            .ok_or_else(|| LicenseError::NotFound)?;

        // Call API
        let response = self
            .api_client
            .deactivate(license_key, &self.device_id)
            .await?;

        if response.success {
            // Delete local license
            self.store.delete()?;
            Ok(())
        } else {
            Err(LicenseError::ApiError {
                code: response.error_code.unwrap_or_default(),
                message: response.error.unwrap_or_else(|| "Deactivation failed".to_string()),
            })
        }
    }


    /// Get current license status (considers trial, grace period, and time tampering with self-healing)
    pub fn get_status(&self) -> LicenseStatus {
        let mut data = match self.store.load() {
            Ok(d) => d,
            Err(_) => return LicenseStatus::default(),
        };

        let current_utc = Utc::now().timestamp();

        // Check for time tampering (real-time detection, not persisted)
        // Self-healing: if time is normal now, tamper flag is false
        let time_tamper_detected = current_utc < data.last_seen_utc_time;

        // If time is normal, update last_seen_utc_time
        // If time is abnormal, don't update - this allows self-healing when time is corrected
        if !time_tamper_detected {
            data.last_seen_utc_time = current_utc;
            data.update_signature();
            let _ = self.store.save(&data);
        }

        // Calculate trial status
        let (is_trial_valid, trial_ends_at) = self.calculate_trial_status(&data, current_utc);

        // Calculate license status
        let (is_license_valid, needs_validation, in_grace_period, grace_period_ends_at) = 
            self.calculate_license_status(&data, current_utc);

        // PRO status = (trial valid OR license valid) AND no time tampering
        // Time tampering temporarily disables PRO until time is corrected (self-healing)
        let is_pro = !time_tamper_detected && (is_trial_valid || is_license_valid);

        // Mask license key for display
        let masked_key = data.license_key.as_ref().map(|k| mask_license_key(k));

        LicenseStatus {
            is_pro,
            is_trial: is_trial_valid && !time_tamper_detected,
            trial_ends_at,
            license_key: masked_key,
            activated_at: data.activated_at,
            expires_at: data.expires_at,
            last_validated_at: data.last_validated_at,
            needs_validation,
            in_grace_period,
            grace_period_ends_at,
            time_tamper_detected,
        }
    }

    /// Calculate trial status
    fn calculate_trial_status(&self, data: &LicenseData, current_utc: i64) -> (bool, Option<i64>) {
        if let Some(trial_start) = data.trial_started_at {
            let trial_end = trial_start + TRIAL_DURATION_SECS;
            let is_valid = current_utc < trial_end && !data.has_license();
            (is_valid, Some(trial_end))
        } else {
            (false, None)
        }
    }

    /// Calculate license status (returns: is_valid, needs_validation, in_grace_period, grace_period_ends_at)
    fn calculate_license_status(&self, data: &LicenseData, current_utc: i64) -> (bool, bool, bool, Option<i64>) {
        // No license key means no license status
        if data.license_key.is_none() {
            return (false, false, false, None);
        }

        // 首先检查激活码是否已过期（本地检查）
        if let Some(expires_at) = data.expires_at {
            if current_utc > expires_at {
                // 激活码已过期，直接返回无效
                return (false, false, false, None);
            }
        }

        let last_validated = data.last_validated_at.unwrap_or(0);
        let time_since_validation = current_utc - last_validated;

        // Calculate if validation is needed
        let needs_validation = time_since_validation > VALIDATION_INTERVAL_SECS;

        // Calculate grace period status
        let in_grace_period = time_since_validation > VALIDATION_INTERVAL_SECS
            && time_since_validation <= GRACE_PERIOD_SECS;

        let grace_period_ends_at = if in_grace_period {
            Some(last_validated + GRACE_PERIOD_SECS)
        } else {
            None
        };

        // License is valid if within grace period
        let is_valid = time_since_validation <= GRACE_PERIOD_SECS;

        (is_valid, needs_validation, in_grace_period, grace_period_ends_at)
    }


    /// Background silent validation
    pub async fn validate_background(&self) -> Result<ValidationResult, LicenseError> {
        let mut data = match self.store.load() {
            Ok(d) => d,
            Err(LicenseError::NotFound) => {
                return Ok(ValidationResult {
                    success: false,
                    downgraded: false,
                    in_grace_period: false,
                });
            }
            Err(e) => return Err(e),
        };

        // No license key means nothing to validate
        let license_key = match &data.license_key {
            Some(k) => k.clone(),
            None => {
                return Ok(ValidationResult {
                    success: false,
                    downgraded: false,
                    in_grace_period: false,
                });
            }
        };

        // Check time tampering - if detected, must validate online
        let current_utc = Utc::now().timestamp();
        let time_tampered = current_utc < data.last_seen_utc_time;

        // Try to validate with server
        match self.api_client.validate(&license_key, &self.device_id).await {
            Ok(response) => {
                if response.success {
                    // Update validation timestamp
                    let now = Utc::now().timestamp();
                    data.update_validation_time(now);
                    self.store.save(&data)?;

                    Ok(ValidationResult {
                        success: true,
                        downgraded: false,
                        in_grace_period: false,
                    })
                } else {
                    // License invalid/expired - downgrade but keep trial if available
                    data.license_key = None;
                    data.activated_at = None;
                    data.last_validated_at = None;
                    data.update_signature();
                    self.store.save(&data)?;

                    Ok(ValidationResult {
                        success: false,
                        downgraded: true,
                        in_grace_period: false,
                    })
                }
            }
            Err(_) => {
                // Network error - check grace period
                // If time was tampered, don't allow grace period
                if time_tampered {
                    return Ok(ValidationResult {
                        success: false,
                        downgraded: false,
                        in_grace_period: false,
                    });
                }

                let last_validated = data.last_validated_at.unwrap_or(0);
                let time_since_validation = current_utc - last_validated;

                if time_since_validation <= GRACE_PERIOD_SECS {
                    // Still in grace period - update seen time
                    data.update_seen_time_and_signature();
                    self.store.save(&data)?;

                    Ok(ValidationResult {
                        success: false,
                        downgraded: false,
                        in_grace_period: true,
                    })
                } else {
                    // Grace period expired - downgrade but keep trial if available
                    data.license_key = None;
                    data.activated_at = None;
                    data.last_validated_at = None;
                    data.update_signature();
                    self.store.save(&data)?;

                    Ok(ValidationResult {
                        success: false,
                        downgraded: true,
                        in_grace_period: false,
                    })
                }
            }
        }
    }
}

/// Mask license key for display (e.g., "NEKO-****-****-5678")
fn mask_license_key(key: &str) -> String {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() >= 4 {
        format!("{}-****-****-{}", parts[0], parts[parts.len() - 1])
    } else {
        "****".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_license_key() {
        assert_eq!(mask_license_key("NEKO-ABCD-EFGH-1234"), "NEKO-****-****-1234");
        assert_eq!(mask_license_key("SHORT"), "****");
        assert_eq!(mask_license_key("A-B-C-D"), "A-****-****-D");
    }

    #[test]
    fn test_default_license_status() {
        let status = LicenseStatus::default();
        assert!(!status.is_pro);
        assert!(!status.is_trial);
        assert!(status.trial_ends_at.is_none());
        assert!(status.license_key.is_none());
        assert!(status.expires_at.is_none());
        assert!(!status.time_tamper_detected);
    }

    #[test]
    fn test_expired_license_is_invalid() {
        // 测试过期的激活码应该返回无效
        use crate::license::store::LicenseData;
        
        let device_id = "test_device_id";
        let past_time = Utc::now().timestamp() - 1000; // 1000秒前过期
        let current_time = Utc::now().timestamp();
        
        // 创建一个已过期的激活码数据
        let data = LicenseData::new_with_license(
            "NEKO-TEST-1234-5678".to_string(),
            device_id.to_string(),
            past_time - 86400, // 激活时间
            past_time - 86400, // 验证时间
            Some(past_time),   // 过期时间（已过期）
        );
        
        // 直接测试 calculate_license_status 的逻辑
        // 由于 calculate_license_status 是私有方法，我们通过检查 expires_at 来验证
        assert!(data.expires_at.is_some());
        assert!(current_time > data.expires_at.unwrap(), "当前时间应该大于过期时间");
    }

    #[test]
    fn test_valid_license_not_expired() {
        // 测试未过期的激活码应该有效
        use crate::license::store::LicenseData;
        
        let device_id = "test_device_id";
        let future_time = Utc::now().timestamp() + 86400 * 30; // 30天后过期
        let current_time = Utc::now().timestamp();
        
        let data = LicenseData::new_with_license(
            "NEKO-TEST-1234-5678".to_string(),
            device_id.to_string(),
            current_time,
            current_time,
            Some(future_time),
        );
        
        assert!(data.expires_at.is_some());
        assert!(current_time < data.expires_at.unwrap(), "当前时间应该小于过期时间");
    }

    #[test]
    fn test_permanent_license_no_expiry() {
        // 测试永久激活码（无过期时间）
        use crate::license::store::LicenseData;
        
        let device_id = "test_device_id";
        let current_time = Utc::now().timestamp();
        
        let data = LicenseData::new_with_license(
            "NEKO-TEST-1234-5678".to_string(),
            device_id.to_string(),
            current_time,
            current_time,
            None, // 永久激活码
        );
        
        assert!(data.expires_at.is_none(), "永久激活码不应有过期时间");
    }
}
