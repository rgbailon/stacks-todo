import { invoke } from "@tauri-apps/api/core";
import type {
  FocusDTO,
  IdeaDTO,
  NoteDTO,
  NoteInput,
  ProjectDTO,
  ProjectDetailDTO,
  ProjectInput,
  TaskDTO,
  TaskPatch,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number = 0) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const msg = typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e);
    throw new ApiError(msg);
  }
}

class ProjectService {
  list(): Promise<ProjectDTO[]> { return call("list_projects"); }
  get(id: string): Promise<ProjectDetailDTO> { return call("get_project", { id }); }
  create(input: ProjectInput): Promise<ProjectDTO> { return call("create_project", { input }); }
  update(id: string, patch: Partial<ProjectInput>): Promise<ProjectDTO> { return call("update_project", { id, patch }); }
  remove(id: string): Promise<{ ok: boolean }> { return call("delete_project", { id }).then(() => ({ ok: true })); }
}

class TaskService {
  create(projectId: string, title: string): Promise<TaskDTO> { return call("create_task", { project_id: projectId, title }); }
  update(id: string, patch: TaskPatch): Promise<TaskDTO> { return call("update_task", { id, patch }); }
  remove(id: string): Promise<{ ok: boolean }> { return call("delete_task", { id }).then(() => ({ ok: true })); }
}

class NoteService {
  create(projectId: string, input: NoteInput): Promise<NoteDTO> { return call("create_note", { project_id: projectId, input }); }
  update(id: string, patch: NoteInput): Promise<NoteDTO> { return call("update_note", { id, patch }); }
  remove(id: string): Promise<{ ok: boolean }> { return call("delete_note", { id }).then(() => ({ ok: true })); }
}

class IdeaService {
  list(): Promise<IdeaDTO[]> { return call("list_ideas"); }
  capture(text: string): Promise<IdeaDTO> { return call("capture_idea", { text }); }
  remove(id: string): Promise<{ ok: boolean }> { return call("delete_idea", { id }).then(() => ({ ok: true })); }
  sendToProject(id: string, projectId: string): Promise<NoteDTO> { return call("send_idea_to_project", { idea_id: id, project_id: projectId }); }
}

class FocusService {
  get(): Promise<FocusDTO> { return call("focus"); }
}

class SystemService {
  seed(): Promise<{ seeded: boolean }> { return call("seed"); }
}

export const api = {
  projects: new ProjectService(),
  tasks: new TaskService(),
  notes: new NoteService(),
  ideas: new IdeaService(),
  focus: new FocusService(),
  system: new SystemService(),
};