/**
 * AI providers for the agentic chat — one interface, two transports:
 *
 *  - Anthropic: the Messages API called directly (native tool use).
 *  - OpenCode:  a wrapper around a locally running `opencode serve`.
 *    The connection is configured entirely through environment variables
 *    (`OPENCODE_SERVER_URL`, `OPENCODE_PASSWORD`, optional `OPENCODE_MODEL`),
 *    so the chat can use whatever models the local opencode install has
 *    authenticated. The server speaks HTTP Basic — username `opencode`,
 *    password from the env var — and only accepts known origins
 *    (localhost, tauri://localhost, …), so it works from the desktop app.
 *
 *    The v2 HTTP API is used (`/api/session`, `/api/session/:id/prompt`,
 *    `/api/experimental/session/:id/wait`). Older servers are rejected with
 *    an upgrade hint rather than silently returning the web UI as JSON.
 *
 * Providers never touch the app database; `lib/ai/agent.ts` owns the tools.
 */

// ------------------------------------------------------------------ contract

export interface AgentToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Provider-agnostic conversation. Both transports map this to their wire format. */
export type ChatTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: AgentToolCall[] }
  | { role: "toolResult"; callId: string; name: string; content: string };

export interface ProviderRequest {
  system: string;
  turns: ChatTurn[];
  tools: AgentToolSpec[];
  /** Optional model override (OpenCode only); `providerID/modelID`. */
  model?: string | null;
}

export interface OpenCodeModel {
  /** Combined `providerID/modelID` (or `providerID/id`) identifier. */
  id: string;
  providerID: string;
  modelID: string;
  name: string;
  enabled: boolean;
}

export interface ProviderReply {
  content: string;
  toolCalls: AgentToolCall[];
}

export interface ChatProvider {
  readonly id: "anthropic" | "opencode";
  readonly label: string;
  /** Env var hint shown in the UI. */
  readonly hint: string;
  complete(request: ProviderRequest): Promise<ProviderReply>;
  /** OpenCode only: list models the server can use. */
  listModels?(): Promise<OpenCodeModel[]>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

// ---------------------------------------------------------------------- env

export interface AiEnv {
  anthropicKey: string | null;
  anthropicModel: string;
  opencodeUrl: string | null;
  opencodePassword: string | null;
  opencodeModel: string | null;
}

export function readAiEnv(): AiEnv {
  const env = import.meta.env;
  return {
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    opencodeUrl: env.OPENCODE_SERVER_URL?.trim().replace(/\/+$/, "") || null,
    opencodePassword: env.OPENCODE_PASSWORD || env.OPENCODE_SERVER_PASSWORD || null,
    opencodeModel: env.OPENCODE_MODEL?.trim() || null,
  };
}

/** Providers configured by the current environment, best experience first. */
export function providersFromEnv(env: AiEnv = readAiEnv()): ChatProvider[] {
  const out: ChatProvider[] = [];
  if (env.anthropicKey) out.push(new AnthropicProvider(env));
  if (env.opencodeUrl) out.push(new OpenCodeProvider(env));
  return out;
}

// ----------------------------------------------------------------- anthropic

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

class AnthropicProvider implements ChatProvider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";
  readonly hint = "ANTHROPIC_API_KEY";

  constructor(private readonly env: AiEnv) {}

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": this.env.anthropicKey!,
      "anthropic-version": "2023-06-01",
      // Required for browser-side calls; the key never leaves this machine.
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const body: Record<string, unknown> = {
      model: this.env.anthropicModel,
      max_tokens: 8192,
      system: request.system,
      messages: toAnthropicMessages(request.turns),
    };
    if (request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      throw new ProviderError("Could not reach api.anthropic.com — check your network connection.");
    }
    if (!res.ok) throw new ProviderError(await errorText(res, "Anthropic"));

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    };
    const content = data.content ?? [];
    return {
      content: content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      toolCalls: content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id ?? `tu_${Math.random().toString(36).slice(2)}`, name: b.name ?? "", input: b.input ?? {} })),
    };
  }
}

type AnthropicMessage = { role: "user" | "assistant"; content: unknown[] };

