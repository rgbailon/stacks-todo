/**
 * ProjectModal — create or edit a project, with a live cover preview.
 * Used by the Library (new/edit) and the Inbox (promote an idea).
 */
"use client";

import { useEffect, useState } from "react";
import { Cover } from "@/components/cover";
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { PALETTES } from "@/lib/palettes";
import { api } from "@/lib/services";
import { toast } from "@/lib/toast";
import {
  CATEGORIES,
  PROJECT_ICONS,
  PROJECT_STATUSES,
  type CategoryId,
  type ProjectDTO,
  type ProjectStatus,
} from "@/lib/types";
import { cx } from "@/lib/utils";

export interface ProjectPrefill {
  title: string;
  description?: string;
  category?: CategoryId;
}

const FORM_ID = "project-form";

export function ProjectModal({
  open,
  onClose,
  initial = null,
  prefill = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ProjectDTO | null;
  prefill?: ProjectPrefill | null;
  onSaved: (project: ProjectDTO, created: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("development");
  const [palette, setPalette] = useState(PALETTES[0].id);
  const [icon, setIcon] = useState<string>("🚀");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);
    if (initial) {
      setTitle(initial.title);
      setDescription(initial.description);
      setCategory(initial.category);
      setPalette(initial.palette);
      setIcon(initial.icon);
      setStatus(initial.status);
    } else {
      const cat = prefill?.category ?? "development";
      setTitle(prefill?.title ?? "");
      setDescription(prefill?.description ?? "");
      setCategory(cat);
      setPalette(PALETTES[Math.floor(Math.random() * PALETTES.length)].id);
      setIcon(CATEGORIES.find((c) => c.id === cat)?.emoji ?? "🚀");
      setStatus("active");
    }
  }, [open, initial, prefill]);

  const pickCategory = (next: CategoryId) => {
    const prevEmoji = CATEGORIES.find((c) => c.id === category)?.emoji;
    setCategory(next);
    // Keep a custom icon; swap only the untouched default.
    if (icon === prevEmoji) setIcon(CATEGORIES.find((c) => c.id === next)?.emoji ?? icon);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError("Give this project a title first."); return; }
    setSaving(true);
    setError("");
    try {
      const input = { title: trimmed, description: description.trim(), category, palette, icon, status };
      const saved = initial
        ? await api.projects.update(initial.id, input)
        : await api.projects.create(input);
      toast.success(initial ? "Project updated." : "Added to your library.");
      onSaved(saved, !initial);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the project.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit project" : "New project"}
      size="lg"
      footer={
        <>
          {error && <span className="mr-auto text-xs text-[#A93B2A]">{error}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" type="submit" form={FORM_ID} disabled={saving}>
            {saving ? <Spinner /> : initial ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="grid gap-6 sm:grid-cols-[1fr_150px]"
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ship the billing API"
              maxLength={120}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this about? What does done look like?"
              maxLength={2000}
            />
          </Field>
          <div className={cx("grid gap-3", initial && "grid-cols-2")}>
            <Field label="Category">
              <Select value={category} onChange={(e) => pickCategory(e.target.value as CategoryId)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </Select>
            </Field>
            {initial && (
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Cover color">
            <div className="flex flex-wrap gap-2 pt-0.5">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  aria-label={`${p.name} cover`}
                  onClick={() => setPalette(p.id)}
                  className={cx(
                    "size-7 rounded-full ring-offset-2 ring-offset-paper transition-transform",
                    palette === p.id ? "scale-110 ring-2 ring-ink" : "hover:scale-110",
                  )}
                  style={{ background: `linear-gradient(160deg, ${p.base}, ${p.deep})` }}
                />
              ))}
            </div>
          </Field>
          <Field label="Icon">
            <div className="grid grid-cols-9 gap-1">
              {PROJECT_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={cx(
                    "grid place-items-center rounded-md p-1.5 text-base leading-none transition",
                    icon === emoji ? "bg-ink/10 ring-1 ring-ink/40" : "hover:bg-ink/5",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Live preview */}
        <div className="hidden sm:block">
          <Cover
            paletteId={palette}
            seed={initial?.id ?? palette}
            className="aspect-[3/4] rounded-lg shadow-md ring-1 ring-black/10"
            contentClassName="flex h-full flex-col p-3"
          >
            <span className="text-[8px] font-bold uppercase tracking-[0.16em] opacity-75">
              {CATEGORIES.find((c) => c.id === category)?.label}
            </span>
            <span className="mt-2 text-2xl leading-none">{icon}</span>
            <span className="mt-auto font-display text-sm font-semibold leading-snug line-clamp-4">
              {title.trim() || "Untitled project"}
            </span>
          </Cover>
          <p className="mt-2 text-center text-[10px] text-ink-soft/70">How it sits on your shelf</p>
        </div>
      </form>
    </Modal>
  );
}