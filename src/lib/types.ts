/**
 * Shared contracts between server and client.
 * Plain DTOs travel over the wire; domain classes in `lib/models.ts` wrap them.
 * To add a category: append to CATEGORIES — everything else adapts.
 */

export const CATEGORIES = [
  { id: "development", label: "Development", emoji: "💻" },
  { id: "business", label: "Business", emoji: "📈" },
  { id: "idea", label: "Idea", emoji: "💡" },
  { id: "learning", label: "Learning", emoji: "📚" },
  { id: "personal", label: "Personal", emoji: "🌿" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const PROJECT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["id"];
export type TaskStatus = "todo" | "doing" | "done";

export const PROJECT_ICONS = [
  "🚀", "💡", "🛠️", "📈", "🎨", "🧠", "📚", "🌱", "💼",
  "✨", "🧪", "📱", "🔧", "🗺️", "💰", "🎯", "🦀", "📝",
] as const;

export interface ProjectStats {
  total: number;
  done: number;
  doing: number;
  notes: number;
}

export interface ProjectDTO {
  id: string;
  title: string;
  description: string;
  category: CategoryId;
  palette: string;
  icon: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  stats: ProjectStats;
}

export interface TaskDTO {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  position: number;
  createdAt: string;
  completedAt: string | null;
}

export interface NoteDTO {
  id: string;
  projectId: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaDTO {
  id: string;
  text: string;
  createdAt: string;
}

export interface ProjectDetailDTO {
  project: ProjectDTO;
  tasks: TaskDTO[];
  notes: NoteDTO[];
}

export type FocusProjectRef = Pick<
  ProjectDTO,
  "id" | "title" | "palette" | "icon" | "category"
>;

export interface FocusTaskDTO extends TaskDTO {
  project: FocusProjectRef;
}

export interface FocusDTO {
  doing: FocusTaskDTO[];
  onDeck: FocusTaskDTO[];
}

export interface ProjectInput {
  title: string;
  description?: string;
  category?: CategoryId;
  palette?: string;
  icon?: string;
  status?: ProjectStatus;
}

export interface TaskPatch {
  title?: string;
  status?: TaskStatus;
  /** Move this task to the front of the queue ("do this next"). */
  makeNext?: boolean;
}

export interface NoteInput {
  title?: string;
  content?: string;
  pinned?: boolean;
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Project";
}

export function isCategory(id: string): id is CategoryId {
  return CATEGORIES.some((c) => c.id === id);
}

export function isTaskStatus(v: string): v is TaskStatus {
  return v === "todo" || v === "doing" || v === "done";
}

export function isProjectStatus(v: string): v is ProjectStatus {
  return PROJECT_STATUSES.some((s) => s.id === v);
}