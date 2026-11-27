# Stacks — architecture

A calm library of your projects. **Think it (Inbox) → Note it (Notes) → Ship it (Plan/Focus).**

The code is organized around small classes (OOP) with functional React components
composing them. Each layer has exactly one job, so modifications stay local.

## Layers

```
src/
├── db/
│   ├── schema.ts        ← tables: projects, tasks, notes, ideas (edit + `npx drizzle-kit push`)
│   ├── index.ts         ← Drizzle client (DATABASE_URL)
│   └── seed.ts          ← example library, seeded only when empty (POST /api/seed)
│
├── server/
│   └── workspace.ts     ← WorkspaceService: the ONLY class that touches the DB.
│                          All rules live here: ordering, "up next", timestamps, cascades.
│
├── app/
│   ├── api/**           ← thin route handlers: validate input → call workspace → JSON
│   ├── page.tsx         ← Library (cover grid, search, filters, continue strip)
│   ├── projects/[id]/   ← Project detail (Plan + Notes)
│   ├── focus/           ← "What next?" across active projects
│   └── inbox/           ← quick capture → promote to project / note
│
├── lib/
│   ├── types.ts         ← wire DTOs + constants (CATEGORIES, PROJECT_ICONS, statuses)
│   ├── models.ts        ← domain classes: Project, Task, Note, Idea, TaskBoard, Workspace
│   ├── services.ts      ← client API classes (BaseService → per-resource), exported as `api`
│   ├── ai/
│   │   ├── providers.ts ← ChatProvider interface + Anthropic (direct) and
│   │   │                  OpenCode (env-wrapped local server) transports
│   │   └── agent.ts     ← system prompt, Stacks tools, the tool-calling loop
│   ├── prompts.ts       ← PromptStore: saved prompt library (localStorage,
│   │                      subscribable like ToastStore)
│   ├── palettes.ts      ← CoverTheme + PALETTES (book-cover identities)
│   ├── markdown.tsx     ← MarkdownParser class + safe <Markdown/> renderer (no deps)
│   ├── toast.tsx        ← ToastStore class + <Toaster/> (useSyncExternalStore)
│   └── utils.ts         ← cx, timeAgo, plainText, quotes
│
└── components/
    ├── ui.tsx           ← Button, Modal, Input, Chip, Progress, EmptyState…
    ├── cover.tsx        ← Cover art: palette gradient + deterministic SVG pattern
    ├── shell.tsx        ← sidebar / mobile nav (Library · Focus · Inbox)
    ├── project-card.tsx ← one book on the shelf
    ├── project-modal.tsx← create/edit with live cover preview
    ├── task-list.tsx    ← Now / Up next / Later / Done
    ├── notes.tsx        ← note cards + markdown editor modal
    └── prompt-library.tsx ← saved-prompt CRUD modal used by Chat
```

## Key rules (where to change what)

| Want to…                        | Touch…                                   |
| ------------------------------- | ---------------------------------------- |
| Add a cover color               | `PALETTES` in `lib/palettes.ts`          |
| Add an AI chat tool             | `createAppTools()` in `lib/ai/agent.ts`  |
| Change AI env vars / providers  | `.env.example` + `lib/ai/providers.ts`   |
| Add a category                  | `CATEGORIES` in `lib/types.ts`           |
| Change how "up next" is chosen  | `TaskBoard` in `lib/models.ts`           |
| Change task/note business rules | `WorkspaceService` in `server/workspace.ts` |
| Restyle the whole app           | tokens in `app/globals.css` + `components/ui.tsx` |
| Add a persisted field           | `db/schema.ts` → DTO in `types.ts` → mapper in `workspace.ts` |

## OOP in a React world

- **Domain classes** (`models.ts`) own computed state: progress, excerpts, board grouping.
- **Service classes** (`services.ts`, `workspace.ts`) own I/O; components never call
  fetch/DB directly. Swapping the backend means rewriting one file.
- **MarkdownParser / ToastStore / CoverTheme** are plain classes with a single
  responsibility; React subscribes or renders their output.
- Components stay functional — the idiomatic React surface over an OOP core.