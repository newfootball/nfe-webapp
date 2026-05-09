# Next Football Experience Web App

Football social web app for players, coaches, recruiters, and clubs. The app is
built with Next.js App Router, React, TypeScript, Prisma/PostgreSQL, better-auth,
next-intl, Tailwind CSS v4, and shadcn/ui.

## Requirements

- Bun `1.3.3` or compatible
- Docker with Docker Compose
- PostgreSQL is provided locally by `compose.yaml`

## Setup

```bash
bun install
docker compose up -d --wait
bunx prisma generate
bunx prisma migrate dev
bun run prisma:seed
bun run dev
```

`bun run dev` uses the package script port `3500`. When using `make dev`, the
effective port comes from `NEXT_PORT` in `.env`/`.env.local`, falling back to
the Makefile default.

## Environment

`.env` is committed as the baseline local environment. `.env.local` is ignored
and can override local values. Do not commit real local secrets.

Important variables:

- `DATABASE_URL`
- `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_CONTAINER_NAME`
- `WEBSITE_URL` (validated as HTTPS)
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_SECRET` or legacy `NEXTAUTH_SECRET`
- `RESEND_API_KEY`
- Optional Google OAuth, Google Analytics, and Cloudinary variables

Validation is defined in `src/lib/env.ts`.

## Development Commands

```bash
bun run dev          # Next dev server
bun run build        # production build
bun run start        # run built app
bun run lint         # non-mutating Biome check
bun run lint:fix     # Biome check --write
bun run format       # Biome format --write
bun run typecheck    # TypeScript only
bun run knip         # unused files/dependencies/exports
bun run prisma:seed  # seed database
```

Make targets are also available:

```bash
make dev
make build
make lint
make check
make prisma-migrate
make prisma-seed
make prisma-studio
make prisma-reset
make docker-up
make docker-down
```

Be careful with `make sync`, `make prisma-reset`, and `make docker-destroy`:
they reset or remove local database state.

## Architecture

- `app/(home)/(auth)`: sign-in, sign-up, forgot/reset password
- `app/(home)/(private)`: authenticated pages
- `app/(home)/(private)/admin`: admin-only pages
- `app/(home)/(public)`: public feed, explore, user/post details, legal pages
- `app/(public)`: programmatic SEO pages
- `app/api/auth/[...all]/route.ts`: better-auth route handler

Project patterns:

- Mutations: `src/actions/*.action.ts` server actions
- Database reads: `src/query/*.query.ts`
- Auth: `src/lib/auth.ts`, `src/lib/auth-client.ts`,
  `src/lib/auth-server.ts`
- i18n: `messages/fr.json`, `messages/en.json`, `src/i18n/request.ts`
- UI primitives: `components/ui`
- Feature components: `components/feature`
- Zustand store: `src/store`
- Shared hooks: `src/hooks`

For agent-specific instructions, see `AGENTS.md`.

## Validation

Run these before handing off code changes:

```bash
bun run typecheck
bun run lint
bun run build
```

For Prisma changes, also run:

```bash
bunx prisma validate
bunx prisma generate
```

There is currently no dedicated test suite configured in `package.json`.
