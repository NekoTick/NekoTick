use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

use crate::license::LicenseError;

type HmacSha256 = Hmac<Sha256>;

const LICENSE_FILE_NAME: &str = ".license.dat";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseData {
    // License fields (existing, now optional for trial-only state)
    pub license_key: Option<String>,
    pub device_id: String,
    pub activated_at: Option<i64>,
    pub last_validated_at: Option<i64>,
    pub expires_at: Option<i64>,  // License expiry timestamp (milliseconds from API, stored as-is)
    
    // Trial fields (new)
    pub trial_started_at: Option<i64>,  // UTC timestamp when trial started
    pub trial_used: bool,               // Prevent repeated trials
    
    // Time tamper detection - using UTC (renamed for clarity)
    pub last_seen_utc_time: i64,
    
    // Signature (existing)
    pub signature: String,
}

impl LicenseData {
    /// Create new LicenseData for license activation (with license key)
    pub fn new_with_license(
        license_key: String,
        device_id: String,
        activated_at: i64,
        last_validated_at: i64,
        expires_at: Option<i64>,
    ) -> Self {
        let last_seen_utc_time = chrono::Utc::now().timestamp();
        let mut data = Self {
            license_key: Some(license_key),
            device_id,
            activated_at: Some(activated_at),
            last_validated_at: Some(last_validated_at),
            expires_at,
            trial_started_at: None,
            trial_used: true, // License activation marks trial as used
            last_seen_utc_time,
            signature: String::new(),
        };
        data.signature = data.compute_signature_internal();
        data
    }

    /// Create new LicenseData for trial (no license key)
    pub fn new_trial(device_id: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        let mut data = Self {
            license_key: None,
            device_id,
            activated_at: None,
            last_validated_at: None,
            expires_at: None,
            trial_started_at: Some(now),
            trial_used: false,
            last_seen_utc_time: now,
            signature: String::new(),
        };
        data.signature = data.compute_signature_internal();
        data
    }

    /// Compute HMAC-SHA256 signature (internal method using self)
    fn compute_signature_internal(&self) -> String {
        Self::compute_signature(
            &self.device_id,
            self.license_key.as_deref().unwrap_or(""),
            self.activated_at.unwrap_or(0),
            self.last_validated_at.unwrap_or(0),
            self.expires_at.unwrap_or(0),
            self.trial_started_at.unwrap_or(0),
            self.trial_used,
            self.last_seen_utc_time,
        )
    }

    /// Compute HMAC-SHA256 signature (static method for verification)
    pub fn compute_signature(
        device_id: &str,
        license_key: &str,
        activated_at: i64,
        last_validated_at: i64,
        expires_at: i64,
        trial_started_at: i64,
        trial_used: bool,
        last_seen_utc_time: i64,
    ) -> String {
        let message = format!(
            "{}:{}:{}:{}:{}:{}:{}",
            license_key, 
            activated_at, 
            last_validated_at,
            expires_at,
            trial_started_at,
            trial_used,
            last_seen_utc_time
        );

        let mut mac: HmacSha256 = Mac::new_from_slice(device_id.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(message.as_bytes());
        let result = mac.finalize();

        hex::encode(result.into_bytes())
    }

    /// Verify signature is valid
    pub fn verify_signature(&self) -> bool {
        let expected = self.compute_signature_internal();

        // Constant-time comparison to prevent timing attacks
        constant_time_eq(self.signature.as_bytes(), expected.as_bytes())
    }

    /// Update last_validated_at and recompute signature
    pub fn update_validation_time(&mut self, timestamp: i64) {
        self.last_validated_at = Some(timestamp);
        self.update_seen_time_and_signature();
    }

    /// Update last_seen_utc_time and recompute signature
    pub fn update_seen_time_and_signature(&mut self) {
        self.last_seen_utc_time = chrono::Utc::now().timestamp();
        self.signature = self.compute_signature_internal();
    }

    /// Update signature without changing time (for other field updates)
    pub fn update_signature(&mut self) {
        self.signature = self.compute_signature_internal();
    }

    /// Set license key (upgrade from trial to licensed)
    pub fn set_license(&mut self, license_key: String, activated_at: i64, last_validated_at: i64, expires_at: Option<i64>) {
        self.license_key = Some(license_key);
        self.activated_at = Some(activated_at);
        self.last_validated_at = Some(last_validated_at);
        self.expires_at = expires_at;
        self.trial_used = true;
        self.update_seen_time_and_signature();
    }

    /// Check if this is a trial-only state (no license)
    pub fn is_trial_only(&self) -> bool {
        self.license_key.is_none() && self.trial_started_at.is_some()
    }

    /// Check if has valid license key
    pub fn has_license(&self) -> bool {
        self.license_key.is_some()
    }
}

/// Constant-time comparison to prevent timing attacks
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

pub struct LicenseStore {
    file_path: PathBuf,
    device_id: String,
}

impl LicenseStore {
    pub fn new(app_data_dir: &PathBuf, device_id: String) -> Self {
        Self {
            file_path: app_data_dir.join(LICENSE_FILE_NAME),
            device_id,
        }
    }

