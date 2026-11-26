pub mod commands;

use commands::DbState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let db_path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("stacks.db");
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
            commands::init_schema(&conn);
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::list_ideas,
            commands::capture_idea,
            commands::delete_idea,
            commands::send_idea_to_project,
            commands::focus,
            commands::seed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}