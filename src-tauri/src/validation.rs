use chrono::Utc;
use uuid::Uuid;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::models::*;
use crate::scim_client::ScimClient;

/// A custom / extension attribute discovered from the SCIM /Schemas endpoint.
struct SchemaAttribute {
    schema_urn: String,
    #[allow(dead_code)]
    schema_name: String,
    attr_name: String,
    attr_type: String, // "boolean", "string", "integer", "decimal", "dateTime", "reference"
}

pub struct ValidationEngine;

// Public wrapper so commands.rs can call schema discovery
impl ValidationEngine {
    pub async fn discover_custom_attributes(client: &ScimClient) -> Vec<DiscoveredSchemaAttribute> {
        let internal = Self::discover_schema_attributes(client).await;
        internal.into_iter().map(|a| DiscoveredSchemaAttribute {
            schema_urn: a.schema_urn,
            schema_name: a.schema_name,
            attr_name: a.attr_name,
            attr_type: a.attr_type,
        }).collect()
    }
}

impl ValidationEngine {
    pub async fn run(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        categories: &[String],
        field_mapping_rules: &[FieldMappingRule],
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let all_categories: Vec<&str> = categories.iter().map(|s| s.as_str()).collect();

        // Pre-discover custom schema attributes (needs a network call) so we
        // can compute an accurate test count for progress reporting.
        let custom_attrs = if all_categories.contains(&"custom_schema") {
            Self::discover_schema_attributes(client).await
        } else {
            Vec::new()
        };

        let mut total_tests = 0usize;
        for cat in &all_categories {
            total_tests += match *cat {
                "schema_discovery" => 3,
                "users_crud" => 6,
                "groups_crud" => 6,
                "patch_operations" => 4,
                "filtering_pagination" => 4,
                "field_mapping" => field_mapping_rules.len().max(1),
                "custom_schema" => Self::count_custom_schema_tests(&custom_attrs),
                _ => 0,
            };
        }

        let mut completed = 0usize;

        for category in &all_categories {
            let cat_results = match *category {
                "schema_discovery" => {
                    Self::test_schema_discovery(app, client, test_run_id, &mut completed, total_tests).await
                }
                "users_crud" => {
                    Self::test_users_crud(app, client, test_run_id, &mut completed, total_tests).await
                }
                "groups_crud" => {
                    Self::test_groups_crud(app, client, test_run_id, &mut completed, total_tests).await
                }
                "patch_operations" => {
                    Self::test_patch_operations(app, client, test_run_id, &mut completed, total_tests).await
                }
                "filtering_pagination" => {
                    Self::test_filtering_pagination(app, client, test_run_id, &mut completed, total_tests).await
                }
                "field_mapping" => {
                    Self::test_field_mapping(app, client, test_run_id, field_mapping_rules, &mut completed, total_tests).await
                }
                "custom_schema" => {
                    Self::test_custom_schema(app, client, test_run_id, &custom_attrs, &mut completed, total_tests).await
                }
                _ => Vec::new(),
            };
            results.extend(cat_results);
        }

        results
    }

    fn emit_progress(app: &AppHandle, test_run_id: &str, test_name: &str, category: &str, completed: usize, total: usize) {
        let _ = app.emit("validation-progress", ValidationProgress {
            test_run_id: test_run_id.to_string(),
            current_test: test_name.to_string(),
            current_category: category.to_string(),
            completed,
            total,
        });
    }

    /// Look up the "Resources" key case-insensitively.
    /// SCIM RFC 7644 uses "Resources" (capital R) but many servers return "resources".
    fn get_resources(json: &Value) -> Option<&Value> {
        json.get("Resources").or_else(|| json.get("resources"))
    }

    /// Fetch /Schemas and extract extension-schema attributes (non-core, non-complex,
    /// non-multi-valued).  Used by the `custom_schema` validation category.
    async fn discover_schema_attributes(client: &ScimClient) -> Vec<SchemaAttribute> {
        let resp = match client.get("/Schemas").await {
            Ok(r) if r.status == 200 => r,
            _ => return Vec::new(),
        };

        let json: Value = match serde_json::from_str(&resp.body) {
            Ok(j) => j,
            Err(_) => return Vec::new(),
        };

        // Schemas may be in a ListResponse (Resources) or a direct array
        let schemas: Vec<&Value> = if let Some(resources) = Self::get_resources(&json) {
            resources.as_array().map(|a| a.iter().collect()).unwrap_or_default()
        } else if let Some(arr) = json.as_array() {
            arr.iter().collect()
        } else {
            return Vec::new();
        };

        // Core schemas whose attributes are already covered by other test categories
        let core_schema_prefixes = [
            "urn:ietf:params:scim:schemas:core:2.0:",
            "urn:ietf:params:scim:api:messages:2.0:",
        ];

        let mut attrs = Vec::new();

        for schema in &schemas {
            let schema_id = schema.get("id").and_then(|v| v.as_str()).unwrap_or("");
            // Skip core schemas
            if core_schema_prefixes.iter().any(|p| schema_id.starts_with(p)) {
                continue;
            }
            // Only consider schemas that relate to User (contain "User" or are generic
            // extensions).  ResourceType-specific filtering could be done via
            // /ResourceTypes, but this heuristic works for most deployments.
            let schema_name = schema.get("name").and_then(|v| v.as_str()).unwrap_or("Extension");

            if let Some(attributes) = schema.get("attributes").and_then(|v| v.as_array()) {
                for attr in attributes {
                    let name = attr.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let attr_type = attr.get("type").and_then(|v| v.as_str()).unwrap_or("string");
                    let multi_valued = attr.get("multiValued").and_then(|v| v.as_bool()).unwrap_or(false);

                    // Skip empty, complex, binary, or multi-valued attributes
                    if name.is_empty() || attr_type == "complex" || attr_type == "binary" || multi_valued {
                        continue;
                    }

                    attrs.push(SchemaAttribute {
                        schema_urn: schema_id.to_string(),
                        schema_name: schema_name.to_string(),
                        attr_name: name.to_string(),
                        attr_type: attr_type.to_lowercase(),
                    });
                }
            }
        }

        attrs
    }

