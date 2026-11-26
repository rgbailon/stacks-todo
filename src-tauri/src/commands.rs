use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

// ---------- DTOs ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    pub total: i64,
    pub done: i64,
    pub doing: i64,
    pub notes: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub palette: String,
    pub icon: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
    pub stats: ProjectStats,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub position: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IdeaDto {
    pub id: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetailDto {
    pub project: ProjectDto,
    pub tasks: Vec<TaskDto>,
    pub notes: Vec<NoteDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusProjectRef {
    pub id: String,
    pub title: String,
    pub palette: String,
    pub icon: String,
    pub category: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusTaskDto {
    #[serde(flatten)]
    pub task: TaskDto,
    pub project: FocusProjectRef,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusDto {
    pub doing: Vec<FocusTaskDto>,
    pub on_deck: Vec<FocusTaskDto>,
}

// ---------- Inputs ----------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub palette: Option<String>,
    pub icon: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub palette: Option<String>,
    pub icon: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub status: Option<String>,
    pub make_next: Option<bool>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub pinned: Option<bool>,
}

// ---------- State ----------

pub struct DbState(pub Mutex<Connection>);

// ---------- helpers ----------

fn ts() -> String {
    Utc::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

fn map_project(row: &rusqlite::Row) -> rusqlite::Result<(String, String, String, String, String, String, String, String, String, Option<String>)> {
    Ok((
        row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
        row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
    ))
}

fn project_stats(conn: &Connection, id: &str) -> ProjectStats {
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE project_id = ?1",
        params![id],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0);
    let done: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE project_id = ?1 AND status = 'done'",
        params![id],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0);
    let doing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE project_id = ?1 AND status = 'doing'",
        params![id],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0);
    let notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE project_id = ?1",
        params![id],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0);
    ProjectStats { total, done, doing, notes }
}

fn to_project(row: &(String, String, String, String, String, String, String, String, String, Option<String>), stats: ProjectStats) -> ProjectDto {
    ProjectDto {
        id: row.0.clone(),
        title: row.1.clone(),
        description: row.2.clone(),
        category: row.3.clone(),
        palette: row.4.clone(),
        icon: row.5.clone(),
        status: row.6.clone(),
        created_at: row.7.clone(),
        updated_at: row.8.clone(),
        last_opened_at: row.9.clone(),
        stats,
    }
}

fn to_task(row: &(String, String, String, String, i64, String, Option<String>)) -> TaskDto {
    TaskDto {
        id: row.0.clone(),
        project_id: row.1.clone(),
        title: row.2.clone(),
        status: row.3.clone(),
        position: row.4,
        created_at: row.5.clone(),
        completed_at: row.6.clone(),
    }
}

fn to_note(row: &(String, String, String, String, i64, String, String)) -> NoteDto {
    NoteDto {
        id: row.0.clone(),
        project_id: row.1.clone(),
        title: row.2.clone(),
        content: row.3.clone(),
        pinned: row.4 != 0,
        created_at: row.5.clone(),
        updated_at: row.6.clone(),
    }
}

// ---------- init ----------

pub fn init_schema(conn: &Connection) {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'development',
            palette TEXT NOT NULL DEFAULT 'ember',
            icon TEXT NOT NULL DEFAULT '🚀',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_opened_at TEXT
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id);
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT 'Untitled note',
            content TEXT NOT NULL DEFAULT '',
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS notes_project_idx ON notes(project_id);
        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );",
    ).unwrap();
}

// ---------- commands ----------

#[tauri::command]
pub fn list_projects(state: tauri::State<DbState>) -> Result<Vec<ProjectDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at FROM projects ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?))
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows {
        let row = r.map_err(|e| e.to_string())?;
        let stats = project_stats(&conn, &row.0);
        out.push(to_project(&row, stats));
    }
    Ok(out)
}

