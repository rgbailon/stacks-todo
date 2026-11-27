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
    opencodePassword: env.OPENCODE_PASSWORD || null,
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
 * The reply contract we force on the OpenCode session through JSON-schema
 * structured output (with a prose fallback if the server ignores `format`).
 */
const REPLY_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Message for the user; may be empty when calling tools" },
    tool_calls: {
      type: "array",
      description: "Tools the host should run; empty when only replying",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          input: { type: "object" },
        },
        required: ["name", "input"],
      },
    },
  },
  required: ["reply", "tool_calls"],
  additionalProperties: false,
};

const OPENCODE_PROTOCOL = [
  "You have no built-in tools — the host application runs the tool calls you request.",
  "Reply with ONLY a single JSON object matching this schema, no markdown fences and no other text:",
  '{"reply": string, "tool_calls": [{"name": string, "input": object}]}',
  '- "reply" is your message to the user (use "" when you are calling tools).',
  '- "tool_calls" is [] when you only want to reply.',
].join("\n");

class OpenCodeProvider implements ChatProvider {
  readonly id = "opencode" as const;
  readonly label = "OpenCode";
  readonly hint = "OPENCODE_SERVER_URL · OPENCODE_PASSWORD";

  constructor(private readonly env: AiEnv) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    // HTTP Basic against `opencode serve`: fixed username, env-var password.
    if (this.env.opencodePassword) {
      headers.authorization = `Basic ${btoa(`opencode:${this.env.opencodePassword}`)}`;
    }
    return headers;
  }

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.env.opencodeUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...this.headers(), ...(init?.headers ?? {}) } });
    } catch {
      throw new ProviderError(
        `Could not reach the OpenCode server at ${this.env.opencodeUrl} — is \`opencode serve\` running?`,
      );
    }
    if (!res.ok) throw new ProviderError(await errorText(res, "OpenCode"));
    return res;
  }

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    // Each turn is a short-lived session: create → prompt → read → delete.
    const created = await this.req("/session", {
      method: "POST",
      body: JSON.stringify({ title: "Stacks Agent" }),
    }).then((r) => r.json()) as { id?: string };
    const sessionId = created.id;
    if (!sessionId) throw new ProviderError("OpenCode server did not return a session id.");

    try {
      const body: Record<string, unknown> = {
        system: `${request.system}\n\n${OPENCODE_PROTOCOL}`,
        parts: [{ type: "text", text: renderConversation(request.turns, request.tools) }],
        format: { type: "json_schema", schema: REPLY_SCHEMA },
      };

      // Best effort: switch off opencode's own coding tools — this chat must
      // only ever act through the host app's Stacks tools.
      const disabled = await this.listToolIds();
      if (disabled) body.tools = disabled;
      const model = parseModel(this.env.opencodeModel);
      if (model) body.model = model;

      const data = await this.req(`/session/${encodeURIComponent(sessionId)}/message`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()) as {
        info?: { error?: unknown };
        parts?: Array<{ type?: string; text?: string }>;
      };

      const failure = data.info?.error;
      if (failure) {
        // Observed shape: { name: "APIError", data: { message: "…" } } — but
        // keep the looser fallbacks for other server versions.
        const nested = (failure as { data?: { message?: string } })?.data?.message;
        const direct = (failure as { message?: string })?.message;
        throw new ProviderError(
          typeof failure === "string" ? failure : nested ?? direct ?? "The OpenCode session failed.",
        );
      }
      const text = (data.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      return parseReply(text);
    } finally {
      // Leave no session litter behind; ignore cleanup failures.
      fetch(`${this.env.opencodeUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: this.headers(),
      }).catch(() => {});
    }
  }

  /** `{ toolId: false }` map, or null when the server doesn't expose the list. */
  private async listToolIds(): Promise<Record<string, boolean> | null> {
    try {
      const json = await this.req("/experimental/tool/ids").then((r) => r.json());
      const ids = Array.isArray(json)
        ? json
        : Array.isArray((json as { ids?: unknown })?.ids)
          ? ((json as { ids: string[] }).ids)
          : [];
      if (ids.length === 0) return null;
      return Object.fromEntries(ids.map((id) => [String(id), false]));
    } catch {
      return null;
    }
  }
}

function renderConversation(turns: ChatTurn[], tools: AgentToolSpec[]): string {
  return [
    "Conversation so far (JSON):",
    JSON.stringify(turns),
    "",
    "Available tools (JSON):",
    JSON.stringify(tools),
    "",
    "Choose tool_calls from the available tools (or []), then write your reply.",
  ].join("\n");
}

function parseModel(value: string | null): { providerID: string; modelID: string } | null {
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) };
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
    const json = (await res.json()) as { error?: { message?: string }; message?: string };
    const message = json?.error?.message ?? json?.message;
    if (message) return `${who} error (${res.status}): ${message}`;
  } catch {
    /* not JSON */
  }
  return `${who} error (${res.status}) ${res.statusText || ""}`.trim();
}
