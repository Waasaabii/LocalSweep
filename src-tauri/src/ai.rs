use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde_json::{json, Value};

use crate::domain::{
    AiSuggestion, AnalyzeCandidatesRequest, AnalyzeCandidatesResponse, Settings,
};

pub fn analyze_candidates(
    request: &AnalyzeCandidatesRequest,
    settings: &Settings,
) -> Result<AnalyzeCandidatesResponse> {
    let endpoint = settings.endpoint.trim_end_matches('/');
    let url = format!("{endpoint}/chat/completions");
    let prompt = build_prompt(request);

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(settings.timeout_seconds))
        .build()
        .context("创建 HTTP 客户端失败")?;

    let mut http_request = client.post(url).json(&json!({
        "model": settings.model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": "你是本地开发环境诊断助手。你只能返回 JSON，不要输出 markdown，不要输出解释。返回结构必须包含 summary 和 suggestions。suggestions 中每一项必须包含 candidateId、recommendation、reason、riskLevel。recommendation 只能是 kill、keep、investigate，riskLevel 只能是 low、medium、high。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }));

    if !settings.api_key.trim().is_empty() {
        http_request = http_request.bearer_auth(settings.api_key.trim());
    }

    let response = http_request.send().context("调用 AI 接口失败")?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .context("解析 AI 接口响应失败")?;

    if !status.is_success() {
        return Err(anyhow::anyhow!("AI 接口返回非成功状态: {status}"));
    }

    let content = value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .context("AI 响应中缺少 message.content")?;

    let parsed = extract_json_object(content)?;
    let summary = parsed
        .get("summary")
        .and_then(Value::as_str)
        .context("AI 响应缺少 summary")?
        .to_string();
    let suggestions = parsed
        .get("suggestions")
        .and_then(Value::as_array)
        .context("AI 响应缺少 suggestions")?
        .iter()
        .map(|item| AiSuggestion {
            candidate_id: item
                .get("candidateId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            recommendation: item
                .get("recommendation")
                .and_then(Value::as_str)
                .unwrap_or("investigate")
                .to_string(),
            reason: item
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or("AI 未给出原因")
                .to_string(),
            risk_level: item
                .get("riskLevel")
                .and_then(Value::as_str)
                .unwrap_or("medium")
                .to_string(),
        })
        .collect::<Vec<_>>();

    Ok(AnalyzeCandidatesResponse {
        summary,
        suggestions,
        analyzed_at: chrono::Local::now().to_rfc3339(),
    })
}

fn build_prompt(request: &AnalyzeCandidatesRequest) -> String {
    format!(
        "分析范围: {}\n请根据以下候选对象判断哪些本地进程值得优先结束，并给出风险。\n{}",
        request.scope,
        serde_json::to_string_pretty(&request.candidates).unwrap_or_else(|_| "[]".to_string())
    )
}

fn extract_json_object(content: &str) -> Result<Value> {
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        return Ok(value);
    }

    let fenced = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(value) = serde_json::from_str::<Value>(fenced) {
        return Ok(value);
    }

    let start = content.find('{').context("AI 响应中未找到 JSON 起始位置")?;
    let end = content.rfind('}').context("AI 响应中未找到 JSON 结束位置")?;
    let slice = &content[start..=end];
    serde_json::from_str::<Value>(slice).context("从 AI 响应中提取 JSON 失败")
}
