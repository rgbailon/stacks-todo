import { LibraryBig, Plus, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { ProjectModal } from "@/components/project-modal";
import { Button, Chip, EmptyState, Input, SectionLabel, Spinner } from "@/components/ui";
import { Project } from "@/lib/models";
import { api } from "@/lib/services";
import { toast } from "@/lib/toast";
import { CATEGORIES, type CategoryId, type ProjectDTO } from "@/lib/types";

export default function LibraryPage() {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | CategoryId>("all");
  const [modal, setModal] = useState<{ initial: ProjectDTO | null } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      setProjects(await api.projects.list());
    } catch {
      toast.error("Could not load your library.");
      setProjects([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const models = useMemo(() => (projects ?? []).map((p) => new Project(p)), [projects]);

  const recent = useMemo(
    () =>
      models
        .filter((p) => p.data.lastOpenedAt)
        .sort((a, b) => (b.data.lastOpenedAt ?? "").localeCompare(a.data.lastOpenedAt ?? ""))
        .slice(0, 6),
    [models],
  );

  const q = query.trim().toLowerCase();
  const filtered = models.filter(
    (p) =>
      (category === "all" || p.data.category === category) &&
      (!q || p.title.toLowerCase().includes(q) || p.data.description.toLowerCase().includes(q)),
  );

  const countFor = (id: CategoryId) => models.filter((p) => p.data.category === id).length;

  const loadExamples = async () => {
    setSeeding(true);
    try {
      const result = await api.system.seed();
      toast[result.seeded ? "success" : "info"](
        result.seeded ? "Example library loaded — make it yours." : "Your library already has projects.",
      );
      await load();
    } catch {
      toast.error("Could not load the example library.");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Library</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {projects === null
              ? "Loading your shelf…"
              : `${models.length} project${models.length === 1 ? "" : "s"} · everything you're building, in one place.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="pl-9 sm:w-56"
            />
          </div>
          <Button variant="accent" onClick={() => setModal({ initial: null })}>
            <Plus size={15} /> <span className="whitespace-nowrap">New project</span>
          </Button>
        </div>
      </header>

      {projects === null ? (
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-paper2" />
          ))}
        </div>
      ) : models.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title="Your library is empty"
          body="Start a project for anything you're building — code, a business plan, a wild idea. Everything lives on one shelf."
        >
          <Button variant="accent" onClick={() => setModal({ initial: null })}>
            <Plus size={15} /> New project
          </Button>
          <Button variant="soft" onClick={() => void loadExamples()} disabled={seeding}>
            {seeding ? <Spinner /> : <Sparkles size={15} />} Load example library
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="scroll-x mt-6 flex gap-2 overflow-x-auto pb-1">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              All · {models.length}
            </Chip>
            {CATEGORIES.filter((c) => countFor(c.id) > 0).map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.emoji} {c.label} · {countFor(c.id)}
              </Chip>
            ))}
          </div>

          {category === "all" && !q && recent.length > 0 && (
            <section className="mt-8">
              <SectionLabel>Pick up where you left off</SectionLabel>
              <div className="scroll-x mt-3 flex gap-4 overflow-x-auto pb-2 pt-1">
                {recent.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    className="w-36 shrink-0"
                    onEdit={(proj) => setModal({ initial: proj.data })}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <SectionLabel>
              {category === "all" ? "All projects" : CATEGORIES.find((c) => c.id === category)?.label}
              {q && ` · matching “${query.trim()}”`}
            </SectionLabel>
            {filtered.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-5 pt-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((p) => (
                  <ProjectCard key={p.id} project={p} onEdit={(proj) => setModal({ initial: proj.data })} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title="Nothing on this shelf"
                body="Try a different search or category."
              >
                <Button variant="ghost" onClick={() => { setQuery(""); setCategory("all"); }}>
                  Clear filters
                </Button>
              </EmptyState>
            )}
          </section>
        </>
      )}

      <ProjectModal
        open={modal !== null}
        initial={modal?.initial ?? null}
        onClose={() => setModal(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}