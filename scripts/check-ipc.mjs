/**
 * Guards the Tauri IPC contract between src/lib/services.ts and
 * src-tauri/src/commands.rs.
 *
 * Tauri resolves each command argument by the Rust parameter name converted to
 * camelCase (#[tauri::command] defaults to rename_all = "camelCase"), so:
 *   - Rust `project_id` must be sent as `projectId`
 *   - single-word names must match the Rust signature exactly
 *     (e.g. update_note takes `input`, not `patch`)
 *
 * The stub in ./ipc-stub.mjs rejects payloads the same way the real runtime
 * does (missing camelCase key → invoke error), so a regression in either rule
 * fails this script.
 *
 * Run: npm run check:ipc
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const failures = [];

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}: ${e.message}`);
  }
};

// Payloads that must be rejected, mirroring the original bug reports.
const mustBeRejected = [
  ["create_task { project_id }", "create_task", { project_id: "p1", title: "x" }],
  ["create_note { project_id }", "create_note", { project_id: "p1", input: {} }],
  ["send_idea_to_project { idea_id, project_id }", "send_idea_to_project", { idea_id: "i1", project_id: "p1" }],
  ["update_note { id, patch }", "update_note", { id: "n1", patch: {} }],
];

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "stacks-ipc-check-"));
  try {
    // Bundle the real services layer against the stubbed Tauri invoke.
    const stubPath = join(import.meta.dirname, "ipc-stub.mjs");
    const result = await build({
      entryPoints: [join(process.cwd(), "src/lib/services.ts")],
      bundle: true,
      format: "esm",
      write: false,
      alias: { "@tauri-apps/api/core": stubPath },
      logLevel: "silent",
    });
    const bundlePath = join(dir, "services.bundle.mjs");
    await writeFile(bundlePath, result.outputFiles[0].text);
    const { api } = await import(pathToFileURL(bundlePath).href);
    const { invoke } = await import(pathToFileURL(stubPath).href);

    console.log("Every api method must resolve against Tauri's camelCase keys:");
    await check("projects.list", () => api.projects.list());
    await check("projects.get", () => api.projects.get("p1"));
    await check("projects.create", () => api.projects.create({ title: "t" }));
    await check("projects.update", () => api.projects.update("p1", { title: "t2" }));
    await check("projects.remove", () => api.projects.remove("p1"));
    await check("tasks.create", () => api.tasks.create("p1", "do it"));
    await check("tasks.update", () => api.tasks.update("t1", { makeNext: true }));
    await check("tasks.remove", () => api.tasks.remove("t1"));
    await check("notes.create", () => api.notes.create("p1", { title: "n", content: "c" }));
    await check("notes.update", () => api.notes.update("n1", { content: "c2" }));
    await check("notes.remove", () => api.notes.remove("n1"));
    await check("ideas.list", () => api.ideas.list());
    await check("ideas.capture", () => api.ideas.capture("hello"));
    await check("ideas.remove", () => api.ideas.remove("i1"));
    await check("ideas.sendToProject", () => api.ideas.sendToProject("i1", "p1"));
    await check("focus.get", () => api.focus.get());
    await check("system.seed", () => api.system.seed());

    console.log("\nOld snake_case payloads must still be rejected (harness sanity):");
    for (const [name, cmd, args] of mustBeRejected) {
      await check(name, async () => {
        try {
          await invoke(cmd, args);
          throw new Error("expected rejection but it resolved");
        } catch (e) {
          if (!/missing key/.test(e.message)) throw e;
        }
      });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll IPC checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
