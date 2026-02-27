use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use std::sync::Mutex;
use chrono;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("scim_inspector.db");
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS server_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                auth_token TEXT,
                auth_username TEXT,
                auth_password TEXT,
                api_key_header TEXT,
                api_key_value TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_runs (
                id TEXT PRIMARY KEY,
                server_config_id TEXT NOT NULL,
                run_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                started_at TEXT NOT NULL,
                completed_at TEXT,
                summary_json TEXT,
                FOREIGN KEY (server_config_id) REFERENCES server_configs(id)
            );

            CREATE TABLE IF NOT EXISTS validation_results (
                id TEXT PRIMARY KEY,
                test_run_id TEXT NOT NULL,
                test_name TEXT NOT NULL,
                category TEXT NOT NULL,
                http_method TEXT NOT NULL,
                url TEXT NOT NULL,
                request_body TEXT,
                response_status INTEGER,
                response_body TEXT,
                duration_ms INTEGER NOT NULL,
                passed INTEGER NOT NULL,
                failure_reason TEXT,
                executed_at TEXT NOT NULL,
                FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
            );

            CREATE TABLE IF NOT EXISTS load_test_results (
                id TEXT PRIMARY KEY,
                test_run_id TEXT NOT NULL,
                request_index INTEGER NOT NULL,
                http_method TEXT NOT NULL,
                url TEXT NOT NULL,
                request_body TEXT,
                status_code INTEGER,
                duration_ms INTEGER NOT NULL,
                success INTEGER NOT NULL,
                error_message TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
            );

            CREATE INDEX IF NOT EXISTS idx_validation_results_run ON validation_results(test_run_id);
            CREATE INDEX IF NOT EXISTS idx_load_test_results_run ON load_test_results(test_run_id);
            CREATE INDEX IF NOT EXISTS idx_test_runs_server ON test_runs(server_config_id);

            CREATE TABLE IF NOT EXISTS field_mapping_rules (
                id TEXT PRIMARY KEY,
                server_config_id TEXT NOT NULL,
                scim_attribute TEXT NOT NULL,
                display_name TEXT NOT NULL,
                required INTEGER NOT NULL DEFAULT 0,
                format TEXT NOT NULL DEFAULT 'none',
                regex_pattern TEXT,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (server_config_id) REFERENCES server_configs(id)
            );

            CREATE INDEX IF NOT EXISTS idx_field_mapping_server ON field_mapping_rules(server_config_id);

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sample_data (
                id TEXT PRIMARY KEY,
                server_config_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                name TEXT NOT NULL,
                data_json TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (server_config_id) REFERENCES server_configs(id)
            );

            CREATE INDEX IF NOT EXISTS idx_sample_data_server ON sample_data(server_config_id);
            "
        )?;
        Ok(())
    }

    // App Settings
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(val) => Ok(Some(val?)),
            None => Ok(None),
        }
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![key, value, chrono::Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    // Server Config CRUD
    pub fn save_server_config(&self, config: &super::models::ServerConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO server_configs (id, name, base_url, auth_type, auth_token, auth_username, auth_password, api_key_header, api_key_value, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                config.id,
                config.name,
                config.base_url,
                config.auth_type,
                config.auth_token,
                config.auth_username,
                config.auth_password,
                config.api_key_header,
                config.api_key_value,
                config.created_at,
                config.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_server_configs(&self) -> Result<Vec<super::models::ServerConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, base_url, auth_type, auth_token, auth_username, auth_password, api_key_header, api_key_value, created_at, updated_at FROM server_configs ORDER BY updated_at DESC"
        )?;
        let configs = stmt.query_map([], |row| {
            Ok(super::models::ServerConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                auth_type: row.get(3)?,
                auth_token: row.get(4)?,
                auth_username: row.get(5)?,
                auth_password: row.get(6)?,
                api_key_header: row.get(7)?,
                api_key_value: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(configs)
    }

    pub fn get_server_config(&self, id: &str) -> Result<Option<super::models::ServerConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, base_url, auth_type, auth_token, auth_username, auth_password, api_key_header, api_key_value, created_at, updated_at FROM server_configs WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(super::models::ServerConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                auth_type: row.get(3)?,
                auth_token: row.get(4)?,
                auth_username: row.get(5)?,
                auth_password: row.get(6)?,
                api_key_header: row.get(7)?,
                api_key_value: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn delete_server_config(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM server_configs WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Test Run CRUD
    pub fn save_test_run(&self, run: &super::models::TestRun) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO test_runs (id, server_config_id, run_type, status, started_at, completed_at, summary_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                run.id,
                run.server_config_id,
                run.run_type,
                run.status,
                run.started_at,
                run.completed_at,
                run.summary_json,
            ],
        )?;
        Ok(())
    }

    pub fn get_test_runs(&self, server_config_id: Option<&str>, run_type: Option<&str>) -> Result<Vec<super::models::TestRun>> {
        let conn = self.conn.lock().unwrap();
        let mut query = String::from("SELECT id, server_config_id, run_type, status, started_at, completed_at, summary_json FROM test_runs WHERE 1=1");
        let mut param_values: Vec<String> = Vec::new();
        
        if let Some(sid) = server_config_id {
            query.push_str(&format!(" AND server_config_id = ?{}", param_values.len() + 1));
            param_values.push(sid.to_string());
        }
        if let Some(rt) = run_type {
            query.push_str(&format!(" AND run_type = ?{}", param_values.len() + 1));
            param_values.push(rt.to_string());
        }
        query.push_str(" ORDER BY started_at DESC");

        let mut stmt = conn.prepare(&query)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let runs = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(super::models::TestRun {
                id: row.get(0)?,
                server_config_id: row.get(1)?,
                run_type: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                completed_at: row.get(5)?,
                summary_json: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(runs)
    }

    pub fn get_test_run(&self, id: &str) -> Result<Option<super::models::TestRun>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_config_id, run_type, status, started_at, completed_at, summary_json FROM test_runs WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(super::models::TestRun {
                id: row.get(0)?,
                server_config_id: row.get(1)?,
                run_type: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                completed_at: row.get(5)?,
                summary_json: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn delete_test_run(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM load_test_results WHERE test_run_id = ?1", params![id])?;
        conn.execute("DELETE FROM validation_results WHERE test_run_id = ?1", params![id])?;
        conn.execute("DELETE FROM test_runs WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Validation Results
    pub fn save_validation_result(&self, result: &super::models::ValidationResult) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO validation_results (id, test_run_id, test_name, category, http_method, url, request_body, response_status, response_body, duration_ms, passed, failure_reason, executed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                result.id,
                result.test_run_id,
                result.test_name,
                result.category,
                result.http_method,
                result.url,
                result.request_body,
                result.response_status,
                result.response_body,
                result.duration_ms,
                result.passed,
                result.failure_reason,
                result.executed_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_validation_results(&self, test_run_id: &str) -> Result<Vec<super::models::ValidationResult>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, test_run_id, test_name, category, http_method, url, request_body, response_status, response_body, duration_ms, passed, failure_reason, executed_at FROM validation_results WHERE test_run_id = ?1 ORDER BY executed_at ASC"
        )?;
        let results = stmt.query_map(params![test_run_id], |row| {
            Ok(super::models::ValidationResult {
                id: row.get(0)?,
                test_run_id: row.get(1)?,
                test_name: row.get(2)?,
                category: row.get(3)?,
                http_method: row.get(4)?,
                url: row.get(5)?,
                request_body: row.get(6)?,
                response_status: row.get(7)?,
                response_body: row.get(8)?,
                duration_ms: row.get(9)?,
                passed: row.get(10)?,
                failure_reason: row.get(11)?,
                executed_at: row.get(12)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(results)
    }

    // Load Test Results
    pub fn save_load_test_results(&self, results: &[super::models::LoadTestResult]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO load_test_results (id, test_run_id, request_index, http_method, url, request_body, status_code, duration_ms, success, error_message, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
            )?;
            for r in results {
                stmt.execute(params![
                    r.id,
                    r.test_run_id,
                    r.request_index,
                    r.http_method,
                    r.url,
                    r.request_body,
                    r.status_code,
                    r.duration_ms,
                    r.success,
                    r.error_message,
                    r.timestamp,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_load_test_results(&self, test_run_id: &str) -> Result<Vec<super::models::LoadTestResult>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, test_run_id, request_index, http_method, url, request_body, status_code, duration_ms, success, error_message, timestamp FROM load_test_results WHERE test_run_id = ?1 ORDER BY request_index ASC"
        )?;
        let results = stmt.query_map(params![test_run_id], |row| {
            Ok(super::models::LoadTestResult {
                id: row.get(0)?,
                test_run_id: row.get(1)?,
                request_index: row.get(2)?,
                http_method: row.get(3)?,
                url: row.get(4)?,
                request_body: row.get(5)?,
                status_code: row.get(6)?,
                duration_ms: row.get(7)?,
                success: row.get(8)?,
                error_message: row.get(9)?,
                timestamp: row.get(10)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(results)
    }

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "DELETE FROM load_test_results; DELETE FROM validation_results; DELETE FROM test_runs; DELETE FROM field_mapping_rules; DELETE FROM server_configs;"
        )?;
        Ok(())
    }

    // Field Mapping Rules CRUD
    pub fn save_field_mapping_rule(&self, rule: &super::models::FieldMappingRule) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO field_mapping_rules (id, server_config_id, scim_attribute, display_name, required, format, regex_pattern, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                rule.id,
                rule.server_config_id,
                rule.scim_attribute,
                rule.display_name,
                rule.required,
                rule.format,
                rule.regex_pattern,
                rule.description,
                rule.created_at,
                rule.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_field_mapping_rules(&self, server_config_id: &str) -> Result<Vec<super::models::FieldMappingRule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_config_id, scim_attribute, display_name, required, format, regex_pattern, description, created_at, updated_at FROM field_mapping_rules WHERE server_config_id = ?1 ORDER BY scim_attribute ASC"
        )?;
        let rules = stmt.query_map(params![server_config_id], |row| {
            Ok(super::models::FieldMappingRule {
                id: row.get(0)?,
                server_config_id: row.get(1)?,
                scim_attribute: row.get(2)?,
                display_name: row.get(3)?,
                required: row.get(4)?,
                format: row.get(5)?,
                regex_pattern: row.get(6)?,
                description: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rules)
    }

    pub fn delete_field_mapping_rule(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM field_mapping_rules WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_field_mapping_rules_for_server(&self, server_config_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM field_mapping_rules WHERE server_config_id = ?1", params![server_config_id])?;
        Ok(())
    }

    // Sample Data CRUD
    pub fn save_sample_data(&self, item: &super::models::SampleData) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO sample_data (id, server_config_id, resource_type, name, data_json, is_default, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                item.server_config_id,
                item.resource_type,
                item.name,
                item.data_json,
                item.is_default,
                item.created_at,
                item.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_sample_data(&self, server_config_id: &str) -> Result<Vec<super::models::SampleData>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_config_id, resource_type, name, data_json, is_default, created_at, updated_at FROM sample_data WHERE server_config_id = ?1 ORDER BY resource_type, name ASC"
        )?;
        let items = stmt.query_map(params![server_config_id], |row| {
            Ok(super::models::SampleData {
                id: row.get(0)?,
                server_config_id: row.get(1)?,
                resource_type: row.get(2)?,
                name: row.get(3)?,
                data_json: row.get(4)?,
                is_default: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(items)
    }

    pub fn delete_sample_data(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sample_data WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_sample_data_for_server(&self, server_config_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sample_data WHERE server_config_id = ?1", params![server_config_id])?;
        Ok(())
    }

    pub fn get_sample_data_count(&self, server_config_id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: usize = conn.query_row(
            "SELECT COUNT(*) FROM sample_data WHERE server_config_id = ?1",
            params![server_config_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn seed_default_sample_data(&self, server_config_id: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        let defaults = vec![
            ("user", "Standard User", serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                "userName": "jane.smith@example.com",
                "name": { "givenName": "Jane", "familyName": "Smith", "formatted": "Jane Smith" },
                "displayName": "Jane Smith",
                "emails": [{ "value": "jane.smith@example.com", "type": "work", "primary": true }],
                "phoneNumbers": [{ "value": "+1-555-0101", "type": "work" }],
                "title": "Software Engineer",
                "active": true
            })),
            ("user", "Admin User", serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                "userName": "admin@example.com",
                "name": { "givenName": "Admin", "familyName": "User", "formatted": "Admin User" },
                "displayName": "Admin User",
                "emails": [{ "value": "admin@example.com", "type": "work", "primary": true }],
                "title": "System Administrator",
                "active": true
            })),
            ("user", "Contractor", serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                "userName": "contractor@external.com",
                "name": { "givenName": "Alex", "familyName": "Contractor" },
                "displayName": "Alex Contractor",
                "emails": [{ "value": "contractor@external.com", "type": "work", "primary": true }],
                "title": "External Contractor",
                "active": true
            })),
            ("group", "Engineering Team", serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
                "displayName": "Engineering Team",
                "members": []
            })),
            ("group", "Marketing Team", serde_json::json!({
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
                "displayName": "Marketing Team",
                "members": []
            })),
        ];

        for (rtype, name, json_val) in defaults {
            let item = super::models::SampleData {
                id: uuid::Uuid::new_v4().to_string(),
                server_config_id: server_config_id.to_string(),
                resource_type: rtype.to_string(),
                name: name.to_string(),
                data_json: serde_json::to_string_pretty(&json_val).unwrap_or_default(),
                is_default: true,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            self.save_sample_data(&item)?;
        }
        Ok(())
    }
}
