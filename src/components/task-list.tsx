/**
 * TaskList — the plan inside a project.
 * Groups come from TaskBoard (domain logic); this file only renders them:
 *   NOW (in motion) → UP NEXT (the one next step) → LATER → DONE.
 */
"use client";

import { ArrowUp, Check, ChevronRight, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, IconButton, Input, SectionLabel } from "@/components/ui";
import type { Task, TaskBoard } from "@/lib/models";
import type { TaskPatch } from "@/lib/types";
import { cx } from "@/lib/utils";

export function TaskList({
  board,
  onAdd,
  onUpdate,
  onDelete,
}: {
  board: TaskBoard;
  onAdd: (title: string) => Promise<void>;
  onUpdate: (task: Task, patch: TaskPatch) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const add = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await onAdd(title);
      setNewTitle("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add the next small step…"
          maxLength={300}
          className="flex-1"
        />
        <Button variant="accent" type="submit" disabled={adding || !newTitle.trim()}>
          <Plus size={15} />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </form>

      <div className="mt-5 space-y-5">
        {board.isEmpty && (
          <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
            No tasks yet. Write the very next step above — small is good.
          </div>
        )}

        {board.now.length > 0 && (
          <Group label={
            <span className="flex items-center gap-1.5 text-ember-deep">
              <span className="animate-soft-pulse size-1.5 rounded-full bg-ember" />
              Now
            </span>
          }>
            {board.now.map((t) => (
              <TaskRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </Group>
        )}

        {board.next && (
          <Group label="Up next">
            <TaskRow task={board.next} isNext onUpdate={onUpdate} onDelete={onDelete} />
          </Group>
        )}

        {board.later.length > 0 && (
          <Group label={`Later · ${board.later.length}`}>
            {board.later.map((t) => (
              <TaskRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </Group>
        )}

        {board.doneCount > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:text-ink"
            >
              <ChevronRight size={13} className={cx("transition-transform", showDone && "rotate-90")} />
              Done · {board.doneCount}
            </button>
            {showDone && (
              <div className="mt-1.5 space-y-0.5">
                {board.done.map((t) => (
                  <TaskRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

function TaskRow({
  task,
  isNext = false,
  onUpdate,
  onDelete,
}: {
  task: Task;
  isNext?: boolean;
  onUpdate: (task: Task, patch: TaskPatch) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [busy, setBusy] = useState(false);

  const run = async (patch: TaskPatch) => {
    setBusy(true);
    try { await onUpdate(task, patch); } finally { setBusy(false); }
  };

  const startEdit = () => { setDraft(task.title); setEditing(true); };
  const saveEdit = async () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== task.title) await run({ title });
  };

  return (
    <div
      className={cx(
        "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink/[0.03]",
        isNext && "bg-ember/[0.05] ring-1 ring-ember/15",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <button
        type="button"
        title={task.isDone ? "Reopen task" : "Mark done"}
        aria-label={task.isDone ? "Reopen task" : "Mark done"}
        onClick={() => void run({ status: task.isDone ? "todo" : "done" })}
        className={cx(
          "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          task.isDone
            ? "border-moss bg-moss text-white"
            : task.isDoing
              ? "border-ember hover:border-moss"
              : "border-ink/25 hover:border-moss",
        )}
      >
        {task.isDone && <Check size={11} strokeWidth={3.5} />}
        {task.isDoing && <span className="animate-soft-pulse size-2 rounded-full bg-ember" />}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void saveEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 py-1 text-sm"
            maxLength={300}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={startEdit}
            title="Double-click to edit"
            className={cx(
              "block w-full truncate text-left text-sm",
              task.isDone ? "text-ink-soft line-through" : "text-ink",
              task.isDoing && "font-medium",
            )}
          >
            {task.title}
          </button>
        )}
      </div>

      {task.isDoing && (
        <span className="shrink-0 rounded bg-ember/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ember-deep">
          Doing
        </span>
      )}
      {isNext && (
        <span className="shrink-0 rounded bg-ink/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
          Next
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {task.isTodo && !isNext && (
          <IconButton label="Do this next" onClick={() => void run({ makeNext: true })}>
            <ArrowUp size={13} />
          </IconButton>
        )}
        {task.isTodo && (
          <IconButton label="Start now" onClick={() => void run({ status: "doing" })}>
            <Play size={13} />
          </IconButton>
        )}
        {task.isDoing && (
          <IconButton label="Pause" onClick={() => void run({ status: "todo" })}>
            <Pause size={13} />
          </IconButton>
        )}
        {!task.isDone && (
          <IconButton label="Edit task" onClick={startEdit}>
            <Pencil size={12} />
          </IconButton>
        )}
        <IconButton
          label="Delete task"
          onClick={() => void onDelete(task)}
          className="hover:bg-[#A93B2A]/10 hover:text-[#A93B2A]"
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}