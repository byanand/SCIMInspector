use reqwest::{Client, Method, Response, header};
use std::collections::HashMap;
use std::time::Instant;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::models::ServerConfig;

pub struct ScimClient {
    client: Client,
    base_url: String,
    auth_type: String,
    auth_token: Option<String>,
    auth_username: Option<String>,
    auth_password: Option<String>,
    api_key_header: Option<String>,
    api_key_value: Option<String>,
}

pub struct ScimResponse {
    pub status: u16,
    pub body: String,
    pub duration_ms: i64,
}

pub struct ScimFullResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: i64,
    pub request_url: String,
}

impl ScimClient {
    pub fn new(config: &ServerConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(100)
            .danger_accept_invalid_certs(true) // Allow self-signed certs for dev/testing
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let base_url = config.base_url.trim_end_matches('/').to_string();

        Ok(ScimClient {
            client,
            base_url,
            auth_type: config.auth_type.clone(),
            auth_token: config.auth_token.clone(),
            auth_username: config.auth_username.clone(),
            auth_password: config.auth_password.clone(),
            api_key_header: config.api_key_header.clone(),
            api_key_value: config.api_key_value.clone(),
        })
    }

    pub fn new_with_concurrency(config: &ServerConfig, max_connections: usize) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(max_connections)
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let base_url = config.base_url.trim_end_matches('/').to_string();

        Ok(ScimClient {
            client,
            base_url,
            auth_type: config.auth_type.clone(),
            auth_token: config.auth_token.clone(),
            auth_username: config.auth_username.clone(),
            auth_password: config.auth_password.clone(),
            api_key_header: config.api_key_header.clone(),
            api_key_value: config.api_key_value.clone(),
        })
    }

    fn build_url(&self, path: &str) -> String {
        let path = path.trim_start_matches('/');
        format!("{}/{}", self.base_url, path)
    }

    fn apply_auth(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.auth_type.as_str() {
            "bearer" => {
                if let Some(ref token) = self.auth_token {
                    builder.header(header::AUTHORIZATION, format!("Bearer {}", token))
                } else {
                    builder
                }
            }
            "basic" => {
                if let (Some(ref user), Some(ref pass)) = (&self.auth_username, &self.auth_password) {
                    let encoded = BASE64.encode(format!("{}:{}", user, pass));
                    builder.header(header::AUTHORIZATION, format!("Basic {}", encoded))
                } else {
                    builder
                }
            }
            "apikey" => {
                if let (Some(ref hdr), Some(ref val)) = (&self.api_key_header, &self.api_key_value) {
                    builder.header(hdr.as_str(), val.as_str())
                } else {
                    builder
                }
            }
            _ => builder,
        }
    }

    pub async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<&str>,
    ) -> Result<ScimResponse, String> {
        let url = self.build_url(path);
        let start = Instant::now();

        let mut builder = self.client.request(method, &url)
            .header(header::CONTENT_TYPE, "application/scim+json")
            .header(header::ACCEPT, "application/scim+json");

        builder = self.apply_auth(builder);

        if let Some(body_str) = body {
            builder = builder.body(body_str.to_string());
        }

        let response: Response = builder.send().await.map_err(|e| format!("Request failed: {}", e))?;
        let duration_ms = start.elapsed().as_millis() as i64;
        let status = response.status().as_u16();
        let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

        Ok(ScimResponse {
            status,
            body,
            duration_ms,
        })
    }

    pub async fn get(&self, path: &str) -> Result<ScimResponse, String> {
        self.request(Method::GET, path, None).await
    }

    pub async fn post(&self, path: &str, body: &str) -> Result<ScimResponse, String> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub async fn put(&self, path: &str, body: &str) -> Result<ScimResponse, String> {
        self.request(Method::PUT, path, Some(body)).await
    }

    pub async fn patch(&self, path: &str, body: &str) -> Result<ScimResponse, String> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    pub async fn delete(&self, path: &str) -> Result<ScimResponse, String> {
        self.request(Method::DELETE, path, None).await
    }

    /// Like `request()` but captures response headers and status text for Explorer.
    pub async fn request_full(
        &self,
        method: Method,
        path: &str,
        body: Option<&str>,
    ) -> Result<ScimFullResponse, String> {
        let url = self.build_url(path);
        let start = Instant::now();

        let mut builder = self.client.request(method, &url)
            .header(header::CONTENT_TYPE, "application/scim+json")
            .header(header::ACCEPT, "application/scim+json");

        builder = self.apply_auth(builder);

        if let Some(body_str) = body {
            builder = builder.body(body_str.to_string());
        }

        let response: Response = builder.send().await.map_err(|e| format!("Request failed: {}", e))?;
        let duration_ms = start.elapsed().as_millis() as i64;
        let status = response.status();
        let status_code = status.as_u16();
        let status_text = status.canonical_reason().unwrap_or("Unknown").to_string();

        let mut resp_headers = HashMap::new();
        for (name, value) in response.headers().iter() {
            if let Ok(v) = value.to_str() {
                resp_headers.insert(name.to_string(), v.to_string());
            }
        }

        let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

        Ok(ScimFullResponse {
            status: status_code,
            status_text,
            headers: resp_headers,
            body,
            duration_ms,
            request_url: url,
        })
    }
}
