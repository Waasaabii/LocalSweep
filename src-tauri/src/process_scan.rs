use std::{
    fs,
    hash::{Hash, Hasher},
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
};

use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use regex::Regex;

use crate::domain::{Candidate, PortBinding, ScanCandidatesResponse};

#[derive(Debug, Clone, Default)]
struct AppBundleMetadata {
    display_name: Option<String>,
    icon_data_url: Option<String>,
}

static APP_BUNDLE_CACHE: OnceLock<Mutex<HashMap<String, AppBundleMetadata>>> = OnceLock::new();

#[derive(Debug, Clone)]
struct ProcessSnapshot {
    pid: i32,
    cpu_percent: f64,
    memory_mb: f64,
    state: String,
    started_at: String,
    executable_path: String,
    command_summary: String,
}

pub fn scan_ports_and_processes() -> Result<ScanCandidatesResponse> {
    let ports_by_pid = collect_ports()?;
    let mut candidates = collect_processes()?
        .into_iter()
        .map(|process| {
            let pid = process.pid;
            build_candidate(&process, ports_by_pid.get(&pid))
        })
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| {
        right
            .ports
            .len()
            .cmp(&left.ports.len())
            .then_with(|| right.cpu_percent.total_cmp(&left.cpu_percent))
            .then_with(|| right.memory_mb.total_cmp(&left.memory_mb))
            .then_with(|| left.process_name.cmp(&right.process_name))
    });

    Ok(ScanCandidatesResponse {
        candidates,
        scanned_at: chrono::Local::now().to_rfc3339(),
    })
}

fn build_candidate(snapshot: &ProcessSnapshot, maybe_ports: Option<&Vec<PortBinding>>) -> Candidate {
    let ports = maybe_ports.cloned().unwrap_or_default();
    let resolved_executable_path = resolve_executable_path(snapshot);
    let bundle_metadata = app_bundle_metadata(&resolved_executable_path);
    let process_name = process_name_from_snapshot(snapshot, &bundle_metadata, &resolved_executable_path);
    let project_path = infer_project_path(snapshot, &resolved_executable_path);
    let status = normalize_status(&snapshot.state);
    let risk_tags = infer_risk_tags(snapshot, &ports, &process_name, &resolved_executable_path);

    Candidate {
        id: format!("proc_{}", snapshot.pid),
        process_name,
        pid: snapshot.pid,
        icon: bundle_metadata.icon_data_url,
        ports,
        executable_path: resolved_executable_path,
        command_summary: snapshot.command_summary.clone(),
        project_path,
        cpu_percent: snapshot.cpu_percent,
        memory_mb: snapshot.memory_mb,
        started_at: snapshot.started_at.clone(),
        status,
        risk_tags,
    }
}

fn process_name_from_snapshot(
    snapshot: &ProcessSnapshot,
    bundle_metadata: &AppBundleMetadata,
    executable_path: &str,
) -> String {
    if let Some(display_name) = bundle_metadata.display_name.as_ref().filter(|value| !value.is_empty())
    {
        return display_name.clone();
    }

    let executable = PathBuf::from(executable_path);
    executable
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            snapshot
                .command_summary
                .split_whitespace()
                .next()
                .unwrap_or("unknown")
                .to_string()
        })
}

fn resolve_executable_path(snapshot: &ProcessSnapshot) -> String {
    if snapshot.executable_path.starts_with('/') && Path::new(&snapshot.executable_path).exists() {
        return snapshot.executable_path.clone();
    }

    for token in snapshot.command_summary.split_whitespace() {
        let candidate = token.trim_matches('"');
        if candidate.starts_with('/') && Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }

    snapshot.executable_path.clone()
}

fn app_bundle_metadata(executable_path: &str) -> AppBundleMetadata {
    let Some(bundle_path) = find_app_bundle_path(executable_path) else {
        return AppBundleMetadata::default();
    };

    let cache_key = bundle_path.to_string_lossy().to_string();
    let cache = APP_BUNDLE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.get(&cache_key) {
            return cached.clone();
        }
    }

    let metadata = load_app_bundle_metadata(&bundle_path).unwrap_or_else(|_| AppBundleMetadata {
        display_name: bundle_path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string()),
        icon_data_url: None,
    });

    if let Ok(mut guard) = cache.lock() {
        guard.insert(cache_key, metadata.clone());
    }

    metadata
}

