# Persistent synthetic local runtime (Refs #64, #46)

This bounded foundation runs the **merged** Start modules with the already
accepted Appwrite **2.6.2** backend. It is local only: no production activation,
source import, B2 access, email delivery, Google activation or final parity claim.
Next's default command/port3500 and the existing Start port3501 stay unchanged
(#65 later made `bun run dev` start Start; the Next app has since been removed).
The full synthetic social graph belongs to #63.

## Install and build without starting services

Use Node24, Bun1.3.14 and Docker Compose v2. The browser proof launches `node`
from Bun using `PATH`; a shell alias alone does not select its version. Confirm
`bun -e 'console.log(Bun.spawnSync(["node", "--version"]).stdout.toString())'`
reports v24 before starting services. The proof also checks this executable before
backend startup. From the repository root:

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

`release` copies the exact Vite SSR/client output, the native Bun TypeScript
runner and internal notification consumer, their server-only source dependency
closure, and the frozen installed Start dependency tree into a self-contained
content-addressed directory under
`apps/start/.local-runtime/releases/<digest>`. It does not need Docker or service
credentials. Internal package links are safely dereferenced, external links are rejected, and
all runtime package resolution must stay inside the artifact. This deliberately
avoids a second graph bundle: native Linux CI showed Bun1.3.14 moving otherwise
identical modules between output positions. No bytes are normalized or omitted
from the full payload hashes. The artifact is larger (about257MiB on the local
host) and bound to its recorded OS/CPU architecture and Bun1.3.14.
The manifest hashes every payload file; `start <digest>` verifies
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

If Docker reports exhausted automatic address pools, inspect existing Docker subnets
and host routes, then choose an unused private `10.x.y.0/24` range for the **first**
prepare: `NFE_LOCAL_RUNTIME_SUBNET=10.245.164.0/24 bun run local:start prepare`.
The example is not a reservation: verify it is free on your host. The chosen
subnet is persisted and survives container recreation; later commands need no
environment override. Supplying a different subnet for existing state is refused.
Do not prune unrelated Docker networks to free space.

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
uses the namespace `nfe-local-runtime-64`, Docker automatic subnet allocation by default, and publishes only
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
Schema provisioning reuses the accepted v1/profile-v2/media-v3/messaging,
notification-v1 and lifecycle-v1 exports and rejects baseline digest drift. No destructive reconciliation runs.
An older persistent fixture is upgraded only by adding its distinct lifecycle key
and corresponding runtime field atomically; every existing value must match.
Unknown drift or replacement of an existing field is refused.

Generated `runtime.json` is read by the local command and injected only at runtime.
It contains the local origin/endpoint/project/database, loopback HTTP opt-in,
a separate `health.read` key, distinct `rows.read`/`rows.write` notification and
lifecycle keys,
`sessions.write` key, `rows.read` key and `rows.write` key mapped to merged module
roles. The internal consumer receives only its notification key and the configuration
needed by the accepted notification connection. It runs one bounded delivery
at a time, uses the accepted Appwrite outbox leases/retries, and reports sanitized
counters and failed/permanent delivery state in a private fresh process-bound
heartbeat. It has no public HTTP/RPC hook. The foreground parent owns its PID;
app failure, Ctrl-C or SIGTERM stop/reap the consumer and supervisor, with bounded
force-stop fallback. Loss of the foreground parent/app also stops the consumer.
No consumer, poller or scheduler is installed outside that foreground lifetime.
The broader provisioning key stays in `credentials.json` and is never
passed to the app. No `VITE_*`, Google, OAuth broker, SMTP or B2 credentials are
configured. Media access and unconfigured integrations remain unavailable;
there are no media fixtures and no B2 requests in this foundation. Arbitrary
signup/email workflows are outside this synthetic operational recipe.

## Diagnostics and proof

`status` returns only HTTP status codes. Liveness proves the app process responds;
readiness requires a fresh strictly validated private supervisor report for all six
Compose services, Appwrite2.6.2, positive DB/cache/geo health checks through a separate
`health.read` key, and all six schema markers through real server reads. Network
checks share a cancellable4s deadline. Worker main-process availability is checked;
queue-progress or latency guarantees are outside this foundation. The foreground
supervisor polls only the fixed dedicated Compose namespace while its app runs;
its report expires after10s, rejects future timestamps and wrong identity, and is
removed on shutdown. The app never invokes Docker or reads its socket. CLI probes run in an owned
detached process group, with bounded group TERM/KILL, pipe cancellation and
reaping; only that spawned group is targeted, never the Docker daemon or user
process group. Cancellation handlers are registered before startup inspection. Readiness returns503 on backend/schema/config failure
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

The browser check uses a separate Node24 process with explicit action/navigation
timeouts and a 60s owned process-group deadline. Session handoff files remain
private and are removed after revocation; the app itself still runs on Bun.

Alternatively install the pinned Playwright Chromium before acquiring the lease
and omit `PLAYWRIGHT_CHANNEL`. The proof performs repeat prepare/provision,
identical release packaging, anonymous SSR, real browser login, private raw SSR,
public profile read, graceful app restart, backend stop/readiness failure/restart,
identity/config/session persistence, proof-only container recreation without deleting
volumes, individual geo/worker outages, stale/missing supervisor reports and secret
scans. One deterministic synthetic notification is delivered by the foreground
consumer and remains unique after app restart. It revokes its browser
session, independently attempts bounded browser/session/app/supervisor/backend teardown even
when another cleanup fails, records failed checks/cleanup without secret details,
and leaves persistent
volumes/state for the next local run. Sanitized private `proof-<timestamp>.json`
records checks and cleanup outcomes; no cloud calls, schedules or watchers run.

This runbook does not establish TLS/proxy behavior, SMTP delivery, B2 signed URL
or Range behavior, monitoring/SLO ownership, backups/DR, Appwrite upgrade safety,
a preproduction promotion or whole-issue acceptance for #64/#46. Those gates
require their own authorization and evidence; never mark either issue closed
from this local foundation.

## Executed local acceptance (2026-11-01)

[The sanitized proof](../../apps/start/evidence/local-runtime-synthetic.json)
records 16 successful checks from reviewed source `8134d67`, using Node24.22.1,
Bun1.3.14 and actual Appwrite2.6.2. This includes browser login, direct private
SSR, durable notification delivery, app restart with the same session, individual
geo/worker failures, expired supervisor reports, backend restart and full
container recreation with the original volumes, configuration and identity.
All five cleanup stages passed; owned app/backend processes stopped and persistent
volumes remained. The additive lifecycle upgrade preserved all seven prior
credential fields and all 21 prior runtime fields. 127 unit tests, build/client
scan (73 files), typechecks and lint passed. Native CI and the remaining global
migration gates are assessed separately on the delivered commit.