    /// Produce a sensible test value for a given SCIM attribute type.
    fn generate_test_value(attr_type: &str) -> Value {
        match attr_type {
            "string"              => Value::String("scim_test_value".to_string()),
            "integer"             => serde_json::json!(42),
            "decimal"             => serde_json::json!(3.14),
            "boolean"             => Value::Bool(true),
            "dateTime" | "datetime" => Value::String(Utc::now().to_rfc3339()),
            "reference"           => Value::String("https://example.com/test".to_string()),
            _                     => Value::String("test".to_string()),
        }
    }

    /// Count how many tests the custom_schema category will produce for a given
    /// set of discovered attributes.
    fn count_custom_schema_tests(attrs: &[SchemaAttribute]) -> usize {
        if attrs.is_empty() {
            return 1; // the "no attributes found" placeholder
        }
        let booleans = attrs.iter().filter(|a| a.attr_type == "boolean").count();
        let others   = attrs.iter().filter(|a| a.attr_type != "boolean").count();
        booleans * 2 + others
    }

    fn make_result(
        test_run_id: &str,
        test_name: &str,
        category: &str,
        http_method: &str,
        url: &str,
        request_body: Option<String>,
        response_status: Option<i32>,
        response_body: Option<String>,
        duration_ms: i64,
        passed: bool,
        failure_reason: Option<String>,
    ) -> ValidationResult {
        ValidationResult {
            id: Uuid::new_v4().to_string(),
            test_run_id: test_run_id.to_string(),
            test_name: test_name.to_string(),
            category: category.to_string(),
            http_method: http_method.to_string(),
            url: url.to_string(),
            request_body,
            response_status,
            response_body,
            duration_ms,
            passed,
            failure_reason,
            executed_at: Utc::now().to_rfc3339(),
        }
    }

    // ── Schema Discovery Tests ──

    async fn test_schema_discovery(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "schema_discovery";

        // Test 1: GET /ServiceProviderConfig
        let test_name = "GET /ServiceProviderConfig";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/ServiceProviderConfig").await {
            Ok(resp) => {
                let passed = resp.status == 200;
                let failure = if !passed {
                    Some(format!("Expected status 200, got {}", resp.status))
                } else {
                    // Validate the response has required fields
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            if json.get("schemas").is_none() {
                                Some("Response missing 'schemas' field".to_string())
                            } else {
                                None
                            }
                        }
                        Err(e) => Some(format!("Invalid JSON response: {}", e)),
                    }
                };
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/ServiceProviderConfig", None,
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, failure.is_none(), failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/ServiceProviderConfig", None, None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        // Test 2: GET /Schemas
        let test_name = "GET /Schemas";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Schemas").await {
            Ok(resp) => {
                let mut passed = resp.status == 200;
                let mut failure = None;
                if !passed {
                    failure = Some(format!("Expected status 200, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            // Should contain schemas array or be a ListResponse
                            let has_schemas = Self::get_resources(&json).is_some() || json.is_array();
                            if !has_schemas {
                                passed = false;
                                failure = Some("Response should contain 'Resources' array or be an array of schemas".to_string());
                            }
                        }
                        Err(e) => {
                            passed = false;
                            failure = Some(format!("Invalid JSON response: {}", e));
                        }
                    }
                }
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/Schemas", None,
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, passed, failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/Schemas", None, None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        // Test 3: GET /ResourceTypes
        let test_name = "GET /ResourceTypes";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/ResourceTypes").await {
            Ok(resp) => {
                let passed = resp.status == 200;
                let failure = if !passed {
                    Some(format!("Expected status 200, got {}", resp.status))
                } else {
                    None
                };
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/ResourceTypes", None,
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, passed, failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/ResourceTypes", None, None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        results
    }

    // ── Users CRUD Tests ──

    async fn test_users_crud(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "users_crud";
        let uid = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let test_user_name = format!("scim_test_user_{}@test.example.com", uid);
        let mut created_user_id: Option<String> = None;

        // Test 1: CREATE User (POST /Users)
        let test_name = "POST /Users - Create Test User";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        let create_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": test_user_name,
            "name": {
                "givenName": "SCIM",
                "familyName": "TestUser"
            },
            "emails": [{
                "value": test_user_name,
                "type": "work",
                "primary": true
            }],
            "displayName": "SCIM Test User",
            "active": true
        }).to_string();

