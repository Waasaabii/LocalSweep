use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use walkdir::WalkDir;

use crate::domain::{
    CacheCategoryResult, CleanCacheResultItem, CleanCachesResponse, ScanCachesResponse,
};

struct CacheCategory {
    key: &'static str,
    path: PathBuf,
}

fn home_dir() -> Result<PathBuf> {
    dirs::home_dir().context("无法获取用户主目录")
}

fn cache_categories() -> Result<Vec<CacheCategory>> {
    let home = home_dir()?;
    Ok(vec![
        CacheCategory {
            key: "appCaches",
            path: home.join("Library/Caches"),
        },
        CacheCategory {
            key: "xcodeDerivedData",
            path: home.join("Library/Developer/Xcode/DerivedData"),
        },
        CacheCategory {
            key: "cargoRegistryCache",
            path: home.join(".cargo/registry/cache"),
        },
    ])
}

fn directory_size(path: &Path) -> (u64, u64, Vec<String>) {
    let mut total_bytes = 0_u64;
    let mut file_count = 0_u64;
    let mut errors = Vec::new();

    if !path.exists() {
        return (0, 0, errors);
    }

    for entry in WalkDir::new(path).follow_links(false) {
        match entry {
            Ok(ent) => {
                if ent.file_type().is_file() {
                    match ent.metadata() {
                        Ok(meta) => {
                            total_bytes = total_bytes.saturating_add(meta.len());
                            file_count = file_count.saturating_add(1);
                        }
                        Err(err) => {
                            errors.push(format!("读取元数据失败: {} ({err})", ent.path().display()))
                        }
                    }
                }
            }
            Err(err) => errors.push(format!("遍历失败: {err}")),
        }
    }

    (total_bytes, file_count, errors)
}

pub fn scan_caches() -> Result<ScanCachesResponse> {
    let mut results = Vec::new();

    for category in cache_categories()? {
        let (total_bytes, file_count, errors) = directory_size(&category.path);
        results.push(CacheCategoryResult {
            category: category.key.to_string(),
            path: category.path.to_string_lossy().to_string(),
            file_count,
            total_bytes,
            errors,
        });
    }

    Ok(ScanCachesResponse {
        categories: results,
        scanned_at: chrono::Local::now().to_rfc3339(),
    })
}

fn remove_child(path: &Path) -> Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
            .with_context(|| format!("删除目录失败: {}", path.display()))?;
    } else if path.is_file() {
        fs::remove_file(path).with_context(|| format!("删除文件失败: {}", path.display()))?;
    }
    Ok(())
}

pub fn clean_caches(category_keys: &[String]) -> Result<CleanCachesResponse> {
    let categories = cache_categories()?;
    let mut results = Vec::new();

    for key in category_keys {
        match categories.iter().find(|category| category.key == key) {
            Some(category) => {
                if !category.path.exists() {
                    results.push(CleanCacheResultItem {
                        category: key.clone(),
                        ok: true,
                        removed_bytes: 0,
                        message: "目录不存在，无需清理".to_string(),
                    });
                    continue;
                }

                let (removed_bytes, _, _) = directory_size(&category.path);
                let mut errors = Vec::new();

                match fs::read_dir(&category.path) {
                    Ok(entries) => {
                        for entry in entries {
                            match entry {
                                Ok(item) => {
                                    if let Err(err) = remove_child(&item.path()) {
                                        errors.push(err.to_string());
                                    }
                                }
                                Err(err) => errors.push(format!("读取目录项失败: {err}")),
                            }
                        }
                    }
                    Err(err) => errors.push(format!("读取目录失败: {err}")),
                }

                results.push(CleanCacheResultItem {
                    category: key.clone(),
                    ok: errors.is_empty(),
                    removed_bytes: if errors.is_empty() { removed_bytes } else { 0 },
                    message: if errors.is_empty() {
                        format!("已清理 {} 并释放 {} bytes", category.path.display(), removed_bytes)
                    } else {
                        errors.join(" | ")
                    },
                });
            }
            None => results.push(CleanCacheResultItem {
                category: key.clone(),
                ok: false,
                removed_bytes: 0,
                message: "不支持的缓存类别".to_string(),
            }),
        }
    }

    Ok(CleanCachesResponse {
        results,
        cleaned_at: chrono::Local::now().to_rfc3339(),
    })
}
