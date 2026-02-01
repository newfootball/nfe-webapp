# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next Football Experience (NFE) - A football/soccer social media web application. Players, coaches, recruiters, and clubs share content, connect, and interact within the football community.

## Development Commands

```bash
make sync              # Full setup: clean, install, docker, migrate, seed, dev
make dev               # Start dev server (auto-starts Docker + installs deps)
make build             # Production build
make lint              # Run all linters (Biome + Prisma validate/format)
make check             # Lint + build
make prisma-migrate    # Run database migrations
make prisma-seed       # Seed database with test data
make prisma-studio     # Open Prisma Studio GUI
make prisma-reset      # Reset database and re-migrate
make docker-up         # Start PostgreSQL container
make docker-down       # Stop containers
make push              # Lint, build, auto-commit, rebase, push current branch
```

Package manager: **Bun** (`bun install`, not npm/yarn).

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5.7**
- **PostgreSQL** + **Prisma 6** ORM
- **better-auth** (email/password + Google OAuth) — *not* NextAuth
- **Tailwind CSS v4** + **Shadcn/UI** (New York style, stone base)
- **TanStack Query** (server state) + **Zustand** (client state)
- **React Hook Form** + **Zod** validation
- **next-intl** (i18n: `fr` default, `en` supported) — locale stored in `NEXT_LOCALE` cookie
- **Cloudinary** (media), **Resend** (email), **Vercel** (hosting)

## Architecture

### Route Groups

```
app/
├── (home)/
│   ├── (auth)/        # Sign-in, sign-up, forgot/reset password — redirects if already authenticated
│   ├── (private)/     # Protected routes (onboarding, profile, post CRUD, messages, admin)
│   └── (public)/      # Public content (explore, post/[id], user/[id], about, privacy, terms)
├── (public)/          # Programmatic SEO pages (players, players/[position], [userType])
└── api/auth/[...all]/ # better-auth API handler
```

- `(private)/layout.tsx` checks session client-side via `useSession()` and redirects unauthenticated users
- `(auth)/layout.tsx` redirects authenticated users away from auth pages
- No server-side middleware file — route protection is in layout components

### Core Patterns

**Server Actions** (`/src/actions/*.action.ts`):
- All mutations go through Server Actions with `"use server"`
- Return `{ error: string }` or `{ success: true }`
- Check auth via `getUserSessionId()` from `/src/lib/auth-server.ts`
- Use `getTranslations()` for i18n error messages
- Call `revalidatePath()` after mutations

**Query Functions** (`/src/query/*.query.ts`):
- All database reads centralized here, marked `"use server"`
- Return typed results with Prisma select/include

**Zustand Stores** (`/src/store/*.store.ts`):
- Export separate hooks: `usePostsActions()`, `usePostsSelectors()` to prevent unnecessary re-renders
- Devtools middleware enabled

**Custom Hooks** (`/src/hooks/`):
- Combine TanStack Query + Zustand (e.g., `usePosts` fetches via query, syncs to store)

**Zod Schemas** (`/src/schemas/`):
- Shared between client validation and Server Action parsing

### Authentication (better-auth)

- Config: `/src/lib/auth.ts` (server), `/src/lib/auth-client.ts` (client), `/src/lib/auth-server.ts` (session helper)
- API route: `/app/api/auth/[...all]/route.ts`
- Client hooks: `signIn()`, `signOut()`, `signUp()`, `useSession()`
- Server session: `getSession()` → `getUserSessionId()` helper
- Password hashing via bcryptjs
- Google OAuth + email/password

### i18n

- Messages in `/messages/en.json` and `/messages/fr.json`
- Config: `/src/i18n/request.ts` reads `NEXT_LOCALE` cookie, defaults to `fr`
- Integrated via `createNextIntlPlugin()` in `next.config.ts`
- Server: `getTranslations(namespace)` / Client: `useTranslations(namespace)`

### Database Models (Prisma)

Key entities: `User` (roles: USER/ADMIN, types: PLAYER/COACH/RECRUITER/CLUB), `Post` (states: DRAFT/PUBLISHED/PENDING/REJECTED/ARCHIVED), `Media` (images/videos via Cloudinary), `Like`, `Comment`, `Follow`, `Favorite`, `Message`, `PostSignal` (moderation).

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Source files | kebab-case | `user-service.ts` |
| React components | PascalCase | `UserForm.tsx` |
| Server actions | `*.action.ts` | `post.action.ts` |
| Query files | `*.query.ts` | `post.query.ts` |
| Zustand stores | `*.store.ts` | `posts.store.ts` |
| Zod schemas | PascalCase + Schema | `PostSchema` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE` |
| Boolean vars | `is`/`has` prefix | `isValid`, `hasAccess` |

## Code Style

- **Biome v2** (sole linter/formatter): tab indentation, double quotes, recommended rules, CSS with Tailwind directives
- **Knip**: unused files/dependencies/exports detection (`bun run knip`)
- **Husky + lint-staged**: pre-commit runs `biome check --write` on staged files
- Server Actions body size limit: `10mb` (configured in `next.config.ts`)

## Environment Variables

Validated at startup in `/src/lib/env.ts` via `@t3-oss/env-nextjs`:
- `DATABASE_URL`, `WEBSITE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY` (required)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_*`, `GOOGLE_ANALYTICS_ID` (optional)
- Client: `NEXT_PUBLIC_APP_URL`

## Workflow Reminders

- Run `make sync` before creating a pull request to reset database and environment
