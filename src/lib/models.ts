/**
 * Domain models — OOP layer over the wire DTOs.
 * Components never re-implement business rules; they ask these objects.
 *   TaskBoard   → groups tasks into Now / Next / Later / Done + progress
 *   Project     → identity, theme, status helpers
 *   Workspace   → a fully loaded project (detail page)
 */
import { CoverTheme } from "@/lib/palettes";
import {
  categoryLabel,
  type IdeaDTO,
  type NoteDTO,
  type ProjectDTO,
  type ProjectDetailDTO,
  type TaskDTO,
} from "@/lib/types";
import { firstLine, plainText } from "@/lib/utils";

export class Task {
  constructor(public readonly data: TaskDTO) {}
  get id() { return this.data.id; }
  get title() { return this.data.title; }
  get isDone() { return this.data.status === "done"; }
  get isDoing() { return this.data.status === "doing"; }
  get isTodo() { return this.data.status === "todo"; }
}

export class Note {
  constructor(public readonly data: NoteDTO) {}
  get id() { return this.data.id; }
  get title() { return this.data.title; }
  get pinned() { return this.data.pinned; }
  get excerpt(): string { return plainText(this.data.content).slice(0, 180); }
  get isEmpty(): boolean { return this.data.content.trim().length === 0; }
}

export class Idea {
  constructor(public readonly data: IdeaDTO) {}
  get id() { return this.data.id; }
  get text() { return this.data.text; }
  /** First line becomes the project title when promoted. */
  get title() { return firstLine(this.data.text, 90); }
  get detail() {
    const rest = this.data.text.trim().split("\n").slice(1).join("\n").trim();
    return rest;
  }
}

/** The heart of "never wonder what to do next". */
export class TaskBoard {
  readonly now: Task[];
  readonly next: Task | null;
  readonly later: Task[];
  readonly done: Task[];
  readonly total: number;

  constructor(tasks: Task[]) {
    const ordered = [...tasks].sort(
      (a, b) =>
        a.data.position - b.data.position ||
        a.data.createdAt.localeCompare(b.data.createdAt),
    );
    this.now = ordered.filter((t) => t.isDoing);
    const queue = ordered.filter((t) => t.isTodo);
    this.next = queue[0] ?? null;
    this.later = queue.slice(1);
    this.done = ordered
      .filter((t) => t.isDone)
      .sort((a, b) => (b.data.completedAt ?? "").localeCompare(a.data.completedAt ?? ""));
    this.total = ordered.length;
  }

  get doneCount() { return this.done.length; }
  get progress(): number {
    return this.total === 0 ? 0 : Math.round((this.doneCount / this.total) * 100);
  }
  get isEmpty() { return this.total === 0; }
}

export class Project {
  constructor(public readonly data: ProjectDTO) {}
  get id() { return this.data.id; }
  get title() { return this.data.title; }
  get theme(): CoverTheme { return CoverTheme.for(this.data.palette); }
  get category() { return categoryLabel(this.data.category); }
  get isActive() { return this.data.status === "active"; }
  get progress(): number {
    const { total, done } = this.data.stats;
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }
}

/** A project with everything inside — used by the detail page. */
export class Workspace {
  readonly project: Project;
  readonly tasks: Task[];
  readonly notes: Note[];
  readonly board: TaskBoard;

  constructor(dto: ProjectDetailDTO) {
    this.project = new Project(dto.project);
    this.tasks = dto.tasks.map((t) => new Task(t));
    this.notes = dto.notes.map((n) => new Note(n));
    this.board = new TaskBoard(this.tasks);
  }
}