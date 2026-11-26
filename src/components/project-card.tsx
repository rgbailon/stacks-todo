/**
 * ProjectCard — one book on the library shelf.
 * The cover carries identity (palette, pattern, icon, title, progress);
 * the caption below carries the numbers.
 */
"use client";

import { Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Cover } from "@/components/cover";
import { ProgressBar } from "@/components/ui";
import type { Project } from "@/lib/models";
import { cx, timeAgo } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = { paused: "Paused", completed: "Done" };

export function ProjectCard({
  project,
  onEdit,
  className,
}: {
  project: Project;
  onEdit?: (project: Project) => void;
  className?: string;
}) {
  const { data } = project;
  return (
    <Link to={`/projects/${project.id}`} className={cx("group block animate-fade-up", className)}>
      <Cover
        paletteId={data.palette}
        seed={data.id}
        className="aspect-[3/4] rounded-xl shadow-md shadow-ink/10 ring-1 ring-black/10 transition-all duration-200 group-hover:-translate-y-1.5 group-hover:shadow-xl group-hover:shadow-ink/20"
        contentClassName="flex h-full flex-col p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-75">{project.category}</span>
          {!project.isActive && (
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
              {STATUS_BADGE[data.status] ?? data.status}
            </span>
          )}
        </div>
        <span className="mt-3 text-3xl leading-none drop-shadow-sm">{data.icon}</span>
        <div className="mt-auto">
          <h3 className="font-display text-lg font-semibold leading-[1.22] line-clamp-3">{project.title}</h3>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <ProgressBar value={project.progress} trackClass="bg-white/20" barClass="bg-white/90" />
            </div>
            <span className="text-[10px] font-semibold opacity-80">
              {data.stats.done}/{data.stats.total}
            </span>
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            title="Edit project"
            aria-label="Edit project"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(project); }}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/25 text-white opacity-100 transition hover:bg-black/45 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Pencil size={13} />
          </button>
        )}
      </Cover>
      <div className="mt-2.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="truncate text-xs text-ink-soft">
          {data.stats.total} tasks · {data.stats.notes} notes
        </span>
        <span className="shrink-0 text-[11px] text-ink-soft/70">{timeAgo(data.updatedAt)}</span>
      </div>
    </Link>
  );
}