#[tauri::command]
pub fn get_project(state: tauri::State<DbState>, id: String) -> Result<ProjectDetailDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let row = conn.query_row(
        "SELECT id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at FROM projects WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?)),
    ).map_err(|_| "not found".to_string())?;
    // touch last_opened_at
    let _ = conn.execute("UPDATE projects SET last_opened_at = ?1 WHERE id = ?2", params![ts(), id]);
    // reload row with updated last_opened
    let row = conn.query_row(
        "SELECT id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at FROM projects WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?)),
    ).map_err(|_| "not found".to_string())?;

    let mut tstmt = conn.prepare("SELECT id,project_id,title,status,position,created_at,completed_at FROM tasks WHERE project_id = ?1 ORDER BY position ASC, created_at ASC").map_err(|e| e.to_string())?;
    let trows = tstmt.query_map(params![id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?))
    }).map_err(|e| e.to_string())?;
    let mut tasks = vec![];
    for t in trows { tasks.push(to_task(&t.map_err(|e| e.to_string())?)); }

    let mut nstmt = conn.prepare("SELECT id,project_id,title,content,pinned,created_at,updated_at FROM notes WHERE project_id = ?1 ORDER BY pinned DESC, updated_at DESC").map_err(|e| e.to_string())?;
    let nrows = nstmt.query_map(params![id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?))
    }).map_err(|e| e.to_string())?;
    let mut notes = vec![];
    for n in nrows { notes.push(to_note(&n.map_err(|e| e.to_string())?)); }

    let stats = project_stats(&conn, &id);
    Ok(ProjectDetailDto {
        project: to_project(&row, stats),
        tasks,
        notes,
    })
}

#[tauri::command]
pub fn create_project(state: tauri::State<DbState>, input: ProjectInput) -> Result<ProjectDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid();
    let t = ts();
    conn.execute(
        "INSERT INTO projects (id,title,description,category,palette,icon,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            id,
            input.title,
            input.description.unwrap_or_default(),
            input.category.unwrap_or_else(|| "development".to_string()),
            input.palette.unwrap_or_else(|| "ember".to_string()),
            input.icon.unwrap_or_else(|| "🚀".to_string()),
            input.status.unwrap_or_else(|| "active".to_string()),
            t.clone(),
            t,
        ],
    ).map_err(|e| e.to_string())?;
    let row = conn.query_row(
        "SELECT id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at FROM projects WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?)),
    ).map_err(|e| e.to_string())?;
    Ok(to_project(&row, ProjectStats { total: 0, done: 0, doing: 0, notes: 0 }))
}

#[tauri::command]
pub fn update_project(state: tauri::State<DbState>, id: String, patch: ProjectPatch) -> Result<ProjectDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // build dynamic update
    let mut sets: Vec<String> = vec!["updated_at = ?1".to_string()];
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(ts())];
    // We'll handle fields by pushing with placeholders; simpler: do individual updates.
    // Use a sequential approach:
    if let Some(v) = &patch.title { let _ = conn.execute("UPDATE projects SET title = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    if let Some(v) = &patch.description { let _ = conn.execute("UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    if let Some(v) = &patch.category { let _ = conn.execute("UPDATE projects SET category = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    if let Some(v) = &patch.palette { let _ = conn.execute("UPDATE projects SET palette = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    if let Some(v) = &patch.icon { let _ = conn.execute("UPDATE projects SET icon = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    if let Some(v) = &patch.status { let _ = conn.execute("UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]); }
    // ensure updated_at touched
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), id]);

    let row = conn.query_row(
        "SELECT id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at FROM projects WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?)),
    ).map_err(|_| "not found".to_string())?;
    let stats = project_stats(&conn, &id);
    Ok(to_project(&row, stats))
}

#[tauri::command]
pub fn delete_project(state: tauri::State<DbState>, id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // cascade delete tasks/notes manually (FK cascade requires pragma; ensure on)
    let _ = conn.execute("PRAGMA foreign_keys = ON", []);
    conn.execute("DELETE FROM tasks WHERE project_id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE project_id = ?1", params![id]).map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM projects WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub fn create_task(state: tauri::State<DbState>, project_id: String, title: String) -> Result<Option<TaskDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // check project exists
    let exists: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![project_id], |r| r.get::<_, i64>(0)).unwrap_or(0);
    if exists == 0 { return Ok(None); }
    let m: i64 = conn.query_row("SELECT COALESCE(MAX(position),0) FROM tasks WHERE project_id = ?1", params![project_id], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let id = uuid();
    let t = ts();
    conn.execute(
        "INSERT INTO tasks (id,project_id,title,status,position,created_at) VALUES (?1,?2,?3,'todo',?4,?5)",
        params![id, project_id.clone(), title, m + 1, t],
    ).map_err(|e| e.to_string())?;
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), project_id]);
    let row = conn.query_row(
        "SELECT id,project_id,title,status,position,created_at,completed_at FROM tasks WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?)),
    ).map_err(|e| e.to_string())?;
    Ok(Some(to_task(&row)))
}

