# Start foundation

Independent migration shell (Refs #48). This is preparation only: #45 remains
blocked on real Appwrite/B2 evidence, and this shell does not establish backend,
authentication, storage or video parity. Neither issue is closed by this change.

From the repository root, with Bun 1.3.14 and Node 24:

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun run dev:start                 # http://localhost:3501/fr
bun run build:start
bun run typecheck:start           # run build first to generate route types
(cd apps/start && bunx playwright install chromium)
bun run smoke:start               # owns port 3501; stop dev first
```

Alternatively install the browser from `apps/start` with `bunx playwright install chromium`.
For an existing local Chrome installation, `PLAYWRIGHT_CHANNEL=chrome bun run smoke:start`
uses that browser instead; CI installs Playwright Chromium explicitly.
Run the built shell using `bun run --cwd apps/start start` (loopback only, port 3501).
Next stays at `bun run dev` (3500), `bun run typecheck` and `bun run build`.
Each application has its own manifest, lockfile and TypeScript boundary. Root
installation is also required because Start reuses the existing shadcn Button and
its `cn` helper. Vite deduplicates React. Existing CSS tokens and public assets
are reused; font fallback replaces Next's font loader. No business page is ported.

Routes: `/` redirects to `/fr`; `/fr`, `/en`, and their `/about` pages.
Unknown routes/locales return 404. The root supplies a recoverable error boundary.
The theme follows the system and persists a manual selection in local storage.
Query integration creates one QueryClient per router/SSR request and hydrates it.
A bounded, synthetic `nfe-shell-reader` cookie (not authentication) exercises SSR
cache isolation; responses containing it use `private, no-store`.

No environment variables or external services are required. An optional
`VITE_APP_NAME` is explicitly validated in `env-public.ts`. Only Vite-prefixed
values are public; never prefix credentials with `VITE_`. Private configuration
is validated per request in `env.server.ts`; no backend credentials are defined.
Start loads only its own env directory. Server functions bridge isomorphic
loaders to `.server.ts` modules; import protection fails on boundary violations.
No root auth/Prisma/Next server module is imported.

Smoke tests run against the built Bun server and cover raw SSR HTML, eight
concurrent readers with the same query key, FR/EN, 404s, hydration, client routing
persistent theme and the error boundary. Build also scans the client JavaScript for
server-only imports, credential names and the synthetic server cookie name. They are named `*.pw.ts` so root `bun test` does not collect
Playwright tests. The local runner serves build assets only; production hosting,
security hardening and deployment configuration are outside this foundation.

Official references (Context7 unavailable in the implementation session):
- https://tanstack.com/start/latest/docs/framework/react/build-from-scratch
- https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query
- https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
- https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables
- https://tanstack.com/start/latest/docs/framework/react/guide/hosting
