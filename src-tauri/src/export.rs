use crate::models::*;

pub struct ExportEngine;

impl ExportEngine {
    pub fn export_validation_json(
        results: &[ValidationResult],
        summary: &ValidationSummary,
        output_path: &str,
    ) -> Result<(), String> {
        let data = serde_json::json!({
            "type": "validation_report",
            "summary": summary,
            "results": results,
        });
        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(output_path, json)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(())
    }

    pub fn export_loadtest_json(
        results: &[LoadTestResult],
        summary: &LoadTestSummary,
        output_path: &str,
    ) -> Result<(), String> {
        let data = serde_json::json!({
            "type": "loadtest_report",
            "summary": summary,
            "results": results,
        });
        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(output_path, json)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(())
    }

    pub fn export_validation_csv(
        results: &[ValidationResult],
        output_path: &str,
    ) -> Result<(), String> {
        let mut wtr = csv::Writer::from_path(output_path)
            .map_err(|e| format!("Failed to create CSV writer: {}", e))?;

        wtr.write_record([
            "Test Name", "Category", "HTTP Method", "URL", "Response Status",
            "Duration (ms)", "Passed", "Failure Reason", "Executed At"
        ]).map_err(|e| format!("CSV write error: {}", e))?;

        for r in results {
            wtr.write_record([
                r.test_name.as_str(),
                r.category.as_str(),
                r.http_method.as_str(),
                r.url.as_str(),
                &r.response_status.map_or(String::new(), |s| s.to_string()),
                &r.duration_ms.to_string(),
                &r.passed.to_string(),
                r.failure_reason.as_deref().unwrap_or(""),
                r.executed_at.as_str(),
            ]).map_err(|e| format!("CSV write error: {}", e))?;
        }

        wtr.flush().map_err(|e| format!("CSV flush error: {}", e))?;
        Ok(())
    }

    pub fn export_loadtest_csv(
        results: &[LoadTestResult],
        output_path: &str,
    ) -> Result<(), String> {
        let mut wtr = csv::Writer::from_path(output_path)
            .map_err(|e| format!("Failed to create CSV writer: {}", e))?;

        wtr.write_record([
            "Request Index", "HTTP Method", "URL", "Status Code",
            "Duration (ms)", "Success", "Error Message", "Timestamp"
        ]).map_err(|e| format!("CSV write error: {}", e))?;

        for r in results {
            wtr.write_record([
                &r.request_index.to_string(),
                r.http_method.as_str(),
                r.url.as_str(),
                &r.status_code.map_or(String::new(), |s| s.to_string()),
                &r.duration_ms.to_string(),
                &r.success.to_string(),
                r.error_message.as_deref().unwrap_or(""),
                r.timestamp.as_str(),
            ]).map_err(|e| format!("CSV write error: {}", e))?;
        }

        wtr.flush().map_err(|e| format!("CSV flush error: {}", e))?;
        Ok(())
    }

