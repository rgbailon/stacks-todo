/**
 * The agentic layer: system prompt, the Stacks tools, and the tool loop.
 *
 * Providers (lib/ai/providers.ts) only translate messages; everything that
 * touches the library goes through the same client `api` the UI uses, so a
 * tool call and a click end up in the same SQLite database.
 */
import type { AgentToolCall, AgentToolSpec, ChatProvider, ChatTurn, ProviderReply } from "@/lib/ai/providers";
import { PALETTES } from "@/lib/palettes";
import { api } from "@/lib/services";
import { CATEGORIES, isCategory, isProjectStatus, isTaskStatus } from "@/lib/types";
import type { NoteInput, TaskPatch } from "@/lib/types";

export const SYSTEM_PROMPT = `You are Stacks Agent, the AI assistant inside Stacks — a calm desktop app that is "a library of your projects": think it (Inbox), note it (Notes), ship it (Plan).

Your job: help the user create and organize PROJECTS, TASKS, and NOTES using your tools.

How Stacks works:
- A project has a title, description, category, cover palette, icon and status (active | paused | completed).
- A project's plan is an ordered list of tasks. Task statuses: todo (unstarted), doing (in motion), done. New tasks are added as todo; the first todo is "up next".
- Notes live inside a project. A note has a title, a body, and an optional pinned flag. Use notes for reference material, decisions, checklists, and longer thoughts; use tasks for actionable next steps.
- Categories: development, business, idea, learning, personal.
- Cover palettes: ember, moss, ocean, plum, amber, rose, teal, graphite.
- Icons: one emoji (🚀 💡 🛠️ 📈 🎨 🧠 📚 🌱 💼 ✨ 🧪 📱 🔧 🗺️ 💰 🎯 🦀 📝 all work).

Rules:
1. Use tools for every change to the library — never claim something was created or updated without a successful tool result.
2. Call list_projects before creating a project when the user refers to existing work, so you reuse projects instead of duplicating them.
3. Call get_project before adding to or updating a project; use the task and note ids it returns. Never invent ids.
4. If a tool returns an error, fix the input it complains about and try again.
5. Break goals into small concrete next steps (roughly 15–60 minutes of work each). 3–7 tasks is a good default; check before creating more than 10.
6. When the user asks to "remember", "write down", or "save" something, use create_note when it belongs to a project; use capture_idea only for a loose thought with no project yet.
7. Keep replies short (2–5 sentences), warm and concrete. When you created or changed things, say what and point out they are now in the Library.
8. If a name or other essential detail is missing, ask one concise question instead of guessing. When you can safely default, do it and mention the choice.`;

export interface AppTool {
  spec: AgentToolSpec;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

/** Thrown for bad tool input; the loop turns it into a recoverable tool result. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

const str = (value: unknown): string => (value == null ? "" : String(value));

const MAX_TITLE = 200;
const MAX_NOTE_CONTENT = 20_000;
const MAX_IDEA_TEXT = 2_000;
/** Notes are sent to the model as context; keep one huge note from eating the prompt. */
const NOTE_PREVIEW = 4_000;

function requiredText(value: unknown, field: string, max: number): string {
  const text = str(value).trim();
  if (!text) throw new ToolInputError(`\`${field}\` is required and must be a non-empty string.`);
  if (text.length > max) throw new ToolInputError(`\`${field}\` must be at most ${max} characters.`);
  return text;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value == null) return undefined;
  const text = str(value).trim();
  if (!text) return undefined;
  if (text.length > max) throw new ToolInputError(`\`${field}\` must be at most ${max} characters.`);
  return text;
}

