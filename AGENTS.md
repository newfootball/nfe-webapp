# Project Guide

## Project

Next Football Experience (`nfe-webapp`) is a football social web app for players,
coaches, recruiters, and clubs. It is a Next.js App Router application with
PostgreSQL/Prisma, better-auth, next-intl, Tailwind CSS v4, and shadcn/ui.

This file is the canonical project guide. `.claude/tasks/**` contains historical
records, not current instructions.

The root lockfile resolves Next.js 16.2.3, React 19.2.5, Prisma 7.8.0,
better-auth 1.6.9, Zod 4.3.6 and Tailwind CSS 4.2.4. TypeScript is 5.7.2;
do not upgrade dependencies as part of documentation work. Use Node 24 and Bun;
the root manifest declares Bun 1.3.3, while the Start shell documents Bun 1.3.14.

Reply in the user's language (French by default). Keep code, identifiers,
commits and PR titles in English.

## Commands

Use Bun only. Do not switch to npm, yarn, or pnpm.

```bash
bun install
bun run dev                 # Next dev server, package script defaults to port 3500
docker compose up -d --wait # PostgreSQL
bunx prisma generate
bunx prisma migrate dev
bunx prisma studio          # database GUI
bun run prisma:seed
bun run typecheck
bun run lint
bun run build
bun run knip
bun run test                # Bun unit tests; Playwright files use *.pw.ts
```

Useful Make targets:

```bash
make dev          # starts Docker, installs deps; NEXT_PORT defaults to 3000
make build
make lint         # mutates files: biome check --write + prisma format
make check        # make lint + make build
make prisma-reset # destructive database reset
make sync         # destructive full reset: clean, recreate Docker DB, migrate, seed, dev
```

Prefer the non-mutating package scripts (`bun run lint`, `bun run typecheck`,
`bun run build`) for validation unless the task explicitly calls for formatting.
Do not run `make sync` as a routine PR prerequisite: it destroys local database
volumes. `make push` also formats, stages all changes, commits, rebases and pushes;
use explicit commands scoped to the authorized work instead.

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

- `app/(home)/(auth)`: sign-in, sign-up, forgot/reset password; its client
  layout redirects authenticated users to `/`.
- `app/(home)/(private)`: authenticated app pages. The group layout checks
  `useSession()` client-side and redirects to `/sign-in`.
- `app/(home)/(private)/admin`: server-side admin guard via `getSession()` and
  `getUserRole()`.
- `app/(home)/(public)`: public feed, explore, user, post, and legal pages.
- `app/(public)`: programmatic SEO pages.
- `app/api/auth/[...all]/route.ts`: better-auth API handler.
- `apps/start`: independent TanStack Start migration shell on port 3501, with
  its own manifest, lockfile and TypeScript boundary. Read
  [apps/start/AGENTS.md](apps/start/AGENTS.md) before working there.
- `tools/migration-probe`: isolated Appwrite/B2 experiments. Read
  [tools/migration-probe/AGENTS.md](tools/migration-probe/AGENTS.md) before working there.

Root installation and checks do not replace the sub-project checks. Both
sub-projects are excluded from the root TypeScript configuration.

Core patterns:

- Mutations live in `src/actions/*.action.ts` and use `"use server"`.
  `getUserSessionId()` is exported from `src/query/user.query.ts`;
  `getSession()` is in `src/lib/auth-server.ts`. Authenticate and authorize each
  protected server operation; client layout redirects are only UI gating.
  Reject missing identity before constructing private Prisma filters, verify
  ownership or admin role, and validate untrusted input on the server.
  Existing return contracts vary: errors can be strings or Zod issue arrays,
  and success payloads can contain data. Preserve each caller's contract and use
  `getTranslations()` for translated errors. Update affected caches after success.
- Database reads live in `src/query/*.query.ts` and use Prisma select/include
  shapes deliberately.
- Auth is better-auth, not NextAuth. Server config is in `src/lib/auth.ts`,
  client helpers in `src/lib/auth-client.ts`, and session helpers in
  `src/lib/auth-server.ts`.
