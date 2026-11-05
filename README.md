# Next Football Experience Web App

Football social web app for players, coaches, recruiters, and clubs, built with
TanStack Start (`apps/start`), React, TypeScript, Tailwind CSS v4, Appwrite and
B2 media storage.

## Requirements

- Bun `1.3.14` and Node 24
- Docker for the persistent local runtime (Appwrite)

## Setup

```bash
bun install
bun install --cwd apps/start
bun run dev          # http://localhost:3501
```

For a full local stack, see the
[persistent local runtime runbook](docs/migration/start-local-runtime.md)
(`bun run local`).

## Development Commands

```bash
bun run dev          # dev server (port 3501)
bun run build        # production build + client bundle scan
bun run start        # run the built app
bun run typecheck    # TypeScript (build first)
bun run test         # Bun unit tests
bun run smoke        # Playwright smoke tests
bun run lint         # non-mutating Biome check
bun run lint:fix     # Biome check --write
bun run format       # Biome format --write
```

## Production

The production image is built from the repository root with
`docker build -f apps/start/Dockerfile .`. See
[docs/migration/start-production.md](docs/migration/start-production.md).

## Git Hooks

Lefthook installs the Git hooks through the `prepare` script during
`bun install` in a developer checkout (skipped in CI and without `.git`). The
pre-commit hook runs Biome on staged JavaScript, TypeScript, JSON/JSONC and CSS
files and restages fixes. Lint failures block the commit.

## Layout

- `apps/start`: the application ([README](apps/start/README.md))
- `tools/`: Appwrite schema, import, backup and probe tooling (isolated packages)
- `infra/`: Appwrite environment definitions
- `docs/migration/`: migration records and runbooks

For agent-specific instructions, see `AGENTS.md`.
