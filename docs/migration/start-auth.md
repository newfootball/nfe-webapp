# Start SSR authentication (#51)

## Verification status

The scoped authentication proof passes against a task-owned Appwrite **2.6.2**
instance and the **production-built** Start shell. No mocked service, clock or
session is used. The redacted result is in
[`apps/start/evidence/auth-synthetic.json`](../../apps/start/evidence/auth-synthetic.json).
Independent coordinator review and exact-head hosted CI are still required.

The completed proof covers browser signup, successful FR/EN login, direct SSR
reload and client navigation; direct private/admin RPC reads; protected `admin`
label promotion/demotion and ineffective admin prefs; self mutation, anonymous
and disabled-identity denial; exact-Origin rejection with unchanged persisted
state; a separately identified Start CSRF 403; null/missing/wrong-type/foreign-ID
payload rejection with sanitized `private, no-store` and `Vary: Cookie` responses;
ten concurrent A/B SSR documents; A→B in the same live browser document and
revocation of the previous session; completed logout and server-side revocation;
explicit administrative revocation; and **natural 60-second session expiry**.
The expired secret is explicitly replayed to prove server rejection in addition
to browser cookie expiry. Wrong-password and absent accounts return the same
FR/EN error, with each actual RPC response checked before the UI assertion.
Safe external return paths stay on the current locale's private page.

Five focused input/cache/policy tests (40 assertions) also pass. They cover
strict signup/login/name schemas, unknown fields, HTTPS cookie configuration,
Origin policy, safe return paths and cancellation of pending prior-account Query
writes. The existing default public-shell smoke selects only `shell.pw.ts` and
passes all three tests without an auth credentials fixture. Auth remains a
separate opt-in suite. Client import protection and the secret scanner remain
enabled; the successful proof scans built browser artifacts and the app server
log against both generated API keys, the password and retained session secrets.

Historical failed attempts and the six-batch shared repair history remain in the
canonical orchestration task state; the final successful run supersedes those
failures rather than reclassifying them as passes. Root and Start frozen installs
were performed independently in a disposable validation copy. Root typecheck,
lint, 22 unit tests and Next build passed; the synthetic build database is
intentionally unreachable, so sitemap fallback diagnostics are expected.

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
The real browser proof verifies these transitions; focused Query tests also
verify that a late prior-account response cannot repopulate the cleared cache.

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

The dedicated project uses Appwrite's minimum supported session duration of
60 seconds, configured only by the disposable console bootstrap. The integration
suite completes every assertion listed above. The JSON `testExit: 0` and task
state are authoritative; the suite is not silently included in public-shell CI.

## Migration constraints

Historical infrastructure status is superseded by the passed synthetic Appwrite
and real B2 compatibility evidence merged in PRs #73 and #74. That evidence is
reused, not rerun here. It does not prove imported source credentials, Google
linking/recovery, permanent hosting or production parity. Identity importer PR#75 is merged and
uses preserved public IDs and protected label `admin`; this auth implementation
follows that contract and does not edit the importer or schema. The schema
worker's latest validation passes against base `bd3951b`, but its independent
review/merge is still pending. This session boundary uses Account/Users identity
contracts only, with no schema-table dependency or claim of representative-source
compatibility. Next routes/build/configuration are unchanged.

Official references:

- https://appwrite.io/docs/products/auth/server-side-rendering
- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions

Pinned Appwrite session-duration implementation (minimum 60 seconds):
https://github.com/appwrite/appwrite/blob/54581f9698f9de23cf4b1432e353b3ee9b0012d5/src/Appwrite/Platform/Modules/Project/Http/Project/Policies/SessionDuration/Update.php