- Auth uses email/password with bcryptjs and optional Google OAuth. Keep secrets,
  Prisma, Cloudinary signing and Resend on the server; never return password hashes,
  reset tokens or session credentials in public query projections.
- Prisma 7 uses `prisma.config.ts` for the datasource and seed command. The
  `prisma-client` generator writes to `src/generated/prisma`; reuse
  `src/lib/prisma.ts`, backed by `PrismaPg` in `create-prisma-client.ts`.
  Review migration SQL and use `prisma migrate deploy` in release workflows;
  do not replace versioned migrations with production `db push`.
- i18n uses `next-intl`; keep `messages/fr.json` and `messages/en.json` in sync.
  `src/i18n/request.ts` selects the `NEXT_LOCALE` cookie, then `Accept-Language`,
  with French as the fallback. Use `getTranslations()` on the server and
  `useTranslations()` on the client. Start has its own locale routing/messages.
- Zustand is only used for feed-side optimistic post updates. Prefer TanStack
  Query for server state and keep Zustand scoped to client UI state.
- `src/hooks/use-posts.ts` bridges Query pagination and the feed store. Reuse
  `usePostsActions()` for store actions; do not assume it provides selector isolation.
  New Zustand v5 selectors must return stable references; use primitive/existing
  slices or `useShallow` for computed objects/tuples when shallow equality fits.
- Shared Zod schemas live in `src/schemas/` and `src/lib/onboarding.schemas.ts`;
  infer input types from schemas and parse again at server boundaries.
- Database entities include User, Post, Media, Like, Comment, Follow, Favorite,
  Message and PostSignal. Consult `prisma/schema.prisma` for current enums.

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
- shadcn uses New York style, stone base and CSS variables in `app/globals.css`.
  Preserve semantics, keyboard behavior, labels and focus when customizing primitives.
- Name stores `*.store.ts`, actions `*.action.ts`, queries `*.query.ts`, and
  schemas `PascalCaseSchema`. Constants use SCREAMING_SNAKE_CASE; booleans use
  `is`/`has` where appropriate.
- Lefthook runs Biome with writes on staged source files via `lefthook.yml`;
  `stage_fixed` restages fixes while protecting partially staged changes.
  Hooks install via `bun run prepare`. Knip checks
  unused code. The current Server Action body limit is `50mb` in `next.config.ts`.

## Applicable Rules

Before editing the indicated area, read the corresponding rule explicitly;
Markdown links do not load rules automatically. Template sources, exact scopes
and intentional omissions are recorded in [.agents/rules/README.md](.agents/rules/README.md).

- Authentication/session work: read [.agents/rules/better-auth.md](.agents/rules/better-auth.md).
- Server mutations/actions: read [.agents/rules/server-actions.md](.agents/rules/server-actions.md).
- Prisma schema, migrations, queries or client setup: read [.agents/rules/prisma.md](.agents/rules/prisma.md).
- Next app routes/components/configuration: read [.agents/rules/nextjs-app-router.md](.agents/rules/nextjs-app-router.md).
- TanStack Start routes, server functions, SSR and build: read [apps/start/.agents/rules/tanstack-start.md](apps/start/.agents/rules/tanstack-start.md).
- Next application translations: read [.agents/rules/next-intl.md](.agents/rules/next-intl.md).
- Query hooks, cache or SSR data state (including Start): read [.agents/rules/tanstack-query.md](.agents/rules/tanstack-query.md).
- Input schemas, forms or environment validation: read [.agents/rules/zod.md](.agents/rules/zod.md).
- UI styling/theme work (including Start): read [.agents/rules/tailwind-v4.md](.agents/rules/tailwind-v4.md).

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

Run `bun run test` for changes affecting unit-tested behavior in `tests/unit/`
or the probe guards. Playwright smoke tests are separate; use the Start guide.
Documentation-only changes need path, command and diff checks, not app builds
or database resets.