    /// Derive AES encryption key from device_id
    fn derive_encryption_key(&self) -> [u8; 32] {
        let key_material = format!("{}nekotick_license_v1", self.device_id);
        let mut hasher = Sha256::new();
        hasher.update(key_material.as_bytes());
        let hash = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&hash[..32]);
        key
    }

    /// Encrypt and save to file
    pub fn save(&self, data: &LicenseData) -> Result<(), LicenseError> {
        let json = serde_json::to_string(data)?;
        let key = self.derive_encryption_key();
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| LicenseError::CryptoError(e.to_string()))?;

        // Generate random nonce
        let nonce_bytes: [u8; 12] = rand::random();
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt
        let ciphertext = cipher
            .encrypt(nonce, json.as_bytes())
            .map_err(|e| LicenseError::CryptoError(e.to_string()))?;

        // Write: nonce + ciphertext
        let mut output = Vec::with_capacity(12 + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        // Ensure parent directory exists
        if let Some(parent) = self.file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        std::fs::write(&self.file_path, output)?;
        Ok(())
    }

    /// Decrypt and load from file
    pub fn load(&self) -> Result<LicenseData, LicenseError> {
        if !self.file_path.exists() {
            return Err(LicenseError::NotFound);
        }

        let encrypted = std::fs::read(&self.file_path)?;
        if encrypted.len() < 12 {
            return Err(LicenseError::StorageError("Invalid file format".into()));
        }

        let key = self.derive_encryption_key();
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| LicenseError::CryptoError(e.to_string()))?;

