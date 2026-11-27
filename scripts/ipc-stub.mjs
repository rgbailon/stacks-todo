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

const NOW = "2026-01-01T00:00:00.000Z";

const projectDto = (id, input = {}) => ({
  id,
  title: input.title ?? "Untitled project",
  description: input.description ?? "",
  category: input.category ?? "development",
  palette: input.palette ?? "ember",
  icon: input.icon ?? "🚀",
  status: input.status ?? "active",
  createdAt: NOW,
  updatedAt: NOW,
  lastOpenedAt: null,
  stats: { total: 0, done: 0, doing: 0, notes: 0 },
});

const taskDto = (id, projectId, title) => ({
  id,
  projectId,
  title,
  status: "todo",
  position: 1,
  createdAt: NOW,
  completedAt: null,
});

const noteDto = (id, projectId, input = {}) => ({
  id,
  projectId,
  title: input.title ?? "Untitled note",
  content: input.content ?? "",
  pinned: input.pinned ?? false,
  createdAt: NOW,
  updatedAt: NOW,
});

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
      return { project: projectDto(args.id, { title: "Stub project" }), tasks: [], notes: [] };
    case "create_project":
      return projectDto(`p_${Date.now().toString(36)}`, args.input);
    case "create_task":
      return taskDto(`t_${Date.now().toString(36)}`, args.projectId, args.title);
    case "create_note":
    case "update_note":
      return noteDto("n_1", args.projectId ?? "p_1", args.input ?? args.patch);
    case "capture_idea":
      return { id: `i_${Date.now().toString(36)}`, text: args.text, createdAt: NOW };
    case "focus":
      return { doing: [], onDeck: [] };
    case "seed":
      return { seeded: true };
    default:
      return { id: "x", ok: true, seeded: false };
  }
}
