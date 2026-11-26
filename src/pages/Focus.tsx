import { ArrowUpRight, Check, Inbox, LibraryBig, Play, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Cover } from "@/components/cover";
import { Button, buttonStyles, EmptyState, SectionLabel } from "@/components/ui";
import { api } from "@/lib/services";
import { toast } from "@/lib/toast";
import type { FocusDTO, FocusTaskDTO, TaskPatch } from "@/lib/types";
import { cx, formatToday, quoteOfTheDay } from "@/lib/utils";

export default function FocusPage() {
  const [dto, setDto] = useState<FocusDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDto(await api.focus.get());
    } catch {
      toast.error("Could not load your focus list.");
      setDto({ doing: [], onDeck: [] });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (task: FocusTaskDTO, patch: TaskPatch) => {
    setBusyId(task.id);
    try {
      await api.tasks.update(task.id, patch);
      if (patch.status === "done") toast.success("Done. Momentum.");
      if (patch.status === "doing") toast.info("In motion — go make it happen.");
      await load();
    } catch {
      toast.error("Could not update the task.");
    } finally {
      setBusyId(null);
    }
  };

  const empty = dto !== null && dto.doing.length === 0 && dto.onDeck.length === 0;
  const quote = dto ? quoteOfTheDay() : null;

  return (
    <div className="animate-fade-up">
      <header>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Focus</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {dto === null ? "Finding your next step…" : `${formatToday()} · one thing at a time.`}
        </p>
      </header>

      {dto === null ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-paper2" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState
          icon={Target}
          title="All clear."
          body="Nothing in motion right now. Open a project and start its next task — or catch a new idea while it's fresh."
        >
          <Link to="/" className={buttonStyles("soft")}>
            <LibraryBig size={15} /> Open library
          </Link>
          <Link to="/inbox" className={buttonStyles("accent")}>
            <Inbox size={15} /> Capture an idea
          </Link>
        </EmptyState>
      ) : (
        <div className="mt-8 space-y-9">
          {dto.doing.length > 0 && (
            <section>
              <SectionLabel className="flex items-center gap-1.5 text-ember-deep">
                <span className="animate-soft-pulse size-1.5 rounded-full bg-ember" />
                In motion · {dto.doing.length}
              </SectionLabel>
              <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
                {dto.doing.map((t) => (
                  <FocusRow key={t.id} task={t} busy={busyId === t.id} onAct={act} />
                ))}
              </div>
            </section>
          )}

          {dto.onDeck.length > 0 && (
            <section>
              <SectionLabel>On deck · {dto.onDeck.length}</SectionLabel>
              <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
                {dto.onDeck.map((t) => (
                  <FocusRow key={t.id} task={t} busy={busyId === t.id} onAct={act} showStart />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {quote && (
        <blockquote className="mt-12 border-l-2 border-ember/60 pl-4">
          <p className="font-display text-base italic leading-relaxed text-ink-soft">“{quote.text}”</p>
          <footer className="mt-1 text-xs text-ink-soft/70">— {quote.by}</footer>
        </blockquote>
      )}
    </div>
  );
}

function FocusRow({
  task,
  busy,
  showStart = false,
  onAct,
}: {
  task: FocusTaskDTO;
  busy: boolean;
  showStart?: boolean;
  onAct: (task: FocusTaskDTO, patch: TaskPatch) => Promise<void>;
}) {
  const href = `/projects/${task.project.id}`;
  return (
    <div className={cx("flex items-center gap-3 p-3.5 sm:p-4", busy && "pointer-events-none opacity-60")}>
      <Cover
        paletteId={task.project.palette}
        seed={task.project.id}
        className="size-10 shrink-0 rounded-lg ring-1 ring-black/10"
        contentClassName="grid h-full place-items-center"
      >
        <span className="text-lg leading-none">{task.project.icon}</span>
      </Cover>
      <div className="min-w-0 flex-1">
        <Link to={href} className="block truncate text-sm font-medium text-ink transition-colors hover:text-ember-deep">
          {task.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-soft">{task.project.title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {showStart && (
          <Button variant="accent" size="sm" onClick={() => void onAct(task, { status: "doing" })}>
            <Play size={13} /> <span className="hidden sm:inline">Start</span>
          </Button>
        )}
        <Button variant="soft" size="sm" onClick={() => void onAct(task, { status: "done" })}>
          <Check size={13} /> <span className="hidden sm:inline">Done</span>
        </Button>
        <Link to={href} title="Open project" className={buttonStyles("ghost", "sm", "px-2")}>
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}