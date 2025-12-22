//! Google Drive API client
//!
//! Provides file and folder operations for Google Drive.

use serde::{Deserialize, Serialize};

const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD_API_BASE: &str = "https://www.googleapis.com/upload/drive/v3";
const USERINFO_API: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

const APP_FOLDER_NAME: &str = "NekoTick_Data";

/// Google Drive file metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub modified_time: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

/// File list response from Drive API
#[derive(Debug, Deserialize)]
pub struct FileListResponse {
    pub files: Vec<DriveFile>,
}

/// User info response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub email: String,
    pub name: Option<String>,
}

/// Error types for Drive API operations
#[derive(Debug, thiserror::Error)]
pub enum DriveError {
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Not found")]
    NotFound,
    #[error("Rate limited")]
    RateLimited,
}

/// Google Drive API client
pub struct DriveClient {
    access_token: String,
    client: reqwest::Client,
}

impl DriveClient {
    /// Create a new Drive client with the given access token
    pub fn new(access_token: String) -> Self {
        Self {
            access_token,
            client: reqwest::Client::new(),
        }
    }

    /// Get user info (email)
    pub async fn get_user_info(&self) -> Result<UserInfo, DriveError> {
        let response = self
            .client
            .get(USERINFO_API)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        response
            .json::<UserInfo>()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))
    }

    /// Find or create the app folder (NekoTick_Data)
    pub async fn ensure_app_folder(&self) -> Result<String, DriveError> {
        // First, try to find existing folder
        if let Some(folder) = self.find_folder(APP_FOLDER_NAME).await? {
            return Ok(folder.id);
        }

        // Create new folder
        self.create_folder(APP_FOLDER_NAME).await
    }

    /// Find a folder by name in root
    async fn find_folder(&self, name: &str) -> Result<Option<DriveFile>, DriveError> {
        let query = format!(
            "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false",
            name
        );

        let url = format!(
            "{}/files?q={}&fields=files(id,name)",
            DRIVE_API_BASE,
            urlencoding::encode(&query)
        );

        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        let list: FileListResponse = response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))?;

        Ok(list.files.into_iter().next())
    }

    /// Create a folder in root
    async fn create_folder(&self, name: &str) -> Result<String, DriveError> {
        self.create_folder_in_parent(name, None).await
    }

    /// Create a folder in a specific parent folder
    pub async fn create_folder_in_parent(&self, name: &str, parent_id: Option<&str>) -> Result<String, DriveError> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct CreateFolderRequest {
            name: String,
            mime_type: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            parents: Option<Vec<String>>,
        }

        let request = CreateFolderRequest {
            name: name.to_string(),
            mime_type: "application/vnd.google-apps.folder".to_string(),
            parents: parent_id.map(|id| vec![id.to_string()]),
        };

        let response = self
            .client
            .post(&format!("{}/files", DRIVE_API_BASE))
            .bearer_auth(&self.access_token)
            .json(&request)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        let file: DriveFile = response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))?;

        Ok(file.id)
    }

    /// Find or create a subfolder within a parent folder
    pub async fn ensure_subfolder(&self, parent_id: &str, name: &str) -> Result<String, DriveError> {
        // First, try to find existing folder
        if let Some(folder) = self.find_file(parent_id, name).await? {
            if folder.mime_type.as_deref() == Some("application/vnd.google-apps.folder") {
                return Ok(folder.id);
            }
        }

        // Create new folder
        self.create_folder_in_parent(name, Some(parent_id)).await
    }

    /// List all files in a folder
    pub async fn list_files(&self, folder_id: &str) -> Result<Vec<DriveFile>, DriveError> {
        let query = format!(
            "'{}' in parents and trashed = false",
            folder_id
        );

        let url = format!(
            "{}/files?q={}&fields=files(id,name,modifiedTime,mimeType)",
            DRIVE_API_BASE,
            urlencoding::encode(&query)
        );

        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        let list: FileListResponse = response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))?;

        Ok(list.files)
    }

    /// Find a file by name in a folder
    pub async fn find_file(
        &self,
        folder_id: &str,
        name: &str,
    ) -> Result<Option<DriveFile>, DriveError> {
        let query = format!(
            "name = '{}' and '{}' in parents and trashed = false",
            name, folder_id
        );

        let url = format!(
            "{}/files?q={}&fields=files(id,name,modifiedTime,mimeType)",
            DRIVE_API_BASE,
            urlencoding::encode(&query)
        );

        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        let list: FileListResponse = response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))?;

        Ok(list.files.into_iter().next())
    }

    /// Upload or update a file
    pub async fn upload_file(
        &self,
        folder_id: &str,
        name: &str,
        content: &[u8],
    ) -> Result<DriveFile, DriveError> {
        // Check if file exists
        if let Some(existing) = self.find_file(folder_id, name).await? {
            // Update existing file
            self.update_file(&existing.id, content).await
        } else {
            // Create new file
            self.create_file(folder_id, name, content).await
        }
    }

    /// Create a new file
    async fn create_file(
        &self,
        folder_id: &str,
        name: &str,
        content: &[u8],
    ) -> Result<DriveFile, DriveError> {
        #[derive(Serialize)]
        struct FileMetadata {
            name: String,
            parents: Vec<String>,
        }

        let metadata = FileMetadata {
            name: name.to_string(),
            parents: vec![folder_id.to_string()],
        };

        let metadata_json = serde_json::to_string(&metadata)
            .map_err(|e| DriveError::ApiError(e.to_string()))?;

        // Use multipart upload
        let boundary = "nekotick_boundary";
        let body = format!(
            "--{boundary}\r\n\
            Content-Type: application/json; charset=UTF-8\r\n\r\n\
            {metadata_json}\r\n\
            --{boundary}\r\n\
            Content-Type: application/json\r\n\r\n"
        );

        let mut full_body = body.into_bytes();
        full_body.extend_from_slice(content);
        full_body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

        let response = self
            .client
            .post(&format!(
                "{}/files?uploadType=multipart&fields=id,name,modifiedTime",
                UPLOAD_API_BASE
            ))
            .bearer_auth(&self.access_token)
            .header(
                "Content-Type",
                format!("multipart/related; boundary={}", boundary),
            )
            .body(full_body)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))
    }

    /// Update an existing file
    async fn update_file(&self, file_id: &str, content: &[u8]) -> Result<DriveFile, DriveError> {
        let response = self
            .client
            .patch(&format!(
                "{}/files/{}?uploadType=media&fields=id,name,modifiedTime",
                UPLOAD_API_BASE, file_id
            ))
            .bearer_auth(&self.access_token)
            .header("Content-Type", "application/json")
            .body(content.to_vec())
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        response
            .json()
            .await
            .map_err(|e| DriveError::ApiError(e.to_string()))
    }

    /// Download a file by ID
    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>, DriveError> {
        let response = self
            .client
            .get(&format!("{}/files/{}?alt=media", DRIVE_API_BASE, file_id))
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| DriveError::NetworkError(e.to_string()))?;

        Self::check_status(response.status().as_u16())?;

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| DriveError::ApiError(e.to_string()))
    }

    /// Handle HTTP response status codes
    fn check_status(status: u16) -> Result<(), DriveError> {
        match status {
            200..=299 => Ok(()),
            401 => Err(DriveError::Unauthorized),
            404 => Err(DriveError::NotFound),
            429 => Err(DriveError::RateLimited),
            _ => Err(DriveError::ApiError(format!("HTTP {}", status))),
        }
    }
}