        let nonce = Nonce::from_slice(&encrypted[..12]);
        let ciphertext = &encrypted[12..];

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| LicenseError::CryptoError("Decryption failed".into()))?;

        let data: LicenseData = serde_json::from_slice(&plaintext)?;

        // Verify signature
        if !data.verify_signature() {
            return Err(LicenseError::SignatureInvalid);
        }

        // Verify device_id matches
        if data.device_id != self.device_id {
            return Err(LicenseError::SignatureInvalid);
        }

        Ok(data)
    }

    /// Delete license file
    pub fn delete(&self) -> Result<(), LicenseError> {
        if self.file_path.exists() {
            std::fs::remove_file(&self.file_path)?;
        }
        Ok(())
    }

    /// Check if license file exists
    pub fn exists(&self) -> bool {
        self.file_path.exists()
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_license_data(device_id: &str) -> LicenseData {
        LicenseData::new_with_license(
            "NEKO-TEST-1234-5678".to_string(),
            device_id.to_string(),
            1703001600,
            1703001600,
            Some(1735603200), // expires_at: 2024-12-31
        )
    }

    fn create_test_trial_data(device_id: &str) -> LicenseData {
        LicenseData::new_trial(device_id.to_string())
    }

    #[test]
    fn test_signature_verification() {
        let data = create_test_license_data("test_device_id");
        assert!(data.verify_signature(), "Valid signature should verify");
    }

    #[test]
    fn test_trial_signature_verification() {
        let data = create_test_trial_data("test_device_id");
        assert!(data.verify_signature(), "Trial signature should verify");
        assert!(data.is_trial_only(), "Should be trial only");
        assert!(!data.has_license(), "Should not have license");
    }

    #[test]
    fn test_tampered_license_key_fails() {
        let mut data = create_test_license_data("test_device_id");
        data.license_key = Some("NEKO-FAKE-0000-0000".to_string());
        assert!(!data.verify_signature(), "Tampered license_key should fail");
    }

    #[test]
    fn test_tampered_activated_at_fails() {
        let mut data = create_test_license_data("test_device_id");
        data.activated_at = Some(9999999999);
        assert!(!data.verify_signature(), "Tampered activated_at should fail");
    }

    #[test]
    fn test_tampered_device_id_fails() {
        let mut data = create_test_license_data("test_device_id");
        data.device_id = "other_device".to_string();
        assert!(!data.verify_signature(), "Tampered device_id should fail");
    }

    #[test]
    fn test_tampered_trial_started_at_fails() {
        let mut data = create_test_trial_data("test_device_id");
        data.trial_started_at = Some(9999999999);
        assert!(!data.verify_signature(), "Tampered trial_started_at should fail");
    }

    #[test]
    fn test_tampered_trial_used_fails() {
        let mut data = create_test_trial_data("test_device_id");
        data.trial_used = true;
        assert!(!data.verify_signature(), "Tampered trial_used should fail");
    }

    #[test]
    fn test_store_round_trip() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_path_buf();
        let device_id = "test_device_12345";

        let store = LicenseStore::new(&path, device_id.to_string());
        let original = create_test_license_data(device_id);

        // Save
        store.save(&original).unwrap();
        assert!(store.exists(), "License file should exist after save");

        // Load
        let loaded = store.load().unwrap();
        assert_eq!(original.license_key, loaded.license_key);
        assert_eq!(original.device_id, loaded.device_id);
        assert_eq!(original.activated_at, loaded.activated_at);
    }

    #[test]
    fn test_trial_store_round_trip() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_path_buf();
        let device_id = "test_device_trial";

        let store = LicenseStore::new(&path, device_id.to_string());
        let original = create_test_trial_data(device_id);

        // Save
        store.save(&original).unwrap();
        assert!(store.exists(), "License file should exist after save");

        // Load
        let loaded = store.load().unwrap();
        assert_eq!(original.trial_started_at, loaded.trial_started_at);
        assert_eq!(original.trial_used, loaded.trial_used);
        assert!(loaded.is_trial_only(), "Loaded data should be trial only");
    }

    #[test]
    fn test_wrong_device_id_fails_load() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_path_buf();

        // Save with device A
        let store_a = LicenseStore::new(&path, "device_a".to_string());
        let data = create_test_license_data("device_a");
        store_a.save(&data).unwrap();

        // Try to load with device B (simulates copying file to another device)
        let store_b = LicenseStore::new(&path, "device_b".to_string());
        let result = store_b.load();
        
        // Should fail because decryption key is different
        assert!(result.is_err(), "Loading with wrong device_id should fail");
    }

    #[test]
    fn test_delete_license() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_path_buf();
        let device_id = "test_device";

        let store = LicenseStore::new(&path, device_id.to_string());
        let data = create_test_license_data(device_id);

        store.save(&data).unwrap();
        assert!(store.exists());

        store.delete().unwrap();
        assert!(!store.exists());
    }

    #[test]
    fn test_upgrade_trial_to_license() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_path_buf();
        let device_id = "test_device_upgrade";

        let store = LicenseStore::new(&path, device_id.to_string());
        
        // Start with trial
        let mut data = create_test_trial_data(device_id);
        assert!(data.is_trial_only());
        
        // Upgrade to license
        data.set_license("NEKO-UPGRADE-1234".to_string(), 1703001600, 1703001600, Some(1735603200));
        assert!(!data.is_trial_only());
        assert!(data.has_license());
        assert!(data.trial_used);
        assert!(data.verify_signature());

        // Save and reload
        store.save(&data).unwrap();
        let loaded = store.load().unwrap();
        assert!(loaded.has_license());
        assert!(loaded.verify_signature());
    }
}