fn find_app_bundle_path(executable_path: &str) -> Option<PathBuf> {
    let mut current = PathBuf::from(executable_path);
    loop {
        if current.extension().and_then(|value| value.to_str()) == Some("app") {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn load_app_bundle_metadata(bundle_path: &Path) -> Result<AppBundleMetadata> {
    let plist_path = bundle_path.join("Contents/Info.plist");
    let display_name = read_plist_string(&plist_path, "CFBundleDisplayName")
        .or_else(|| read_plist_string(&plist_path, "CFBundleName"))
        .or_else(|| {
            bundle_path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(|value| value.to_string())
        });

    let icon_data_url = resolve_bundle_icon_data_url(bundle_path, &plist_path);

    Ok(AppBundleMetadata {
        display_name,
        icon_data_url,
    })
}

fn read_plist_string(plist_path: &Path, key: &str) -> Option<String> {
    let output = Command::new("plutil")
        .args(["-extract", key, "raw", "-o", "-"])
        .arg(plist_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() || value == "null" {
        None
    } else {
        Some(value)
    }
}

fn resolve_bundle_icon_data_url(bundle_path: &Path, plist_path: &Path) -> Option<String> {
    let icon_name = read_plist_string(plist_path, "CFBundleIconFile")
        .or_else(|| read_plist_string(plist_path, "CFBundleIconName"))?;
    let resources_path = bundle_path.join("Contents/Resources");
    let icon_path = resolve_icon_file_path(&resources_path, &icon_name)?;
    load_icon_data_url(bundle_path, &icon_path)
}

fn resolve_icon_file_path(resources_path: &Path, icon_name: &str) -> Option<PathBuf> {
    let candidate = resources_path.join(icon_name);
    if candidate.exists() {
        return Some(candidate);
    }

    for extension in ["icns", "png", "jpg", "jpeg"] {
        let with_extension = resources_path.join(format!("{icon_name}.{extension}"));
        if with_extension.exists() {
            return Some(with_extension);
        }
    }

    None
}

fn load_icon_data_url(bundle_path: &Path, icon_path: &Path) -> Option<String> {
    let extension = icon_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "icns" {
        return materialize_icns_data_url(bundle_path, icon_path);
    }

    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return None,
    };
    data_url_from_file(icon_path, mime)
}

fn materialize_icns_data_url(bundle_path: &Path, icon_path: &Path) -> Option<String> {
    let cache_dir = dirs::cache_dir()?.join("localsweep/icon-cache");
    fs::create_dir_all(&cache_dir).ok()?;

    let hashed_name = stable_hash(&bundle_path.to_string_lossy());
    let png_path = cache_dir.join(format!("{hashed_name}.png"));

    if !png_path.exists() {
        let output = Command::new("sips")
            .args(["-z", "64", "64", "-s", "format", "png"])
            .arg(icon_path)
            .args(["--out"])
            .arg(&png_path)
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }
    }

    data_url_from_file(&png_path, "image/png")
}

fn data_url_from_file(path: &Path, mime: &str) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        BASE64_STANDARD.encode(bytes)
    ))
}

