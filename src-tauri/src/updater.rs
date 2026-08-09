//! Update check against the project's GitHub Releases.
//!
//! This is deliberately notify-only: it tells the user a newer release exists
//! and opens the release page. It never downloads or installs anything, which
//! keeps it working identically across the `.msi`/`.exe`, `.dmg`, `.deb` and
//! `.rpm` bundles we ship (Tauri's self-updater cannot handle deb/rpm).

use std::cmp::Ordering;
use std::time::Duration;

use reqwest::header;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Repository the update check queries.
const REPO: &str = "byanand/SCIMInspector";

/// Only URLs under this prefix may be handed to the system browser.
const ALLOWED_URL_PREFIX: &str = "https://github.com/byanand/SCIMInspector/";

/// How long to wait on GitHub before giving up. Kept short so a startup check
/// on a flaky network never leaves the user staring at a stalled request.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: String,
    pub published_at: String,
}

/// The subset of GitHub's release payload we care about.
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
}

/// A semver-ish version: a numeric core plus an optional prerelease tag.
///
/// Unparseable segments degrade to 0 rather than erroring — a malformed tag
/// upstream should never break the check, it should just fail to look newer.
#[derive(Debug, PartialEq, Eq)]
struct Version {
    core: (u32, u32, u32),
    prerelease: Option<String>,
}

fn parse_version(raw: &str) -> Version {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    // Build metadata (`+abc`) is never significant for ordering.
    let without_build = trimmed.split('+').next().unwrap_or("");
    let (core_str, prerelease) = match without_build.split_once('-') {
        Some((core, pre)) => (core, Some(pre.to_string())),
        None => (without_build, None),
    };

    let mut parts = core_str.split('.').map(|p| p.trim().parse::<u32>().unwrap_or(0));
    Version {
        core: (
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
        ),
        prerelease,
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.core.cmp(&other.core).then_with(|| {
            // Per semver, a prerelease sorts *below* the same core release.
            match (&self.prerelease, &other.prerelease) {
                (None, None) => Ordering::Equal,
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (Some(a), Some(b)) => a.cmp(b),
            }
        })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// The version this binary was built as, straight from `tauri.conf.json`.
#[tauri::command]
pub async fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Ask GitHub for the newest published release and compare it to ours.
///
/// `/releases/latest` already excludes drafts and prereleases, so users only
/// ever get pointed at a stable build.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(format!("https://api.github.com/repos/{}/releases/latest", REPO))
        // GitHub rejects API requests without a User-Agent.
        .header(header::USER_AGENT, format!("SCIMInspector/{}", current_version))
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        // 403 here is almost always the 60/hour unauthenticated rate limit.
        return Err(format!("GitHub returned HTTP {}", status.as_u16()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Unexpected response from GitHub: {}", e))?;

    let latest_version = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    let update_available = parse_version(&latest_version) > parse_version(&current_version);

    Ok(UpdateInfo {
        current_version,
        latest_version,
        update_available,
        release_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
    })
}

/// Open a release page in the system browser.
#[tauri::command]
pub async fn open_release_page(app: AppHandle, url: String) -> Result<(), String> {
    // The frontend can invoke this with any string, so only this project's own
    // GitHub pages are allowed through to the browser.
    if !url.starts_with(ALLOWED_URL_PREFIX) {
        return Err("Refusing to open a URL outside the project's GitHub releases".to_string());
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_newer(latest: &str, current: &str) -> bool {
        parse_version(latest) > parse_version(current)
    }

    #[test]
    fn detects_newer_versions() {
        assert!(is_newer("0.2.3", "0.2.2"));
        assert!(is_newer("0.3.0", "0.2.9"));
        assert!(is_newer("1.0.0", "0.99.99"));
    }

    #[test]
    fn ignores_same_or_older_versions() {
        assert!(!is_newer("0.2.2", "0.2.2"));
        assert!(!is_newer("0.2.1", "0.2.2"));
        assert!(!is_newer("0.1.9", "0.2.0"));
    }

    #[test]
    fn strips_v_prefix_from_tags() {
        assert_eq!(parse_version("v0.2.2"), parse_version("0.2.2"));
        assert!(is_newer("v0.3.0", "0.2.2"));
    }

    #[test]
    fn treats_prerelease_as_older_than_its_release() {
        assert!(is_newer("0.3.0", "0.3.0-beta.1"));
        assert!(!is_newer("0.3.0-beta.1", "0.3.0"));
        assert!(is_newer("0.3.0-beta.2", "0.3.0-beta.1"));
    }

    #[test]
    fn tolerates_short_and_malformed_versions() {
        assert_eq!(parse_version("1.2").core, (1, 2, 0));
        assert_eq!(parse_version("2").core, (2, 0, 0));
        assert_eq!(parse_version("").core, (0, 0, 0));
        assert_eq!(parse_version("not-a-version").core, (0, 0, 0));
        // Garbage must never masquerade as an update.
        assert!(!is_newer("garbage", "0.2.2"));
    }

    #[test]
    fn ignores_build_metadata() {
        assert_eq!(parse_version("0.2.2+build.5"), parse_version("0.2.2"));
        assert!(!is_newer("0.2.2+build.5", "0.2.2"));
    }
}
