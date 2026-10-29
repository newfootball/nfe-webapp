# Start SSR authentication — partial implementation (#51)

## Review status

**Draft, do not merge.** The implementation and proof harness are scoped to
`apps/start`. The real synthetic Appwrite run reached signup, HttpOnly cookie
issuance, private SSR reload and client navigation. It then failed on the first
raw server-function replay: Start returned `403 Forbidden` before the auth guard
because the replay did not include the same-origin/RPC headers required by Start.
The public shell suite passes when selected explicitly with
`PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start smoke tests/shell.pw.ts`.
The default `smoke` glob also selects the auth suite without its dedicated server
configuration and currently fails; separate suite selection remains to repair.
The proof is not green; direct function guards, concurrent A/B isolation, account
switching, logout and revocation remain unproven. Natural time-based expiry has
not been tested. Three repair batches have been consumed and preserved in the
worker's canonical task state; no further repair was attempted.

A separate self-review blocker: the sign-in form sends a shared object containing
`name: ""`, while the credential boundary rejects an explicitly empty name. The
login form must send only email/password or the server must validate the name only
for signup. This issue is not repaired in this draft because the shared repair
budget is exhausted. The tests must remain strict; a framework-level 403 must not
be accepted as proof that an authenticated role/identity guard executed.

## Intended boundary

`auth.server.ts` creates a new SDK client per operation. Private reads and the
self-name mutation fetch the current Appwrite account and session; the only
admin role mapping is the protected `admin` label. User prefs cannot grant it.
Private data requests use the session client, never an API-key client. Responses
are reduced to public identity/name/role or a fixed translated error code, with
`Cache-Control: private, no-store` and `Vary: Cookie`.

The only application key needs `sessions.write` for SSR login secrets. Signup
uses the unauthenticated Account API so Appwrite account policy remains active.
No user-management key is configured in the app. The proof harness has a separate
disposable `users.read/users.write` fixture key that must never be deployed.
Passwords, session secrets, SDK errors and backend configuration must not enter
HTML, Query state, logs or client assets. The existing client artifact scan is
retained and extended with the new private names, cookie names and SDK marker.

Configuration is private runtime environment only:

- `START_APP_ORIGIN`: exact origin, HTTPS by default, without a trailing slash.
- `START_APPWRITE_ENDPOINT`: Appwrite API endpoint ending in `/v1`.
- `START_APPWRITE_PROJECT`: project ID.
- `START_APPWRITE_SESSION_KEY`: server-only `sessions.write` key.
- `START_AUTH_ALLOW_HTTP_LOOPBACK=true`: explicit HTTP exception limited to
  localhost/127.0.0.1 development and synthetic proof instances.

HTTPS uses `__Host-nfe-session`, `Secure`, `HttpOnly`, `SameSite=Lax`, host-only,
`Path=/`, with Appwrite's session expiry. Explicit HTTP loopback uses
`nfe-session-dev` without Secure. Mutations require POST, exact configured Origin,
and reject cross-site/same-site Fetch Metadata. Return paths are restricted to
`/{fr|en}/private` for the current locale. No forwarded Host header is trusted.

On successful login/logout, the client cancels in-flight Query requests, clears
all Query cache data and invalidates router loaders. No auth state uses Zustand
in this shell. A direct account switch attempts to revoke the previous session.
These transitions still require the blocked real browser proof before approval.

## Isolated verification

Install root and Start dependencies separately using Bun frozen lockfiles. Build
Start before running either browser suite. The shell suite uses port 3501; auth
proof uses its own local server port 3511 and Docker API port 19561.

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun run --cwd apps/start test
bun run --cwd apps/start typecheck
bun run --cwd apps/start lint
bun run --cwd apps/start build
bun run --cwd apps/start auth:prepare
bun run --cwd apps/start auth:up
NFE_AUTH_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start auth:proof
bun run --cwd apps/start auth:down
```

`auth-local.ts` derives a reduced, pinned official Appwrite2.6.2 compose, with
unique project `nfe-auth-51`, dedicated network/volumes, loopback-only port, and
private random credentials under ignored `scripts/.local`. It refuses preexisting
resources on prepare. `auth-proof.ts` bootstraps disposable synthetic accounts,
starts the built server, invokes Playwright, scans its private log and client
artifacts against generated secrets and writes a redacted evidence JSON. A failed
test is recorded as failure, not converted to success. Its server stops in a
finally block. `auth:down` removes only this project's resources; delete the
ignored private `.local` directory after retaining required redacted diagnostics.

The integration suite intends to assert raw SSR isolation for ten concurrent
requests, A then B in the same browser, direct unauthorized reads/mutations,
protected role promotion/demotion without relogin, rejected origins, session
revocation and generic FR/EN errors. Only the prefix of that suite ran in this
draft; the JSON `testExit` and task state are authoritative.

## Migration constraints

Historical infrastructure status is superseded by the passed synthetic Appwrite
and real B2 compatibility evidence merged in PRs #73 and #74. That evidence is
reused, not rerun here. It does not prove imported source credentials, Google
linking/recovery, permanent hosting or production parity. Identity importer PR#75
uses preserved public IDs and protected label `admin`; this auth draft follows
that contract and does not edit the importer or schema. Final schema review and
independent coordinator review remain required. Next routes/build/configuration
are unchanged.

Official references:

- https://appwrite.io/docs/products/auth/server-side-rendering
- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
