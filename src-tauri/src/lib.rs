mod ai;
mod cache_scan;
mod domain;
mod process_scan;
mod settings_store;

use anyhow::Result;
use nix::sys::signal::{kill as send_signal, Signal};
use nix::unistd::Pid;

pub use crate::domain::*;

fn current_parent_pid() -> Option<i32> {
    let output = std::process::Command::new("ps")
        .args(["-o", "ppid=", "-p", &std::process::id().to_string()])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout).trim().parse::<i32>().ok()
}

pub fn scan_ports_and_processes_service() -> Result<ScanCandidatesResponse> {
    process_scan::scan_ports_and_processes()
}

pub fn analyze_candidates_service(
    request: AnalyzeCandidatesRequest,
) -> Result<AnalyzeCandidatesResponse> {
    let settings = settings_store::load_settings()?;
    ai::analyze_candidates(&request, &settings)
}

pub fn load_settings_service() -> Result<Settings> {
    settings_store::load_settings()
}

pub fn save_settings_service(settings: Settings) -> Result<SaveSettingsResponse> {
    settings_store::save_settings(&settings)
}

pub fn scan_caches_service() -> Result<ScanCachesResponse> {
    cache_scan::scan_caches()
}

pub fn clean_caches_service(request: CleanCachesRequest) -> Result<CleanCachesResponse> {
    cache_scan::clean_caches(&request.categories)
}

fn pid_from_candidate_id(id: &str) -> Option<i32> {
    id.strip_prefix("proc_")?.parse::<i32>().ok()
}

pub fn kill_processes_service(request: KillRequest) -> Result<KillResponse> {
    let current_pid = std::process::id() as i32;
    let parent_pid = current_parent_pid();
    let latest_candidates = scan_ports_and_processes_service()?.candidates;

    let results = request
        .candidate_ids
        .iter()
        .map(|candidate_id| {
            let pid = match pid_from_candidate_id(candidate_id) {
                Some(pid) => pid,
                None => {
                    return KillResultItem {
                        candidate_id: candidate_id.clone(),
                        ok: false,
                        message: "无法从 candidateId 解析 PID".to_string(),
                    }
                }
            };

            if pid <= 1 {
                return KillResultItem {
                    candidate_id: candidate_id.clone(),
                    ok: false,
                    message: "系统关键 PID 不允许结束".to_string(),
                };
            }

            if pid == current_pid || parent_pid == Some(pid) {
                return KillResultItem {
                    candidate_id: candidate_id.clone(),
                    ok: false,
                    message: "当前应用或父级进程不允许结束".to_string(),
                };
            }

            if let Some(candidate) = latest_candidates.iter().find(|item| item.id == *candidate_id) {
                if candidate.risk_tags.iter().any(|tag| tag == "system-process") {
                    return KillResultItem {
                        candidate_id: candidate_id.clone(),
                        ok: false,
                        message: "系统进程默认禁止结束".to_string(),
                    };
                }
            }

            let signal = if request.force {
                Signal::SIGKILL
            } else {
                Signal::SIGTERM
            };

            match send_signal(Pid::from_raw(pid), signal) {
                Ok(()) => KillResultItem {
                    candidate_id: candidate_id.clone(),
                    ok: true,
                    message: format!("已发送 {:?}", signal),
                },
                Err(err) => KillResultItem {
                    candidate_id: candidate_id.clone(),
                    ok: false,
                    message: format!("发送信号失败: {err}"),
                },
            }
        })
        .collect::<Vec<_>>();

    Ok(KillResponse {
        results,
        executed_at: chrono::Local::now().to_rfc3339(),
    })
}

type AppResult<T> = std::result::Result<T, String>;

fn map_err<T>(result: Result<T>) -> AppResult<T> {
    result.map_err(|err| err.to_string())
}

#[tauri::command]
async fn scan_ports_and_processes() -> AppResult<ScanCandidatesResponse> {
    map_err(scan_ports_and_processes_service())
}

#[tauri::command]
async fn analyze_candidates(request: AnalyzeCandidatesRequest) -> AppResult<AnalyzeCandidatesResponse> {
    map_err(analyze_candidates_service(request))
}

#[tauri::command]
async fn kill_processes(request: KillRequest) -> AppResult<KillResponse> {
    map_err(kill_processes_service(request))
}

#[tauri::command]
async fn scan_caches() -> AppResult<ScanCachesResponse> {
    map_err(scan_caches_service())
}

#[tauri::command]
async fn clean_caches(request: CleanCachesRequest) -> AppResult<CleanCachesResponse> {
    map_err(clean_caches_service(request))
}

#[tauri::command]
async fn load_settings() -> AppResult<Settings> {
    map_err(load_settings_service())
}

#[tauri::command]
async fn save_settings(settings: Settings) -> AppResult<SaveSettingsResponse> {
    map_err(save_settings_service(settings))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_ports_and_processes,
            analyze_candidates,
            kill_processes,
            scan_caches,
            clean_caches,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
