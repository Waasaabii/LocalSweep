use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortBinding {
    pub port: u16,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub process_name: String,
    pub pid: i32,
    pub icon: Option<String>,
    pub ports: Vec<PortBinding>,
    pub executable_path: String,
    pub command_summary: String,
    pub project_path: Option<String>,
    pub cpu_percent: f64,
    pub memory_mb: f64,
    pub started_at: String,
    pub status: String,
    pub risk_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCandidatesResponse {
    pub candidates: Vec<Candidate>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCandidatesRequest {
    pub scope: String,
    pub candidates: Vec<Candidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub candidate_id: String,
    pub recommendation: String,
    pub reason: String,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCandidatesResponse {
    pub summary: String,
    pub suggestions: Vec<AiSuggestion>,
    pub analyzed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillRequest {
    pub candidate_ids: Vec<String>,
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillResultItem {
    pub candidate_id: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillResponse {
    pub results: Vec<KillResultItem>,
    pub executed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheCategoryResult {
    pub category: String,
    pub path: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCachesResponse {
    pub categories: Vec<CacheCategoryResult>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCachesRequest {
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCacheResultItem {
    pub category: String,
    pub ok: bool,
    pub removed_bytes: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCachesResponse {
    pub results: Vec<CleanCacheResultItem>,
    pub cleaned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub timeout_seconds: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            endpoint: "http://localhost:11434/v1".to_string(),
            api_key: String::new(),
            model: "qwen2.5:14b".to_string(),
            timeout_seconds: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettingsResponse {
    pub saved_at: String,
}