fn stable_hash(value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn normalize_status(state: &str) -> String {
    match state.chars().next().unwrap_or_default() {
        'R' => "running".to_string(),
        'S' | 'I' => "sleeping".to_string(),
        'T' => "stopped".to_string(),
        _ => "unknown".to_string(),
    }
}

fn infer_risk_tags(
    snapshot: &ProcessSnapshot,
    ports: &[PortBinding],
    process_name: &str,
    executable_path: &str,
) -> Vec<String> {
    let mut tags = BTreeSet::new();

    if ports.iter().any(|port| matches!(port.port, 11434 | 3000 | 5173 | 8000 | 8080)) {
        tags.insert("dev-service".to_string());
    }

    if ports.iter().any(|port| port.port == 11434) || process_name.eq_ignore_ascii_case("ollama") {
        tags.insert("model-service".to_string());
    }

    if snapshot.cpu_percent >= 50.0 {
        tags.insert("high-cpu".to_string());
    }

    if snapshot.memory_mb >= 1024.0 {
        tags.insert("high-memory".to_string());
    }

    if executable_path.starts_with("/System/")
        || executable_path.starts_with("/usr/libexec/")
        || executable_path.starts_with("/sbin/")
    {
        tags.insert("system-process".to_string());
    }

    if snapshot.pid == std::process::id() as i32 {
        tags.insert("current-app".to_string());
    }

    tags.into_iter().collect()
}

fn infer_project_path(snapshot: &ProcessSnapshot, executable_path: &str) -> Option<String> {
    let mut candidates = Vec::new();

    if !executable_path.is_empty() {
        candidates.push(executable_path.to_string());
    }

    for token in snapshot.command_summary.split_whitespace() {
        if token.starts_with('/') {
            candidates.push(token.trim_matches('"').to_string());
        }
    }

    for candidate in candidates {
        let path = PathBuf::from(&candidate);
        let start = if path.is_dir() {
            path
        } else {
            path.parent().map(Path::to_path_buf).unwrap_or(path)
        };

        if let Some(found) = find_project_root(&start) {
            return Some(found.to_string_lossy().to_string());
        }
    }

    None
}

fn find_project_root(start: &Path) -> Option<PathBuf> {
    let markers = ["package.json", "pnpm-lock.yaml", "Cargo.toml", "go.mod", ".git"];
    let mut current = Some(start.to_path_buf());
    let mut depth = 0;

    while let Some(path) = current {
        if markers.iter().any(|marker| path.join(marker).exists()) {
            return Some(path);
        }

        depth += 1;
        if depth > 6 {
            return None;
        }

        current = path.parent().map(Path::to_path_buf);
    }

    None
}

fn collect_processes() -> Result<Vec<ProcessSnapshot>> {
    let output = Command::new("ps")
        .args([
            "-axo",
            "pid=,%cpu=,rss=,state=,lstart=,comm=,command=",
        ])
        .output()
        .context("执行 ps 失败")?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "ps 执行失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let regex = Regex::new(
        r"^\s*(\d+)\s+([0-9.]+)\s+(\d+)\s+(\S+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s*(.*)$",
    )
    .expect("invalid process regex");

    let mut processes = Vec::new();

    for line in raw.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }

        if let Some(captures) = regex.captures(line) {
            let pid = captures.get(1).and_then(|value| value.as_str().parse::<i32>().ok());
            let cpu_percent = captures
                .get(2)
                .and_then(|value| value.as_str().parse::<f64>().ok());
            let rss_kb = captures.get(3).and_then(|value| value.as_str().parse::<f64>().ok());
            let state = captures.get(4).map(|value| value.as_str().to_string());
            let started_at = captures.get(5).map(|value| value.as_str().to_string());
            let executable_path = captures.get(6).map(|value| value.as_str().to_string());
            let command_summary = captures.get(7).map(|value| value.as_str().trim().to_string());

            if let (
                Some(pid),
                Some(cpu_percent),
                Some(rss_kb),
                Some(state),
                Some(started_at),
                Some(executable_path),
                Some(command_summary),
            ) = (
                pid,
                cpu_percent,
                rss_kb,
                state,
                started_at,
                executable_path,
                command_summary,
            ) {
                processes.push(ProcessSnapshot {
                    pid,
                    cpu_percent,
                    memory_mb: rss_kb / 1024.0,
                    state,
                    started_at,
                    executable_path,
                    command_summary,
                });
            }
        }
    }

    Ok(processes)
}

fn collect_ports() -> Result<HashMap<i32, Vec<PortBinding>>> {
    let mut result = HashMap::<i32, Vec<PortBinding>>::new();
    collect_ports_for_protocol("tcp", &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], &mut result)?;
    collect_ports_for_protocol("udp", &["-nP", "-iUDP", "-Fpn"], &mut result)?;

    for ports in result.values_mut() {
        ports.sort_by_key(|binding| binding.port);
        ports.dedup_by(|left, right| left.port == right.port && left.protocol == right.protocol);
    }

    Ok(result)
}

fn collect_ports_for_protocol(
    protocol: &str,
    args: &[&str],
    output: &mut HashMap<i32, Vec<PortBinding>>,
) -> Result<()> {
    let result = Command::new("lsof")
        .args(args)
        .output()
        .with_context(|| format!("执行 lsof 失败: {}", args.join(" ")))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        if stderr.contains("No such file or directory") {
            return Ok(());
        }
        return Err(anyhow::anyhow!("lsof 执行失败: {stderr}"));
    }

    let raw = String::from_utf8_lossy(&result.stdout);
    let mut current_pid: Option<i32> = None;

    for line in raw.lines() {
        if let Some(value) = line.strip_prefix('p') {
            current_pid = value.parse::<i32>().ok();
            continue;
        }

        if let Some(value) = line.strip_prefix('n') {
            if let (Some(pid), Some(port)) = (current_pid, parse_port(value)) {
                output.entry(pid).or_default().push(PortBinding {
                    port,
                    protocol: protocol.to_string(),
                });
            }
        }
    }

    Ok(())
}

fn parse_port(value: &str) -> Option<u16> {
    let digits = value.rsplit(':').next()?;
    let digits = digits.split_whitespace().next()?;
    digits.parse::<u16>().ok()
}
