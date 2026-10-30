# Start foundation

Independent migration shell (Refs #48). Appwrite2.6.2 and B2 compatibility
evidence passed and was merged in PRs #73/#74. Production, representative source
import, storage and video parity are not established by this shell.

SSR authentication has a passing isolated synthetic proof (Related #51); see
[the auth implementation and proof status](../../docs/migration/start-auth.md).
Independent review and exact-head CI remain required; imported-source and permanent-host gates are not established.

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
are reused; font fallback replaces Next's font loader. Only a scoped authentication/private identity page is added; no business page is ported.

Routes: `/` redirects to `/fr`; `/fr`, `/en`, and their `/about` pages.
Unknown routes/locales return 404. The root supplies a recoverable error boundary.
The theme follows the system and persists a manual selection in local storage.
Query integration creates one QueryClient per router/SSR request and hydrates it.
A bounded, synthetic `nfe-shell-reader` cookie (not authentication) exercises SSR
cache isolation; responses containing it use `private, no-store`.

Public shell routes need no external service. Auth routes require the private
runtime configuration documented in `docs/migration/start-auth.md`. An optional
`VITE_APP_NAME` is explicitly validated in `env-public.ts`. Only Vite-prefixed
values are public; never prefix credentials with `VITE_`. Private configuration
is validated per request in `env.server.ts`; auth configuration remains server-only.
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

## Public-page migration (#61)

The resumed public-page lot is partial and must not be merged yet. See
[public pages, SEO, evidence and known URL blocker](../../docs/migration/start-public-pages.md).
Use `START_SMOKE_PORT=3562 PLAYWRIGHT_CHANNEL=chrome bun run smoke:start` from
root when the default port 3501 is already occupied; the existing default stays
unchanged. Production indexing is deliberately disabled throughout the shell.
