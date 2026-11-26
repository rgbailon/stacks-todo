/**
 * Notes — index cards beside the plan.
 * NotesPanel lists them; NoteEditor is a modal with Write/Preview tabs
 * and developer-friendly markdown (headings, checklists, code fences).
 */
"use client";

import { Pin, Plus, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Chip, IconButton, Input, Modal, Spinner, Textarea } from "@/components/ui";
import { Markdown } from "@/lib/markdown";
import type { Note } from "@/lib/models";
import type { NoteDTO, NoteInput } from "@/lib/types";
import { toast } from "@/lib/toast";
import { cx, timeAgo } from "@/lib/utils";

export function NotesPanel({
  notes,
  onCreate,
  onUpdate,
  onDelete,
}: {
  notes: Note[];
  onCreate: (input: NoteInput) => Promise<NoteDTO>;
  onUpdate: (id: string, patch: NoteInput) => Promise<NoteDTO>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<NoteDTO | "new" | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StickyNote size={16} className="text-ink-soft" />
          <h2 className="font-display text-lg font-semibold text-ink">Notes</h2>
          <span className="text-xs text-ink-soft">{notes.length}</span>
        </div>
        <Button variant="soft" size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} /> New note
        </Button>
      </div>

      <div className="mt-3 space-y-2.5">
        {notes.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-5 text-center">
            <p className="text-sm leading-relaxed text-ink-soft">
              Decisions, snippets, links — keep them next to the work.
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditing("new")}>
              <Plus size={14} /> Write the first note
            </Button>
          </div>
        )}
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => setEditing(note.data)}
            className="block w-full rounded-xl border border-line bg-card p-3.5 text-left transition hover:border-ink/30 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{note.title}</h3>
              {note.pinned && <Pin size={12} className="shrink-0 text-ember" />}
            </div>
            {note.isEmpty ? (
              <p className="mt-1 text-xs italic text-ink-soft/60">Empty note</p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-ink-soft line-clamp-2">{note.excerpt}</p>
            )}
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-ink-soft/60">
              {timeAgo(note.data.updatedAt)}
            </p>
          </button>
        ))}
      </div>

      {editing !== null && (
        <NoteEditor
          key={editing === "new" ? "new" : editing.id}
          note={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

function NoteEditor({
  note,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  note: NoteDTO | null;
  onClose: () => void;
  onCreate: (input: NoteInput) => Promise<NoteDTO>;
  onUpdate: (id: string, patch: NoteInput) => Promise<NoteDTO>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (!deleteArmed) return;
    const t = setTimeout(() => setDeleteArmed(false), 2600);
    return () => clearTimeout(t);
  }, [deleteArmed]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const input: NoteInput = { title: title.trim() || "Untitled note", content, pinned };
      if (note) await onUpdate(note.id, input);
      else await onCreate(input);
      onClose();
    } catch {
      toast.error("Could not save the note — your draft is still here.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!note) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    try {
      await onDelete(note.id);
      onClose();
    } catch {
      toast.error("Could not delete the note.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={note ? "Edit note" : "New note"}
      size="lg"
      footer={
        <>
          {note && (
            <Button variant="danger" className="mr-auto" onClick={() => void remove()}>
              {deleteArmed ? "Click again to delete" : "Delete"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : "Save note"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus={!note}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          maxLength={160}
          className="flex-1 font-medium"
        />
        <IconButton
          label={pinned ? "Unpin note" : "Pin note"}
          onClick={() => setPinned((v) => !v)}
          className={cx("size-9 rounded-lg border border-line", pinned && "border-ember/40 bg-ember/10 text-ember")}
        >
          <Pin size={15} />
        </IconButton>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Chip active={tab === "write"} onClick={() => setTab("write")}>Write</Chip>
        <Chip active={tab === "preview"} onClick={() => setTab("preview")}>Preview</Chip>
        <span className="ml-auto hidden text-[10px] text-ink-soft/70 sm:block">⌘/Ctrl + Enter to save</span>
      </div>

      {tab === "write" ? (
        <>
          <Textarea
            autoFocus={Boolean(note)}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void save(); }
            }}
            rows={12}
            placeholder={"# A decision worth keeping\n\n**bold** · *italic* · `inline code`\n- [ ] a checklist\n- a list\n\n```ts\nconst answer = 42;\n```"}
            className="mt-3 min-h-[280px] font-mono text-[13px]"
          />
          <p className="mt-2 text-[11px] text-ink-soft/70">
            Markdown: # heading · **bold** · `code` · - list · - [ ] todo · ``` code fence · &gt; quote
          </p>
        </>
      ) : (
        <div className="mt-3 min-h-[280px] rounded-lg border border-line bg-white/50 p-4">
          {content.trim()
            ? <Markdown text={content} />
            : <p className="text-sm italic text-ink-soft/60">Nothing to preview yet.</p>}
        </div>
      )}
    </Modal>
  );
}