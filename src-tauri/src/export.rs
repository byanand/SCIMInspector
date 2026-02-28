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
<div class="stat"><div class="value">{}ms</div><div class="label">P75</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P90</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P95</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">P99</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">Min</div></div>
<div class="stat"><div class="value">{}ms</div><div class="label">Max</div></div>
<div class="stat error-stat"><div class="value">{:.1}%</div><div class="label">Error Rate</div></div>
</div>"#,
            summary.total_requests, summary.requests_per_second,
            summary.avg_latency_ms, summary.p50_latency_ms,
            summary.p75_latency_ms, summary.p90_latency_ms, summary.p95_latency_ms, summary.p99_latency_ms,
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

    // ── Excel exports ──────────────────────────────────────────────────────

    pub fn export_validation_excel(
        results: &[ValidationResult],
        summary: &ValidationSummary,
        output_path: &str,
    ) -> Result<(), String> {
        use rust_xlsxwriter::{Chart, ChartType, Color, Format, FormatAlign, FormatBorder, Workbook};

        let xe = |e: rust_xlsxwriter::XlsxError| e.to_string();

        // ── Shared formats ──────────────────────────────────────────────
        let fmt_title = Format::new()
            .set_bold()
            .set_font_size(20.0)
            .set_font_color(Color::RGB(0x1565C0));

        let fmt_section = Format::new()
            .set_bold()
            .set_font_size(11.0)
            .set_font_color(Color::RGB(0x1565C0))
            .set_border_bottom(FormatBorder::Medium)
            .set_border_bottom_color(Color::RGB(0x1565C0));

        let fmt_header = Format::new()
            .set_bold()
            .set_background_color(Color::RGB(0xBBDEFB))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center);

        let fmt_cell = Format::new()
            .set_border(FormatBorder::Thin);

        let fmt_center = Format::new()
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center);

        let fmt_cell_pass = Format::new()
            .set_border(FormatBorder::Thin)
            .set_background_color(Color::RGB(0xE8F5E9));

        let fmt_cell_fail = Format::new()
            .set_border(FormatBorder::Thin)
            .set_background_color(Color::RGB(0xFFEBEE));

        let fmt_pass_text = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0x2E7D32))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_background_color(Color::RGB(0xE8F5E9));

        let fmt_fail_text = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0xC62828))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_background_color(Color::RGB(0xFFEBEE));

        let fmt_bold = Format::new().set_bold();

        let fmt_gray = Format::new()
            .set_font_color(Color::RGB(0x757575))
            .set_italic();

        // ── Build workbook ──────────────────────────────────────────────
        let mut workbook = Workbook::new();

        // ╔══════════════════════════════════════════════════════╗
        // ║  Sheet 1 – Summary & Charts                         ║
        // ╚══════════════════════════════════════════════════════╝
        {
            let sheet = workbook.add_worksheet();
            sheet.set_name("Summary & Charts").map_err(xe)?;
            sheet.set_column_width(0, 30.0).map_err(xe)?;
            sheet.set_column_width(1, 18.0).map_err(xe)?;
            sheet.set_column_width(2, 14.0).map_err(xe)?;
            sheet.set_column_width(3, 14.0).map_err(xe)?;
            sheet.set_column_width(4, 12.0).map_err(xe)?;

            // R0: Title
            sheet.set_row_height(0, 32.0).map_err(xe)?;
            sheet.merge_range(0, 0, 0, 4, "SCIM Validation Report", &fmt_title).map_err(xe)?;

            // R1: Timestamp
            let ts = chrono::Utc::now().format("%B %d, %Y  %H:%M UTC").to_string();
            sheet.write_with_format(1, 0, format!("Generated: {ts}"), &fmt_gray).map_err(xe)?;

            // R3: Section – Key Metrics
            sheet.write_with_format(3, 0, "KEY METRICS", &fmt_section).map_err(xe)?;

            let score_color = if summary.compliance_score >= 90.0 {
                Color::RGB(0x2E7D32)
            } else if summary.compliance_score >= 70.0 {
                Color::RGB(0xE65100)
            } else {
                Color::RGB(0xC62828)
            };

            let fmt_score = Format::new()
                .set_bold()
                .set_font_size(14.0)
                .set_font_color(score_color)
                .set_border(FormatBorder::Thin)
                .set_align(FormatAlign::Center);

            let metrics: &[(&str, String)] = &[
                ("Compliance Score", format!("{:.1}%", summary.compliance_score)),
                ("Total Tests", summary.total.to_string()),
                ("Passed", summary.passed.to_string()),
                ("Failed", summary.failed.to_string()),
                ("Duration", format!("{:.2}s", summary.duration_ms as f64 / 1000.0)),
            ];

            for (i, (label, val)) in metrics.iter().enumerate() {
                let row = 4 + i as u32;
                sheet.write_with_format(row, 0, *label, &fmt_bold).map_err(xe)?;
                let vfmt = if i == 0 { &fmt_score }
                           else if i == 2 { &fmt_pass_text }
                           else if i == 3 { &fmt_fail_text }
                           else { &fmt_cell };
                sheet.write_with_format(row, 1, val.as_str(), vfmt).map_err(xe)?;
            }

            // R10: Section – Category Breakdown
            sheet.write_with_format(10, 0, "CATEGORY BREAKDOWN", &fmt_section).map_err(xe)?;

            sheet.write_with_format(11, 0, "Category", &fmt_header).map_err(xe)?;
            sheet.write_with_format(11, 1, "Total", &fmt_header).map_err(xe)?;
            sheet.write_with_format(11, 2, "Passed", &fmt_header).map_err(xe)?;
            sheet.write_with_format(11, 3, "Failed", &fmt_header).map_err(xe)?;
            sheet.write_with_format(11, 4, "Pass Rate", &fmt_header).map_err(xe)?;

            let cat_first: u32 = 12;
            for (i, cat) in summary.categories.iter().enumerate() {
                let row = cat_first + i as u32;
                let pass_rate = if cat.total > 0 { cat.passed as f64 / cat.total as f64 } else { 0.0 };
                let pr_color = if pass_rate >= 0.9 { Color::RGB(0x2E7D32) }
                               else if pass_rate >= 0.7 { Color::RGB(0xE65100) }
                               else { Color::RGB(0xC62828) };
                let fmt_pr = Format::new()
                    .set_num_format("0%")
                    .set_border(FormatBorder::Thin)
                    .set_align(FormatAlign::Center)
                    .set_font_color(pr_color);

                sheet.write_with_format(row, 0, &cat.name, &fmt_cell).map_err(xe)?;
                sheet.write_with_format(row, 1, cat.total as u32, &fmt_center).map_err(xe)?;
                sheet.write_with_format(row, 2, cat.passed as u32, &fmt_center).map_err(xe)?;
                sheet.write_with_format(row, 3, cat.failed as u32, &fmt_center).map_err(xe)?;
                sheet.write_with_format(row, 4, pass_rate, &fmt_pr).map_err(xe)?;
            }

            let cat_last = cat_first + summary.categories.len().saturating_sub(1) as u32;

            // ── Chart 1: Stacked column – pass/fail per category ──
            if !summary.categories.is_empty() {
                let mut chart = Chart::new(ChartType::ColumnStacked);
                chart.title().set_name("Test Results by Category");
                chart.x_axis().set_name("Category");
                chart.y_axis().set_name("Tests");
                chart.set_style(10);
                chart.set_width(480);
                chart.set_height(300);

                chart.add_series()
                    .set_name("Passed")
                    .set_categories(("Summary & Charts", cat_first, 0, cat_last, 0))
                    .set_values(("Summary & Charts", cat_first, 2, cat_last, 2));

                chart.add_series()
                    .set_name("Failed")
                    .set_categories(("Summary & Charts", cat_first, 0, cat_last, 0))
                    .set_values(("Summary & Charts", cat_first, 3, cat_last, 3));

                sheet.insert_chart(cat_last + 2, 0, &chart).map_err(xe)?;
            }

            // ── Chart 2: Pie – overall pass / fail ──
            // Write hidden data in columns G–H (col 6–7)
            sheet.write(4, 6, "Status").map_err(xe)?;
            sheet.write(4, 7, "Count").map_err(xe)?;
            sheet.write(5, 6, "Passed").map_err(xe)?;
            sheet.write(5, 7, summary.passed as u32).map_err(xe)?;
            sheet.write(6, 6, "Failed").map_err(xe)?;
            sheet.write(6, 7, summary.failed as u32).map_err(xe)?;

            let mut pie = Chart::new(ChartType::Pie);
            pie.title().set_name("Overall Pass / Fail");
            pie.set_style(10);
            pie.set_width(320);
            pie.set_height(240);
            pie.add_series()
                .set_categories(("Summary & Charts", 5, 6, 6, 6))
                .set_values(("Summary & Charts", 5, 7, 6, 7));

            sheet.insert_chart(3, 9, &pie).map_err(xe)?;
        }

        // ╔══════════════════════════════════════════════════════╗
        // ║  Sheet 2 – Results                                  ║
        // ╚══════════════════════════════════════════════════════╝
        {
            let sheet = workbook.add_worksheet();
            sheet.set_name("Results").map_err(xe)?;
            sheet.set_column_width(0, 38.0).map_err(xe)?;
            sheet.set_column_width(1, 24.0).map_err(xe)?;
            sheet.set_column_width(2, 10.0).map_err(xe)?;
            sheet.set_column_width(3, 13.0).map_err(xe)?;
            sheet.set_column_width(4, 14.0).map_err(xe)?;
            sheet.set_column_width(5, 9.0).map_err(xe)?;
            sheet.set_column_width(6, 52.0).map_err(xe)?;
            sheet.set_column_width(7, 24.0).map_err(xe)?;

            let headers = [
                "Test Name", "Category", "Method",
                "Status Code", "Duration (ms)", "Result",
                "Failure Reason", "Executed At",
            ];
            for (c, h) in headers.iter().enumerate() {
                sheet.write_with_format(0, c as u16, *h, &fmt_header).map_err(xe)?;
            }
            sheet.set_freeze_panes(1, 0).map_err(xe)?;

            for (i, r) in results.iter().enumerate() {
                let row = 1 + i as u32;
                let rf = if r.passed { &fmt_cell_pass } else { &fmt_cell_fail };
                let rtf = if r.passed { &fmt_pass_text } else { &fmt_fail_text };

                let center_rf = if r.passed {
                    Format::new().set_border(FormatBorder::Thin)
                        .set_background_color(Color::RGB(0xE8F5E9))
                        .set_align(FormatAlign::Center)
                } else {
                    Format::new().set_border(FormatBorder::Thin)
                        .set_background_color(Color::RGB(0xFFEBEE))
                        .set_align(FormatAlign::Center)
                };

                sheet.write_with_format(row, 0, &r.test_name, rf).map_err(xe)?;
                sheet.write_with_format(row, 1, &r.category, rf).map_err(xe)?;
                sheet.write_with_format(row, 2, &r.http_method, &center_rf).map_err(xe)?;
                let status_str = r.response_status.map(|s| s.to_string()).unwrap_or_default();
                sheet.write_with_format(row, 3, status_str.as_str(), &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 4, r.duration_ms, &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 5, if r.passed { "PASS" } else { "FAIL" }, rtf).map_err(xe)?;
                sheet.write_with_format(row, 6, r.failure_reason.as_deref().unwrap_or(""), rf).map_err(xe)?;
                sheet.write_with_format(row, 7, &r.executed_at, rf).map_err(xe)?;
            }
        }

        workbook.save(output_path).map_err(xe)?;
        Ok(())
    }

    pub fn export_loadtest_excel(
        results: &[LoadTestResult],
        summary: &LoadTestSummary,
        output_path: &str,
    ) -> Result<(), String> {
        use rust_xlsxwriter::{Chart, ChartType, Color, Format, FormatAlign, FormatBorder, Workbook};

        let xe = |e: rust_xlsxwriter::XlsxError| e.to_string();

        // ── Compute per-endpoint stats ──────────────────────────────────
        // key = "METHOD /path/normalized"  (strip query strings & IDs for grouping)
        let mut ep_map: std::collections::BTreeMap<String, (usize, usize, i64)> =
            std::collections::BTreeMap::new();
        for r in results {
            // Normalize URL: collapse trailing UUID-like path segments
            let url_key = format!("{} {}", r.http_method, Self::normalize_url(&r.url));
            let e = ep_map.entry(url_key).or_insert((0, 0, 0));
            e.0 += 1;
            if r.success { e.1 += 1; }
            e.2 += r.duration_ms;
        }
        let endpoints: Vec<(String, usize, usize, f64, f64)> = ep_map
            .iter()
            .map(|(k, (total, ok, dur_sum))| {
                let avg = if *total > 0 { *dur_sum as f64 / *total as f64 } else { 0.0 };
                let err_rate = if *total > 0 { (*total - *ok) as f64 / *total as f64 * 100.0 } else { 0.0 };
                (k.clone(), *total, *ok, avg, err_rate)
            })
            .collect();
        let multi_endpoint = endpoints.len() > 1;

        // ── Shared formats ──────────────────────────────────────────────
        let fmt_title = Format::new()
            .set_bold()
            .set_font_size(20.0)
            .set_font_color(Color::RGB(0x1565C0));

        let fmt_section = Format::new()
            .set_bold()
            .set_font_size(11.0)
            .set_font_color(Color::RGB(0x1565C0))
            .set_border_bottom(FormatBorder::Medium)
            .set_border_bottom_color(Color::RGB(0x1565C0));

        let fmt_header = Format::new()
            .set_bold()
            .set_background_color(Color::RGB(0xBBDEFB))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center);

        let fmt_ep_header = Format::new()
            .set_bold()
            .set_background_color(Color::RGB(0xE8EAF6))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center);

        let fmt_center = Format::new()
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center);

        let _fmt_cell = Format::new()
            .set_border(FormatBorder::Thin);

        let fmt_bold = Format::new().set_bold();

        let fmt_gray = Format::new()
            .set_font_color(Color::RGB(0x757575))
            .set_italic();

        let fmt_blue_val = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0x1565C0))
            .set_border(FormatBorder::Thin);

        let fmt_red_val = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0xC62828))
            .set_border(FormatBorder::Thin);

        let fmt_cell_ok = Format::new()
            .set_border(FormatBorder::Thin)
            .set_background_color(Color::RGB(0xE8F5E9));

        let fmt_cell_err = Format::new()
            .set_border(FormatBorder::Thin)
            .set_background_color(Color::RGB(0xFFEBEE));

        let fmt_ok_text = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0x2E7D32))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_background_color(Color::RGB(0xE8F5E9));

        let fmt_err_text = Format::new()
            .set_bold()
            .set_font_color(Color::RGB(0xC62828))
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_background_color(Color::RGB(0xFFEBEE));

        let mut workbook = Workbook::new();

        // ╔══════════════════════════════════════════════════════╗
        // ║  Sheet 1 – Summary & Charts                         ║
        // ╚══════════════════════════════════════════════════════╝
        {
            let sheet = workbook.add_worksheet();
            sheet.set_name("Summary & Charts").map_err(xe)?;
            sheet.set_column_width(0, 26.0).map_err(xe)?;
            sheet.set_column_width(1, 16.0).map_err(xe)?;
            sheet.set_column_width(2, 14.0).map_err(xe)?;
            sheet.set_column_width(3, 14.0).map_err(xe)?;
            // Col 4: spacer
            sheet.set_column_width(4, 4.0).map_err(xe)?;
            // Cols 5-6: hidden chart data (narrow)
            sheet.set_column_width(5, 18.0).map_err(xe)?;
            sheet.set_column_width(6, 10.0).map_err(xe)?;
            // Col 7: spacer
            sheet.set_column_width(7, 2.0).map_err(xe)?;

            // ── R0: Title ──
            sheet.set_row_height(0, 32.0).map_err(xe)?;
            sheet.merge_range(0, 0, 0, 3, "SCIM Load Test Report", &fmt_title).map_err(xe)?;
            let ts = chrono::Utc::now().format("%B %d, %Y  %H:%M UTC").to_string();
            sheet.write_with_format(1, 0, format!("Generated: {ts}"), &fmt_gray).map_err(xe)?;

            // ── R3: Performance Metrics ──
            sheet.write_with_format(3, 0, "PERFORMANCE METRICS", &fmt_section).map_err(xe)?;

            let metrics: &[(&str, String, bool)] = &[
                ("Total Requests",   summary.total_requests.to_string(),             false),
                ("Successful",       summary.successful.to_string(),                 false),
                ("Failed",           summary.failed.to_string(),                     summary.failed > 0),
                ("Error Rate",       format!("{:.2}%", summary.error_rate),          summary.error_rate > 5.0),
                ("Requests / sec",   format!("{:.1}", summary.requests_per_second),  false),
                ("Avg Latency",      format!("{:.0} ms", summary.avg_latency_ms),    false),
                ("P50 Latency",      format!("{} ms", summary.p50_latency_ms),       false),
                ("P75 Latency",      format!("{} ms", summary.p75_latency_ms),       false),
                ("P90 Latency",      format!("{} ms", summary.p90_latency_ms),       false),
                ("P95 Latency",      format!("{} ms", summary.p95_latency_ms),       false),
                ("P99 Latency",      format!("{} ms", summary.p99_latency_ms),       false),
                ("Min Latency",      format!("{} ms", summary.min_latency_ms),       false),
                ("Max Latency",      format!("{} ms", summary.max_latency_ms),       false),
            ];
            for (i, (label, val, is_err)) in metrics.iter().enumerate() {
                let row = 4 + i as u32;
                sheet.write_with_format(row, 0, *label, &fmt_bold).map_err(xe)?;
                let vfmt = if *is_err { &fmt_red_val } else { &fmt_blue_val };
                sheet.write_with_format(row, 1, val.as_str(), vfmt).map_err(xe)?;
            }
            // R16 metrics ends at row 15

            // ── R17: Status Code Distribution ──
            sheet.write_with_format(17, 0, "STATUS CODE DISTRIBUTION", &fmt_section).map_err(xe)?;
            sheet.write_with_format(18, 0, "Status Code", &fmt_header).map_err(xe)?;
            sheet.write_with_format(18, 1, "Count", &fmt_header).map_err(xe)?;
            sheet.write_with_format(18, 2, "Share", &fmt_header).map_err(xe)?;

            let mut codes: Vec<(i32, usize)> = summary.status_code_distribution
                .iter().map(|(&k, &v)| (k, v)).collect();
            codes.sort_by_key(|(k, _)| *k);
            let total_req = summary.total_requests.max(1);
            let status_first: u32 = 19;
            for (i, (code, count)) in codes.iter().enumerate() {
                let row = status_first + i as u32;
                let share = *count as f64 / total_req as f64;
                let fmt_pct = Format::new()
                    .set_num_format("0%")
                    .set_border(FormatBorder::Thin)
                    .set_align(FormatAlign::Center);
                sheet.write_with_format(row, 0, format!("HTTP {code}"), &fmt_center).map_err(xe)?;
                sheet.write_with_format(row, 1, *count as u32, &fmt_center).map_err(xe)?;
                sheet.write_with_format(row, 2, share, &fmt_pct).map_err(xe)?;
            }
            let status_last = status_first + codes.len().saturating_sub(1) as u32;

            // ── Endpoint Breakdown (when multiple endpoints tested) ──
            let mut ep_section_row: u32 = status_last + 2;
            if multi_endpoint {
                sheet.write_with_format(ep_section_row, 0, "ENDPOINT BREAKDOWN", &fmt_section).map_err(xe)?;
                ep_section_row += 1;
                let ep_hdr_row = ep_section_row;
                sheet.write_with_format(ep_hdr_row, 0, "Endpoint", &fmt_ep_header).map_err(xe)?;
                sheet.write_with_format(ep_hdr_row, 1, "Requests", &fmt_ep_header).map_err(xe)?;
                sheet.write_with_format(ep_hdr_row, 2, "Success", &fmt_ep_header).map_err(xe)?;
                sheet.write_with_format(ep_hdr_row, 3, "Avg Latency", &fmt_ep_header).map_err(xe)?;

                let ep_data_first = ep_hdr_row + 1;
                for (i, (ep, total, ok, avg_lat, err_rate)) in endpoints.iter().enumerate() {
                    let row = ep_data_first + i as u32;
                    let is_err = *err_rate > 5.0;
                    let rf = if is_err { &fmt_cell_err } else { &fmt_cell_ok };
                    let fmt_avg = if is_err {
                        Format::new().set_border(FormatBorder::Thin)
                            .set_background_color(Color::RGB(0xFFEBEE))
                            .set_align(FormatAlign::Center)
                    } else {
                        Format::new().set_border(FormatBorder::Thin)
                            .set_background_color(Color::RGB(0xE8F5E9))
                            .set_align(FormatAlign::Center)
                    };
                    sheet.write_with_format(row, 0, ep.as_str(), rf).map_err(xe)?;
                    sheet.write_with_format(row, 1, *total as u32, &fmt_avg).map_err(xe)?;
                    sheet.write_with_format(row, 2, *ok as u32, &fmt_avg).map_err(xe)?;
                    sheet.write_with_format(row, 3, format!("{:.0} ms", avg_lat).as_str(), &fmt_avg).map_err(xe)?;
                    // Write numeric avg_lat in col 6 for chart source (hidden column area)
                    sheet.write(row, 6, *avg_lat as u32).map_err(xe)?;
                    // Write endpoint label in col 5 for chart categories
                    sheet.write(row, 5, ep.as_str()).map_err(xe)?;
                }
                let ep_data_last = ep_data_first + endpoints.len().saturating_sub(1) as u32;

                // Per-endpoint avg latency chart — placed to the right, row 3 col 8 + offset
                // We place it at row 18, col 8 (below the latency percentile chart)
                let mut ep_chart = Chart::new(ChartType::Bar); // horizontal bar reads better for long endpoint names
                ep_chart.title().set_name("Avg Latency by Endpoint (ms)");
                ep_chart.x_axis().set_name("ms");
                ep_chart.set_style(10);
                ep_chart.set_width(460);
                ep_chart.set_height((endpoints.len() as u32 * 28 + 120).min(380) as u32);
                ep_chart.add_series()
                    .set_name("Avg Latency (ms)")
                    .set_categories(("Summary & Charts", ep_data_first, 5, ep_data_last, 5))
                    .set_values(("Summary & Charts", ep_data_first, 6, ep_data_last, 6));
                // Place endpoint chart at row 18, right of latency chart (col 16)
                sheet.insert_chart(18, 16, &ep_chart).map_err(xe)?;
            }

            // ── Hidden chart data block (cols 5-6, rows 4-10): latency percentiles ──
            // These rows are always free because left-side data uses cols 0-3
            let pct_labels = ["Avg", "P50", "P75", "P90", "P95", "P99", "Min", "Max"];
            let pct_values = [
                summary.avg_latency_ms as i64,
                summary.p50_latency_ms,
                summary.p75_latency_ms,
                summary.p90_latency_ms,
                summary.p95_latency_ms,
                summary.p99_latency_ms,
                summary.min_latency_ms,
                summary.max_latency_ms,
            ];
            // Use rows 4-10 in cols 5-6 (safe — left side data only in cols 0-1)
            const PCT_FIRST: u32 = 4;
            for (i, (lbl, val)) in pct_labels.iter().zip(pct_values.iter()).enumerate() {
                let row = PCT_FIRST + i as u32;
                sheet.write(row, 5, *lbl).map_err(xe)?;
                sheet.write(row, 6, *val).map_err(xe)?;
            }
            const PCT_LAST: u32 = PCT_FIRST + 7; // 4+7 = 11 (8 items: Avg,P50,P75,P90,P95,P99,Min,Max)

            // ── Chart 1: Latency Percentiles (column) ──
            // Anchored at row 3, col 8 — height=260px (~13 rows) → occupies rows 3-15
            let mut lat_chart = Chart::new(ChartType::Column);
            lat_chart.title().set_name("Latency Percentiles (ms)");
            lat_chart.x_axis().set_name("Percentile");
            lat_chart.y_axis().set_name("ms");
            lat_chart.set_style(10);
            lat_chart.set_width(420);
            lat_chart.set_height(260);
            lat_chart.add_series()
                .set_name("Latency (ms)")
                .set_categories(("Summary & Charts", PCT_FIRST, 5, PCT_LAST, 5))
                .set_values(("Summary & Charts", PCT_FIRST, 6, PCT_LAST, 6));
            sheet.insert_chart(3, 8, &lat_chart).map_err(xe)?;

            // ── Hidden pie source data: rows 12-14, cols 5-6 ──
            // Row 12 is safely below the pct data (ends row 10) and inside the
            // latency chart's data range but NOT overlapping chart placement on cols 8+
            sheet.write(12, 5, "Successful").map_err(xe)?;
            sheet.write(12, 6, summary.successful as u32).map_err(xe)?;
            sheet.write(13, 5, "Failed").map_err(xe)?;
            sheet.write(13, 6, summary.failed as u32).map_err(xe)?;

            // ── Chart 2: Success / Failure Pie ──
            // Anchored at row 18, col 8 — starts BELOW the latency chart (which ends ~row 16)
            // height=240px (~12 rows) → occupies rows 18-29
            let mut pie = Chart::new(ChartType::Pie);
            pie.title().set_name("Success / Failure Rate");
            pie.set_style(10);
            pie.set_width(360);
            pie.set_height(260);
            pie.add_series()
                .set_categories(("Summary & Charts", 12, 5, 13, 5))
                .set_values(("Summary & Charts", 12, 6, 13, 6));
            sheet.insert_chart(18, 8, &pie).map_err(xe)?;
        }

        // ╔══════════════════════════════════════════════════════╗
        // ║  Sheet 2 – Results                                  ║
        // ╚══════════════════════════════════════════════════════╝
        {
            let sheet = workbook.add_worksheet();
            sheet.set_name("Results").map_err(xe)?;
            sheet.set_column_width(0, 10.0).map_err(xe)?;
            sheet.set_column_width(1, 10.0).map_err(xe)?;
            sheet.set_column_width(2, 36.0).map_err(xe)?;
            sheet.set_column_width(3, 13.0).map_err(xe)?;
            sheet.set_column_width(4, 14.0).map_err(xe)?;
            sheet.set_column_width(5, 10.0).map_err(xe)?;
            sheet.set_column_width(6, 38.0).map_err(xe)?;
            sheet.set_column_width(7, 24.0).map_err(xe)?;

            let headers = [
                "#", "Method", "URL", "Status Code",
                "Duration (ms)", "Success", "Error Message", "Timestamp",
            ];
            for (c, h) in headers.iter().enumerate() {
                sheet.write_with_format(0, c as u16, *h, &fmt_header).map_err(xe)?;
            }
            sheet.set_freeze_panes(1, 0).map_err(xe)?;

            let max_rows = results.len().min(10_000);
            for (i, r) in results.iter().take(max_rows).enumerate() {
                let row = 1 + i as u32;
                let rf  = if r.success { &fmt_cell_ok  } else { &fmt_cell_err };
                let rtf = if r.success { &fmt_ok_text  } else { &fmt_err_text };

                let center_rf = if r.success {
                    Format::new().set_border(FormatBorder::Thin)
                        .set_background_color(Color::RGB(0xE8F5E9))
                        .set_align(FormatAlign::Center)
                } else {
                    Format::new().set_border(FormatBorder::Thin)
                        .set_background_color(Color::RGB(0xFFEBEE))
                        .set_align(FormatAlign::Center)
                };

                sheet.write_with_format(row, 0, r.request_index, &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 1, &r.http_method, &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 2, &r.url, rf).map_err(xe)?;
                let status_str = r.status_code.map(|s| s.to_string()).unwrap_or_default();
                sheet.write_with_format(row, 3, status_str.as_str(), &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 4, r.duration_ms, &center_rf).map_err(xe)?;
                sheet.write_with_format(row, 5, if r.success { "✓" } else { "✗" }, rtf).map_err(xe)?;
                sheet.write_with_format(row, 6, r.error_message.as_deref().unwrap_or(""), rf).map_err(xe)?;
                sheet.write_with_format(row, 7, &r.timestamp, rf).map_err(xe)?;
            }
        }

        workbook.save(output_path).map_err(xe)?;
        Ok(())
    }

    /// Collapse path segments that look like UUIDs or numeric IDs so that
    /// "GET /Users/abc-123" and "GET /Users/def-456" group together as "GET /Users/{id}".
    fn normalize_url(url: &str) -> String {
        // Strip query string
        let path = url.split('?').next().unwrap_or(url);
        let segments: Vec<&str> = path.split('/').map(|s| {
            // UUID pattern or all-digits → replace with {id}
            if s.len() > 8 && s.chars().all(|c| c.is_alphanumeric() || c == '-') {
                "{id}"
            } else {
                s
            }
        }).collect();
        segments.join("/")
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