#[tauri::command]
pub fn update_task(state: tauri::State<DbState>, id: String, patch: TaskPatch) -> Result<TaskDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let existing = conn.query_row(
        "SELECT id,project_id,title,status,position,created_at,completed_at FROM tasks WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?)),
    ).map_err(|_| "not found".to_string())?;
    let project_id = existing.1.clone();
    if let Some(v) = &patch.title {
        let _ = conn.execute("UPDATE tasks SET title = ?1 WHERE id = ?2", params![v, id]);
    }
    if let Some(v) = &patch.status {
        let completed = if v == "done" { Some(ts()) } else { None };
        let _ = conn.execute("UPDATE tasks SET status = ?1, completed_at = ?2 WHERE id = ?3", params![v, completed, id]);
    }
    if patch.make_next.unwrap_or(false) {
        let m: i64 = conn.query_row(
            "SELECT COALESCE(MIN(position),0) FROM tasks WHERE project_id = ?1 AND status = 'todo'",
            params![project_id],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(0);
        let _ = conn.execute("UPDATE tasks SET position = ?1 WHERE id = ?2", params![m - 1, id]);
    }
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), project_id]);
    let row = conn.query_row(
        "SELECT id,project_id,title,status,position,created_at,completed_at FROM tasks WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?)),
    ).map_err(|_| "not found".to_string())?;
    Ok(to_task(&row))
}

#[tauri::command]
pub fn delete_task(state: tauri::State<DbState>, id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // get project_id first
    let pid: Option<String> = conn.query_row("SELECT project_id FROM tasks WHERE id = ?1", params![id], |r| r.get::<_, String>(0)).ok();
    let n = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n > 0 {
        if let Some(p) = pid { let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), p]); }
    }
    Ok(n > 0)
}

#[tauri::command]
pub fn create_note(state: tauri::State<DbState>, project_id: String, input: NoteInput) -> Result<Option<NoteDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let exists: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![project_id], |r| r.get::<_, i64>(0)).unwrap_or(0);
    if exists == 0 { return Ok(None); }
    let id = uuid();
    let t = ts();
    let title = input.title.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "Untitled note".to_string());
    let content = input.content.unwrap_or_default();
    let pinned = input.pinned.unwrap_or(false);
    conn.execute(
        "INSERT INTO notes (id,project_id,title,content,pinned,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, project_id.clone(), title, content, pinned as i64, t.clone(), t.clone()],
    ).map_err(|e| e.to_string())?;
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), project_id]);
    let row = conn.query_row(
        "SELECT id,project_id,title,content,pinned,created_at,updated_at FROM notes WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?)),
    ).map_err(|e| e.to_string())?;
    Ok(Some(to_note(&row)))
}

#[tauri::command]
pub fn update_note(state: tauri::State<DbState>, id: String, input: NoteInput) -> Result<NoteDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // fetch project_id
    let pid: String = conn.query_row("SELECT project_id FROM notes WHERE id = ?1", params![id], |r| r.get::<_, String>(0)).map_err(|_| "not found".to_string())?;
    if let Some(v) = &input.title {
        let title = v.trim();
        let title = if title.is_empty() { "Untitled note" } else { title };
        let _ = conn.execute("UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3", params![title, ts(), id]);
    }
    if let Some(v) = &input.content {
        let _ = conn.execute("UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3", params![v, ts(), id]);
    }
    if let Some(v) = &input.pinned {
        let _ = conn.execute("UPDATE notes SET pinned = ?1, updated_at = ?2 WHERE id = ?3", params![*v as i64, ts(), id]);
    }
    let _ = conn.execute("UPDATE notes SET updated_at = ?1 WHERE id = ?2", params![ts(), id]);
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), pid]);
    let row = conn.query_row(
        "SELECT id,project_id,title,content,pinned,created_at,updated_at FROM notes WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?)),
    ).map_err(|_| "not found".to_string())?;
    Ok(to_note(&row))
}

