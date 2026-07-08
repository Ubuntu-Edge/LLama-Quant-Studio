// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use serde_json::json;
use tauri_plugin_store::StoreExt;

const CONFIG_STORE: &str = "config.json";
const LLAMA_CPP_PATH_KEY: &str = "llama_cpp_path";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_llama_cpp_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    store.set(LLAMA_CPP_PATH_KEY, json!(path));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_llama_cpp_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    let value = store.get(LLAMA_CPP_PATH_KEY);
    Ok(value.and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
fn clear_llama_cpp_path(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    store.delete(LLAMA_CPP_PATH_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_llama_cpp_path,
            load_llama_cpp_path,
            clear_llama_cpp_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}