# Start release runbook (Refs #64)

Operating procedure for the TanStack Start release on the Coolify server `nfe-production`
(`https://nfe-foot.com`, Appwrite at `https://appwrite.nfe-foot.com`, media on Backblaze B2
bucket `nfe-webapp-prod`). Image and runtime contract: [start-production.md](start-production.md).
There is no preproduction: every step below runs against production and must be announced first.

Owner: Fahari (`mkldevops`), release and on-call. Change the owner here when it changes.

## 1. Before a release

1. CI green on the release commit: `lint`, `start-foundation` (tests, lint, build, typecheck,
   smoke), `start-image` (image build + container smoke), importer and schema jobs.
   No job uses `continue-on-error` or `|| true`; installs use `--frozen-lockfile` with Bun 1.3.14.
2. Tag the commit: `git tag vYYYY.MM.DD-N && git push origin vYYYY.MM.DD-N`.
   The tag is the release identity; the CI image of that tag is the tested artefact.
3. Note the currently running deployment in Coolify (commit and image tag): it is the rollback target.
4. Check the latest Appwrite backup is under 24 h old ([backup-restore.md](backup-restore.md)).

## 2. Promote

1. Coolify → application `nfe-start` → **Git source**: set the branch/commit to the tag, **Deploy**.
   Coolify builds `apps/start/Dockerfile` from the repository root, identical to the `start-image` CI job.
2. Coolify keeps the previous container serving until the new one passes `/healthz`.
3. Run the smoke from a workstation:

   ```sh
   bun run --cwd apps/start prod:smoke                    # read-only, ~10 s
   SMOKE_EMAIL=… SMOKE_PASSWORD=… bun run --cwd apps/start prod:smoke:login
   ```

   `prod:smoke` checks liveness, readiness (Appwrite), SSR `/fr`, the `www` 308, immutable hashed
   assets, absence of server variable names in the SSR HTML and every reachable client chunk,
   same-origin-only client diagnostics, the 307 to a 120 s version-pinned signed B2 URL with
   `private, no-store` and `no-referrer`, a `Range` read (206) on B2 and the B2 CORS preflight for
   `PUT` (allowed for the app origin, refused for a foreign one). It never prints signed URLs or bodies.
   Exit `0` = all checks passed; `1` = a check failed; `2` = a check could not run (listed in
   `notRun`, e.g. no public media on `/fr`: set `SMOKE_MEDIA_PATH=/post-media/<id>/thumbnail`).
   A release gate requires exit `0`.
   `prod:smoke:login` signs in with a dedicated smoke account (never a real user), checks the
   `__Host-nfe-session` cookie is `Secure`/`HttpOnly`, reads private pages through Appwrite, fails
   on any 5xx or uncaught page error, then signs out from `/fr/private`. Without credentials it
   reports `skipped`, which does not count as a passed gate.
4. Watch the Coolify logs for 10 minutes (section 4). Any `threshold_breached` or failed smoke → rollback.

## 3. Roll back

1. Coolify → `nfe-start` → **Rollback** → select the image noted in 1.3 → **Rollback**.
   No rebuild; the container restarts on the previous image with the current environment.
2. If an environment variable changed with the release, restore its previous value first.
3. Run `prod:smoke` again; record the release tag, time and reason in the issue or PR.
4. Never delete the previous image, deployment or Appwrite data while investigating.
   Schema changes are additive (see [appwrite-schema.md](appwrite-schema.md)), so rolling the
   app back never requires rolling the database back.

## 4. Observability

The production entry (`apps/start/server/production.ts`, `server/telemetry.ts`) writes JSON lines
to stdout, kept by Coolify (**Logs** tab, or `docker logs <container>` on the server):

| Event | Content | Never contains |
| --- | --- | --- |
| `request` | `id`, `method`, `path` (no query, max 160 chars), `status`, `ms`; `/healthz`, `/readyz` and `/assets/*` excluded | query strings, headers, cookies, bodies, IPs |
| `request_failed` | `id`, `method`, `path`, `error` (error class name only) | message, stack, upstream body |
| `client_error` | browser `error`/`unhandledrejection`: `kind`, redacted `message` (300 chars), `path`; `Content-Length` ≤ 4 KB (else 413), 10/min per client address and 60/min overall, excess counted in `metrics.clientErrorsDropped` | stack, query, user data |
| `metrics` | every 60 s: `requests`, status classes, `errorRate`, `p50Ms`/`p95Ms`/`p99Ms`/`maxMs`, `inflight`, `maxInflight`, `rssBytes`, `heapUsedBytes`, `tmpFreeBytes`, `clientErrorsDropped` | — |
| `threshold_breached` | `alert` name, emitted next to the `metrics` line that crossed it | — |

