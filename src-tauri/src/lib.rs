// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

const CONFIG_STORE: &str = "config.json";
const LLAMA_CPP_PATH_KEY: &str = "llama_cpp_path";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_llama_cpp_path(app: AppHandle, path: String) -> Result<(), String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    store.set(LLAMA_CPP_PATH_KEY, json!(path));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_llama_cpp_path(app: AppHandle) -> Result<Option<String>, String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    let value = store.get(LLAMA_CPP_PATH_KEY);
    Ok(value.and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
fn clear_llama_cpp_path(app: AppHandle) -> Result<(), String> {
    let store = app.store(CONFIG_STORE).map_err(|e| e.to_string())?;
    store.delete(LLAMA_CPP_PATH_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedPathInfo {
    path: String,
    is_directory: bool,
    is_gguf: bool,
}

#[tauri::command]
fn inspect_dropped_path(path: String) -> Result<DroppedPathInfo, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    let is_directory = p.is_dir();
    let is_gguf = p
        .extension()
        .map(|ext| ext.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false);
    Ok(DroppedPathInfo {
        path,
        is_directory,
        is_gguf,
    })
}

// ---------- Phase 2: pipeline ----------

#[derive(Clone, serde::Serialize)]
struct LogLine {
    stream: String, // "stdout" | "stderr"
    line: String,
}

#[derive(Clone, serde::Serialize)]
struct QuantLogLine {
    line: String,
    percentage: f32,
}

#[derive(Clone, serde::Serialize)]
struct JobDone {
    success: bool,
    message: String,
    #[serde(rename = "outputPath")]
    output_path: Option<String>,
}

/// Returns (and creates if missing) the app-managed output directory
/// where converted / quantized .gguf files are written.
fn get_output_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("outputs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Converts a Hugging Face model repo folder into an unquantized (f16)
/// .gguf file, by shelling out to convert_hf_to_gguf.py inside the
/// configured llama.cpp directory. Streams stdout/stderr to the frontend
/// via the "conversion://log" event, and emits "conversion://done" when
/// the process exits.
#[tauri::command]
async fn convert_hf_to_gguf(
    app: AppHandle,
    hf_repo_path: String,
    model_name: String,
) -> Result<(), String> {
    let llama_cpp_path = load_llama_cpp_path(app.clone())?
        .ok_or_else(|| "No llama.cpp directory configured. Set one up on the Setup page first.".to_string())?;

    let script_path = PathBuf::from(&llama_cpp_path).join("convert_hf_to_gguf.py");
    if !script_path.exists() {
        return Err(format!(
            "convert_hf_to_gguf.py not found at {}. Make sure your selected llama.cpp directory contains it.",
            script_path.display()
        ));
    }

    let output_dir = get_output_dir(&app)?;
    let output_path = output_dir.join(format!("{}-f16.gguf", model_name));
    let output_path_str = output_path.to_string_lossy().to_string();

    // Switched to "python" to match common Windows environment defaults cleanly
    let mut child = TokioCommand::new("python")
        .arg(&script_path)
        .arg(&hf_repo_path)
        .arg("--outfile")
        .arg(&output_path_str)
        .arg("--outtype")
        .arg("f16")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start conversion process: {}", e))?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let app_stdout = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_stdout.emit(
                "conversion://log",
                LogLine {
                    stream: "stdout".into(),
                    line,
                },
            );
        }
    });

    let app_stderr = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_stderr.emit(
                "conversion://log",
                LogLine {
                    stream: "stderr".into(),
                    line,
                },
            );
        }
    });

    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let done = match status {
            Ok(s) if s.success() => JobDone {
                success: true,
                message: "Conversion complete".into(),
                output_path: Some(output_path_str),
            },
            Ok(s) => JobDone {
                success: false,
                message: format!("Conversion process exited with status {}", s),
                output_path: None,
            },
            Err(e) => JobDone {
                success: false,
                message: format!("Failed to wait for conversion process: {}", e),
                output_path: None,
            },
        };
        let _ = app.emit("conversion://done", done);
    });

    Ok(())
}

/// Quantizes an f16 .gguf file into a target optimized format by shelling out
/// to llama-quantize.exe inside the configured llama.cpp directory. 
/// Parses token metrics on-the-fly to emit real-time progress percentages.
#[tauri::command]
async fn quantize_matrix(
    app: AppHandle,
    input_f16_path: String,
    model_name: String,
    quant_type: String,
) -> Result<(), String> {
    let llama_cpp_path = load_llama_cpp_path(app.clone())?
        .ok_or_else(|| "No llama.cpp directory configured.".to_string())?;

    // Append .exe cleanly since the environment is running on a Windows host
    let executable_name = if cfg!(windows) { "llama-quantize.exe" } else { "llama-quantize" };
    let exec_path = PathBuf::from(&llama_cpp_path).join(executable_name);

    if !exec_path.exists() {
        return Err(format!("Quantization engine binary not found at {}", exec_path.display()));
    }

    let output_dir = get_output_dir(&app)?;
    let output_path = output_dir.join(format!("{}-{}.gguf", model_name, quant_type.to_lowercase()));
    let output_path_str = output_path.to_string_lossy().to_string();

    let mut child = TokioCommand::new(&exec_path)
        .arg(&input_f16_path)
        .arg(&output_path_str)
        .arg(&quant_type)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to initiate quantization engine: {}", e))?;

    let stderr = child.stderr.take().expect("stderr was piped");
    let app_stream = app.clone();

    // Asynchronous token parsing loop
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let mut progress_pct = 0.0;

            // Token Parsing Engine: Scan line content for structural patterns like '[  12/ 300]'
            if line.contains('[') && line.contains('/') && line.contains(']') {
                if let (Some(start), Some(end)) = (line.find('['), line.find(']')) {
                    let inside_brackets = &line[start + 1..end];
                    let split_metrics: Vec<&str> = inside_brackets.split('/').collect();
                    if split_metrics.len() == 2 {
                        let current_token = split_metrics[0].trim().parse::<f32>().unwrap_or(0.0);
                        let total_tokens = split_metrics[1].trim().parse::<f32>().unwrap_or(0.0);
                        if total_tokens > 0.0 {
                            progress_pct = (current_token / total_tokens) * 100.0;
                        }
                    }
                }
            }

            let _ = app_stream.emit(
                "quantization://log",
                QuantLogLine {
                    line,
                    percentage: progress_pct,
                },
            );
        }
    });

    // Completion listener task thread
    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let final_report = match status {
            Ok(s) if s.success() => JobDone {
                success: true,
                message: "Quantization structural pass complete!".into(),
                output_path: Some(output_path_str),
            },
            _ => JobDone {
                success: false,
                message: "Quantization engine processing aborted on non-zero exit code.".into(),
                output_path: None,
            },
        };
        let _ = app.emit("quantization://done", final_report);
    });

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
            clear_llama_cpp_path,
            inspect_dropped_path,
            convert_hf_to_gguf,
            quantize_matrix // Registered Stage 2 handler
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}