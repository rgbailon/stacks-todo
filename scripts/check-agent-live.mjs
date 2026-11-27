/**
 * Live end-to-end check for the Stacks agent over a real OpenCode server.
 *
 * Bundles the production `providers.ts` + `agent.ts` (with the Tauri IPC stub),
 * so it exercises the same code path the desktop app uses. Requires a running
 * `opencode serve` plus OPENCODE_SERVER_URL and OPENCODE_PASSWORD in `.env`.
 *
 * Run: npm run check:agent-live
 */
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const split = l.indexOf("=");
        return [l.slice(0, split).trim(), l.slice(split + 1).trim()];
      }),
  );
}

async function main() {
  const env = parseEnv(await readFile(".env", "utf8"));
  const url = (env.OPENCODE_SERVER_URL || "").trim().replace(/\/+$/, "");
  const password = env.OPENCODE_PASSWORD || env.OPENCODE_SERVER_PASSWORD || "";
  if (!url) {
    console.log("Skipped: set OPENCODE_SERVER_URL (and OPENCODE_PASSWORD) in .env.");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "stacks-agent-live-"));
  const stubPath = join(process.cwd(), "scripts", "ipc-stub.mjs");
  try {
    // Bundle the agent with the IPC stub so tools hit the fake backend.
    const agentBuild = await build({
      entryPoints: [join(process.cwd(), "src/lib/ai/agent.ts")],
      bundle: true,
      format: "esm",
      write: false,
      alias: { "@tauri-apps/api/core": stubPath },
      logLevel: "silent",
    });
    const agentPath = join(dir, "agent.bundle.mjs");
    await writeFile(agentPath, agentBuild.outputFiles[0].text);
    const { runAgent } = await import(pathToFileURL(agentPath).href);

    // Bundle the providers to use the real OpenCode transport.
    const providerBuild = await build({
      entryPoints: [join(process.cwd(), "src/lib/ai/providers.ts")],
      bundle: true,
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const providerPath = join(dir, "providers.bundle.mjs");
    await writeFile(providerPath, providerBuild.outputFiles[0].text);
    const { providersFromEnv } = await import(pathToFileURL(providerPath).href);

    const model = env.OPENCODE_MODEL || null;
    const provider = providersFromEnv({
      anthropicKey: null,
      anthropicModel: "unused",
      opencodeUrl: url,
      opencodePassword: password || null,
      opencodeModel: model,
    }).find((candidate) => candidate.id === "opencode");
    if (!provider) throw new Error("OpenCode provider was not created.");

    console.log(`Live agent run via ${model || "the server default model"}…`);
    const events = [];
    const run = await runAgent({
      provider,
      history: [],
      userText:
        'Create a project called "Live check" in the idea category, add one task "Write the first draft", and write a note titled "Notes" with content "Hello from the live test."',
      onTool: (e) => events.push(e),
    });

    console.log("\nFinal reply:\n" + run.reply);
    console.log("\nTool events:");
    for (const e of events) console.log(`  ${e.ok ? "ok " : "FAIL"} ${e.name} — ${e.summary}`);
    if (run.error) {
      console.log("\nRun error:", run.error);
      process.exitCode = 1;
      return;
    }
    if (events.length === 0 || !events.every((e) => e.ok)) {
      process.exitCode = 1;
      return;
    }
    console.log("\nLive agent check passed.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
