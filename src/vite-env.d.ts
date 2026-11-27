/// <reference types="vite/client" />

/**
 * Environment variables for the AI chat (see .env.example).
 * Exposed to the bundle via vite.config.ts `envPrefix` — desktop/local use only.
 */
interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly OPENCODE_SERVER_URL?: string;
  readonly OPENCODE_PASSWORD?: string;
  /** Alias accepted by `opencode serve`; the app uses it as a fallback. */
  readonly OPENCODE_SERVER_PASSWORD?: string;
  readonly OPENCODE_MODEL?: string;
}
