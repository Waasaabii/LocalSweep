use std::{fs, path::PathBuf};

use anyhow::{Context, Result};

use crate::domain::{SaveSettingsResponse, Settings};

fn settings_dir() -> Result<PathBuf> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .context("无法定位本地配置目录")?;
    Ok(base.join("localsweep"))
}

fn settings_path() -> Result<PathBuf> {
    Ok(settings_dir()?.join("settings.json"))
}

pub fn load_settings() -> Result<Settings> {
    let path = settings_path()?;

    if !path.exists() {
        return Ok(Settings::default());
    }

    let raw =
        fs::read_to_string(&path).with_context(|| format!("读取设置文件失败: {}", path.display()))?;
    let settings = serde_json::from_str::<Settings>(&raw).context("解析设置文件失败")?;
    Ok(settings)
}

pub fn save_settings(settings: &Settings) -> Result<SaveSettingsResponse> {
    let dir = settings_dir()?;
    fs::create_dir_all(&dir).with_context(|| format!("创建配置目录失败: {}", dir.display()))?;
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).context("序列化设置失败")?;
    fs::write(&path, raw).with_context(|| format!("写入设置文件失败: {}", path.display()))?;

    Ok(SaveSettingsResponse {
        saved_at: chrono::Local::now().to_rfc3339(),
    })
}
