/**
 * Exercises the agentic chat loop (src/lib/ai/agent.ts) with a scripted
 * provider and the real Stacks tools running against the Tauri IPC stub —
 * no network, no model. Asserts:
 *   - tool calls execute in order and results flow back to the provider
 *   - bad tool input becomes a recoverable error result (not a crash)
 *   - unknown tools are rejected with the available list
 *   - provider failures keep partial progress so retries never re-run tools
 *
 * Run: npm run check:agent
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const failures = [];
const assert = (cond, label) => {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
};

class FakeProvider {
  id = "fake";
  label = "Fake";
  hint = "none";
  constructor(script) {
    this.script = [...script];
    this.requests = [];
  }
  async complete(request) {
    this.requests.push(request);
    if (this.script.length === 0) throw new Error("fake provider script exhausted");
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return next;
  }
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "stacks-agent-check-"));
  try {
    const stubPath = join(import.meta.dirname, "ipc-stub.mjs");
    const result = await build({
      entryPoints: [join(process.cwd(), "src/lib/ai/agent.ts")],
      bundle: true,
      format: "esm",
      write: false,
      alias: { "@tauri-apps/api/core": stubPath },
      logLevel: "silent",
    });
    const bundlePath = join(dir, "agent.bundle.mjs");
    await writeFile(bundlePath, result.outputFiles[0].text);
    const { runAgent, createAppTools, SYSTEM_PROMPT } = await import(pathToFileURL(bundlePath).href);

    // ------------------------------------------------------------ tool specs
    console.log("Tool specs are well-formed:");
    const tools = createAppTools();
    const names = tools.map((t) => t.spec.name);
    assert(names.includes("create_project"), "create_project present");
    assert(names.includes("create_task"), "create_task present");
    assert(names.includes("get_project"), "get_project present");
    assert(names.includes("update_task"), "update_task present");
    assert(names.includes("create_note"), "create_note present");
    assert(names.includes("update_note"), "update_note present");
    assert(
      tools.every(
        (t) =>
          typeof t.spec.name === "string" &&
          typeof t.spec.description === "string" &&
          t.spec.input_schema?.type === "object",
      ),
      "every spec has name/description/object schema",
    );
    assert(SYSTEM_PROMPT.includes("Stacks"), "system prompt names the app");
    assert(SYSTEM_PROMPT.includes("notes"), "system prompt explains notes");

    // ------------------------------------------------------- happy-path loop
    console.log("\nHappy path: create project → create task → create note → final reply:");
    const provider = new FakeProvider([
      { content: "", toolCalls: [{ id: "c1", name: "create_project", input: { title: "Agent test project", category: "idea" } }] },
      { content: "", toolCalls: [{ id: "c2", name: "create_task", input: { projectId: "p_1", title: "First small step" } }] },
      {
        content: "",
        toolCalls: [
          {
            id: "c3",
            name: "create_note",
            input: { projectId: "p_1", title: "Parts list", content: "- GPU\n- RAM", pinned: true },
          },
        ],
      },
      { content: "Done — the project, task, and note are in your Library.", toolCalls: [] },
    ]);
    const events = [];
    const run = await runAgent({
      provider,
      history: [],
      userText: "Create a project called Agent test project with one task and a parts note",
      onTool: (e) => events.push(e),
    });
    assert(!run.error, `no error (got: ${run.error ?? "none"})`);
    assert(run.reply.startsWith("Done —"), "final reply returned");
    assert(run.toolEvents.length === 3, "three tool events emitted");
    assert(run.toolEvents.every((e) => e.ok), "all tools succeeded");
    assert(events.length === 3, "onTool callback fired three times");
    assert(run.turns.length === 8, `eight turns (user + 3×(assistant,toolResult) + assistant), got ${run.turns.length}`);
    assert(run.turns[0].role === "user", "starts with the user message");
    assert(run.turns[1].toolCalls?.[0]?.name === "create_project", "first assistant turn carries the tool call");
    assert(
      run.turns[2].role === "toolResult" && run.turns[2].content.includes("Created project"),
      "tool result carries the full result text",
    );
    assert(
      run.turns[6].role === "toolResult" && run.turns[6].content.includes("Created note"),
      "note tool result carries the full result text",
    );
    assert(
      provider.requests[0].tools.some((t) => t.name === "create_project"),
      "provider received the tool specs",
    );
    assert(
      provider.requests[1].turns.some((t) => t.role === "toolResult"),
      "second provider call sees the tool results",
    );
    assert(
      provider.requests[0].system.includes("library of your projects"),
      "system prompt passed through",
    );

    // ------------------------------------------------- recoverable tool error
    console.log("\nBad tool input becomes a recoverable result:");
    const run2 = await runAgent({
      provider: new FakeProvider([
        { content: "", toolCalls: [{ id: "e1", name: "create_project", input: {} }] },
        { content: "What should the project be called?", toolCalls: [] },
      ]),
      history: [],
      userText: "Make a project",
    });
    assert(!run2.error, "run completes despite tool failure");
    assert(run2.toolEvents[0]?.ok === false, "tool event marked failed");
    assert(run2.toolEvents[0]?.summary.includes("title"), "error names the missing field");
    assert(run2.turns[2].content.startsWith("Error:"), "provider sees an Error: result");
    assert(run2.reply === "What should the project be called?", "model recovers with a question");

    // -------------------------------------------------------- notes and tasks
    console.log("\nNotes and task updates use the real Stacks tools:");
    const runNote = await runAgent({
      provider: new FakeProvider([
        {
          content: "",
          toolCalls: [
            {
              id: "n1",
              name: "create_note",
              input: { projectId: "p_1", title: "Parts list", content: "- GPU\n- RAM", pinned: true },
            },
          ],
        },
        { content: "Saved the note.", toolCalls: [] },
      ]),
      history: [],
      userText: "Write a parts note",
    });
    assert(runNote.toolEvents[0]?.ok, "create_note succeeded");
    assert(runNote.toolEvents[0]?.summary.includes("Created note"), "note summary names the result");

    const runTask = await runAgent({
      provider: new FakeProvider([
        { content: "", toolCalls: [{ id: "u1", name: "update_task", input: { taskId: "t_1", status: "done" } }] },
        { content: "Marked it done.", toolCalls: [] },
      ]),
      history: [],
      userText: "Mark the task done",
    });
    assert(runTask.toolEvents[0]?.ok, "update_task succeeded");
    assert(runTask.toolEvents[0]?.summary.includes("done"), "task summary names the new status");

    const runEmptyNote = await runAgent({
      provider: new FakeProvider([
        { content: "", toolCalls: [{ id: "n2", name: "create_note", input: { projectId: "p_1", title: "Empty", content: "  " } }] },
        { content: "What should the note say?", toolCalls: [] },
      ]),
      history: [],
      userText: "Write an empty note",
    });
    assert(runEmptyNote.toolEvents[0]?.ok === false, "empty note content is rejected");
    assert(runEmptyNote.toolEvents[0]?.summary.includes("content"), "error names the missing content");

    // ------------------------------------------------------------ unknown tool
    console.log("\nUnknown tool names are rejected:");
    const run3 = await runAgent({
      provider: new FakeProvider([
        { content: "", toolCalls: [{ id: "u1", name: "delete_everything", input: {} }] },
        { content: "I can't do that.", toolCalls: [] },
      ]),
      history: [],
      userText: "Delete everything",
    });
    assert(run3.toolEvents[0]?.ok === false, "unknown tool marked failed");
    assert(run3.turns[2].content.includes("Unknown tool"), "result says unknown tool");
    assert(run3.turns[2].content.includes("create_project"), "result lists available tools");

    // ------------------------------------------------------ provider failures
    console.log("\nProvider failure mid-run keeps executed progress:");
    const run4 = await runAgent({
      provider: new FakeProvider([
        { content: "", toolCalls: [{ id: "f1", name: "capture_idea", input: { text: "a small idea" } }] },
        new Error("network down"),
      ]),
      history: [],
      userText: "Remember this idea",
    });
    assert(run4.error === "network down", "error surfaced to the caller");
    assert(run4.toolEvents.length === 1 && run4.toolEvents[0].ok, "already-executed tool kept");
    assert(run4.turns.length === 3, "turns keep user + assistant + toolResult for retry");
    assert(run4.turns[2].content.includes("Captured idea"), "tool result text preserved");

    // ------------------------------------------------------------- step budget
    console.log("\nStep budget forces a final tool-free answer:");
    const endless = {
      id: "endless",
      label: "Endless",
      hint: "none",
      requests: [],
      async complete(request) {
        this.requests.push(request);
        return { content: "", toolCalls: [{ id: `b${this.requests.length}`, name: "capture_idea", input: { text: "loop" } }] };
      },
    };
    const run5 = await runAgent({ provider: endless, history: [], userText: "loop forever", maxTurns: 3 });
    assert(!run5.error, "step budget does not error");
    assert(endless.requests.length === 4, `3 tool rounds + 1 final ask (got ${endless.requests.length})`);
    assert(endless.requests[3].tools.length === 0, "final ask carries no tools");
    assert(run5.turns[run5.turns.length - 1].role === "assistant", "conversation ends on an assistant turn");
    assert(run5.reply.length > 0, "final reply is non-empty");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll agent checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