Redaction (`redactText`) strips `X-Amz-Signature/Credential/Security-Token` values, `Bearer`/`Basic`
tokens, `key|secret|password|token|session=` values and opaque strings of 48+ characters.
Signed URLs only travel in `Location` headers, which are never logged.
The `Origin`/`Sec-Fetch-Site` check on client beacons only stops cross-site browser posts; a
non-browser client can forge it, so `client_error` lines are diagnostic hints, never evidence.
A high `clientErrorsDropped` means the budget is saturated (real error storm or abuse).

Diagnosis by symptom:

- 5xx on a page → find its `request` line, then the `request_failed` line with the same `id`.
- Client-side breakage → `client_error` lines for the path.
- Appwrite outage → `/readyz` 503 and `readiness_appwrite` failing in `prod:smoke`; `/healthz`
  stays 200 on purpose so Coolify does not restart a healthy app during an Appwrite incident.
- Storage → `tmpFreeBytes` (ffmpeg scratch) here; B2 volume and transfer in section 6.

### Thresholds

| Alert | Threshold (per 60 s window) | First action |
| --- | --- | --- |
| `error_rate` | 5xx > 2 % with ≥ 20 requests | correlate `request_failed`; rollback if it started with a release |
| `latency_p95` | p95 > 1500 ms with ≥ 20 requests | check `/readyz`, Appwrite and server CPU in Coolify metrics |
| `saturation_inflight` | > 64 concurrent requests | check traffic origin; scale the server or add a replica |
| `memory_rss` | RSS > 768 MiB | restart from Coolify, then look for a leak in the release diff |
| `storage_tmp_free` | free temp disk < 1 GiB | clean the server (`docker system prune` via Coolify), check stuck media jobs |

Values are starting points for one small container (`defaultThresholds` in `server/telemetry.ts`);
revise them from a month of `metrics` lines. Coolify server metrics (CPU, RAM, disk) cover the host.
No external alerting is wired: the owner reads the logs after each release and when a user reports
an issue. Deferred monitoring (cron, watcher) is deliberately out of scope.

## 5. Upgrade Appwrite

Appwrite runs as the Coolify service `appwrite-nfe` (currently `2.6.2`). Password recovery is
gated on that exact version: `invalidationPolicy()` in `apps/start/src/lib/recovery.server.ts`
compares `START_RECOVERY_INVALIDATION_CONFIRMED` to the literal `"2.6.2"`. Changing only the
variable disables recovery for every user.

1. Read the Appwrite release notes between the current and target versions; stop on any breaking
   change to sessions, Users, Databases or the `/health/version` route.
2. Rehearse locally: bump the version in the local runtime (`docs/migration/start-local-runtime.md`),
   run `bun run --cwd apps/start local:proof` and the auth/recovery proofs.
3. Take a fresh backup and verify it restores ([backup-restore.md](backup-restore.md), blocked by #47).
4. Announce a short window; in Coolify change the `appwrite-nfe` image tags, **Deploy**, then run
   the Appwrite migration command shown in the release notes (`docker compose exec appwrite migrate`).
5. Check `https://appwrite.nfe-foot.com/v1/health/version` reports the new version, then
   `prod:smoke` and `prod:smoke:login`.
6. Recovery: before the upgrade, ship a Start release whose `recovery.server.ts` literal is the
   target version, after `bun run --cwd apps/start recovery:proof` passed against it locally. Until
   Appwrite, the literal and the variable match, recovery answers `unavailable` (expected; announce
   it). After the upgrade set `START_RECOVERY_INVALIDATION_CONFIRMED` to the new version, redeploy
   `nfe-start`, and test a recovery request with the smoke account.
7. Rollback: restore the previous image tags **and** the backup from step 3 (Appwrite migrations are
   not reversible). Record the outcome.

## 6. B2 storage and cost

- Keys live only in the Coolify runtime environment of `nfe-start` (`B2_*`, not build variables);
  `check:client` at build time and `prod:smoke` at run time prove they are absent from the bundle.
- Upload is direct browser → B2 multipart with presigned parts; `prod:smoke` only verifies the CORS
  preflight for `PUT` from the app origin (it is read-only and never uploads). Reads are 120 s
  signed redirects supporting `Range`, verified by `prod:smoke` on the final domain.
- Volume and cost: Backblaze console → **Reports** for `nfe-webapp-prod` (stored GB, downloaded GB,
  class B/C transactions). Review monthly. A CDN in front of B2 is only worth it if egress exceeds
  the free allowance (3× stored volume per month) — not the case at launch.

## 7. Release record

For each release, keep in the PR or issue: tag, Coolify deployment time, `prod:smoke` summary
line, `prod:smoke:login` result, and whether a rollback happened.
