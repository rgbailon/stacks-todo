/**
 * Prompt library — saved prompts the user creates inside the app.
 *
 * A small subscribable store (ToastStore pattern): components read a stable
 * snapshot via useSyncExternalStore and mutations persist to localStorage.
 * The storage seam is injectable so tests can run without a browser.
 */
export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptInput {
  title?: string;
  body?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "stacks.prompts.v1";

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Storage can be unavailable (privacy mode) — run in memory.
    return null;
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValid(value: unknown): value is SavedPrompt {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<SavedPrompt>;
  return typeof p.id === "string" && typeof p.title === "string" && typeof p.body === "string";
}

export class PromptStore {
  private prompts: SavedPrompt[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;

  constructor(private readonly storage: StorageLike | null = defaultStorage()) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Stable reference between mutations — required by useSyncExternalStore. */
  getSnapshot = (): SavedPrompt[] => {
    this.ensureLoaded();
    return this.prompts;
  };

  /** Newest first. */
  list(): SavedPrompt[] {
    return [...this.getSnapshot()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  create(input: PromptInput): SavedPrompt {
    this.ensureLoaded();
    const now = new Date().toISOString();
    const prompt: SavedPrompt = {
      id: uuid(),
      title: input.title?.trim() || "Untitled prompt",
      body: input.body ?? "",
      createdAt: now,
      updatedAt: now,
    };
    this.prompts = [prompt, ...this.prompts];
    this.persist();
    this.emit();
    return prompt;
  }

  update(id: string, patch: PromptInput): SavedPrompt | null {
    this.ensureLoaded();
    const index = this.prompts.findIndex((p) => p.id === id);
    if (index < 0) return null;
    const current = this.prompts[index];
    const updated: SavedPrompt = {
      ...current,
      title: patch.title !== undefined ? patch.title.trim() || "Untitled prompt" : current.title,
      body: patch.body !== undefined ? patch.body : current.body,
      updatedAt: new Date().toISOString(),
    };
    this.prompts = this.prompts.map((p, i) => (i === index ? updated : p));
    this.persist();
    this.emit();
    return updated;
  }

  remove(id: string): boolean {
    this.ensureLoaded();
    const next = this.prompts.filter((p) => p.id !== id);
    if (next.length === this.prompts.length) return false;
    this.prompts = next;
    this.persist();
    this.emit();
    return true;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) this.prompts = parsed.filter(isValid);
    } catch {
      // Corrupt or unavailable — start empty; the next save overwrites it.
      this.prompts = [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.prompts));
    } catch {
      // Quota/private mode — keep working in memory.
    }
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

/** The app-wide library. */
export const promptStore = new PromptStore();
