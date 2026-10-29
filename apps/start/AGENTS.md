# Start Migration Shell

This is an independent TanStack Start foundation, not the production Next app
or proof of backend/auth/storage parity. Read [README.md](README.md) before
changing the shell. Keep its manifest, lockfile and TypeScript boundary separate.

## Commands

From the repository root (Bun 1.3.14 and Node 24):

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun run dev:start                 # port 3501, strict; Next uses 3500
bun run build:start               # builds and scans client output
bun run typecheck:start           # build first to generate route types
bun run smoke:start               # built Bun server; stop dev on 3501 first
```

Smoke tests need Playwright Chromium installed from this directory with
`bunx playwright install chromium`, or use
`PLAYWRIGHT_CHANNEL=chrome bun run smoke:start` from the root for local Chrome.
`bun run --cwd apps/start start` serves the built shell on loopback only.

## Boundaries

- Installed: Start 1.169.4, Router 1.170.46, Query 5.105.0, Vite 8.3.5,
  React 19.2.5, Tailwind 4.3.3. Before editing this package, read
  [.agents/rules/tanstack-start.md](.agents/rules/tanstack-start.md), then follow
  the installed source/types and this package's README when examples differ.
- Preserve per-request QueryClient creation in `src/router.tsx` and SSR hydration.
  The synthetic `nfe-shell-reader` cookie tests cache isolation and is not auth;
  responses carrying it must remain `private, no-store`.
- Loaders and `beforeLoad` are isomorphic. Runtime-validate inputs and authorize
  every protected server function/route independently of UI guards; keep
  credentials and private data behind the server boundary.
- Server functions bridge loaders to `.server.ts` modules. Import protection
  must remain enabled; do not import root Next/auth/Prisma server modules.
- Only intentionally public values belong in `VITE_*`. Use `src/lib/env-public.ts`
  and `src/lib/env.server.ts`; this app loads only its own environment directory.
- Locale routes use `/fr` and `/en`, with `/` redirecting to `/fr`; unknown locales
  return 404. Keep both languages in `src/lib/messages.ts` aligned. This shell
  does not use root next-intl configuration.
- Reuse existing shadcn Button, `cn`, root CSS tokens and public assets. Preserve
  React deduplication and avoid importing Next-specific UI into the shell.
- Do not hand-edit `src/routeTree.gen.ts`. Keep browser tests named `*.pw.ts` so
  root `bun test` does not collect Playwright tests.
- Before changing query/SSR state, read
  [../../.agents/rules/tanstack-query.md](../../.agents/rules/tanstack-query.md).
  For styles, read [../../.agents/rules/tailwind-v4.md](../../.agents/rules/tailwind-v4.md).
  For environment validation, read [../../.agents/rules/zod.md](../../.agents/rules/zod.md).
