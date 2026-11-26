import { Feather, FolderPlus, Inbox, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectModal, type ProjectPrefill } from "@/components/project-modal";
import { Button, EmptyState, IconButton, Select, Spinner, Textarea } from "@/components/ui";
import { Idea } from "@/lib/models";
import { api } from "@/lib/services";
import { toast } from "@/lib/toast";
import type { IdeaDTO, ProjectDTO } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function InboxPage() {
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<IdeaDTO[] | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [text, setText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [promote, setPromote] = useState<Idea | null>(null);

  const load = useCallback(async () => {
    try {
      const [ideaRows, projectRows] = await Promise.all([api.ideas.list(), api.projects.list()]);
      setIdeas(ideaRows);
      setProjects(projectRows);
    } catch {
      toast.error("Could not load your inbox.");
      setIdeas([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const capture = async () => {
    const trimmed = text.trim();
    if (!trimmed || capturing) return;
    setCapturing(true);
    try {
      const created = await api.ideas.capture(trimmed);
      setIdeas((prev) => [created, ...(prev ?? [])]);
      setText("");
      toast.success("Idea captured.");
    } catch {
      toast.error("Could not capture the idea.");
    } finally {
      setCapturing(false);
    }
  };

  const discard = async (idea: Idea) => {
    try {
      await api.ideas.remove(idea.id);
      setIdeas((prev) => (prev ? prev.filter((i) => i.id !== idea.id) : prev));
      toast.info("Idea discarded.");
    } catch {
      toast.error("Could not discard the idea.");
    }
  };

  const send = async (idea: Idea, projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    try {
      await api.ideas.sendToProject(idea.id, projectId);
      setIdeas((prev) => (prev ? prev.filter((i) => i.id !== idea.id) : prev));
      toast.success(`Saved as a note in “${target?.title ?? "project"}”.`);
    } catch {
      toast.error("Could not move the idea.");
    }
  };

  const prefill = useMemo<ProjectPrefill | null>(
    () => (promote ? { title: promote.title, description: promote.detail, category: "idea" } : null),
    [promote],
  );

  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <header>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Inbox</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Catch ideas before they escape. Sort them when you're ready.
        </p>
      </header>

      <div className="mt-6 rounded-2xl border border-line bg-card p-4 shadow-sm">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void capture(); }
          }}
          rows={2}
          placeholder="What's on your mind? A feature, a bug, a business idea…"
          className="border-0 bg-transparent px-1 focus:ring-0"
          maxLength={5000}
        />
        <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-3">
          <span className="text-[11px] text-ink-soft/70">⌘/Ctrl + Enter to capture</span>
          <Button variant="accent" onClick={() => void capture()} disabled={capturing || !text.trim()}>
            {capturing ? <Spinner /> : <Feather size={15} />} Capture
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {ideas === null ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-paper2" />
          ))
        ) : ideas.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Inbox zero."
            body="Nothing waiting. Capture anything here first — it costs a second and saves your train of thought."
          />
        ) : (
          ideas.map((raw) => {
            const idea = new Idea(raw);
            return (
              <div key={idea.id} className="animate-fade-up rounded-xl border border-line bg-card p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{idea.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                  <span className="mr-auto text-[11px] text-ink-soft/70">{timeAgo(raw.createdAt)}</span>
                  <Button variant="soft" size="sm" onClick={() => setPromote(idea)}>
                    <FolderPlus size={13} /> New project
                  </Button>
                  <Select
                    value=""
                    onChange={(e) => { if (e.target.value) void send(idea, e.target.value); }}
                    className="h-8 w-auto max-w-44 py-0 text-xs"
                    disabled={activeProjects.length === 0}
                    title="Send to a project as a note"
                  >
                    <option value="" disabled>Send to project…</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.icon} {p.title}</option>
                    ))}
                  </Select>
                  <IconButton
                    label="Discard idea"
                    onClick={() => void discard(idea)}
                    className="hover:bg-[#A93B2A]/10 hover:text-[#A93B2A]"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ProjectModal
        open={promote !== null}
        prefill={prefill}
        onClose={() => setPromote(null)}
        onSaved={(project, created) => {
          const source = promote;
          if (!created || !source) return;
          void api.ideas.remove(source.id)
            .then(() => setIdeas((prev) => (prev ? prev.filter((i) => i.id !== source.id) : prev)))
            .catch(() => {});
          navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}