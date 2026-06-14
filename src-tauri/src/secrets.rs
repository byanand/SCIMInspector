//! Secure secret storage backed by the OS keychain (via the `keyring` crate).
//!
//! Sensitive values (auth tokens, passwords, API keys) are kept in the platform
//! credential store — Windows Credential Manager, macOS Keychain, or the Linux
//! Secret Service — rather than in the plaintext SQLite database. Each secret is
//! addressed by an `account` string; the service name is constant.
//!
//! All operations are best-effort: if the platform keychain is unavailable
//! (e.g. a headless Linux box without a running secret service), callers fall
//! back to the database column so the application keeps working.

const SERVICE: &str = "com.sciminspector.app";

/// Store `value` under `account`. Returns `true` if the value was written to
/// the keychain (or successfully cleared). An empty/`None` value deletes any
/// existing entry.
pub fn set(account: &str, value: Option<&str>) -> bool {
    match value {
        Some(v) if !v.is_empty() => match keyring::Entry::new(SERVICE, account) {
            Ok(entry) => entry.set_password(v).is_ok(),
            Err(_) => false,
        },
        _ => {
            delete(account);
            true
        }
    }
}

/// Retrieve the secret stored under `account`, if any.
pub fn get(account: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, account)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

/// Delete the secret stored under `account` (no-op if absent).
pub fn delete(account: &str) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, account) {
        let _ = entry.delete_credential();
    }
}