/** Note bodies keep their formatting; only the emptiness check trims. */
function noteBody(value: unknown): string {
  const text = str(value);
  if (!text.trim()) throw new ToolInputError("`content` is required and must be a non-empty string.");
  if (text.length > MAX_NOTE_CONTENT) {
    throw new ToolInputError(`\`content\` must be at most ${MAX_NOTE_CONTENT} characters.`);
  }
  return text;
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function createAppTools(): AppTool[] {
  return [
    {
      spec: {
        name: "list_projects",
        description:
          "List every project in the Stacks library with its id, title, category, status, description and task stats. Call this before creating anything that might already exist.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      execute: async () => {
        const rows = await api.projects.list();
        return JSON.stringify(
          rows.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            category: p.category,
            status: p.status,
            stats: p.stats,
          })),
        );
      },
    },
    {
      spec: {
        name: "create_project",
        description:
          "Create a project in the library. `title` is required; pick a fitting category, cover palette and emoji icon (or leave them out for sensible defaults).",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Project title" },
            description: { type: "string", description: "One or two sentences: what is this, what does done look like?" },
            category: { type: "string", enum: [...CATEGORIES.map((c) => c.id)], description: "Project category" },
            palette: { type: "string", enum: [...PALETTES.map((p) => p.id)], description: "Cover palette id" },
            icon: { type: "string", description: "Single emoji for the cover" },
            status: { type: "string", enum: ["active", "paused", "completed"], description: "Defaults to active" },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const title = requiredText(input.title, "title", MAX_TITLE);
        const category = input.category == null ? undefined : str(input.category);
        if (category !== undefined && !isCategory(category)) {
          throw new ToolInputError(`Unknown category "${category}". Valid: ${CATEGORIES.map((c) => c.id).join(", ")}.`);
        }
        const palette = input.palette == null ? undefined : str(input.palette);
        if (palette !== undefined && !PALETTES.some((p) => p.id === palette)) {
          throw new ToolInputError(`Unknown palette "${palette}". Valid: ${PALETTES.map((p) => p.id).join(", ")}.`);
        }
        const status = input.status == null ? undefined : str(input.status);
        if (status !== undefined && !isProjectStatus(status)) {
          throw new ToolInputError(`Unknown status "${status}". Valid: active, paused, completed.`);
        }
        const saved = await api.projects.create({
          title,
          description: str(input.description).trim() || undefined,
          category: category as never,
          palette,
          icon: str(input.icon).trim() || undefined,
          status: status as never,
        });
        return `Created project "${saved.title}" (id: ${saved.id}).`;
      },
    },
    {
      spec: {
        name: "get_project",
        description:
          "Read one project's plan: its details, tasks and notes. Call this before adding to or updating a project so you can reuse the real task and note ids.",
        input_schema: {
          type: "object",
          properties: { projectId: { type: "string", description: "Project id from list_projects" } },
          required: ["projectId"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const projectId = requiredText(input.projectId, "projectId", MAX_TITLE);
        const detail = await api.projects.get(projectId);
        return JSON.stringify({
          project: {
            id: detail.project.id,
            title: detail.project.title,
            description: detail.project.description,
            category: detail.project.category,
            status: detail.project.status,
            stats: detail.project.stats,
          },
          tasks: detail.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, position: t.position })),
          notes: detail.notes.map((n) => ({
            id: n.id,
            title: n.title,
            pinned: n.pinned,
            updatedAt: n.updatedAt,
            content: clip(n.content, NOTE_PREVIEW),
          })),
        });
      },
    },
    {
      spec: {
        name: "create_task",
        description:
          "Add a task to a project's plan. The task starts as todo. Use a small, concrete next-step title.",
        input_schema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Project id from list_projects" },
            title: { type: "string", description: "The task — small and concrete (~15–60 min of work)" },
          },
          required: ["projectId", "title"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const projectId = requiredText(input.projectId, "projectId", MAX_TITLE);
        const title = requiredText(input.title, "title", MAX_TITLE);
        // Resolves the "not found" case with a clear message before creating.
        const detail = await api.projects.get(projectId);
        const created = await api.tasks.create(projectId, title);
        if (!created) throw new ToolInputError(`Project ${projectId} no longer exists.`);
        return `Added task "${created.title}" (id: ${created.id}) to project "${detail.project.title}".`;
      },
    },
    {
      spec: {
        name: "update_task",
        description:
          "Change an existing task: rename it, move it between todo/doing/done, or make it the next task. Use get_project first to find the task id.",
        input_schema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task id from get_project" },
            title: { type: "string", description: "New task title" },
            status: { type: "string", enum: ["todo", "doing", "done"], description: "New task status" },
            makeNext: { type: "boolean", description: "Move this task to the front of the todo queue" },
          },
          required: ["taskId"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const taskId = requiredText(input.taskId, "taskId", MAX_TITLE);
        const patch: TaskPatch = {};
        const title = optionalText(input.title, "title", MAX_TITLE);
        if (title) patch.title = title;
        if (input.status != null) {
          const status = str(input.status);
          if (!isTaskStatus(status)) {
            throw new ToolInputError(`Unknown task status "${status}". Valid: todo, doing, done.`);
          }
          patch.status = status;
        }
        if (input.makeNext != null) patch.makeNext = input.makeNext === true;
        if (Object.keys(patch).length === 0) {
          throw new ToolInputError("Provide at least one of `title`, `status`, or `makeNext`.");
        }
        const updated = await api.tasks.update(taskId, patch);
        return `Updated task "${updated.title}" (status: ${updated.status}).`;
      },
    },
    {
      spec: {
        name: "create_note",
        description:
          "Write a note inside a project. Use notes for reference material, decisions, checklists, and longer thoughts that are not actionable tasks.",
        input_schema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Project id from list_projects" },
            title: { type: "string", description: "Short note title" },
            content: { type: "string", description: "Note body; plain text or light markdown" },
            pinned: { type: "boolean", description: "Pin the note to the top of the project (defaults to false)" },
          },
          required: ["projectId", "title", "content"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const projectId = requiredText(input.projectId, "projectId", MAX_TITLE);
        const title = requiredText(input.title, "title", MAX_TITLE);
        const content = noteBody(input.content);
        // Resolves the "not found" case with a clear message before creating.
        const detail = await api.projects.get(projectId);
        const saved = await api.notes.create(projectId, {
          title,
          content,
          pinned: input.pinned === true,
        });
        if (!saved) throw new ToolInputError(`Project ${projectId} no longer exists.`);
        return `Created note "${saved.title}" (id: ${saved.id}) in project "${detail.project.title}".`;
      },
    },
    {
      spec: {
        name: "update_note",
        description:
          "Edit an existing note's title, body, or pinned state. Use get_project first to find the note id.",
        input_schema: {
          type: "object",
          properties: {
            noteId: { type: "string", description: "Note id from get_project" },
            title: { type: "string", description: "New note title" },
            content: { type: "string", description: "New note body; replaces the existing body" },
            pinned: { type: "boolean", description: "Pin or unpin the note" },
          },
          required: ["noteId"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const noteId = requiredText(input.noteId, "noteId", MAX_TITLE);
        const patch: NoteInput = {};
        const title = optionalText(input.title, "title", MAX_TITLE);
        if (title) patch.title = title;
        if (input.content != null) patch.content = noteBody(input.content);
        if (input.pinned != null) patch.pinned = input.pinned === true;
        if (Object.keys(patch).length === 0) {
          throw new ToolInputError("Provide at least one of `title`, `content`, or `pinned`.");
        }
        const updated = await api.notes.update(noteId, patch);
        return `Updated note "${updated.title}" (id: ${updated.id}).`;
      },
    },
    {
      spec: {
        name: "capture_idea",
        description: "Save a quick idea to the Inbox when the user wants to park a thought instead of planning it now.",
        input_schema: {
          type: "object",
          properties: { text: { type: "string", description: "The idea, in the user's words" } },
          required: ["text"],
          additionalProperties: false,
        },
      },
      execute: async (input) => {
        const text = requiredText(input.text, "text", MAX_IDEA_TEXT);
        const idea = await api.ideas.capture(text);
        return `Captured idea (id: ${idea.id}).`;
      },
    },
  ];
}

