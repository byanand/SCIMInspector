use chrono::Utc;
use uuid::Uuid;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tauri::State;
use std::collections::HashMap;
use tokio::sync::Mutex as TokioMutex;

use crate::db::Database;
use crate::models::*;
use crate::scim_client::ScimClient;
use crate::validation::ValidationEngine;
use crate::load_test::LoadTestEngine;
use crate::export::ExportEngine;

pub struct AppState {
    pub db: Database,
    pub cancel_flags: TokioMutex<HashMap<String, Arc<AtomicBool>>>,
}

// ── Server Config Commands ──

#[tauri::command]
pub async fn save_server_config(state: State<'_, AppState>, config: ServerConfig) -> Result<ServerConfig, String> {
    let mut config = config;
    if config.id.is_empty() {
        config.id = Uuid::new_v4().to_string();
        config.created_at = Utc::now().to_rfc3339();
    }
    config.updated_at = Utc::now().to_rfc3339();
    state.db.save_server_config(&config).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub async fn get_server_configs(state: State<'_, AppState>) -> Result<Vec<ServerConfig>, String> {
    state.db.get_server_configs().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server_config(state: State<'_, AppState>, id: String) -> Result<Option<ServerConfig>, String> {
    state.db.get_server_config(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_server_config(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_server_config(&id).map_err(|e| e.to_string())
}

// ── Test Connection ──

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>, server_config_id: String) -> Result<TestConnectionResult, String> {
    let config = state.db.get_server_config(&server_config_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server config not found")?;

    let client = ScimClient::new(&config)?;
    let start = Instant::now();

    match client.get("/ServiceProviderConfig").await {
        Ok(resp) => {
            Ok(TestConnectionResult {
                success: resp.status == 200,
                status_code: Some(resp.status),
                response_body: Some(resp.body),
                error: None,
                duration_ms: start.elapsed().as_millis() as i64,
            })
        }
        Err(e) => {
            Ok(TestConnectionResult {
                success: false,
                status_code: None,
                response_body: None,
                error: Some(e),
                duration_ms: start.elapsed().as_millis() as i64,
            })
        }
    }
}

// ── Validation Commands ──

#[tauri::command]
pub async fn run_validation(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ValidationRunConfig,
) -> Result<String, String> {
    let server_config = state.db.get_server_config(&config.server_config_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server config not found")?;

    let client = ScimClient::new(&server_config)?;
    let test_run_id = Uuid::new_v4().to_string();

    // Create test run record
    let test_run = TestRun {
        id: test_run_id.clone(),
        server_config_id: config.server_config_id.clone(),
        run_type: "validation".to_string(),
        status: "running".to_string(),
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
        summary_json: None,
    };
    state.db.save_test_run(&test_run).map_err(|e| e.to_string())?;

    // Load field mapping rules for this server
    let field_mapping_rules = state.db.get_field_mapping_rules(&config.server_config_id)
        .map_err(|e| e.to_string())?;

    let results = ValidationEngine::run(&app, &client, &test_run_id, &config.categories, &field_mapping_rules).await;

    // Save results
    for r in &results {
        state.db.save_validation_result(r).map_err(|e| e.to_string())?;
    }

    // Compute and save summary
    let summary = ValidationEngine::compute_summary(&results);
    let summary_json = serde_json::to_string(&summary).unwrap_or_default();

    let completed_run = TestRun {
        id: test_run_id.clone(),
        server_config_id: config.server_config_id,
        run_type: "validation".to_string(),
        status: "completed".to_string(),
        started_at: test_run.started_at,
        completed_at: Some(Utc::now().to_rfc3339()),
        summary_json: Some(summary_json),
    };
    state.db.save_test_run(&completed_run).map_err(|e| e.to_string())?;

    Ok(test_run_id)
}

#[tauri::command]
pub async fn get_validation_results(
    state: State<'_, AppState>,
    test_run_id: String,
) -> Result<Vec<ValidationResult>, String> {
    state.db.get_validation_results(&test_run_id).map_err(|e| e.to_string())
}

// ── Load Test Commands ──

#[tauri::command]
pub async fn start_load_test(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: LoadTestConfig,
) -> Result<String, String> {
    let server_config = state.db.get_server_config(&config.server_config_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server config not found")?;

    let client = Arc::new(ScimClient::new_with_concurrency(&server_config, config.concurrency)?);
    let test_run_id = Uuid::new_v4().to_string();
    let cancel_flag = Arc::new(AtomicBool::new(false));

    // Store cancel flag
    {
        let mut flags = state.cancel_flags.lock().await;
        flags.insert(test_run_id.clone(), cancel_flag.clone());
    }

    // Create test run record
    let test_run = TestRun {
        id: test_run_id.clone(),
        server_config_id: config.server_config_id.clone(),
        run_type: "loadtest".to_string(),
        status: "running".to_string(),
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
        summary_json: None,
    };
    state.db.save_test_run(&test_run).map_err(|e| e.to_string())?;

    let start = Instant::now();
    let results = LoadTestEngine::run_scenario(&app, client, &test_run_id, &config, cancel_flag.clone()).await;
    let total_duration_ms = start.elapsed().as_millis() as i64;

    // Save results in batches
    state.db.save_load_test_results(&results).map_err(|e| e.to_string())?;

    // Compute summary
    let summary = LoadTestEngine::compute_summary(&results, total_duration_ms);
    let summary_json = serde_json::to_string(&summary).unwrap_or_default();

    let status = if cancel_flag.load(Ordering::Relaxed) { "cancelled" } else { "completed" };
    let completed_run = TestRun {
        id: test_run_id.clone(),
        server_config_id: config.server_config_id,
        run_type: "loadtest".to_string(),
        status: status.to_string(),
        started_at: test_run.started_at,
        completed_at: Some(Utc::now().to_rfc3339()),
        summary_json: Some(summary_json),
    };
    state.db.save_test_run(&completed_run).map_err(|e| e.to_string())?;

    // Cleanup cancel flag
    {
        let mut flags = state.cancel_flags.lock().await;
        flags.remove(&test_run_id);
    }

    Ok(test_run_id)
}

#[tauri::command]
pub async fn stop_load_test(
    state: State<'_, AppState>,
    test_run_id: String,
) -> Result<(), String> {
    let flags = state.cancel_flags.lock().await;
    if let Some(flag) = flags.get(&test_run_id) {
        flag.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("Test run not found or already completed".to_string())
    }
}

#[tauri::command]
pub async fn get_load_test_results(
    state: State<'_, AppState>,
    test_run_id: String,
) -> Result<Vec<LoadTestResult>, String> {
    state.db.get_load_test_results(&test_run_id).map_err(|e| e.to_string())
}

// ── Test Run Commands ──

#[tauri::command]
pub async fn get_test_runs(
    state: State<'_, AppState>,
    server_config_id: Option<String>,
    run_type: Option<String>,
) -> Result<Vec<TestRun>, String> {
    state.db.get_test_runs(
        server_config_id.as_deref(),
        run_type.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_test_run(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<TestRun>, String> {
    state.db.get_test_run(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_test_run(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.db.delete_test_run(&id).map_err(|e| e.to_string())
}

// ── Export Commands ──

#[tauri::command]
pub async fn export_report(
    state: State<'_, AppState>,
    request: ExportRequest,
) -> Result<(), String> {
    let test_run = state.db.get_test_run(&request.test_run_id)
        .map_err(|e| e.to_string())?
        .ok_or("Test run not found")?;

    match test_run.run_type.as_str() {
        "validation" => {
            let results = state.db.get_validation_results(&request.test_run_id).map_err(|e| e.to_string())?;
            let summary: ValidationSummary = test_run.summary_json
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| ValidationEngine::compute_summary(&results));

            match request.format.as_str() {
                "json" => ExportEngine::export_validation_json(&results, &summary, &request.output_path),
                "csv" => ExportEngine::export_validation_csv(&results, &request.output_path),
                "pdf" => ExportEngine::export_validation_pdf(&results, &summary, &request.output_path),
                _ => Err("Unsupported format".to_string()),
            }
        }
        "loadtest" => {
            let results = state.db.get_load_test_results(&request.test_run_id).map_err(|e| e.to_string())?;
            let total_duration: i64 = results.last().map_or(0, |r| r.duration_ms);
            let summary: LoadTestSummary = test_run.summary_json
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| LoadTestEngine::compute_summary(&results, total_duration));

            match request.format.as_str() {
                "json" => ExportEngine::export_loadtest_json(&results, &summary, &request.output_path),
                "csv" => ExportEngine::export_loadtest_csv(&results, &request.output_path),
                "pdf" => ExportEngine::export_loadtest_pdf(&results, &summary, &request.output_path),
                _ => Err("Unsupported format".to_string()),
            }
        }
        _ => Err("Unknown test run type".to_string()),
    }
}

// ── Utility Commands ──

#[tauri::command]
pub async fn clear_all_data(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_all_data().map_err(|e| e.to_string())
}

// ── Custom Schema Discovery ──

#[tauri::command]
pub async fn discover_custom_schema(
    state: State<'_, AppState>,
    server_config_id: String,
) -> Result<Vec<DiscoveredSchemaAttribute>, String> {
    let config = state.db.get_server_config(&server_config_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server config not found")?;
    let client = ScimClient::new(&config)?;
    Ok(ValidationEngine::discover_custom_attributes(&client).await)
}

// ── Field Mapping Commands ──

#[tauri::command]
pub async fn save_field_mapping_rule(state: State<'_, AppState>, rule: FieldMappingRule) -> Result<FieldMappingRule, String> {
    let mut rule = rule;
    if rule.id.is_empty() {
        rule.id = Uuid::new_v4().to_string();
        rule.created_at = Utc::now().to_rfc3339();
    }
    rule.updated_at = Utc::now().to_rfc3339();
    state.db.save_field_mapping_rule(&rule).map_err(|e| e.to_string())?;
    Ok(rule)
}

#[tauri::command]
pub async fn get_field_mapping_rules(state: State<'_, AppState>, server_config_id: String) -> Result<Vec<FieldMappingRule>, String> {
    state.db.get_field_mapping_rules(&server_config_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_field_mapping_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_field_mapping_rule(&id).map_err(|e| e.to_string())
}

// ── App Settings Commands ──

#[tauri::command]
pub async fn get_app_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_app_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state.db.save_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_app_setting(state: State<'_, AppState>, key: String) -> Result<(), String> {
    state.db.delete_setting(&key).map_err(|e| e.to_string())
}

// ── SCIM Explorer Commands ──

#[tauri::command]
pub async fn execute_scim_request(
    state: State<'_, AppState>,
    request: ExplorerRequest,
) -> Result<ExplorerResponse, String> {
    let config = state.db.get_server_config(&request.server_config_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server config not found")?;

    let client = ScimClient::new(&config)?;

    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    let mut path = request.path.clone();
    if let Some(ref qp) = request.query_params {
        if !qp.is_empty() {
            if path.contains('?') {
                path.push_str(&format!("&{}", qp));
            } else {
                path.push_str(&format!("?{}", qp));
            }
        }
    }

    let result = client.request_full(method, &path, request.body.as_deref()).await?;

    Ok(ExplorerResponse {
        status: result.status,
        status_text: result.status_text,
        headers: result.headers,
        body: result.body,
        duration_ms: result.duration_ms,
        request_url: result.request_url,
    })
}

// ── AI Data Generation ──

#[tauri::command]
pub async fn generate_scim_data(
    state: State<'_, AppState>,
    operation: String,
) -> Result<String, String> {
    let api_key = state.db.get_setting("openai_api_key")
        .map_err(|e| e.to_string())?
        .ok_or("OpenAI API key not configured. Go to Settings to add it.")?;

    let system_prompt = "You are a SCIM 2.0 data generator. Return ONLY valid JSON, no markdown, no explanation. Generate realistic, diverse data each time. Use common real-world names, email addresses, and department names. Never use 'John Doe' or 'test@example.com'.";

    let user_prompt = match operation.as_str() {
        "create_user" => r#"Generate a complete SCIM 2.0 User resource JSON for creating a new user. Include schemas array with "urn:ietf:params:scim:schemas:core:2.0:User", a realistic userName (email format), name object with givenName/familyName/formatted, displayName, emails array with one primary work email, a title, and active set to true. Include phoneNumbers with one work number. Make it a realistic person."#,
        "create_group" => r#"Generate a complete SCIM 2.0 Group resource JSON for creating a new group. Include schemas array with "urn:ietf:params:scim:schemas:core:2.0:Group", a realistic displayName that sounds like a real department or team name (like "Engineering Platform Team", "Marketing Analytics", "DevOps Infrastructure"), and an empty members array."#,
        "change_user_name" => r#"Generate a SCIM 2.0 PatchOp JSON to change a user's name. Include schemas array with "urn:ietf:params:scim:api:messages:2.0:PatchOp", and Operations array with a single "replace" operation that updates name.givenName, name.familyName, and displayName to a new realistic name."#,
        "update_user" => r#"Generate a complete SCIM 2.0 User resource JSON for a full PUT update. Include schemas, userName (email), name with givenName/familyName/formatted, displayName, emails array, title, active: true, and phoneNumbers. Use realistic data for a different person than typical examples."#,
        "test" => r#"Return {"status":"ok","message":"OpenAI connection successful"}"#,
        _ => return Err(format!("Unknown operation for AI generation: {}", operation)),
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "temperature": 0.9,
            "max_tokens": 800,
            "response_format": { "type": "json_object" }
        }))
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| format!("Failed to read OpenAI response: {}", e))?;

    if status != 200 {
        return Err(format!("OpenAI API error ({}): {}", status, body));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("No content in OpenAI response")?
        .to_string();

    Ok(content)
}
