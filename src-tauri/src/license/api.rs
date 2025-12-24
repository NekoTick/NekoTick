use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::license::LicenseError;

// Always use production API (no local development server)
const API_BASE: &str = "https://api.nekotick.com";

const TIMEOUT_SECS: u64 = 10;

// Request types
#[derive(Serialize)]
pub struct ActivateRequest {
    pub license_key: String,
    pub device_id: String,
}

#[derive(Serialize)]
pub struct DeactivateRequest {
    pub license_key: String,
    pub device_id: String,
}

#[derive(Serialize)]
pub struct ValidateRequest {
    pub license_key: String,
    pub device_id: String,
}

// Response types
#[derive(Deserialize, Debug)]
pub struct ActivateResponse {
    pub success: bool,
    pub activated_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub error_code: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct DeactivateResponse {
    pub success: bool,
    pub error_code: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ValidateResponse {
    pub success: bool,
    pub error_code: Option<String>,
    pub error: Option<String>,
}

pub struct ApiClient {
    client: Client,
}

impl ApiClient {
    pub fn new() -> Result<Self, LicenseError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(TIMEOUT_SECS))
            .build()
            .map_err(|e| LicenseError::NetworkError(e.to_string()))?;

        Ok(Self { client })
    }

    /// POST /activate
    pub async fn activate(
        &self,
        license_key: &str,
        device_id: &str,
    ) -> Result<ActivateResponse, LicenseError> {
        let url = format!("{}/activate", API_BASE);
        let request = ActivateRequest {
            license_key: license_key.to_string(),
            device_id: device_id.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        // Check for HTTP errors
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(LicenseError::NetworkError(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let result = response.json::<ActivateResponse>().await?;
        Ok(result)
    }

    /// POST /deactivate
    pub async fn deactivate(
        &self,
        license_key: &str,
        device_id: &str,
    ) -> Result<DeactivateResponse, LicenseError> {
        let url = format!("{}/deactivate", API_BASE);
        let request = DeactivateRequest {
            license_key: license_key.to_string(),
            device_id: device_id.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        // Check for HTTP errors
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(LicenseError::NetworkError(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let result = response.json::<DeactivateResponse>().await?;
        Ok(result)
    }

    /// POST /validate (background silent validation)
    pub async fn validate(
        &self,
        license_key: &str,
        device_id: &str,
    ) -> Result<ValidateResponse, LicenseError> {
        let url = format!("{}/validate", API_BASE);
        let request = ValidateRequest {
            license_key: license_key.to_string(),
            device_id: device_id.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        // Check for HTTP errors
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(LicenseError::NetworkError(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let result = response.json::<ValidateResponse>().await?;
        Ok(result)
    }
}

impl Default for ApiClient {
    fn default() -> Self {
        Self::new().expect("Failed to create API client")
    }
}