// ------------------------------------------------------------------- the loop

export interface AgentToolEvent {
  name: string;
  ok: boolean;
  summary: string;
}

export interface AgentRunResult {
  /** Final user-facing reply ("" when the run failed). */
  reply: string;
  /** Full conversation including this run — store it and pass it back as history. */
  turns: ChatTurn[];
  toolEvents: AgentToolEvent[];
  error?: string;
}

export interface RunAgentOptions {
  provider: ChatProvider;
  history: ChatTurn[];
  userText: string;
  /** Injectable for tests; defaults to the real Stacks tools. */
  tools?: AppTool[];
  maxTurns?: number;
  onTool?: (event: AgentToolEvent) => void;
  /** Optional model override (OpenCode). */
  model?: string | null;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function firstLine(text: string, max = 140): string {
  const line = text.split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Run one user message to completion: provider → execute tool calls → feed
 * results back → repeat until the model replies with plain text (or the
 * step budget runs out). Never throws; failures come back as `error` with
 * whatever progress was made kept in `turns`.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentRunResult> {
  const tools = options.tools ?? createAppTools();
  const byName = new Map(tools.map((t) => [t.spec.name, t]));
  const turns: ChatTurn[] = [...options.history, { role: "user", content: options.userText }];
  const toolEvents: AgentToolEvent[] = [];
  const maxTurns = options.maxTurns ?? 8;

  const finish = (reply: string, error?: string): AgentRunResult => ({
    reply,
    turns: [...turns, { role: "assistant", content: reply, toolCalls: [] }],
    toolEvents,
    ...(error ? { error } : {}),
  });

  const ask = (includeTools: boolean): Promise<ProviderReply> =>
    options.provider.complete({
      system: SYSTEM_PROMPT,
      turns,
      tools: includeTools ? tools.map((t) => t.spec) : [],
      model: options.model,
    });

  for (let step = 0; step < maxTurns; step++) {
    let reply: ProviderReply;
    try {
      reply = await ask(true);
    } catch (e) {
      // Keep turns (including tool results already executed) so a retry
      // continues where we left off instead of re-running the tools.
      return { reply: "", turns, toolEvents, error: messageOf(e) };
    }

    if (reply.toolCalls.length === 0) return finish(reply.content);

    turns.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const outcome = await runTool(byName, call);
      // The model sees the full result; the UI gets the one-line summary.
      turns.push({
        role: "toolResult",
        callId: call.id,
        name: call.name,
        content: outcome.ok ? outcome.result : `Error: ${outcome.summary}`,
      });
      const event = { name: outcome.name, ok: outcome.ok, summary: outcome.summary };
      toolEvents.push(event);
      options.onTool?.(event);
    }
  }

  // Step budget spent: force one final tool-free answer so the conversation
  // still ends on an assistant message.
  try {
    const final = await ask(false);
    return finish(final.content || "I hit the step limit before finishing — send another message to continue.");
  } catch (e) {
    return { reply: "", turns, toolEvents, error: messageOf(e) };
  }
}

async function runTool(
  byName: Map<string, AppTool>,
  call: AgentToolCall,
): Promise<AgentToolEvent & { result: string }> {
  const tool = byName.get(call.name);
  if (!tool) {
    const summary = `Unknown tool "${call.name}". Available: ${[...byName.keys()].join(", ")}`;
    return { name: call.name, ok: false, summary, result: `Error: ${summary}` };
  }
  try {
    const result = await tool.execute(call.input ?? {});
    return { name: call.name, ok: true, summary: firstLine(result), result };
  } catch (e) {
    const summary = messageOf(e);
    return { name: call.name, ok: false, summary, result: `Error: ${summary}` };
  }
}
