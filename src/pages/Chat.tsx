/**
 * Chat — the agentic sidekick. Pick a provider (Anthropic or a local
 * OpenCode server), ask for projects and tasks, watch the tool calls run.
 * Everything it creates lands in the same library the rest of the app reads.
 */
import { AlertCircle, Bot, RotateCcw, Send, Sparkles, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, EmptyState, Spinner, Textarea } from "@/components/ui";
import { runAgent, type AgentToolEvent } from "@/lib/ai/agent";
import { providersFromEnv, readAiEnv, type ChatProvider, type ChatTurn } from "@/lib/ai/providers";
import { toast } from "@/lib/toast";

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; ok: boolean; summary: string }
  | { kind: "error"; text: string };

const SUGGESTIONS = [
  "Plan a project: “Home lab refresh” with 5 tasks",
  "What projects are on my shelf right now?",
  "Turn “learn watercolor” into a project with small steps",
];

const toolLabel = (name: string) => name.replace(/_/g, " ");

export default function ChatPage() {
  const env = useMemo(() => readAiEnv(), []);
  const providers = useMemo(() => providersFromEnv(env), [env]);
  const [providerId, setProviderId] = useState(() => providers[0]?.id ?? "");
  const provider: ChatProvider | null = providers.find((p) => p.id === providerId) ?? providers[0] ?? null;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const turnsRef = useRef<ChatTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !provider) return;
    setInput("");
    setEntries((prev) => [...prev, { kind: "user", text }]);
    setBusy(true);
    try {
      const result = await runAgent({
        provider,
        history: turnsRef.current,
        userText: text,
        onTool: (event: AgentToolEvent) =>
          setEntries((prev) => [...prev, { kind: "tool", name: event.name, ok: event.ok, summary: event.summary }]),
      });
      // Commit partial progress too, so a retry never re-runs finished tools.
      turnsRef.current = result.turns;
      if (result.error) {
        setEntries((prev) => [...prev, { kind: "error", text: result.error! }]);
      } else if (result.reply) {
        setEntries((prev) => [...prev, { kind: "assistant", text: result.reply }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (busy) return;
    turnsRef.current = [];
    setEntries([]);
  };

  // ---------------------------------------------------------------- no provider
  if (providers.length === 0 || !provider) {
    return (
      <div className="animate-fade-up">
        <header>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Chat</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            An AI that can build your library — projects, tasks, and thinking out loud.
          </p>
        </header>
        <div className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-6">
          <EmptyState
            icon={Bot}
            title="Connect an AI to start chatting"
            body="Stacks talks to either Anthropic directly or your local OpenCode server. Configure one of them below and restart the dev server."
          >
            <div className="mt-4 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-2">
              <SetupCard
                title="Anthropic"
                lines={["ANTHROPIC_API_KEY=sk-ant-…", "# optional: ANTHROPIC_MODEL=claude-sonnet-4-5"]}
                note="Create a key at console.anthropic.com, put it in .env, restart."
              />
              <SetupCard
                title="OpenCode (local)"
                lines={[
                  "# 1. run the server:  opencode serve",
                  "OPENCODE_SERVER_URL=http://127.0.0.1:4096",
                  "OPENCODE_PASSWORD=…",
                  "# optional: OPENCODE_MODEL=anthropic/claude-sonnet-4-5",
                ]}
                note="Point at the URL opencode prints; the password is sent as HTTP Basic (user “opencode”). Restart after saving .env."
              />
            </div>
          </EmptyState>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- chat
  return (
    <div className="animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Chat</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Ask for projects and tasks — you&apos;ll see every tool call as it runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 1 &&
            providers.map((p) => (
              <Chip
                key={p.id}
                active={p.id === provider.id}
                title={`Uses ${p.hint}`}
                onClick={() => setProviderId(p.id)}
              >
                {p.label}
              </Chip>
            ))}
          {providers.length === 1 && (
            <span className="hidden text-[11px] text-ink-soft/70 sm:block" title={`Uses ${provider.hint}`}>
              via {provider.label}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy || entries.length === 0}>
            <RotateCcw size={13} /> New chat
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="mt-6 flex h-[min(62vh,640px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-paper2/40 p-4"
      >
        {entries.length === 0 ? (
          <div className="m-auto max-w-lg text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-card text-ink-soft ring-1 ring-line">
              <Sparkles size={20} />
            </div>
            <p className="mt-3 font-display text-lg font-semibold text-ink">What should we build?</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              I can draft a project, break it into small tasks, or answer what&apos;s already on your shelf.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-left text-sm text-ink-soft transition hover:border-ink/30 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          entries.map((entry, i) => <ChatEntry key={i} entry={entry} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 px-1 text-sm text-ink-soft">
            <Spinner className="size-4" />
            <span>{entries.some((e) => e.kind === "tool") ? "Working through it…" : "Thinking…"}</span>
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={`Ask ${provider.label} to create a project, add tasks, or just think…`}
          className="min-h-[56px] flex-1 resize-none"
        />
        <Button variant="accent" type="submit" disabled={busy || !input.trim()} className="mb-0.5 h-10">
          {busy ? <Spinner /> : <Send size={15} />} Send
        </Button>
      </form>
      <p className="mt-2 text-right text-[11px] text-ink-soft/70">⌘/Ctrl + Enter to send</p>
    </div>
  );
}

function SetupCard({ title, lines, note }: { title: string; lines: string[]; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{title}</p>
      <div className="mt-2 space-y-1">
        {lines.map((line) => (
          <code
            key={line}
            className={`block rounded px-2 py-1 font-mono text-[11px] ${
              line.startsWith("#") ? "text-ink-soft/70" : "bg-paper2 text-ink"
            }`}
          >
            {line}
          </code>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{note}</p>
    </div>
  );
}

function ChatEntry({ entry }: { entry: Entry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-paper">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-card px-4 py-2.5 text-sm leading-relaxed text-ink">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "tool") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/70 px-3 py-2 text-xs">
        <Wrench size={13} className={entry.ok ? "shrink-0 text-moss" : "shrink-0 text-[#A93B2A]"} />
        <span className="shrink-0 font-semibold uppercase tracking-wide text-ink">{toolLabel(entry.name)}</span>
        <span className={`truncate ${entry.ok ? "text-ink-soft" : "text-[#A93B2A]"}`}>{entry.summary}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#A93B2A]/30 bg-[#A93B2A]/[0.06] px-3 py-2.5 text-xs text-[#8C2F21]">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="leading-relaxed">{entry.text}</span>
    </div>
  );
}