#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;
    use tempfile::tempdir;

    // Generate random device IDs
    fn device_id_strategy() -> impl Strategy<Value = String> {
        "[a-zA-Z0-9]{16,64}".prop_map(|s| s)
    }

    // Generate random license keys
    fn license_key_strategy() -> impl Strategy<Value = String> {
        "NEKO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}".prop_map(|s| s)
    }

    // Generate random timestamps (within reasonable range)
    fn timestamp_strategy() -> impl Strategy<Value = i64> {
        // Range: 2020-01-01 to 2030-01-01
        1577836800i64..1893456000i64
    }

    proptest! {
        /// Property 1: Trial initialization idempotence
        /// Multiple calls to create trial should produce same trial_started_at
        #[test]
        fn test_trial_initialization_idempotence(device_id in device_id_strategy()) {
            let temp_dir = tempdir().unwrap();
            let path = temp_dir.path().to_path_buf();
            let store = LicenseStore::new(&path, device_id.clone());

            // First trial creation
            let trial1 = LicenseData::new_trial(device_id.clone());
            store.save(&trial1).unwrap();
            let loaded1 = store.load().unwrap();
            let trial_started_1 = loaded1.trial_started_at;

            // Simulate "second initialization" - should not change trial_started_at
            // In real code, ensure_trial_initialized checks if trial exists
            let loaded2 = store.load().unwrap();
            let trial_started_2 = loaded2.trial_started_at;

            prop_assert_eq!(trial_started_1, trial_started_2);
            prop_assert!(loaded2.verify_signature());
        }

        /// Property 4: Encryption key derivation determinism
        /// Same device_id should always produce same encryption key
        #[test]
        fn test_key_derivation_determinism(device_id in device_id_strategy()) {
            let temp_dir = tempdir().unwrap();
            let path = temp_dir.path().to_path_buf();
            
            let store1 = LicenseStore::new(&path, device_id.clone());
            let store2 = LicenseStore::new(&path, device_id.clone());

            // Create and save with store1
            let data = LicenseData::new_trial(device_id.clone());
            store1.save(&data).unwrap();

            // Load with store2 (same device_id)
            let loaded = store2.load();
            prop_assert!(loaded.is_ok(), "Same device_id should decrypt successfully");
        }

        /// Property 5: Encryption/decryption round-trip consistency
        /// Encrypt then decrypt should produce equivalent data
        #[test]
        fn test_encryption_round_trip(
            device_id in device_id_strategy(),
            license_key in license_key_strategy(),
            activated_at in timestamp_strategy(),
            last_validated_at in timestamp_strategy(),
            expires_at in timestamp_strategy()
        ) {
            let temp_dir = tempdir().unwrap();
            let path = temp_dir.path().to_path_buf();
            let store = LicenseStore::new(&path, device_id.clone());

            let original = LicenseData::new_with_license(
                license_key.clone(),
                device_id.clone(),
                activated_at,
                last_validated_at,
                Some(expires_at),
            );

            store.save(&original).unwrap();
            let loaded = store.load().unwrap();

            prop_assert_eq!(&original.license_key, &loaded.license_key);
            prop_assert_eq!(&original.device_id, &loaded.device_id);
            prop_assert_eq!(original.activated_at, loaded.activated_at);
            prop_assert_eq!(original.expires_at, loaded.expires_at);
            prop_assert!(loaded.verify_signature());
        }

        /// Property 6: Device binding enforcement
        /// Different device_id should fail to decrypt
        #[test]
        fn test_device_binding_enforcement(
            device_id_a in device_id_strategy(),
            device_id_b in device_id_strategy()
        ) {
            // Skip if device IDs happen to be the same
            prop_assume!(device_id_a != device_id_b);

            let temp_dir = tempdir().unwrap();
            let path = temp_dir.path().to_path_buf();

            // Save with device A
            let store_a = LicenseStore::new(&path, device_id_a.clone());
            let data = LicenseData::new_trial(device_id_a);
            store_a.save(&data).unwrap();

            // Try to load with device B
            let store_b = LicenseStore::new(&path, device_id_b);
            let result = store_b.load();

            prop_assert!(result.is_err(), "Different device_id should fail to decrypt");
        }

        /// Property 10: HMAC signature integrity
        /// Tampering any field should fail signature verification
        #[test]
        fn test_signature_integrity(device_id in device_id_strategy()) {
            let mut data = LicenseData::new_trial(device_id);
            prop_assert!(data.verify_signature(), "Original should verify");

            // Tamper with trial_started_at
            let original_trial = data.trial_started_at;
            data.trial_started_at = Some(data.trial_started_at.unwrap_or(0) + 1);
            prop_assert!(!data.verify_signature(), "Tampered trial_started_at should fail");
            data.trial_started_at = original_trial;

            // Tamper with trial_used
            data.trial_used = !data.trial_used;
            prop_assert!(!data.verify_signature(), "Tampered trial_used should fail");
        }
    }
}
