pub mod models;
pub mod db;
pub mod scim_client;
pub mod validation;
pub mod load_test;
pub mod export;
pub mod commands;

use commands::AppState;
use db::Database;
use tauri::Manager;
use std::collections::HashMap;
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let db = Database::new(app_dir).expect("Failed to initialize database");
            app.manage(AppState {
                db,
                cancel_flags: TokioMutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_server_config,
            commands::get_server_configs,
            commands::get_server_config,
            commands::delete_server_config,
            commands::test_connection,
            commands::run_validation,
            commands::get_validation_results,
            commands::start_load_test,
            commands::stop_load_test,
            commands::get_load_test_results,
            commands::get_test_runs,
            commands::get_test_run,
            commands::delete_test_run,
            commands::export_report,
            commands::clear_all_data,
            commands::discover_custom_schema,
            commands::save_field_mapping_rule,
            commands::get_field_mapping_rules,
            commands::delete_field_mapping_rule,
            commands::get_app_setting,
            commands::save_app_setting,
            commands::delete_app_setting,
            commands::execute_scim_request,
            commands::generate_scim_data,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running SCIM Inspector");
}
