/**
 * PromptLibrary — the UI for creating prompts inside the app.
 * A modal with two views: the list (use / edit / delete) and an editor.
 * Data lives in `promptStore`; "Use" hands the body back to the chat.
 */
"use client";

import { Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { Button, IconButton, Modal, Spinner, Textarea, Input } from "@/components/ui";
import { promptStore, type SavedPrompt } from "@/lib/prompts";
import { toast } from "@/lib/toast";
import { cx, timeAgo } from "@/lib/utils";

const MAX_BODY = 10000;

export function PromptLibrary({
  open,
  onClose,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (body: string) => void;
}) {
  const prompts = useSyncExternalStore(promptStore.subscribe, promptStore.getSnapshot, promptStore.getSnapshot);
  const sorted = useMemo(
    () => [...prompts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [prompts],
  );

  const [view, setView] = useState<"list" | "editor">("list");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setView("list");
      setDraftId(null);
      setArmedId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!armedId) return;
    const t = setTimeout(() => setArmedId(null), 2600);
    return () => clearTimeout(t);
  }, [armedId]);

  const startCreate = () => {
    setDraftId(null);
    setTitle("");
    setBody("");
    setView("editor");
  };

  const startEdit = (prompt: SavedPrompt) => {
    setDraftId(prompt.id);
    setTitle(prompt.title);
    setBody(prompt.body);
    setView("editor");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (draftId) promptStore.update(draftId, { title, body });
      else promptStore.create({ title, body });
      toast.success("Prompt saved.");
      setView("list");
    } finally {
      setSaving(false);
    }
  };

  const remove = (prompt: SavedPrompt) => {
    if (armedId !== prompt.id) {
      setArmedId(prompt.id);
      return;
    }
    promptStore.remove(prompt.id);
    setArmedId(null);
    toast.info("Prompt deleted.");
  };

  const use = (prompt: SavedPrompt) => {
    onUse(prompt.body);
    onClose();
  };

  const footer =
    view === "editor" ? (
      <>
        <Button variant="ghost" onClick={() => setView("list")}>
          Cancel
        </Button>
        <Button variant="accent" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : "Save prompt"}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="accent" onClick={startCreate}>
          <Plus size={14} /> New prompt
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={view === "editor" ? (draftId ? "Edit prompt" : "New prompt") : "Prompt library"}
      size="lg"
      footer={footer}
    >
      {view === "list" ? (
        <div className="space-y-2.5">
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <StickyNote size={20} className="mx-auto text-ink-soft/60" />
              <p className="mt-2 text-sm font-medium text-ink">No saved prompts yet</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Save the instructions you reach for again — briefs, checklists, formats — then drop
                them into any chat.
              </p>
            </div>
          ) : (
            sorted.map((prompt) => (
              <div
                key={prompt.id}
                className="group rounded-xl border border-line bg-card p-3.5 transition hover:border-ink/30"
              >
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{prompt.title}</h3>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-soft/60">
                    {timeAgo(prompt.updatedAt)}
                  </span>
                </div>
                {prompt.body.trim() ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">{prompt.body}</p>
                ) : (
                  <p className="mt-1 text-xs italic text-ink-soft/60">Empty prompt</p>
                )}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Button variant="soft" size="sm" onClick={() => use(prompt)}>
                    Use
                  </Button>
                  <span className="flex-1" />
                  <IconButton label="Edit prompt" onClick={() => startEdit(prompt)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton
                    label={armedId === prompt.id ? "Click again to delete" : "Delete prompt"}
                    onClick={() => remove(prompt)}
                    className={cx(
                      "hover:bg-[#A93B2A]/10 hover:text-[#A93B2A]",
                      armedId === prompt.id && "bg-[#A93B2A]/10 text-[#A93B2A]",
                    )}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Title
            </span>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Project brief"
              maxLength={160}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Prompt
            </span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={MAX_BODY}
              placeholder={"Write the instruction you want to reuse…\n\nTip: leave a blank line where your own details go, then edit after inserting."}
              className="min-h-[220px] font-mono text-[13px]"
            />
            <span className="mt-1 block text-right text-[10px] text-ink-soft/60">
              {body.length}/{MAX_BODY}
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
