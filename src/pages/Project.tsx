import { ArrowLeft, BookX, ListTodo, Pencil, Trash2 } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cover } from "@/components/cover";
import { NotesPanel } from "@/components/notes";
import { ProjectModal } from "@/components/project-modal";
import { TaskList } from "@/components/task-list";
import { Button, buttonStyles, ConfirmDialog, EmptyState, ProgressRing } from "@/components/ui";
import { Workspace, type Task } from "@/lib/models";
import { api } from "@/lib/services";
import { toast } from "@/lib/toast";
import type { NoteDTO, NoteInput, ProjectDetailDTO, TaskPatch } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const sortNotes = (rows: NoteDTO[]) =>
  [...rows].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dto, setDto] = useState<ProjectDetailDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setDto(await api.projects.get(id!));
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const ws = useMemo(() => (dto ? new Workspace(dto) : null), [dto]);

  const addTask = async (title: string) => {
    try {
      const created = await api.tasks.create(id!, title);
      setDto((prev) => (prev ? { ...prev, tasks: [...prev.tasks, created] } : prev));
    } catch {
      toast.error("Could not add the task.");
    }
  };

  const updateTask = async (task: Task, patch: TaskPatch) => {
    try {
      const updated = await api.tasks.update(task.id, patch);
      setDto((prev) =>
        prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === updated.id ? updated : t)) } : prev,
      );
      if (patch.status === "done") toast.success("Task completed.");
      if (patch.makeNext) toast.info("Moved to the front of the queue.");
    } catch {
      toast.error("Could not update the task.");
    }
  };

  const deleteTask = async (task: Task) => {
    try {
      await api.tasks.remove(task.id);
      setDto((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== task.id) } : prev));
      toast.info("Task deleted.");
    } catch {
      toast.error("Could not delete the task.");
    }
  };

  const createNote = async (input: NoteInput): Promise<NoteDTO> => {
    const created = await api.notes.create(id!, input);
    setDto((prev) => (prev ? { ...prev, notes: sortNotes([created, ...prev.notes]) } : prev));
    toast.success("Note saved.");
    return created;
  };

  const updateNote = async (noteId: string, patch: NoteInput): Promise<NoteDTO> => {
    const updated = await api.notes.update(noteId, patch);
    setDto((prev) =>
      prev
        ? { ...prev, notes: sortNotes(prev.notes.map((n) => (n.id === updated.id ? updated : n))) }
        : prev,
    );
    toast.success("Note saved.");
    return updated;
  };

  const deleteNote = async (noteId: string) => {
    await api.notes.remove(noteId);
    setDto((prev) => (prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== noteId) } : prev));
    toast.info("Note deleted.");
  };

  const deleteProject = async () => {
    setDeleting(true);
    try {
      await api.projects.remove(id!);
      toast.info("Project deleted.");
      navigate("/");
    } catch {
      toast.error("Could not delete the project.");
      setDeleting(false);
    }
  };

  if (failed) {
    return (
      <EmptyState icon={BookX} title="Project not found" body="It may have been deleted, or the link is wrong.">
        <Link to="/" className={buttonStyles("soft")}>
          <ArrowLeft size={15} /> Back to library
        </Link>
      </EmptyState>
    );
  }

  if (!dto || !ws) {
    return (
      <div>
        <div className="h-4 w-24 animate-pulse rounded bg-paper2" />
        <div className="mt-4 h-44 animate-pulse rounded-2xl bg-paper2" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="h-72 animate-pulse rounded-2xl bg-paper2" />
          <div className="h-48 animate-pulse rounded-2xl bg-paper2" />
        </div>
      </div>
    );
  }

  const { project } = ws;
  const { data } = project;

  return (
    <div className="animate-fade-up">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Library
      </Link>

      <Cover
        paletteId={data.palette}
        seed={data.id}
        className="mt-4 rounded-2xl shadow-lg shadow-ink/10 ring-1 ring-black/10"
        contentClassName="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
            {project.category}
            {!project.isActive && (
              <span className="rounded-full bg-black/25 px-2 py-0.5 normal-case tracking-normal">
                {data.status === "paused" ? "Paused" : "Completed"}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-start gap-3.5">
            <span className="text-4xl leading-none drop-shadow">{data.icon}</span>
            <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{project.title}</h1>
          </div>
          {data.description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-85">{data.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-5 sm:flex-col sm:gap-3">
          <ProgressRing value={ws.board.progress} size={72} />
          <p className="text-xs font-medium opacity-85 sm:text-center">
            {ws.board.doneCount}/{ws.board.total} tasks · {ws.notes.length} notes
          </p>
        </div>
      </Cover>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          Updated {timeAgo(data.updatedAt)} · created {timeAgo(data.createdAt)}
        </p>
        <div className="flex gap-2">
          <Button variant="soft" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo size={16} className="text-ink-soft" />
              <h2 className="font-display text-lg font-semibold text-ink">Plan</h2>
            </div>
            <span className="text-xs font-semibold text-ink-soft">{ws.board.progress}%</span>
          </div>
          <div className="mt-4">
            <TaskList board={ws.board} onAdd={addTask} onUpdate={updateTask} onDelete={deleteTask} />
          </div>
        </section>

        <NotesPanel notes={ws.notes} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} />
      </div>

      <ProjectModal
        open={editOpen}
        initial={dto.project}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void deleteProject()}
        busy={deleting}
        title="Delete this project?"
        body={`“${project.title}” with its ${ws.board.total} tasks and ${ws.notes.length} notes will be permanently removed.`}
        confirmLabel="Delete project"
      />
    </div>
  );
}