function toAnthropicMessages(turns: ChatTurn[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  let pendingToolResults = false;
  for (const turn of turns) {
    if (turn.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: turn.content }] });
      pendingToolResults = false;
    } else if (turn.role === "assistant") {
      const content: unknown[] = [];
      if (turn.content) content.push({ type: "text", text: turn.content });
      for (const call of turn.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      out.push({ role: "assistant", content });
      pendingToolResults = false;
    } else {
      const block = { type: "tool_result", tool_use_id: turn.callId, content: turn.content };
      if (pendingToolResults) {
        (out[out.length - 1].content as unknown[]).push(block);
      } else {
        out.push({ role: "user", content: [block] });
        pendingToolResults = true;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ opencode

/**
 * The reply contract we force on the OpenCode session. The v2 API has no
 * structured-output parameter, so the protocol is textual and `parseReply`
 * is deliberately forgiving.
 */
const OPENCODE_PROTOCOL = [
  "You have no built-in tools in this session — the host application runs any tool calls you request.",
  "Reply with ONLY a single JSON object, no markdown fences and no other text:",
  '{"reply": string, "tool_calls": [{"name": string, "input": object}]}',
  '- "reply" is your message to the user (use "" when you are calling tools).',
  '- "tool_calls" is [] when you only want to reply.',
].join("\n");

const OPENCODE_REQUEST_TIMEOUT_MS = 30_000;
/** A slow local model may need minutes; the UI stays busy while it works. */
const OPENCODE_WAIT_TIMEOUT_MS = 180_000;

interface OpenCodeSessionResponse {
  data?: { id?: string };
  /** Older v2 builds returned the session at the top level. */
  id?: string;
}

interface OpenCodeFailure {
  message?: string;
  type?: string;
  status?: number;
  retryAfterMs?: number;
}

interface OpenCodePart {
  type?: string;
  text?: string;
}

interface OpenCodeMessage {
  type?: string;
  text?: string;
  content?: OpenCodePart[];
  error?: OpenCodeFailure;
  outcome?: string;
  finish?: string;
}

class OpenCodeProvider implements ChatProvider {
  readonly id = "opencode" as const;
  readonly label = "OpenCode";
  readonly hint = "OPENCODE_SERVER_URL · OPENCODE_PASSWORD · OPENCODE_MODEL";

  private readonly baseUrl: string;

  constructor(private readonly env: AiEnv) {
    this.baseUrl = env.opencodeUrl ?? "";
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    // HTTP Basic against `opencode serve`: fixed username, env-var password.
    if (this.env.opencodePassword) {
      headers.authorization = `Basic ${btoa(`opencode:${this.env.opencodePassword}`)}`;
    }
    return headers;
  }

  /**
   * One request with a hard timeout and a useful error. The OpenCode v2 API
   * returns `{ data: … }` envelopes and `204` for the wait endpoint.
   */
  private async req<T>(path: string, init: RequestInit = {}, timeoutMs = OPENCODE_REQUEST_TIMEOUT_MS): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: { ...this.headers(), ...(init.headers ?? {}) },
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new ProviderError(`OpenCode did not answer within ${Math.round(timeoutMs / 1000)}s.`);
        }
        throw new ProviderError(
          `Could not reach the OpenCode server at ${this.baseUrl} — is \`opencode serve\` running?`,
        );
      }
      if (!res.ok) throw new ProviderError(await errorText(res, "OpenCode"));
      if (res.status === 204) return undefined as T;
      try {
        return (await res.json()) as T;
      } catch {
        throw new ProviderError(
          "OpenCode returned a non-JSON response — check that OPENCODE_SERVER_URL points at `opencode serve`.",
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    // Each turn is a short-lived session: create → prompt → wait → read → delete.
    const sessionId = await this.createSession(request.model ?? this.env.opencodeModel);
    try {
      await this.req(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
        method: "POST",
        body: JSON.stringify({ text: renderConversation(request) }),
      });
      await this.req(
        `/api/experimental/session/${encodeURIComponent(sessionId)}/wait`,
        { method: "POST" },
        OPENCODE_WAIT_TIMEOUT_MS,
      );
      const messages = await this.readMessages(sessionId);
      return replyFromMessages(messages);
    } finally {
      this.deleteSession(sessionId);
    }
  }

  /** Models the connected OpenCode server can use. */
  async listModels(): Promise<OpenCodeModel[]> {
    const res = await this.req<{ data?: Array<Record<string, unknown>> }>("/api/model");
    const rows = res.data ?? [];
    const out: OpenCodeModel[] = [];
    for (const row of rows) {
      const providerID = String(row.providerID ?? "");
      const modelID = String(row.modelID ?? row.id ?? "");
      if (!providerID || !modelID) continue;
      const enabled = row.enabled !== false && row.status !== "disabled";
      out.push({
        id: `${providerID}/${modelID}`,
        providerID,
        modelID,
        name: String(row.name ?? modelID),
        enabled,
      });
    }
    // Prefer enabled models; keep the list stable.
    return out.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }

  private async createSession(modelValue: string | null = null): Promise<string> {
    const body: Record<string, unknown> = {
      title: "Stacks Agent",
      // This chat must act only through the host app's Stacks tools. Deny the
      // server-side agent every built-in tool so it cannot touch the machine.
      permissions: [{ action: "*", resource: "*", effect: "deny" }],
    };
    const model = parseModel(modelValue ?? this.env.opencodeModel);
    if (model) body.model = model;

    try {
      const created = await this.req<OpenCodeSessionResponse>("/api/session", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const id = created.data?.id ?? created.id;
      if (!id) throw new ProviderError("OpenCode did not return a session id.");
      return id;
    } catch (e) {
      if (e instanceof ProviderError && /\((404|405)\)/.test(e.message)) {
        throw new ProviderError(
          "This OpenCode server does not expose the v2 API. Update OpenCode (`opencode upgrade`) and restart `opencode serve`.",
        );
      }
      throw e;
    }
  }

  private async readMessages(sessionId: string): Promise<OpenCodeMessage[]> {
    const res = await this.req<{ data?: OpenCodeMessage[] }>(
      `/api/session/${encodeURIComponent(sessionId)}/message`,
    );
    return res.data ?? [];
  }

  private deleteSession(sessionId: string): void {
    // Leave no session litter behind; ignore cleanup failures.
    void fetch(`${this.baseUrl}/api/session/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: this.headers(),
    }).catch(() => {});
  }
}

function renderConversation(request: ProviderRequest): string {
  return [
    request.system,
    "",
    OPENCODE_PROTOCOL,
    "",
    "Conversation so far (JSON):",
    JSON.stringify(request.turns),
    "",
    "Available tools (JSON):",
    JSON.stringify(request.tools),
    "",
    "Choose tool_calls from the available tools (or []), then write your reply.",
  ].join("\n");
}

function parseModel(value: string | null): { providerID: string; id: string } | null {
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) };
}

function replyFromMessages(messages: OpenCodeMessage[]): ProviderReply {
  const idle = [...messages].reverse().find((m) => m.type === "idle");
  if (idle?.outcome === "failed") throw new ProviderError(openCodeFailure(idle.error));

  const assistants = messages.filter((m) => m.type === "assistant");
  const last = assistants[assistants.length - 1];
  if (last?.error) throw new ProviderError(openCodeFailure(last.error));

  const assistant = [...assistants]
    .reverse()
    .find((m) => (m.content ?? []).some((p) => p.type === "text" && p.text));
  if (!assistant) throw new ProviderError("OpenCode finished without an assistant reply.");

  const text = (assistant.content ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
  return parseReply(text);
}

function openCodeFailure(error?: OpenCodeFailure): string {
  if (!error) return "OpenCode could not complete the request.";
  const message = error.message?.trim() || error.type || "Unknown error";
  const sentence = message.endsWith(".") ? message : `${message}.`;
  const status = error.status ? ` (${error.status})` : "";
  const retry = error.retryAfterMs
    ? ` Retry in about ${Math.max(1, Math.ceil(error.retryAfterMs / 60_000))} min.`
    : "";
  const modelHint =
    error.type === "provider.free-limit" || error.status === 429
      ? " Set OPENCODE_MODEL to a model your OpenCode install can use."
      : "";
  return `OpenCode error${status}: ${sentence}${retry}${modelHint}`;
}

function parseReply(text: string): ProviderReply {
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const content = typeof record.reply === "string" ? record.reply : "";
    const rawCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
    const toolCalls: AgentToolCall[] = rawCalls
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof (c as Record<string, unknown>).name === "string")
      .map((c, i) => ({
        id: `oc_${Date.now().toString(36)}_${i}`,
        name: String(c.name),
        input: c.input && typeof c.input === "object" ? (c.input as Record<string, unknown>) : {},
      }));
    if (content || toolCalls.length > 0) return { content, toolCalls };
  }
  // The model ignored the protocol — show whatever it said instead of failing.
  return { content: text.trim() || "The model returned an empty response.", toolCalls: [] };
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

// -------------------------------------------------------------------- shared

async function errorText(res: Response, who: string): Promise<string> {
  try {
    const json = (await res.json()) as {
      error?: { message?: string; data?: { message?: string } };
      message?: string;
    };
    const message = json?.error?.message ?? json?.error?.data?.message ?? json?.message;
    if (message) return `${who} error (${res.status}): ${message}`;
  } catch {
    /* not JSON */
  }
  return `${who} error (${res.status}) ${res.statusText || ""}`.trim();
}
