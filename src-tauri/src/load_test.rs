use chrono::Utc;
use uuid::Uuid;
use reqwest::Method;
use serde_json::Value;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, AtomicBool, Ordering};
use std::time::Instant;
use tokio::sync::{Semaphore, Mutex};
use tauri::{AppHandle, Emitter};

use crate::models::*;
use crate::scim_client::ScimClient;

pub struct LoadTestEngine;

impl LoadTestEngine {
    // ── Scenario-based execution ──

    pub async fn run_scenario(
        app: &AppHandle,
        client: Arc<ScimClient>,
        test_run_id: &str,
        config: &LoadTestConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> Vec<LoadTestResult> {
        let scenario = config.scenario.as_deref().unwrap_or("create_users");
        match scenario {
            "create_users" => Self::scenario_create_users(app, client, test_run_id, config, cancel_flag).await,
            "create_update" => Self::scenario_create_update(app, client, test_run_id, config, cancel_flag).await,
            "full_lifecycle" => Self::scenario_full_lifecycle(app, client, test_run_id, config, cancel_flag).await,
            "list_users" => Self::scenario_list_users(app, client, test_run_id, config, cancel_flag).await,
            _ => Self::scenario_create_users(app, client, test_run_id, config, cancel_flag).await,
        }
    }

    /// Scenario: Create Users — POST /Users with auto-generated data, then cleanup
    async fn scenario_create_users(
        app: &AppHandle,
        client: Arc<ScimClient>,
        test_run_id: &str,
        config: &LoadTestConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> Vec<LoadTestResult> {
        let total = config.total_requests;
        let semaphore = Arc::new(Semaphore::new(config.concurrency));
        let completed = Arc::new(AtomicUsize::new(0));
        let error_count = Arc::new(AtomicUsize::new(0));
        let created_ids: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let start_time = Instant::now();

        let mut handles = Vec::new();

        for i in 0..total {
            if cancel_flag.load(Ordering::Relaxed) { break; }
            Self::apply_ramp_up(config, i, total, &start_time).await;

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let cancel = cancel_flag.clone();
            let completed = completed.clone();
            let error_count = error_count.clone();
            let created_ids = created_ids.clone();
            let app = app.clone();
            let run_id = test_run_id.to_string();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                if cancel.load(Ordering::Relaxed) { return None; }

                let body = Self::generate_user_body(i);
                let result = client.request(Method::POST, "/Users", Some(&body)).await;
                let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;

                let load_result = Self::build_result(&run_id, i, "POST", "/Users", Some(body), &result, &error_count);

                // Capture created user ID for cleanup
                if let Ok(ref resp) = result {
                    if resp.status == 201 {
                        if let Ok(json) = serde_json::from_str::<Value>(&resp.body) {
                            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                created_ids.lock().await.push(id.to_string());
                            }
                        }
                    }
                }

                Self::emit_phase_progress(&app, &run_id, "Creating users", comp, total, &start_time, &error_count);
                Some(load_result)
            }));
        }

        let mut results = Self::collect_results(handles).await;

        // Cleanup: delete all created users
        let ids = created_ids.lock().await.clone();
        Self::cleanup_users(&app, &client, test_run_id, &ids, &cancel_flag, &mut results, total, &start_time).await;

        results
    }

    /// Scenario: Create + Update — POST /Users, then PATCH each created user
    async fn scenario_create_update(
        app: &AppHandle,
        client: Arc<ScimClient>,
        test_run_id: &str,
        config: &LoadTestConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> Vec<LoadTestResult> {
        let n = config.total_requests; // N user "units of work"
        let total_http = n * 2; // N creates + N updates
        let semaphore = Arc::new(Semaphore::new(config.concurrency));
        let completed = Arc::new(AtomicUsize::new(0));
        let error_count = Arc::new(AtomicUsize::new(0));
        let created_ids: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let start_time = Instant::now();

        // Phase 1: Create users
        let mut handles = Vec::new();
        for i in 0..n {
            if cancel_flag.load(Ordering::Relaxed) { break; }
            Self::apply_ramp_up(config, i, n, &start_time).await;

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let cancel = cancel_flag.clone();
            let completed = completed.clone();
            let error_count = error_count.clone();
            let created_ids = created_ids.clone();
            let app = app.clone();
            let run_id = test_run_id.to_string();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                if cancel.load(Ordering::Relaxed) { return None; }

                let body = Self::generate_user_body(i);
                let result = client.request(Method::POST, "/Users", Some(&body)).await;
                let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;

                let load_result = Self::build_result(&run_id, i, "POST", "/Users", Some(body), &result, &error_count);

                if let Ok(ref resp) = result {
                    if resp.status == 201 {
                        if let Ok(json) = serde_json::from_str::<Value>(&resp.body) {
                            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                created_ids.lock().await.push(id.to_string());
                            }
                        }
                    }
                }

                Self::emit_phase_progress(&app, &run_id, "Creating users", comp, total_http, &start_time, &error_count);
                Some(load_result)
            }));
        }

        let mut results = Self::collect_results(handles).await;

        // Phase 2: Update each created user
        let ids = created_ids.lock().await.clone();
        let mut update_handles = Vec::new();
        for (i, user_id) in ids.iter().enumerate() {
            if cancel_flag.load(Ordering::Relaxed) { break; }

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let cancel = cancel_flag.clone();
            let completed = completed.clone();
            let error_count = error_count.clone();
            let app = app.clone();
            let run_id = test_run_id.to_string();
            let path = format!("/Users/{}", user_id);
            let idx = n + i;

            update_handles.push(tokio::spawn(async move {
                let _permit = permit;
                if cancel.load(Ordering::Relaxed) { return None; }

                let body = Self::generate_patch_body();
                let result = client.request(Method::PATCH, &path, Some(&body)).await;
                let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;

                let load_result = Self::build_result(&run_id, idx, "PATCH", &path, Some(body), &result, &error_count);
                Self::emit_phase_progress(&app, &run_id, "Updating users", comp, total_http, &start_time, &error_count);
                Some(load_result)
            }));
        }

        results.extend(Self::collect_results(update_handles).await);

        // Cleanup
        Self::cleanup_users(&app, &client, test_run_id, &ids, &cancel_flag, &mut results, total_http, &start_time).await;

        results
    }

    /// Scenario: Full Lifecycle — POST → GET → DELETE per user (delete is built-in, no separate cleanup)
    async fn scenario_full_lifecycle(
        app: &AppHandle,
        client: Arc<ScimClient>,
        test_run_id: &str,
        config: &LoadTestConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> Vec<LoadTestResult> {
        let n = config.total_requests;
        let total_http = n * 3; // create + read + delete per user
        let semaphore = Arc::new(Semaphore::new(config.concurrency));
        let completed = Arc::new(AtomicUsize::new(0));
        let error_count = Arc::new(AtomicUsize::new(0));
        let start_time = Instant::now();

        let mut results = Vec::new();

        // Run each lifecycle sequentially per user, but concurrently across users
        let mut handles = Vec::new();
        for i in 0..n {
            if cancel_flag.load(Ordering::Relaxed) { break; }
            Self::apply_ramp_up(config, i, n, &start_time).await;

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let cancel = cancel_flag.clone();
            let completed = completed.clone();
            let error_count = error_count.clone();
            let app = app.clone();
            let run_id = test_run_id.to_string();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                if cancel.load(Ordering::Relaxed) { return Vec::new(); }

                let mut batch = Vec::new();
                let base_idx = i * 3;

                // 1. Create
                let body = Self::generate_user_body(i);
                let create_result = client.request(Method::POST, "/Users", Some(&body)).await;
                let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;
                batch.push(Self::build_result(&run_id, base_idx, "POST", "/Users", Some(body), &create_result, &error_count));
                Self::emit_phase_progress(&app, &run_id, "Creating users", comp, total_http, &start_time, &error_count);

                // Extract user ID for read + delete
                let user_id = create_result.ok().and_then(|resp| {
                    if resp.status == 201 {
                        serde_json::from_str::<Value>(&resp.body).ok()
                            .and_then(|j| j.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    } else {
                        None
                    }
                });

                if let Some(ref uid) = user_id {
                    if !cancel.load(Ordering::Relaxed) {
                        // 2. Read
                        let read_path = format!("/Users/{}", uid);
                        let read_result = client.request(Method::GET, &read_path, None).await;
                        let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        batch.push(Self::build_result(&run_id, base_idx + 1, "GET", &read_path, None, &read_result, &error_count));
                        Self::emit_phase_progress(&app, &run_id, "Reading users", comp, total_http, &start_time, &error_count);
                    }

                    if !cancel.load(Ordering::Relaxed) {
                        // 3. Delete
                        let del_path = format!("/Users/{}", uid);
                        let del_result = client.request(Method::DELETE, &del_path, None).await;
                        let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        batch.push(Self::build_result(&run_id, base_idx + 2, "DELETE", &del_path, None, &del_result, &error_count));
                        Self::emit_phase_progress(&app, &run_id, "Deleting users", comp, total_http, &start_time, &error_count);
                    }
                } else {
                    // Create failed — mark read and delete as skipped
                    completed.fetch_add(2, Ordering::Relaxed);
                    error_count.fetch_add(2, Ordering::Relaxed);
                    batch.push(LoadTestResult {
                        id: Uuid::new_v4().to_string(),
                        test_run_id: run_id.clone(),
                        request_index: base_idx as i64 + 1,
                        http_method: "GET".to_string(),
                        url: "/Users/{id}".to_string(),
                        request_body: None,
                        status_code: None,
                        duration_ms: 0,
                        success: false,
                        error_message: Some("Skipped — create failed".to_string()),
                        timestamp: Utc::now().to_rfc3339(),
                    });
                    batch.push(LoadTestResult {
                        id: Uuid::new_v4().to_string(),
                        test_run_id: run_id.clone(),
                        request_index: base_idx as i64 + 2,
                        http_method: "DELETE".to_string(),
                        url: "/Users/{id}".to_string(),
                        request_body: None,
                        status_code: None,
                        duration_ms: 0,
                        success: false,
                        error_message: Some("Skipped — create failed".to_string()),
                        timestamp: Utc::now().to_rfc3339(),
                    });
                }

                batch
            }));
        }

        for handle in handles {
            if let Ok(batch) = handle.await {
                results.extend(batch);
            }
        }

        results.sort_by_key(|r| r.request_index);
        results
    }

    /// Scenario: List Users — GET /Users with pagination
    async fn scenario_list_users(
        app: &AppHandle,
        client: Arc<ScimClient>,
        test_run_id: &str,
        config: &LoadTestConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> Vec<LoadTestResult> {
        let total = config.total_requests;
        let semaphore = Arc::new(Semaphore::new(config.concurrency));
        let completed = Arc::new(AtomicUsize::new(0));
        let error_count = Arc::new(AtomicUsize::new(0));
        let start_time = Instant::now();

        let mut handles = Vec::new();

        for i in 0..total {
            if cancel_flag.load(Ordering::Relaxed) { break; }
            Self::apply_ramp_up(config, i, total, &start_time).await;

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let cancel = cancel_flag.clone();
            let completed = completed.clone();
            let error_count = error_count.clone();
            let app = app.clone();
            let run_id = test_run_id.to_string();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                if cancel.load(Ordering::Relaxed) { return None; }

                let start_index = (i * 10) + 1;
                let path = format!("/Users?startIndex={}&count=10", start_index);
                let result = client.request(Method::GET, &path, None).await;
                let comp = completed.fetch_add(1, Ordering::Relaxed) + 1;

                let load_result = Self::build_result(&run_id, i, "GET", &path, None, &result, &error_count);
                Self::emit_phase_progress(&app, &run_id, "Listing users", comp, total, &start_time, &error_count);
                Some(load_result)
            }));
        }

        Self::collect_results(handles).await
    }

    // ── Cleanup ──

    async fn cleanup_users(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        ids: &[String],
        cancel_flag: &AtomicBool,
        results: &mut Vec<LoadTestResult>,
        base_total: usize,
        start_time: &Instant,
    ) {
        if ids.is_empty() { return; }

        let cleanup_total = ids.len();
        for (i, user_id) in ids.iter().enumerate() {
            if cancel_flag.load(Ordering::Relaxed) { break; }

            let path = format!("/Users/{}", user_id);
            let del = client.request(Method::DELETE, &path, None).await;

            let success = match &del {
                Ok(resp) => resp.status >= 200 && resp.status < 300,
                Err(_) => false,
            };

            let duration_ms = match &del {
                Ok(resp) => resp.duration_ms,
                Err(_) => 0,
            };

            results.push(LoadTestResult {
                id: Uuid::new_v4().to_string(),
                test_run_id: test_run_id.to_string(),
                request_index: (base_total + i) as i64,
                http_method: "DELETE".to_string(),
                url: path,
                request_body: None,
                status_code: del.as_ref().ok().map(|r| r.status as i32),
                duration_ms,
                success,
                error_message: del.err(),
                timestamp: Utc::now().to_rfc3339(),
            });

            // Emit cleanup progress
            if (i + 1) % 10 == 0 || i + 1 == cleanup_total {
                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let total_with_cleanup = base_total + cleanup_total;
                let comp = base_total + i + 1;
                let _ = app.emit("loadtest-progress", LoadTestProgress {
                    test_run_id: test_run_id.to_string(),
                    phase: "Cleaning up".to_string(),
                    completed: comp,
                    total: total_with_cleanup,
                    current_rps: if elapsed_secs > 0.0 { comp as f64 / elapsed_secs } else { 0.0 },
                    avg_latency_ms: 0.0,
                    error_count: 0,
                });
            }
        }
    }

    // ── Data generators ──

    fn generate_user_body(index: usize) -> String {
        let suffix = Self::random_suffix(8);
        let username = format!("loadtest_{}_{:04}@test.example.com", suffix, index);
        let given = format!("Load{}", &suffix[..4]);
        let family = format!("Test{}", &suffix[4..]);
        serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": username,
            "name": {
                "givenName": given,
                "familyName": family
            },
            "emails": [{
                "value": username,
                "type": "work",
                "primary": true
            }],
            "displayName": format!("{} {}", given, family),
            "active": true
        }).to_string()
    }

    fn generate_patch_body() -> String {
        let suffix = Self::random_suffix(6);
        serde_json::json!({
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{
                "op": "replace",
                "path": "displayName",
                "value": format!("Updated_{}", suffix)
            }]
        }).to_string()
    }

    fn random_suffix(len: usize) -> String {
        (0..len)
            .map(|_| {
                let idx = rand::random::<u8>() % 26;
                (b'a' + idx) as char
            })
            .collect()
    }

    // ── Helpers ──

    async fn apply_ramp_up(config: &LoadTestConfig, i: usize, total: usize, start_time: &Instant) {
        if let Some(ramp_up) = config.ramp_up_seconds {
            if ramp_up > 0 && total > 1 {
                let delay_per_request = (ramp_up as f64 * 1000.0) / total as f64;
                let delay = std::time::Duration::from_millis((i as f64 * delay_per_request) as u64);
                let elapsed = start_time.elapsed();
                if delay > elapsed {
                    tokio::time::sleep(delay - elapsed).await;
                }
            }
        }
    }

    fn build_result(
        run_id: &str,
        index: usize,
        method: &str,
        path: &str,
        body: Option<String>,
        result: &Result<crate::scim_client::ScimResponse, String>,
        error_count: &AtomicUsize,
    ) -> LoadTestResult {
        match result {
            Ok(resp) => {
                let success = resp.status >= 200 && resp.status < 400;
                if !success {
                    error_count.fetch_add(1, Ordering::Relaxed);
                }
                LoadTestResult {
                    id: Uuid::new_v4().to_string(),
                    test_run_id: run_id.to_string(),
                    request_index: index as i64,
                    http_method: method.to_string(),
                    url: path.to_string(),
                    request_body: body,
                    status_code: Some(resp.status as i32),
                    duration_ms: resp.duration_ms,
                    success,
                    error_message: if !success { Some(format!("Status {}", resp.status)) } else { None },
                    timestamp: Utc::now().to_rfc3339(),
                }
            }
            Err(e) => {
                error_count.fetch_add(1, Ordering::Relaxed);
                LoadTestResult {
                    id: Uuid::new_v4().to_string(),
                    test_run_id: run_id.to_string(),
                    request_index: index as i64,
                    http_method: method.to_string(),
                    url: path.to_string(),
                    request_body: body,
                    status_code: None,
                    duration_ms: 0,
                    success: false,
                    error_message: Some(e.clone()),
                    timestamp: Utc::now().to_rfc3339(),
                }
            }
        }
    }

    fn emit_phase_progress(
        app: &AppHandle,
        run_id: &str,
        phase: &str,
        completed: usize,
        total: usize,
        start_time: &Instant,
        error_count: &AtomicUsize,
    ) {
        if completed % 10 == 0 || completed == total {
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let _ = app.emit("loadtest-progress", LoadTestProgress {
                test_run_id: run_id.to_string(),
                phase: phase.to_string(),
                completed,
                total,
                current_rps: if elapsed_secs > 0.0 { completed as f64 / elapsed_secs } else { 0.0 },
                avg_latency_ms: 0.0,
                error_count: error_count.load(Ordering::Relaxed),
            });
        }
    }

    async fn collect_results(handles: Vec<tokio::task::JoinHandle<Option<LoadTestResult>>>) -> Vec<LoadTestResult> {
        let mut results = Vec::new();
        for handle in handles {
            if let Ok(Some(result)) = handle.await {
                results.push(result);
            }
        }
        results.sort_by_key(|r| r.request_index);
        results
    }

    // ── Summary ──

    pub fn compute_summary(results: &[LoadTestResult], total_duration_ms: i64) -> LoadTestSummary {
        let total_requests = results.len();
        let successful = results.iter().filter(|r| r.success).count();
        let failed = total_requests - successful;
        let error_rate = if total_requests > 0 { failed as f64 / total_requests as f64 * 100.0 } else { 0.0 };

        let mut latencies: Vec<i64> = results.iter().map(|r| r.duration_ms).collect();
        latencies.sort();

        let min_latency = *latencies.first().unwrap_or(&0);
        let max_latency = *latencies.last().unwrap_or(&0);
        let avg_latency = if !latencies.is_empty() {
            latencies.iter().sum::<i64>() as f64 / latencies.len() as f64
        } else {
            0.0
        };

        let p50 = Self::percentile(&latencies, 50.0);
        let p95 = Self::percentile(&latencies, 95.0);
        let p99 = Self::percentile(&latencies, 99.0);

        let rps = if total_duration_ms > 0 {
            total_requests as f64 / (total_duration_ms as f64 / 1000.0)
        } else {
            0.0
        };

        let mut status_dist: std::collections::HashMap<i32, usize> = std::collections::HashMap::new();
        for r in results {
            if let Some(code) = r.status_code {
                *status_dist.entry(code).or_insert(0) += 1;
            }
        }

        LoadTestSummary {
            total_requests,
            successful,
            failed,
            error_rate,
            total_duration_ms,
            min_latency_ms: min_latency,
            max_latency_ms: max_latency,
            avg_latency_ms: avg_latency,
            p50_latency_ms: p50,
            p95_latency_ms: p95,
            p99_latency_ms: p99,
            requests_per_second: rps,
            status_code_distribution: status_dist,
        }
    }

    fn percentile(sorted: &[i64], p: f64) -> i64 {
        if sorted.is_empty() {
            return 0;
        }
        let idx = ((p / 100.0) * (sorted.len() - 1) as f64).round() as usize;
        sorted[idx.min(sorted.len() - 1)]
    }
}