#[tauri::command]
pub fn delete_note(state: tauri::State<DbState>, id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pid: Option<String> = conn.query_row("SELECT project_id FROM notes WHERE id = ?1", params![id], |r| r.get::<_, String>(0)).ok();
    let n = conn.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n > 0 {
        if let Some(p) = pid { let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), p]); }
    }
    Ok(n > 0)
}

#[tauri::command]
pub fn list_ideas(state: tauri::State<DbState>) -> Result<Vec<IdeaDto>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id,text,created_at FROM ideas ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { let (a, b, c) = r.map_err(|e| e.to_string())?; out.push(IdeaDto { id: a, text: b, created_at: c }); }
    Ok(out)
}

#[tauri::command]
pub fn capture_idea(state: tauri::State<DbState>, text: String) -> Result<IdeaDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid();
    let t = ts();
    conn.execute("INSERT INTO ideas (id,text,created_at) VALUES (?1,?2,?3)", params![id, text, t.clone()]).map_err(|e| e.to_string())?;
    Ok(IdeaDto { id, text, created_at: t })
}

#[tauri::command]
pub fn delete_idea(state: tauri::State<DbState>, id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM ideas WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub fn send_idea_to_project(state: tauri::State<DbState>, idea_id: String, project_id: String) -> Result<NoteDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // fetch idea
    let (text,): (String,) = conn.query_row("SELECT text FROM ideas WHERE id = ?1", params![idea_id], |r| Ok((r.get::<_, String>(0)?,))).map_err(|_| "not found".to_string())?;
    // check project exists
    let exists: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![project_id], |r| r.get::<_, i64>(0)).unwrap_or(0);
    if exists == 0 { return Err("project not found".to_string()); }
    // create note
    let id = uuid();
    let t = ts();
    let title = text.trim().lines().next().unwrap_or("").chars().take(80).collect::<String>();
    let title = if title.is_empty() { "Captured idea".to_string() } else { title };
    conn.execute(
        "INSERT INTO notes (id,project_id,title,content,pinned,created_at,updated_at) VALUES (?1,?2,?3,?4,0,?5,?6)",
        params![id, project_id.clone(), title, text, t.clone(), t.clone()],
    ).map_err(|e| e.to_string())?;
    // delete idea
    let _ = conn.execute("DELETE FROM ideas WHERE id = ?1", params![idea_id]);
    let _ = conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts(), project_id]);
    let row = conn.query_row(
        "SELECT id,project_id,title,content,pinned,created_at,updated_at FROM notes WHERE id = ?1",
        params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?)),
    ).map_err(|e| e.to_string())?;
    Ok(to_note(&row))
}

#[tauri::command]
pub fn focus(state: tauri::State<DbState>) -> Result<FocusDto, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // active projects
    let mut stmt = conn.prepare("SELECT id,title,palette,icon,category FROM projects WHERE status = 'active' ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let prows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))).map_err(|e| e.to_string())?;
    let mut active: Vec<(String, String, String, String, String)> = vec![];
    for r in prows { active.push(r.map_err(|e| e.to_string())?); }
    if active.is_empty() { return Ok(FocusDto { doing: vec![], on_deck: vec![] }); }

    // tasks for active projects
    let ids: Vec<String> = active.iter().map(|a| a.0.clone()).collect();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let q = format!("SELECT id,project_id,title,status,position,created_at,completed_at FROM tasks WHERE project_id IN ({}) ORDER BY position ASC, created_at ASC", placeholders);
    let mut tstmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let trows = tstmt.query_map(params.as_slice(), |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?))
    }).map_err(|e| e.to_string())?;
    let mut tasks: Vec<(String, String, String, String, i64, String, Option<String>)> = vec![];
    for t in trows { tasks.push(t.map_err(|e| e.to_string())?); }

    let mut by_project: std::collections::BTreeMap<String, Vec<(String, String, String, String, i64, String, Option<String>)>> = std::collections::BTreeMap::new();
    for t in tasks {
        by_project.entry(t.1.clone()).or_default().push(t);
    }

    let mut doing: Vec<FocusTaskDto> = vec![];
    let mut on_deck: Vec<FocusTaskDto> = vec![];
    for p in &active {
        let list = by_project.get(&p.0).cloned().unwrap_or_default();
        let pref = FocusProjectRef { id: p.0.clone(), title: p.1.clone(), palette: p.2.clone(), icon: p.3.clone(), category: p.4.clone() };
        for t in &list {
            if t.3 == "doing" {
                let td = to_task(&t);
                doing.push(FocusTaskDto { task: td, project: pref.clone() });
            }
        }
        // next todo
        if let Some(t) = list.iter().find(|t| t.3 == "todo") {
            let td = to_task(&t);
            on_deck.push(FocusTaskDto { task: td, project: pref.clone() });
        }
    }
    Ok(FocusDto { doing, on_deck })
}