        match client.post("/Users", &create_body).await {
            Ok(resp) => {
                let passed = resp.status == 201;
                let mut failure = None;
                if !passed {
                    failure = Some(format!("Expected status 201, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                created_user_id = Some(id.to_string());
                            } else {
                                failure = Some("Response missing 'id' field".to_string());
                            }
                        }
                        Err(e) => {
                            failure = Some(format!("Invalid JSON: {}", e));
                        }
                    }
                }
                results.push(Self::make_result(
                    test_run_id, test_name, category, "POST",
                    "/Users", Some(create_body.clone()),
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, failure.is_none(), failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "POST",
                    "/Users", Some(create_body.clone()), None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        // Test 2: READ User (GET /Users/{id})
        let test_name = "GET /Users/{id} - Read Test User";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            match client.get(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed {
                        Some(format!("Expected status 200, got {}", resp.status))
                    } else {
                        match serde_json::from_str::<Value>(&resp.body) {
                            Ok(json) => {
                                if json.get("userName").and_then(|v| v.as_str()) != Some(&test_user_name) {
                                    Some("Returned userName does not match created user".to_string())
                                } else {
                                    None
                                }
                            }
                            Err(e) => Some(format!("Invalid JSON: {}", e)),
                        }
                    };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET",
                        &path, None,
                        Some(resp.status as i32), Some(resp.body),
                        resp.duration_ms, failure.is_none(), failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET",
                        &path, None, None, None,
                        0, false, Some(e),
                    ));
                }
            }
        } else {
            results.push(Self::make_result(
                test_run_id, test_name, category, "GET",
                "/Users/{id}", None, None, None,
                0, false, Some("Skipped: user creation failed".to_string()),
            ));
        }
        *completed += 1;

        // Test 3: LIST Users (GET /Users)
        let test_name = "GET /Users - List Users";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Users").await {
            Ok(resp) => {
                let passed = resp.status == 200;
                let failure = if !passed {
                    Some(format!("Expected status 200, got {}", resp.status))
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            if json.get("totalResults").is_none() {
                                Some("Response missing 'totalResults' field".to_string())
                            } else {
                                let total = json.get("totalResults").and_then(|v| v.as_u64()).unwrap_or(0);
                                if total > 0 && Self::get_resources(&json).is_none() {
                                    Some("Response missing 'Resources' field (totalResults > 0 but no Resources array)".to_string())
                                } else if total > 0 {
                                    match Self::get_resources(&json).and_then(|v| v.as_array()) {
                                        Some(arr) if arr.is_empty() => {
                                            Some("'Resources' array is empty but totalResults > 0".to_string())
                                        }
                                        Some(_) => None,
                                        None => Some("'Resources' is not an array".to_string()),
                                    }
                                } else {
                                    // totalResults == 0: Resources is optional per RFC 7644 §3.4.2
                                    None
                                }
                            }
                        }
                        Err(e) => Some(format!("Invalid JSON: {}", e)),
                    }
                };
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/Users", None,
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, failure.is_none(), failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET",
                    "/Users", None, None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        // Test 4: UPDATE User (PUT /Users/{id})
        let test_name = "PUT /Users/{id} - Update Test User";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            let update_body = serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                "userName": test_user_name,
                "name": {
                    "givenName": "SCIM",
                    "familyName": "UpdatedUser"
                },
                "emails": [{
                    "value": test_user_name,
                    "type": "work",
                    "primary": true
                }],
                "displayName": "SCIM Updated User",
                "active": true
            }).to_string();
            match client.put(&path, &update_body).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed {
                        Some(format!("Expected status 200, got {}", resp.status))
                    } else {
                        match serde_json::from_str::<Value>(&resp.body) {
                            Ok(json) => {
                                let family = json.pointer("/name/familyName").and_then(|v| v.as_str());
                                if family != Some("UpdatedUser") {
                                    Some("familyName was not updated to 'UpdatedUser'".to_string())
                                } else {
                                    None
                                }
                            }
                            Err(e) => Some(format!("Invalid JSON: {}", e)),
                        }
                    };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "PUT",
                        &path, Some(update_body),
                        Some(resp.status as i32), Some(resp.body),
                        resp.duration_ms, failure.is_none(), failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "PUT",
                        &path, Some(update_body), None, None,
                        0, false, Some(e),
                    ));
                }
            }
        } else {
            results.push(Self::make_result(
                test_run_id, test_name, category, "PUT",
                "/Users/{id}", None, None, None,
                0, false, Some("Skipped: user creation failed".to_string()),
            ));
        }
        *completed += 1;

        // Test 5: DELETE User (DELETE /Users/{id})
        let test_name = "DELETE /Users/{id} - Delete Test User";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            match client.delete(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 204 || resp.status == 200;
                    let failure = if !passed {
                        Some(format!("Expected status 204 or 200, got {}", resp.status))
                    } else {
                        None
                    };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "DELETE",
                        &path, None,
                        Some(resp.status as i32), Some(resp.body),
                        resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "DELETE",
                        &path, None, None, None,
                        0, false, Some(e),
                    ));
                }
            }
        } else {
            results.push(Self::make_result(
                test_run_id, test_name, category, "DELETE",
                "/Users/{id}", None, None, None,
                0, false, Some("Skipped: user creation failed".to_string()),
            ));
        }
        *completed += 1;

        // Test 6: VERIFY deletion (GET /Users/{id} should return 404)
        let test_name = "GET /Users/{id} - Verify Deletion (expect 404)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            match client.get(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 404;
                    let failure = if !passed {
                        Some(format!("Expected status 404 after deletion, got {}", resp.status))
                    } else {
                        None
                    };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET",
                        &path, None,
                        Some(resp.status as i32), Some(resp.body),
                        resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET",
                        &path, None, None, None,
                        0, false, Some(e),
                    ));
                }
            }
        } else {
            results.push(Self::make_result(
                test_run_id, test_name, category, "GET",
                "/Users/{id}", None, None, None,
                0, false, Some("Skipped: user creation failed".to_string()),
            ));
        }
        *completed += 1;

        results
    }

    // ── Groups CRUD Tests ──

    async fn test_groups_crud(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "groups_crud";
        let test_group_name = format!("scim_test_group_{}", Uuid::new_v4().to_string().split('-').next().unwrap());
        let mut created_group_id: Option<String> = None;

        // Test 1: CREATE Group
        let test_name = "POST /Groups - Create Test Group";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        let create_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "displayName": test_group_name,
            "members": []
        }).to_string();
        match client.post("/Groups", &create_body).await {
            Ok(resp) => {
                let passed = resp.status == 201;
                let mut failure = None;
                if !passed {
                    failure = Some(format!("Expected status 201, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                created_group_id = Some(id.to_string());
                            } else {
                                failure = Some("Response missing 'id' field".to_string());
                            }
                        }
                        Err(e) => failure = Some(format!("Invalid JSON: {}", e)),
                    }
                }
                results.push(Self::make_result(
                    test_run_id, test_name, category, "POST",
                    "/Groups", Some(create_body.clone()),
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, failure.is_none(), failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(
                    test_run_id, test_name, category, "POST",
                    "/Groups", Some(create_body), None, None,
                    0, false, Some(e),
                ));
            }
        }
        *completed += 1;

        // Test 2: READ Group
        let test_name = "GET /Groups/{id} - Read Test Group";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref group_id) = created_group_id {
            let path = format!("/Groups/{}", group_id);
            match client.get(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET",
                        &path, None, Some(resp.status as i32), Some(resp.body),
                        resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET", &path, None, None, None, 0, false, Some(e),
                    ));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Groups/{id}", None, None, None, 0, false, Some("Skipped: group creation failed".to_string())));
        }
        *completed += 1;

        // Test 3: LIST Groups
        let test_name = "GET /Groups - List Groups";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Groups").await {
            Ok(resp) => {
                let passed = resp.status == 200;
                let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                results.push(Self::make_result(
                    test_run_id, test_name, category, "GET", "/Groups", None,
                    Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure,
                ));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Groups", None, None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        // Test 4: UPDATE Group
        let test_name = "PUT /Groups/{id} - Update Test Group";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref group_id) = created_group_id {
            let path = format!("/Groups/{}", group_id);
            let update_body = serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
                "displayName": format!("{}_updated", test_group_name),
                "members": []
            }).to_string();
            match client.put(&path, &update_body).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "PUT", &path, Some(update_body),
                        Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "PUT", &path, Some(update_body), None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "PUT", "/Groups/{id}", None, None, None, 0, false, Some("Skipped: group creation failed".to_string())));
        }
        *completed += 1;

        // Test 5: DELETE Group
        let test_name = "DELETE /Groups/{id} - Delete Test Group";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref group_id) = created_group_id {
            let path = format!("/Groups/{}", group_id);
            match client.delete(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 204 || resp.status == 200;
                    let failure = if !passed { Some(format!("Expected 204/200, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "DELETE", &path, None,
                        Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "DELETE", &path, None, None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "DELETE", "/Groups/{id}", None, None, None, 0, false, Some("Skipped: group creation failed".to_string())));
        }
        *completed += 1;

        // Test 6: VERIFY deletion
        let test_name = "GET /Groups/{id} - Verify Deletion (expect 404)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref group_id) = created_group_id {
            let path = format!("/Groups/{}", group_id);
            match client.get(&path).await {
                Ok(resp) => {
                    let passed = resp.status == 404;
                    let failure = if !passed { Some(format!("Expected 404, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(
                        test_run_id, test_name, category, "GET", &path, None,
                        Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure,
                    ));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "GET", &path, None, None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Groups/{id}", None, None, None, 0, false, Some("Skipped: group creation failed".to_string())));
        }
        *completed += 1;

        results
    }

    // ── PATCH Operations Tests ──

    async fn test_patch_operations(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "patch_operations";
        let test_user_name = format!("scim_patch_test_{}@test.example.com", Uuid::new_v4().to_string().split('-').next().unwrap());
        let mut created_user_id: Option<String> = None;

        // First create a user for PATCH testing
        let create_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": test_user_name,
            "name": { "givenName": "Patch", "familyName": "TestUser" },
            "displayName": "Patch Test User",
            "active": true
        }).to_string();
        if let Ok(resp) = client.post("/Users", &create_body).await {
            if resp.status == 201 {
                if let Ok(json) = serde_json::from_str::<Value>(&resp.body) {
                    created_user_id = json.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
            }
        }

        // Test 1: PATCH Add attribute
        let test_name = "PATCH /Users/{id} - Add attribute (title)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            let patch_body = serde_json::json!({
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [{ "op": "add", "path": "title", "value": "Engineer" }]
            }).to_string();
            match client.patch(&path, &patch_body).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "PATCH", "/Users/{id}", None, None, None, 0, false, Some("Skipped: user creation failed".to_string())));
        }
        *completed += 1;

        // Test 2: PATCH Replace attribute
        let test_name = "PATCH /Users/{id} - Replace attribute (displayName)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            let patch_body = serde_json::json!({
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [{ "op": "replace", "path": "displayName", "value": "Updated Patch User" }]
            }).to_string();
            match client.patch(&path, &patch_body).await {
                Ok(resp) => {
                    let passed = resp.status == 200;
                    let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "PATCH", "/Users/{id}", None, None, None, 0, false, Some("Skipped: user creation failed".to_string())));
        }
        *completed += 1;

        // Test 3: PATCH Remove attribute
        let test_name = "PATCH /Users/{id} - Remove attribute (title)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        if let Some(ref user_id) = created_user_id {
            let path = format!("/Users/{}", user_id);
            let patch_body = serde_json::json!({
                "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                "Operations": [{ "op": "remove", "path": "title" }]
            }).to_string();
            match client.patch(&path, &patch_body).await {
                Ok(resp) => {
                    let passed = resp.status == 200 || resp.status == 204;
                    let failure = if !passed { Some(format!("Expected 200/204, got {}", resp.status)) } else { None };
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
                }
                Err(e) => {
                    results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), None, None, 0, false, Some(e)));
                }
            }
        } else {
            results.push(Self::make_result(test_run_id, test_name, category, "PATCH", "/Users/{id}", None, None, None, 0, false, Some("Skipped: user creation failed".to_string())));
        }
        *completed += 1;

        // Cleanup: delete the test user
        if let Some(ref user_id) = created_user_id {
            let _ = client.delete(&format!("/Users/{}", user_id)).await;
        }

        // Test 4: PATCH on non-existent resource should return 404
        let test_name = "PATCH /Users/{nonexistent} - Expect 404";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        let fake_id = Uuid::new_v4().to_string();
        let path = format!("/Users/{}", fake_id);
        let patch_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{ "op": "add", "path": "title", "value": "Test" }]
        }).to_string();
        match client.patch(&path, &patch_body).await {
            Ok(resp) => {
                let passed = resp.status == 404;
                let failure = if !passed { Some(format!("Expected 404 for non-existent resource, got {}", resp.status)) } else { None };
                results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "PATCH", &path, Some(patch_body), None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        results
    }

    // ── Filtering & Pagination Tests ──

    async fn test_filtering_pagination(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "filtering_pagination";

        // Create a test user for filtering
        let test_user_name = format!("scim_filter_test_{}@test.example.com", Uuid::new_v4().to_string().split('-').next().unwrap());
        let mut created_user_id: Option<String> = None;
        let create_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": test_user_name,
            "name": { "givenName": "Filter", "familyName": "TestUser" },
            "displayName": "Filter Test User",
            "active": true
        }).to_string();
        if let Ok(resp) = client.post("/Users", &create_body).await {
            if resp.status == 201 {
                if let Ok(json) = serde_json::from_str::<Value>(&resp.body) {
                    created_user_id = json.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
            }
        }

        // Test 1: Filter by userName eq
        let test_name = "GET /Users?filter - Filter by userName eq";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        let filter_path = format!("/Users?filter=userName eq \"{}\"", test_user_name);
        match client.get(&filter_path).await {
            Ok(resp) => {
                let mut passed = resp.status == 200;
                let mut failure = None;
                if !passed {
                    failure = Some(format!("Expected 200, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            let total_results = json.get("totalResults").and_then(|v| v.as_u64()).unwrap_or(0);
                            if total_results == 0 {
                                passed = false;
                                failure = Some("Filter returned 0 results, expected at least 1".to_string());
                            }
                        }
                        Err(e) => {
                            passed = false;
                            failure = Some(format!("Invalid JSON: {}", e));
                        }
                    }
                }
                results.push(Self::make_result(test_run_id, test_name, category, "GET", &filter_path, None, Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "GET", &filter_path, None, None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        // Test 2: Pagination with startIndex and count
        let test_name = "GET /Users?startIndex&count - Pagination";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Users?startIndex=1&count=2").await {
            Ok(resp) => {
                let mut passed = resp.status == 200;
                let mut failure = None;
                if !passed {
                    failure = Some(format!("Expected 200, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            if json.get("totalResults").is_none() {
                                passed = false;
                                failure = Some("Response missing 'totalResults' for pagination".to_string());
                            }
                            if json.get("itemsPerPage").is_none() && Self::get_resources(&json).is_some() {
                                // itemsPerPage is recommended but not strictly required
                            }
                        }
                        Err(e) => {
                            passed = false;
                            failure = Some(format!("Invalid JSON: {}", e));
                        }
                    }
                }
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?startIndex=1&count=2", None, Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?startIndex=1&count=2", None, None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        // Test 3: Filter with invalid filter — RFC 7644 §3.4.2.2 says
        // servers SHOULD return 400 (invalidFilter), but many servers
        // silently ignore unknown attributes and return 200 instead.
        // Treat 400 as a full pass, 200 as a pass-with-warning.
        let test_name = "GET /Users?filter - Invalid filter (expect 400)";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Users?filter=invalidAttribute zz \"bad\"").await {
            Ok(resp) => {
                let (passed, failure) = match resp.status {
                    400 => (true, None),
                    200 => (true, Some("Server returned 200 instead of 400 for an invalid filter — RFC 7644 §3.4.2.2 recommends (SHOULD) returning 400 with scimType \"invalidFilter\"".to_string())),
                    other => (false, Some(format!("Expected 400 for invalid filter, got {}", other))),
                };
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?filter=invalidAttribute zz \"bad\"", None, Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?filter=invalidAttribute zz \"bad\"", None, None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        // Test 4: Attributes parameter
        let test_name = "GET /Users?attributes - Select specific attributes";
        Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
        match client.get("/Users?attributes=userName,displayName&count=1").await {
            Ok(resp) => {
                let passed = resp.status == 200;
                let failure = if !passed { Some(format!("Expected 200, got {}", resp.status)) } else { None };
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?attributes=userName,displayName&count=1", None, Some(resp.status as i32), Some(resp.body), resp.duration_ms, passed, failure));
            }
            Err(e) => {
                results.push(Self::make_result(test_run_id, test_name, category, "GET", "/Users?attributes=userName,displayName&count=1", None, None, None, 0, false, Some(e)));
            }
        }
        *completed += 1;

        // Cleanup
        if let Some(ref user_id) = created_user_id {
            let _ = client.delete(&format!("/Users/{}", user_id)).await;
        }

        results
    }

    // ── Custom Schema Tests ──

    async fn test_custom_schema(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        attrs: &[SchemaAttribute],
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "custom_schema";

        if attrs.is_empty() {
            let test_name = "No custom schema attributes discovered";
            Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
            results.push(Self::make_result(
                test_run_id, test_name, category, "N/A", "/Schemas", None, None, None, 0, true,
                Some("Skipped — no extension schema attributes found in /Schemas".to_string()),
            ));
            *completed += 1;
            return results;
        }

        for attr in attrs {
            if attr.attr_type == "boolean" {
                // Two tests: one with true, one with false
                let r = Self::test_custom_attr_value(
                    app, client, test_run_id, attr, Value::Bool(true), completed, total,
                ).await;
                results.push(r);

                let r = Self::test_custom_attr_value(
                    app, client, test_run_id, attr, Value::Bool(false), completed, total,
                ).await;
                results.push(r);
            } else {
                let test_value = Self::generate_test_value(&attr.attr_type);
                let r = Self::test_custom_attr_value(
                    app, client, test_run_id, attr, test_value, completed, total,
                ).await;
                results.push(r);
            }
        }

        results
    }

    /// Create a user with a custom extension attribute set to `value`, verify
    /// the response echoes the attribute correctly, then clean up.
    async fn test_custom_attr_value(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        attr: &SchemaAttribute,
        value: Value,
        completed: &mut usize,
        total: usize,
    ) -> ValidationResult {
        let category = "custom_schema";
        let value_display = match &value {
            Value::Bool(b) => b.to_string(),
            Value::String(s) => format!("\"{}\"", s),
            Value::Number(n) => n.to_string(),
            _ => value.to_string(),
        };
        let short_schema = attr.schema_urn.split(':').last().unwrap_or(&attr.schema_urn);
        let test_name = format!(
            "POST /Users - Create with {}.{} = {}",
            short_schema, attr.attr_name, value_display
        );
        Self::emit_progress(app, test_run_id, &test_name, category, *completed, total);

        let uid = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let test_user_name = format!("scim_custom_test_{}@test.example.com", uid);

        // Build the create body with the extension attribute
        let mut body_map = serde_json::Map::new();
        body_map.insert("schemas".to_string(), serde_json::json!([
            "urn:ietf:params:scim:schemas:core:2.0:User",
            &attr.schema_urn
        ]));
        body_map.insert("userName".to_string(), Value::String(test_user_name.clone()));
        body_map.insert("name".to_string(), serde_json::json!({
            "givenName": "Custom",
            "familyName": "SchemaTest"
        }));
        body_map.insert("displayName".to_string(), Value::String("Custom Schema Test User".to_string()));
        body_map.insert("emails".to_string(), serde_json::json!([{
            "value": test_user_name,
            "type": "work",
            "primary": true
        }]));
        body_map.insert("active".to_string(), Value::Bool(true));

        // Extension attributes go under the schema URN key
        let mut ext_map = serde_json::Map::new();
        ext_map.insert(attr.attr_name.clone(), value.clone());
        body_map.insert(attr.schema_urn.clone(), Value::Object(ext_map));

        let body_str = serde_json::to_string(&Value::Object(body_map)).unwrap_or_default();

        let result = match client.post("/Users", &body_str).await {
            Ok(resp) => {
                let passed = resp.status == 201;
                let mut failure = None;

                if !passed {
                    failure = Some(format!("Expected status 201, got {}", resp.status));
                } else {
                    match serde_json::from_str::<Value>(&resp.body) {
                        Ok(json) => {
                            // Verify the extension attribute is echoed back correctly
                            let returned_value = json
                                .get(&attr.schema_urn)
                                .and_then(|ext| ext.get(&attr.attr_name));

                            match returned_value {
                                None => {
                                    failure = Some(format!(
                                        "Response missing extension attribute {}.{}",
                                        attr.schema_urn, attr.attr_name
                                    ));
                                }
                                Some(rv) => {
                                    // For booleans, compare directly; for others, compare as strings
                                    let values_match = if value.is_boolean() {
                                        rv.as_bool() == value.as_bool()
                                    } else {
                                        rv == &value
                                    };
                                    if !values_match {
                                        failure = Some(format!(
                                            "Expected {}.{} = {}, got {}",
                                            attr.schema_urn, attr.attr_name,
                                            value_display, rv
                                        ));
                                    }
                                }
                            }

                            // Cleanup: delete the created user
                            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                let _ = client.delete(&format!("/Users/{}", id)).await;
                            }
                        }
                        Err(e) => {
                            failure = Some(format!("Invalid JSON response: {}", e));
                        }
                    }
                }

                Self::make_result(
                    test_run_id, &test_name, category, "POST",
                    "/Users", Some(body_str),
                    Some(resp.status as i32), Some(resp.body),
                    resp.duration_ms, failure.is_none(), failure,
                )
            }
            Err(e) => {
                Self::make_result(
                    test_run_id, &test_name, category, "POST",
                    "/Users", Some(body_str), None, None,
                    0, false, Some(e),
                )
            }
        };

        *completed += 1;
        result
    }

    pub fn compute_summary(results: &[ValidationResult]) -> ValidationSummary {
        let total = results.len();
        let passed = results.iter().filter(|r| r.passed).count();
        let failed = results.iter().filter(|r| !r.passed && !r.failure_reason.as_ref().map_or(false, |r| r.starts_with("Skipped"))).count();
        let skipped = results.iter().filter(|r| r.failure_reason.as_ref().map_or(false, |r| r.starts_with("Skipped"))).count();
        let compliance_score = if total - skipped > 0 {
            (passed as f64 / (total - skipped) as f64) * 100.0
        } else {
            0.0
        };
        let duration_ms: i64 = results.iter().map(|r| r.duration_ms).sum();

        let mut category_map: std::collections::HashMap<String, (usize, usize, usize)> = std::collections::HashMap::new();
        for r in results {
            let entry = category_map.entry(r.category.clone()).or_insert((0, 0, 0));
            entry.0 += 1;
            if r.passed { entry.1 += 1; } else { entry.2 += 1; }
        }
        let categories = category_map.into_iter().map(|(name, (t, p, f))| CategorySummary {
            name, total: t, passed: p, failed: f,
        }).collect();

        ValidationSummary { total, passed, failed, skipped, compliance_score, duration_ms, categories }
    }

    // ── Field Mapping Validation ──

    async fn test_field_mapping(
        app: &AppHandle,
        client: &ScimClient,
        test_run_id: &str,
        rules: &[FieldMappingRule],
        completed: &mut usize,
        total: usize,
    ) -> Vec<ValidationResult> {
        let mut results = Vec::new();
        let category = "field_mapping";

        if rules.is_empty() {
            let test_name = "No field mapping rules defined";
            Self::emit_progress(app, test_run_id, test_name, category, *completed, total);
            results.push(Self::make_result(
                test_run_id, test_name, category, "N/A", "", None, None, None, 0, true,
                Some("Skipped — no field mapping rules configured".to_string()),
            ));
            *completed += 1;
            return results;
        }

        // Create a temporary test user so we always have one to validate
        // field mapping rules against, even on an empty database.
        let uid = Uuid::new_v4().to_string().split('-').next().unwrap().to_string();
        let fm_user_name = format!("scim_fieldmap_test_{}@test.example.com", uid);
        let create_body = serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": fm_user_name,
            "name": { "givenName": "FieldMap", "familyName": "TestUser" },
            "emails": [{ "value": fm_user_name, "type": "work", "primary": true }],
            "displayName": "FieldMap Test User",
            "active": true
        }).to_string();

        let (user_json, created_user_id) = match client.post("/Users", &create_body).await {
            Ok(resp) if resp.status == 201 => {
                match serde_json::from_str::<Value>(&resp.body) {
                    Ok(json) => {
                        let id = json.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                        (Some(json), id)
                    }
                    Err(_) => (None, None),
                }
            }
            _ => {
                // If we can't create, try fetching an existing user as fallback
                let mut found: Option<Value> = None;
                for endpoint in &["/Users?count=1", "/Users"] {
                    if let Ok(resp) = client.get(endpoint).await {
                        if resp.status == 200 {
                            if let Ok(json) = serde_json::from_str::<Value>(&resp.body) {
                                found = Self::get_resources(&json)
                                    .and_then(|r| r.as_array())
                                    .and_then(|arr| arr.first().cloned());
                                if found.is_some() { break; }
                            }
                        }
                    }
                }
                (found, None)
            }
        };

        for rule in rules {
            let test_name = format!("Field: {} ({})", rule.display_name, rule.scim_attribute);
            Self::emit_progress(app, test_run_id, &test_name, category, *completed, total);

            let start = std::time::Instant::now();

            let (passed, failure) = if let Some(ref user) = user_json {
                Self::validate_field_rule(user, rule)
            } else {
                (false, Some("Could not create or fetch a sample User for field mapping validation".to_string()))
            };

            let duration_ms = start.elapsed().as_millis() as i64;
            results.push(Self::make_result(
                test_run_id, &test_name, category, "GET", "/Users",
                None, None,
                user_json.as_ref().map(|u| serde_json::to_string_pretty(u).unwrap_or_default()),
                duration_ms, passed, failure,
            ));
            *completed += 1;
        }

        // Cleanup: delete the test user if we created one
        if let Some(ref user_id) = created_user_id {
            let _ = client.delete(&format!("/Users/{}", user_id)).await;
        }

        results
    }

    fn validate_field_rule(user: &Value, rule: &FieldMappingRule) -> (bool, Option<String>) {
        // Navigate nested path like "name.givenName" or "emails[0].value"
        let value = Self::resolve_path(user, &rule.scim_attribute);

        // Check required
        if rule.required {
            match &value {
                None => return (false, Some(format!("Required field '{}' is missing", rule.scim_attribute))),
                Some(v) if v.is_null() => return (false, Some(format!("Required field '{}' is null", rule.scim_attribute))),
                Some(Value::String(s)) if s.is_empty() => return (false, Some(format!("Required field '{}' is empty", rule.scim_attribute))),
                _ => {}
            }
        }

        // If field absent and not required => pass
        let val = match &value {
            Some(v) if !v.is_null() => v,
            _ => return (true, None),
        };

        // Format validation
        let val_str = match val {
            Value::String(s) => s.clone(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            _ => val.to_string(),
        };

        match rule.format.as_str() {
            "none" => (true, None),
            "email" => {
                // Simple email regex
                let re = regex_lite::Regex::new(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$").unwrap();
                if re.is_match(&val_str) {
                    (true, None)
                } else {
                    (false, Some(format!("'{}' value '{}' is not a valid email address", rule.scim_attribute, val_str)))
                }
            }
            "uri" => {
                if val_str.starts_with("http://") || val_str.starts_with("https://") || val_str.starts_with("urn:") {
                    (true, None)
                } else {
                    (false, Some(format!("'{}' value '{}' is not a valid URI", rule.scim_attribute, val_str)))
                }
            }
            "phone" => {
                let re = regex_lite::Regex::new(r"^[\+]?[\d\s\-\(\)\.]{7,20}$").unwrap();
                if re.is_match(&val_str) {
                    (true, None)
                } else {
                    (false, Some(format!("'{}' value '{}' is not a valid phone number", rule.scim_attribute, val_str)))
                }
            }
            "boolean" => {
                match val {
                    Value::Bool(_) => (true, None),
                    Value::String(s) if s == "true" || s == "false" => (true, None),
                    _ => (false, Some(format!("'{}' value '{}' is not a boolean (expected true or false)", rule.scim_attribute, val_str))),
                }
            }
            "integer" => {
                match val {
                    Value::Number(n) if n.is_i64() || n.is_u64() => (true, None),
                    Value::String(s) if s.parse::<i64>().is_ok() => (true, None),
                    _ => (false, Some(format!("'{}' value '{}' is not a valid integer", rule.scim_attribute, val_str))),
                }
            }
            "datetime" => {
                // ISO 8601 basic check
                let re = regex_lite::Regex::new(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$").unwrap();
                if re.is_match(&val_str) {
                    (true, None)
                } else {
                    (false, Some(format!("'{}' value '{}' is not a valid ISO 8601 date-time", rule.scim_attribute, val_str)))
                }
            }
            "regex" => {
                if let Some(ref pattern) = rule.regex_pattern {
                    match regex_lite::Regex::new(pattern) {
                        Ok(re) => {
                            if re.is_match(&val_str) {
                                (true, None)
                            } else {
                                (false, Some(format!("'{}' value '{}' does not match pattern '{}'", rule.scim_attribute, val_str, pattern)))
                            }
                        }
                        Err(e) => (false, Some(format!("Invalid regex pattern '{}': {}", pattern, e))),
                    }
                } else {
                    (false, Some("Regex format selected but no pattern provided".to_string()))
                }
            }
            _ => (true, None),
        }
    }

    fn resolve_path<'a>(json: &'a Value, path: &str) -> Option<Value> {
        let mut current = json.clone();
        for part in Self::split_path(path) {
            match part {
                PathPart::Key(key) => {
                    current = current.get(&key)?.clone();
                }
                PathPart::Index(key, idx) => {
                    current = current.get(&key)?.as_array()?.get(idx)?.clone();
                }
            }
        }
        Some(current)
    }

    fn split_path(path: &str) -> Vec<PathPart> {
        let mut parts = Vec::new();
        for segment in path.split('.') {
            // Check for array index: emails[0]
            if let Some(bracket_pos) = segment.find('[') {
                let key = &segment[..bracket_pos];
                let idx_str = &segment[bracket_pos + 1..segment.len() - 1];
                if let Ok(idx) = idx_str.parse::<usize>() {
                    parts.push(PathPart::Index(key.to_string(), idx));
                } else {
                    parts.push(PathPart::Key(segment.to_string()));
                }
            } else {
                parts.push(PathPart::Key(segment.to_string()));
            }
        }
        parts
    }
}

enum PathPart {
    Key(String),
    Index(String, usize),
}
