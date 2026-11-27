/**
 * Live smoke test for the OpenCode provider (src/lib/ai/providers.ts).
 *
 * Requires a running `opencode serve` plus OPENCODE_SERVER_URL and
 * OPENCODE_PASSWORD in `.env` (or the environment). Set OPENCODE_MODEL to a
 * model the server can use, in `providerID/modelID` form. The script skips
 * cleanly when the URL is missing, so it is safe to run in CI.
 *
 * Run: npm run check:opencode
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
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
      }),
  );
}

async function main() {
  let fileEnv = {};
  try {
    fileEnv = parseEnv(await readFile(".env", "utf8"));
  } catch {
    /* no .env — use the process environment */
  }
  // `.env` is the app's config and wins over a stray shell variable. The
  // model stays overridable from the shell for one-off checks.
  const url = (fileEnv.OPENCODE_SERVER_URL || process.env.OPENCODE_SERVER_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const password =
    fileEnv.OPENCODE_PASSWORD ||
    fileEnv.OPENCODE_SERVER_PASSWORD ||
    process.env.OPENCODE_PASSWORD ||
    process.env.OPENCODE_SERVER_PASSWORD ||
    "";
  const model = process.env.OPENCODE_MODEL || fileEnv.OPENCODE_MODEL || null;
  if (!url) {
    console.log("Skipped: set OPENCODE_SERVER_URL (and OPENCODE_PASSWORD) in .env or the environment.");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "stacks-opencode-check-"));
  try {
    const result = await build({
      entryPoints: [join(process.cwd(), "src/lib/ai/providers.ts")],
      bundle: true,
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const bundlePath = join(dir, "providers.bundle.mjs");
    await writeFile(bundlePath, result.outputFiles[0].text);
    const { providersFromEnv } = await import(pathToFileURL(bundlePath).href);

    const provider = providersFromEnv({
      anthropicKey: null,
      anthropicModel: "unused",
      opencodeUrl: url,
      opencodePassword: password || null,
      opencodeModel: model,
    }).find((candidate) => candidate.id === "opencode");
    if (!provider) throw new Error("OpenCode provider was not created.");

    console.log(`Asking ${url} via ${model || "the server default model"}…`);
    const reply = await provider.complete({
      system: "You are a JSON API. Follow the host protocol exactly.",
      turns: [{ role: "user", content: 'Reply with {"reply":"pong","tool_calls":[]}.' }],
      tools: [],
    });
    console.log("reply:", reply.content);
    console.log("tool calls:", reply.toolCalls.length);
    if (!reply.content) throw new Error("Provider returned an empty reply.");
    console.log("\nOpenCode provider check passed.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
