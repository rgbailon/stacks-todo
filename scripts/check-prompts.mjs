/**
 * Exercises the prompt library store (src/lib/prompts.ts) with an injected
 * fake storage — create / update / remove, snapshots, subscriptions, and a
 * persistence roundtrip through a second store instance.
 *
 * Run: npm run check:prompts
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

const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "stacks-prompts-check-"));
  try {
    const result = await build({
      entryPoints: [join(process.cwd(), "src/lib/prompts.ts")],
      bundle: true,
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const bundlePath = join(dir, "prompts.bundle.mjs");
    await writeFile(bundlePath, result.outputFiles[0].text);
    const { PromptStore } = await import(pathToFileURL(bundlePath).href);

    console.log("Create / read / update / remove:");
    const storage = fakeStorage();
    const store = new PromptStore(storage);
    assert(store.list().length === 0, "starts empty");

    const a = store.create({ title: "  Project brief  ", body: "Write a one-pager for {project}." });
    const b = store.create({ title: "", body: "Second prompt" });
    assert(a.title === "Project brief", "title is trimmed");
    assert(b.title === "Untitled prompt", "blank title gets a default");
    assert(store.list().length === 2, "both prompts listed");

    const updated = store.update(a.id, { body: "Updated body" });
    assert(updated && updated.body === "Updated body", "update changes the body");
    assert(updated.title === "Project brief", "partial update keeps the title");
    assert(store.update("missing", { title: "x" }) === null, "unknown id updates nothing");

    assert(store.remove(b.id) === true, "remove returns true");
    assert(store.remove(b.id) === false, "double remove returns false");
    assert(store.list().length === 1, "one prompt left");

    console.log("\nSubscriptions:");
    let fired = 0;
    const unsubscribe = store.subscribe(() => {
      fired += 1;
    });
    store.create({ title: "Third", body: "…" });
    assert(fired === 1, "subscriber notified once per mutation");
    const snapshot = store.getSnapshot();
    store.getSnapshot();
    assert(store.getSnapshot() === snapshot, "snapshot is stable between mutations");
    unsubscribe();
    store.create({ title: "Fourth", body: "…" });
    assert(fired === 1, "unsubscribed listener no longer fires");

    console.log("\nPersistence roundtrip:");
    const raw = storage.map.get("stacks.prompts.v1");
    assert(typeof raw === "string" && raw.includes("Project brief"), "written to storage under the versioned key");
    const rehydrated = new PromptStore(storage);
    assert(rehydrated.list().length === 3, `second store rehydrates all prompts (got ${rehydrated.list().length})`);
    assert(
      rehydrated.list().every((p) => p.id && p.title && p.createdAt && p.updatedAt),
      "rehydrated prompts keep their fields",
    );

    console.log("\nCorrupt storage is survivable:");
    const broken = { getItem: () => "{not json", setItem: () => {} };
    const store2 = new PromptStore(broken);
    assert(store2.list().length === 0, "corrupt payload starts empty");
    const created = store2.create({ title: "Fresh", body: "ok" });
    assert(created.title === "Fresh", "store still works after corrupt load");

    console.log("\nNo storage (memory mode):");
    const memory = new PromptStore(null);
    memory.create({ title: "Nope", body: "…" });
    assert(memory.list().length === 1, "works without localStorage");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll prompt store checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
