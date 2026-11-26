// Simulates Tauri's IPC argument resolution: each command looks up its Rust
// parameter names converted to camelCase (#[tauri::command] default).
// A missing camelCase key rejects the call exactly like the real runtime.
// Keep the keys in sync with the Rust signatures in src-tauri/src/commands.rs.
const EXPECTED_KEYS = {
  list_projects: [],
  get_project: ["id"],
  create_project: ["input"],
  update_project: ["id", "patch"],
  delete_project: ["id"],
  create_task: ["projectId", "title"],
  update_task: ["id", "patch"],
  delete_task: ["id"],
  create_note: ["projectId", "input"],
  update_note: ["id", "input"],
  delete_note: ["id"],
  list_ideas: [],
  capture_idea: ["text"],
  delete_idea: ["id"],
  send_idea_to_project: ["ideaId", "projectId"],
  focus: [],
  seed: [],
};

export async function invoke(cmd, args = {}) {
  const expected = EXPECTED_KEYS[cmd];
  if (!expected) throw new Error(`unknown command: ${cmd}`);
  const missing = expected.filter((k) => !(k in (args ?? {})));
  if (missing.length) {
    throw new Error(
      `invalid args \`${missing[0]}\` for command \`${cmd}\`: missing key \`${missing[0]}\``,
    );
  }
  switch (cmd) {
    case "list_projects":
    case "list_ideas":
      return [];
    case "get_project":
      return { project: { id: args.id }, tasks: [], notes: [] };
    case "focus":
      return { doing: [], onDeck: [] };
    case "seed":
      return { seeded: true };
    case "create_note":
    case "send_idea_to_project":
      return {
        id: "note-1",
        projectId: args.projectId ?? args.id,
        title: "note",
        content: "",
        pinned: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
    case "create_task":
      return {
        id: "task-1",
        projectId: args.projectId,
        title: args.title,
        status: "todo",
        position: 1,
        createdAt: "2026-01-01T00:00:00Z",
        completedAt: null,
      };
    default:
      return { id: "x", ok: true, seeded: false };
  }
}