#[tauri::command]
pub fn seed(state: tauri::State<DbState>) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get::<_, i64>(0)).unwrap_or(0);
    if count > 0 {
        return Ok(serde_json::json!({ "seeded": false }));
    }
    // Insert seed projects
    let hours = |h: i64| -> String {
        (Utc::now() - chrono::Duration::hours(h)).to_rfc3339()
    };
    let insert_project = |title: &str, desc: &str, cat: &str, pal: &str, icon: &str, status: &str, created_h: i64, updated_h: i64, opened_h: Option<i64>| -> String {
        let id = uuid();
        let created = hours(created_h);
        let updated = hours(updated_h);
        let opened: Option<String> = opened_h.map(hours);
        let _ = conn.execute(
            "INSERT INTO projects (id,title,description,category,palette,icon,status,created_at,updated_at,last_opened_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, title, desc, cat, pal, icon, status, created, updated, opened],
        );
        id
    };
    let billing = insert_project("Ship the billing API", "Stripe webhooks, invoice emails and the usage meter. The finish line is in sight — keep the queue short.", "development", "ocean", "🛠️", "active", 24*12, 2, Some(1));
    let portfolio = insert_project("Portfolio v3", "A quiet, editorial site that lets the work speak. Two case studies, one about page, zero carousels.", "development", "ember", "🎨", "active", 24*9, 5, Some(3));
    let growth = insert_project("Q3 growth plan", "Retention before acquisition. Talk to churned customers, then run one honest pricing experiment.", "business", "moss", "📈", "active", 24*20, 26, Some(26));
    let rustp = insert_project("Learn Rust by building", "No more tutorial loops. Read a chapter, build a thing, write down what confused you.", "learning", "plum", "🦀", "active", 24*15, 50, None);
    let saas = insert_project("Micro-SaaS: changelog tool", "A tiny hosted changelog for indie devs. Validate before building anything bigger than a landing page.", "idea", "amber", "✨", "active", 24*6, 72, None);
    let office = insert_project("Home office reset", "One calm weekend: monitor arm, cables, plants. Pause until the launch is out.", "personal", "teal", "🌿", "paused", 24*30, 140, None);

    // tasks
    let tinsert = |project_id: &str, title: &str, status: &str, position: i64, completed_h: Option<i64>| {
        let id = uuid();
        let completed_at: Option<String> = completed_h.map(hours);
        let created = hours(1);
        let _ = conn.execute(
            "INSERT INTO tasks (id,project_id,title,status,position,created_at,completed_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, project_id, title, status, position, created, completed_at],
        );
    };
    // billing
    tinsert(&billing, "Handle the invoice.payment_failed webhook", "doing", 0, None);
    tinsert(&billing, "Add idempotency keys to POST /invoices", "todo", 1, None);
    tinsert(&billing, "Write integration tests for proration", "todo", 2, None);
    tinsert(&billing, "Draft the changelog entry for v1.2", "todo", 3, None);
    tinsert(&billing, "Design the invoice PDF template", "done", 4, Some(30));
    tinsert(&billing, "Set up a Stripe test clock", "done", 5, Some(52));
    // portfolio
    tinsert(&portfolio, "Pick the type scale and grid", "doing", 0, None);
    tinsert(&portfolio, "Write case study: fintech dashboard", "todo", 1, None);
    tinsert(&portfolio, "Draft the about page copy", "todo", 2, None);
    tinsert(&portfolio, "Collect project screenshots", "done", 3, Some(20));
    // growth
    tinsert(&growth, "Draft the positioning one-pager", "doing", 0, None);
    tinsert(&growth, "Interview 5 churned customers", "todo", 1, None);
    tinsert(&growth, "Run pricing experiment: annual discount", "todo", 2, None);
    tinsert(&growth, "Pull the MRR cohort data", "done", 3, Some(48));
    // rust
    tinsert(&rustp, "Finish the ownership chapter", "doing", 0, None);
    tinsert(&rustp, "Build a CLI todo app in Rust", "todo", 1, None);
    tinsert(&rustp, "Read error handling patterns", "todo", 2, None);
    tinsert(&rustp, "Set up rustup and cargo", "done", 3, Some(90));
    // saas
    tinsert(&saas, "Validate the idea with 10 developers", "todo", 0, None);
    tinsert(&saas, "Sketch a one-page pricing site", "todo", 1, None);
    tinsert(&saas, "Shortlist three names", "todo", 2, None);
    // office
    tinsert(&office, "Order the monitor arm", "todo", 0, None);
    tinsert(&office, "Cable management pass", "todo", 1, None);
    tinsert(&office, "Declutter the desk", "done", 2, Some(160));

    // notes
    let ninsert = |project_id: &str, title: &str, content: &str, pinned: bool, created_h: i64, updated_h: i64| {
        let id = uuid();
        let _ = conn.execute(
            "INSERT INTO notes (id,project_id,title,content,pinned,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, project_id, title, content, pinned as i64, hours(created_h), hours(updated_h)],
        );
    };
    ninsert(&billing, "Launch day runbook", "# Launch day\n\nShip in this order, verify each step before the next.\n\n- [x] Freeze schema migrations\n- [x] Stripe test clock passes\n- [ ] Deploy behind the `billing_v2` flag\n- [ ] Enable for 5% of workspaces\n- [ ] Watch the webhook error rate for 1h\n\n> Rollback is one flag flip. Keep it that way.", true, 100, 4);
    ninsert(&billing, "Webhook verification snippet", "The signature check that finally worked:\n\n```ts\nconst event = stripe.webhooks.constructEvent(\n  rawBody,\n  req.headers[\"stripe-signature\"],\n  process.env.STRIPE_WEBHOOK_SECRET,\n);\n```\n\n**Gotcha:** the body must stay *raw* — no JSON middleware before this route.", false, 90, 28);
    ninsert(&portfolio, "Moodboard & tone", "Warm paper, ink text, one confident accent. Serif headlines, generous whitespace.\n\n- Editorial, not \"tech startup\"\n- Every project page opens with the *problem*, not the stack\n- Motion: subtle lifts only\n\nReference: book covers, not dashboards.", true, 80, 6);
    ninsert(&growth, "Pricing hypotheses", "# What we believe\n\n1. Annual pricing lifts retention more than it hurts conversion\n2. The $19 tier is anchoring — most value sits at $29\n3. Churn is onboarding, not price\n\n**Next:** prove #3 with five interviews before touching prices.", false, 120, 30);
    ninsert(&rustp, "Ownership cheat sheet", "Rules that finally clicked:\n\n- Each value has **one owner**\n- Owner drops → value drops\n- `&T` many readers, `&mut T` one writer\n\n```rust\nfn len(s: &String) -> usize { s.len() } // borrow, don't take\n```\n\nWhen confused: *who owns this, and for how long?*", false, 70, 50);
    ninsert(&saas, "The pitch", "\"Your changelog, hosted in 90 seconds.\"\n\nFor indie devs who ship weekly but never tell anyone. Markdown in, beautiful public page out, RSS + email built in.\n\n**Risk:** it's a vitamin, not a painkiller. Talk to 10 devs first.", true, 60, 70);
    ninsert(&office, "Setup wishlist", "- Monitor arm (clamp, not grommet)\n- One plant that survives me: pothos\n- Warm desk lamp, 2700K\n- Cable tray under the desk", false, 200, 150);

    // ideas
    let iinsert = |text: &str, created_h: i64| {
        let id = uuid();
        let _ = conn.execute("INSERT INTO ideas (id,text,created_at) VALUES (?1,?2,?3)", params![id, text, hours(created_h)]);
    };
    iinsert("Blog post: the debugging log that saved our launch — tell it as a timeline.", 3);
    iinsert("VS Code extension that turns TODO comments into a board like this one.", 22);
    iinsert("Follow up with Maya about the freelance contract before Friday.", 46);

    Ok(serde_json::json!({ "seeded": true }))
}