    pub fn export_validation_pdf(
        results: &[ValidationResult],
        summary: &ValidationSummary,
        output_path: &str,
    ) -> Result<(), String> {
        let mut html = String::from(r#"<!DOCTYPE html><html><head><meta charset="utf-8">
<title>SCIM Validation Report</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:auto;padding:20px;color:#222}
h1{color:#1565c0;border-bottom:2px solid #1565c0;padding-bottom:8px}
.summary{display:flex;gap:24px;margin:16px 0;flex-wrap:wrap}
.stat{background:#f5f5f5;border-radius:8px;padding:16px 24px;text-align:center}
.stat .value{font-size:28px;font-weight:700}
.stat .label{font-size:12px;color:#666;margin-top:4px}
.score{color:#2e7d32} .fail-c{color:#c62828}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th{background:#e3f2fd;padding:8px 12px;text-align:left;font-weight:600}
td{padding:6px 12px;border-bottom:1px solid #e0e0e0}
.pass{color:#2e7d32;font-weight:600} .fail{color:#c62828;font-weight:600}
@media print{body{padding:0}.stat{break-inside:avoid}}
</style></head><body>
<h1>SCIM Validation Report</h1>
<div class="summary">
"#);

        html.push_str(&format!(
            r#"<div class="stat"><div class="value score">{:.1}%</div><div class="label">Compliance Score</div></div>
<div class="stat"><div class="value">{}</div><div class="label">Total</div></div>
<div class="stat"><div class="value score">{}</div><div class="label">Passed</div></div>
<div class="stat"><div class="value fail-c">{}</div><div class="label">Failed</div></div>
<div class="stat"><div class="value">{}</div><div class="label">Skipped</div></div>
</div>"#,
            summary.compliance_score, summary.total, summary.passed, summary.failed, summary.skipped
        ));

        // Category breakdown
        if !summary.categories.is_empty() {
            html.push_str("<h2>Category Breakdown</h2><table><tr><th>Category</th><th>Passed</th><th>Failed</th><th>Total</th></tr>");
            for cat in &summary.categories {
                html.push_str(&format!(
                    "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                    cat.name, cat.passed, cat.failed, cat.total
                ));
            }
            html.push_str("</table>");
        }

        // Detailed results
        html.push_str("<h2>Detailed Results</h2><table>
<tr><th>Test</th><th>Category</th><th>Method</th><th>Status</th><th>Duration</th><th>Result</th><th>Reason</th></tr>");

        for r in results {
            let result_class = if r.passed { "pass" } else { "fail" };
            let result_text = if r.passed { "PASS" } else { "FAIL" };
            let status = r.response_status.map_or("-".to_string(), |s| s.to_string());
            let reason = r.failure_reason.as_deref().unwrap_or("-");
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}ms</td><td class=\"{}\">{}</td><td>{}</td></tr>",
                html_escape(&r.test_name), html_escape(&r.category), &r.http_method,
                status, r.duration_ms, result_class, result_text, html_escape(reason)
            ));
        }

        html.push_str("</table></body></html>");
        std::fs::write(output_path, html)
            .map_err(|e| format!("Failed to write PDF report: {}", e))?;
        Ok(())
    }

    pub fn export_loadtest_pdf(
        results: &[LoadTestResult],
        summary: &LoadTestSummary,
        output_path: &str,
    ) -> Result<(), String> {
        let mut html = String::from(r#"<!DOCTYPE html><html><head><meta charset="utf-8">
<title>SCIM Load Test Report</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:auto;padding:20px;color:#222}
h1{color:#1565c0;border-bottom:2px solid #1565c0;padding-bottom:8px}
h2{margin-top:24px;color:#333}
.summary{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}
.stat{background:#f5f5f5;border-radius:8px;padding:12px 20px;text-align:center;min-width:100px}
.stat .value{font-size:22px;font-weight:700;color:#1565c0}
.stat .label{font-size:11px;color:#666;margin-top:4px}
.error-stat .value{color:#c62828}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
th{background:#e3f2fd;padding:6px 10px;text-align:left;font-weight:600}
td{padding:4px 10px;border-bottom:1px solid #e0e0e0}
@media print{body{padding:0}.stat{break-inside:avoid}}
</style></head><body>
<h1>SCIM Load Test Report</h1>
<div class="summary">
"#);

        html.push_str(&format!(
            r#"<div class="stat"><div class="value">{}</div><div class="label">Total Requests</div></div>
<div class="stat"><div class="value">{:.1}</div><div class="label">Requests/sec</div></div>
<div class="stat"><div class="value">{:.0}ms</div><div class="label">Avg Latency</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P50</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P95</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P99</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">Min</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">Max</div></div>
<div class="stat error-stat"><div class="value">{:.1}%</div><div class="label">Error Rate</div></div>
</div>"#,
            summary.total_requests, summary.requests_per_second,
            summary.avg_latency_ms, summary.p50_latency_ms,
            summary.p95_latency_ms, summary.p99_latency_ms,
            summary.min_latency_ms, summary.max_latency_ms,
            summary.error_rate
        ));

        // Status code distribution
        if !summary.status_code_distribution.is_empty() {
            html.push_str("<h2>Status Code Distribution</h2><table><tr><th>Status Code</th><th>Count</th></tr>");
            let mut codes: Vec<_> = summary.status_code_distribution.iter().collect();
            codes.sort_by_key(|(k, _)| *k);
            for (code, count) in codes {
                html.push_str(&format!("<tr><td>HTTP {}</td><td>{}</td></tr>", code, count));
            }
            html.push_str("</table>");
        }

        // Show first 500 results max in detail table
        let max_detail = std::cmp::min(results.len(), 500);
        html.push_str(&format!(
            "<h2>Request Details (showing {} of {})</h2>",
            max_detail, results.len()
        ));
        html.push_str("<table><tr><th>#</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Success</th></tr>");
        for r in results.iter().take(max_detail) {
            let status = r.status_code.map_or("-".to_string(), |s| s.to_string());
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}ms</td><td>{}</td></tr>",
                r.request_index, &r.http_method, html_escape(&r.url),
                status, r.duration_ms, if r.success { "✓" } else { "✗" }
            ));
        }

        html.push_str("</table></body></html>");
        std::fs::write(output_path, html)
            .map_err(|e| format!("Failed to write PDF report: {}", e))?;
        Ok(())
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
