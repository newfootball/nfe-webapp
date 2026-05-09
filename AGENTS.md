# Codex Project Guide

## Project

Next Football Experience (`nfe-webapp`) is a football social web app for players,
coaches, recruiters, and clubs. It is a Next.js App Router application with
PostgreSQL/Prisma, better-auth, next-intl, Tailwind CSS v4, and shadcn/ui.

`CLAUDE.md` and `.claude/tasks/**` are historical Claude artifacts. Treat this
file as the current source of truth for Codex.

## Commands

Use Bun only. Do not switch to npm, yarn, or pnpm.

```bash
bun install
bun run dev                 # Next dev server, package script defaults to port 3500
docker compose up -d --wait # PostgreSQL
bunx prisma generate
bunx prisma migrate dev
bun run prisma:seed
bun run typecheck
bun run lint
bun run build
bun run knip
```

Useful Make targets:

```bash
make dev          # starts Docker, installs deps, then runs the dev server
make build
make lint         # mutates files: biome check --write + prisma format
make check        # make lint + make build
make prisma-reset # destructive database reset
make sync         # destructive full reset: clean, recreate Docker DB, migrate, seed, dev
```

Prefer the non-mutating package scripts (`bun run lint`, `bun run typecheck`,
`bun run build`) for validation unless the task explicitly calls for formatting.

## Environment

`.env` is tracked as the baseline local environment and `.env.local` overrides it
locally. Never print or commit `.env.local` values.

Runtime validation lives in `src/lib/env.ts`. The app needs:

- PostgreSQL: `DATABASE_URL` plus the `POSTGRES_*` variables used by
  `compose.yaml`.
- App URLs/auth: `WEBSITE_URL` must be an HTTPS URL, `NEXT_PUBLIC_APP_URL` is
  optional, and auth needs `BETTER_AUTH_SECRET` or the legacy
  `NEXTAUTH_SECRET`.
- Required service key: `RESEND_API_KEY`.
- Optional integrations: Google OAuth, Google Analytics, and Cloudinary.

## Architecture

- `app/(home)/(auth)`: sign-in, sign-up, forgot/reset password.
- `app/(home)/(private)`: authenticated app pages. The group layout checks
  `useSession()` client-side and redirects to `/sign-in`.
- `app/(home)/(private)/admin`: server-side admin guard via `getSession()` and
  `getUserRole()`.
- `app/(home)/(public)`: public feed, explore, user, post, and legal pages.
- `app/(public)`: programmatic SEO pages.
- `app/api/auth/[...all]/route.ts`: better-auth API handler.

Core patterns:

- Mutations live in `src/actions/*.action.ts`, use `"use server"`, check auth
  with `getUserSessionId()`, return `{ error: string }` or `{ success: true }`,
  and call `revalidatePath()` when user-facing data changes.
- Database reads live in `src/query/*.query.ts` and use Prisma select/include
  shapes deliberately.
- Auth is better-auth, not NextAuth. Server config is in `src/lib/auth.ts`,
  client helpers in `src/lib/auth-client.ts`, and session helpers in
  `src/lib/auth-server.ts`.
- i18n uses `next-intl`; keep `messages/fr.json` and `messages/en.json` in sync.
  French is the default locale.
- Zustand is only used for feed-side optimistic post updates. Prefer TanStack
  Query for server state and keep Zustand scoped to client UI state.

## Code Style

- Biome v2 is the formatter/linter: tabs, double quotes, organized imports.
- TypeScript is strict with `noUncheckedIndexedAccess` and
  `noImplicitOverride`.
- Source file names are kebab-case unless the local directory already uses a
  component file convention.
- React components are PascalCase.
- Use lucide icons for new UI controls when possible.
- Keep shadcn/ui primitives in `components/ui` and feature components under
  `components/feature`.
- Preserve existing route-group structure and aliases (`@/components`,
  `@/lib`, `@/src/...`) instead of inventing new module boundaries.

## Validation Expectations

For code changes, run the narrowest meaningful validation first, then broaden
when the change touches shared behavior:

```bash
bun run typecheck
bun run lint
bun run build
```

For Prisma/schema changes, also run:

```bash
bunx prisma validate
bunx prisma generate
```

There is no dedicated test suite configured in `package.json` at the moment.
