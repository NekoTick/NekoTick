use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, LogicalPosition};
use tauri::window::Color;

// Create drag overlay window
#[tauri::command]
async fn create_drag_window(app: AppHandle, content: String, x: f64, y: f64, width: f64, height: f64, is_done: bool, is_dark: bool, priority: Option<String>) -> Result<(), String> {
    // Close existing drag window if any
    if let Some(existing) = app.get_webview_window("drag-overlay") {
        let _ = existing.destroy();
    }

    // Theme-based colors
    let (bg_color, border_color, text_color, text_muted) = if is_dark {
        ("#18181b", "#3f3f46", "#fafafa", "#71717a")
    } else {
        ("#fff", "#e5e5e5", "#18181b", "#a1a1aa")
    };
    
    // Priority colors
    let priority_color = match priority.as_deref() {
        Some("red") => "#ef4444",
        Some("yellow") => "#eab308",
        Some("purple") => "#a855f7",
        Some("green") => "#22c55e",
        _ => text_muted,
    };
    
    let has_priority = priority.is_some() && priority.as_deref() != Some("default");
    
    // Style for completed tasks
    let content_style = if is_done {
        format!("text-decoration:line-through;color:{}", text_muted)
    } else {
        String::new()
    };
    
    let checkbox_html = if is_done {
        format!("<svg class=\"checkbox\" viewBox=\"0 0 16 16\"><rect x=\"0.5\" y=\"0.5\" width=\"15\" height=\"15\" rx=\"2\" fill=\"{}\" stroke=\"{}\"/><path d=\"M4 8l3 3 5-6\" stroke=\"white\" stroke-width=\"2\" fill=\"none\"/></svg>", text_color, text_color)
    } else if has_priority {
        format!("<div class=\"checkbox\" style=\"border:2px solid {}\"></div>", priority_color)
    } else {
        format!("<div class=\"checkbox\" style=\"border-color:{}\"></div>", text_muted)
    };

    // HTML content - transparent background, card fills window
    let html = format!(r#"<!DOCTYPE html>
<html style="background:transparent!important">
<head>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{background:transparent!important;overflow:hidden;width:100%;height:100%}}
body{{font-family:system-ui,-apple-system,sans-serif;display:flex}}
.card{{
  background:{};
  border:1px solid {};
  border-radius:4px;
  padding:8px 12px;
  display:flex;
  align-items:start;
  gap:8px;
  font-size:14px;
  color:{};
  width:100%;
  height:100%;
}}
.grip{{color:{}}}
.checkbox{{width:16px;height:16px;border:1px solid {};border-radius:3px;flex-shrink:0;margin-top:2px}}
.content{{flex:1;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}}
</style>
</head>
<body style="background:transparent!important">
<div class="card">
<div class="grip">⋮⋮</div>
{}
<span class="content" style="{}">{}</span>
</div>
</body>
</html>"#, bg_color, border_color, text_color, text_muted, text_muted, checkbox_html, content_style, content);

    // Create transparent window - hidden first, show after setup
    let window = WebviewWindowBuilder::new(
        &app,
        "drag-overlay",
        WebviewUrl::default(),
    )
    .title("")
    .inner_size(width, height)
    .position(x - 20.0, y - (height / 2.0))
    .decorations(false)
    .shadow(false)
    .background_color(Color(0, 0, 0, 0))
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    // Ignore cursor events so drag continues
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;

    // Inject HTML content
    window.eval(&format!(r#"document.write(`{}`); document.close();"#, html.replace('`', "\\`")))
        .map_err(|e| e.to_string())?;

    // Show window
    window.show().map_err(|e| e.to_string())?;

    Ok(())
}

// Update drag window position
#[tauri::command]
async fn update_drag_window_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("drag-overlay") {
        // Get window height for vertical centering
        let size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 36));
        let half_height = (size.height as f64) / 2.0;
        window.set_position(LogicalPosition::new(x - 20.0, y - half_height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Destroy drag window
#[tauri::command]
async fn destroy_drag_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("drag-overlay") {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Toggle fullscreen with smooth animation
#[tauri::command]
async fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
        
        if is_maximized {
            // Exit fullscreen - keep decorations hidden (app has custom titlebar)
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            // Enter fullscreen - hide decorations and maximize
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_drag_window,
            update_drag_window_position,
            destroy_drag_window,
            toggle_fullscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
