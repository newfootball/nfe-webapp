# Persistent synthetic local runtime (Refs #64, #46)

This bounded foundation runs the **merged** Start modules with the already
accepted Appwrite **2.6.2** backend. It is local only: no production activation,
source import, B2 access, email delivery, Google activation or final parity claim.
Next's default command/port3500 and the existing Start port3501 stay unchanged.
The full synthetic social graph belongs to #63.

## Install and build without starting services

Use Node24, Bun1.3.14 and Docker Compose v2. From the repository root:

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun run --cwd apps/start test
bun run build:start                 # includes server-boundary/client scan
bun run typecheck:start
bun run lint
bun run local:start release         # prints a SHA256 release digest
bun run local:start release         # same inputs => same digest
```

`release` packages the built SSR handler, Bun dependencies and static client
files into a self-contained content-addressed directory under
`apps/start/.local-runtime/releases/<digest>`. It does not need Docker or service
credentials. The manifest hashes every payload file; `start <digest>` verifies
both manifest identity and payload before execution. Serve the same directory
again to roll back locally; keep previous directories. This is a reproducible
local release, not a promoted image or a preproduction proxy deployment.

## First startup (exclusive backend lease during supervised work)

Check that ports18464 and3564 are free and no other heavy backend proof owns the
host. The bootstrap additionally checks Docker resources and port collisions.
Docker needs at least2CPU/8GiB; allow disk for the pinned images and data volumes.
The accepted images must already be installed: `up` uses `--pull never` and never
installs a different backend version. It uses appwrite/appwrite:2.6.2,
appwrite/postgres:0.1.0, redis:7.4.7-alpine and appwrite/geo:0.3.2.

```sh
bun run local:start prepare
bun run local:start up
bun run local:start provision
bun run local:start provision       # safe replay, preserves rows and credentials
bun run local:start start <digest>  # foreground; Ctrl-C drains requests
```

In another terminal:

```sh
bun run local:start status
curl --fail http://127.0.0.1:3564/_local/health
curl --fail http://127.0.0.1:3564/_local/ready
# Stop the foreground app with Ctrl-C before stopping its backend:
bun run local:start stop
# Later: up, provision (optional), start the same digest.
```

`stop` stops only the dedicated backend containers; it **never** deletes volumes,
config, keys or fixture IDs. Ctrl-C/SIGTERM drains the app (10s deadline). Docker
uses the namespace `nfe-local-runtime-64`, no fixed subnet, and publishes only
Appwrite on127.0.0.1:18464; Start listens only on127.0.0.1:3564. Redis/Postgres and
workers are private to that Compose network. Containers do not auto-restart.
No automatic destructive reset or cleanup command is supplied.

## Private state and synthetic identity

The ignored `.local-runtime` directory must be0700 and its state files0600.
Bootstrap refuses permissive/symlinked state and uses exclusive file creation.
It never writes `.env`/`.env.local`, overwrites existing credentials or resets
existing passwords/profiles. Keep this directory with its named Docker volumes:
losing one half is a manual recovery situation, not permission to regenerate keys.
Do not run bootstrap concurrently or copy these credentials to another environment.

The fixed synthetic project/database are `nfe-local`. The sole seeded actor is
`local-player` (`local-player@example.test`), with a generated password in the
private `fixture.json`; inspect that file only locally when manual login is
needed. No password is printed. Existing profiles and their edits survive replays.
Schema provisioning reuses the accepted v1/profile-v2/media-v3/messaging exports
and rejects baseline digest drift. No destructive reconciliation runs.

Generated `runtime.json` is read by the local command and injected only at runtime.
It contains the local origin/endpoint/project/database, loopback HTTP opt-in,
`sessions.write` key, `rows.read` key and `rows.write` key mapped to merged module
roles. The broader provisioning key stays in `credentials.json` and is never
passed to the app. No `VITE_*`, Google, OAuth broker, SMTP or B2 credentials are
configured. Media access and unconfigured integrations remain unavailable;
there are no media fixtures and no B2 requests in this foundation. Arbitrary
signup/email workflows are outside this synthetic operational recipe.

## Diagnostics and proof

`status` returns only HTTP status codes. Liveness proves the app process responds;
readiness requires Appwrite2.6.2 and all four schema markers through a real server
read, with bounded timeout. Readiness returns503 on backend/schema/config failure
without leaking its cause/credentials. Neither endpoint exposes settings or data.
For diagnosis check Node/Bun versions, `status`, free ports, Docker disk/memory and
`docker compose --project-name nfe-local-runtime-64 --file apps/start/.local-runtime/compose.json ps`.
Do not print `compose config`, `docker inspect` environments, private JSON or raw
backend logs into reports: they can contain credentials or session material.
Backend logs rotate at10MiB ×5 per service. The foreground app suppresses raw
request/error output; proof logs stay private and are scanned for secret values.

After receiving the coordinator's **explicit exclusive backend lease**, run:

```sh
NFE_LOCAL_RUNTIME_LEASE=64 PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start local:proof
```

Alternatively install the pinned Playwright Chromium before acquiring the lease
and omit `PLAYWRIGHT_CHANNEL`. The proof performs repeat prepare/provision,
identical release packaging, anonymous SSR, real browser login, private raw SSR,
public profile read, graceful app restart, backend stop/readiness failure/restart,
identity/config/session persistence and secret scans. It revokes its browser
session, stops its own app and backend even on failure, and leaves persistent
volumes/state for the next local run. Sanitized private `proof-<timestamp>.json`
records checks and retained volumes; no cloud calls, schedules or watchers run.

This runbook does not establish TLS/proxy behavior, SMTP delivery, B2 signed URL
or Range behavior, monitoring/SLO ownership, backups/DR, Appwrite upgrade safety,
a preproduction promotion or whole-issue acceptance for #64/#46. Those gates
require their own authorization and evidence; never mark either issue closed
from this local foundation.
