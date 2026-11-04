# Project Guide

## Project

Next Football Experience (`nfe-webapp`) is a football social web app for players,
coaches, recruiters, and clubs. The application is the TanStack Start app in
`apps/start` (React 19, TanStack Router/Query, Tailwind CSS v4, Appwrite, B2
media storage). The former Next.js/Prisma app has been removed; its Prisma
schema survives only as the legacy source contract in
`tools/appwrite-schema/legacy/schema.prisma`.

This file is the canonical project guide. `.claude/tasks/**` and
`docs/migration/**` contain historical records, not current instructions.

Reply in the user's language (French by default). Keep code, identifiers,
commits and PR titles in English.

## Commands

Use Bun only (1.3.14) with Node 24. Do not switch to npm, yarn, or pnpm.

```bash
bun install                              # root tooling: Biome, Lefthook
bun install --cwd apps/start             # application dependencies
bun run dev                              # Start dev server (port 3501)
bun run build                            # build and scan client output
bun run typecheck                        # build first to generate route types
bun run test                             # Bun unit tests (Playwright files use *.pw.ts)
bun run smoke                            # Playwright smoke on the built server
bun run lint                             # non-mutating Biome check of the whole repo
```

Each package under `tools/` and `infra/` has its own manifest, lockfile and
checks; run them from that directory.

## Environment

The root has no environment file. Start loads only its own environment
directory (`apps/start`); see [apps/start/README.md](apps/start/README.md) and
`docs/migration/start-production.md` for the runtime contract. Never print or
commit `.env*` values.

## Architecture

- `apps/start`: the application. Read [apps/start/AGENTS.md](apps/start/AGENTS.md)
  before working there.
- `tools/appwrite-schema`: Appwrite schema, contracts and provisioner.
- `tools/identity-import`, `tools/business-import`: legacy data import into Appwrite.
- `tools/backup-restore`, `tools/migration-probe`: recovery tooling and isolated
  Appwrite/B2 experiments. Read [tools/migration-probe/AGENTS.md](tools/migration-probe/AGENTS.md)
  before working there.
- `infra/appwrite`: Appwrite environment definitions.

## Code Style

- Biome v2 is the formatter/linter: tabs, double quotes, organized imports.
- TypeScript is strict with `noUncheckedIndexedAccess` and `noImplicitOverride`.
- Source file names are kebab-case; React components are PascalCase.
- Lefthook runs Biome with writes on staged source files via `lefthook.yml`;
  `stage_fixed` restages fixes while protecting partially staged changes.
  Hooks install via `bun run prepare` in developer checkouts; CI and archives
  without `.git` skip hook installation.

## Applicable Rules

Before editing the indicated area, read the corresponding rule explicitly;
Markdown links do not load rules automatically. Template sources and scopes are
recorded in [.agents/rules/README.md](.agents/rules/README.md).

- TanStack Start routes, server functions, SSR and build: read [apps/start/.agents/rules/tanstack-start.md](apps/start/.agents/rules/tanstack-start.md).
- Query hooks, cache or SSR data state: read [.agents/rules/tanstack-query.md](.agents/rules/tanstack-query.md).
- Input schemas, forms or environment validation: read [.agents/rules/zod.md](.agents/rules/zod.md).
- UI styling/theme work: read [.agents/rules/tailwind-v4.md](.agents/rules/tailwind-v4.md).

## Validation Expectations

Run the narrowest meaningful validation first, then broaden when the change
touches shared behavior:

```bash
bun run lint
bun run build
bun run typecheck
bun run test
```

Documentation-only changes need path, command and diff checks, not app builds.
