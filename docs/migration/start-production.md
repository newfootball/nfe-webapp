# Start production image and runtime (Refs #64)

Production artefact of `apps/start` for the Coolify server `nfe-production`
(Traefik terminates TLS for `https://nfe-foot.com` and `https://www.nfe-foot.com`).
This document covers the image, the runtime contract, the Coolify settings and
the promotion/rollback procedure. It does not switch the public domain and does
not replace the Next application as the reference.

## Artefact

| Item | Value |
| --- | --- |
| Dockerfile | `apps/start/Dockerfile` (multi-stage, `oven/bun:1.3.14-slim` build, `oven/bun:1.3.14-alpine` runtime) |
| Build context | repository root (`docker build -f apps/start/Dockerfile .`); `.dockerignore` is an allowlist |
| Why the root | Start imports `components/ui/button.tsx`, `src/lib/utils.ts`, `messages/*.json`, `app/globals.css`, `public/` |
| Installs | `bun install --frozen-lockfile --ignore-scripts` for the root and for `apps/start`; production dependencies only in the runtime image |
| Runtime contents | `/app/dist` (client + SSR bundles), `/app/node_modules` (production), `/app/server` (entry), `/app/package.json` |
| Not in the image | sources, tests, Playwright, lockfile of the root app, any `.env` file |
| User / port | `bun` (uid 1000) / `3000` (`PORT`), bound to `0.0.0.0` (`HOST`) |
| Extra packages | `ffmpeg`/`ffprobe` (media processing spawns them), `curl` (container health check), CA certificates |
| Entry | `bun server/production.ts` (`apps/start/server/production.ts`) |
| Bundle guard | `bun run check:client` runs inside the build with `NFE_PRIVATE_BUNDLE_CANARY` set: any server-only variable name or the canary value in `dist/client` fails the build |

`apps/start/server.ts` stays the loopback runner of the local synthetic runtime
(port 3501, `/_local/*` health). Production uses `server/production.ts` only.

Local commands (from `apps/start`, Docker required):

```sh
bun run image:build     # docker build --file Dockerfile --tag nfe-start:local ../..
bun run image:smoke     # scripts/image-smoke.sh nfe-start:local
```

## Runtime behaviour

| Path / event | Behaviour |
| --- | --- |
| `GET /healthz` | liveness, `200 {"status":"ok"}`; `503 {"status":"draining"}` after SIGTERM. Never touches a dependency. |
| `GET /readyz` | readiness, `200` when the keyless Appwrite route `GET {START_APPWRITE_ENDPOINT}/health/version` answers; `503 {"status":"unavailable","checks":{"appwrite":"unavailable"}}` otherwise. 3 s timeout, 5 s cache, one in-flight probe. |
| Hashed assets `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` |
| Other static files | `Cache-Control: public, max-age=3600, must-revalidate`; dotfiles and traversal never resolve |
| Forwarded headers | `X-Forwarded-Proto` and `X-Forwarded-Host` (first value, validated) rebuild the public URL when `START_TRUST_PROXY` is not `false`. The app only ever runs behind Traefik, so the default is `true`. |
| Alias hosts | any host different from `START_APP_ORIGIN` gets `308` to the canonical origin (`www.nfe-foot.com` → `nfe-foot.com`); non-idempotent methods get `421`. Health paths are exempt. The `__Host-nfe-session` cookie requires one canonical https origin. |
| SIGTERM / SIGINT | stop accepting connections, drain in-flight requests up to 10 s, then exit `0` |
| Errors | handler failures log `request_failed method=… path=…` only and return `500`; no error object, body or header is serialized |
| Logs | one `listening host= port= origin= appwrite=<host> trustProxy=` line at boot; configuration values are never printed |

## Environment variables

Validation runs before the server listens (`apps/start/server/env.ts`). On failure
the process exits `1` and prints variable **names** only, grouped as `missing`,
`invalid` and `forbidden in production`. Values never appear in logs or responses.

Scope: `server` = read by the Bun process only; `client` = inlined by Vite at build time.
Example values are placeholders.

| Name | Scope | Required | Example | Used by |
| --- | --- | --- | --- | --- |
| `START_APP_ORIGIN` | server | yes | `https://nfe-foot.com` | `auth-context.server.ts` (canonical origin, secure cookies); `server/production.ts` (alias redirect) |
| `START_APPWRITE_ENDPOINT` | server | yes | `https://appwrite.nfe-foot.com/v1` | every Appwrite client, readiness probe |
| `START_APPWRITE_PROJECT` | server | yes | `nfe` | every Appwrite client |
| `START_APPWRITE_DATABASE` | server | yes | `nfe` | every `*.server.ts` module reading collections |
| `START_APPWRITE_SESSION_KEY` | server | yes | `<api key: sessions>` | `auth-context.server.ts`, `feed.server.ts`, `media-db.server.ts` |
| `START_APPWRITE_FEED_READER_KEY` | server | yes | `<api key>` | `feed.server.ts`, `messaging.server.ts`, `post-text.server.ts`, `interactions.server.ts` |
| `START_APPWRITE_PROFILE_WRITER_KEY` | server | yes | `<api key>` | `profile.server.ts`, `feed.server.ts`, `messaging.server.ts`, `media-db.server.ts`, `post-text.server.ts` |
| `START_APPWRITE_FOLLOW_WRITER_KEY` | server | yes | `<api key>` | `follow.server.ts`, `messaging.server.ts` |
| `START_APPWRITE_INTERACTION_WRITER_KEY` | server | yes | `<api key>` | `interactions.server.ts` |
| `START_APPWRITE_POST_TEXT_WRITER_KEY` | server | yes | `<api key>` | `post-text.server.ts`, `messaging.server.ts` |
| `START_APPWRITE_MESSAGING_WRITER_KEY` | server | yes | `<api key>` | `messaging.server.ts` |
| `START_APPWRITE_MODERATION_READER_KEY` | server | yes | `<api key>` | `moderation.server.ts` |
| `START_APPWRITE_MODERATION_WRITER_KEY` | server | yes | `<api key>` | `moderation.server.ts` |
| `START_APPWRITE_NOTIFICATION_WRITER_KEY` | server | yes | `<api key>` | `notification-outbox.server.ts` |
| `START_APPWRITE_LIFECYCLE_WRITER_KEY` | server | yes | `<api key>` | `post-lifecycle-db.server.ts` |
| `START_APPWRITE_ACCOUNT_LIFECYCLE_WRITER_KEY` | server | yes | `<api key>` | `account-deletion.server.ts`, `account-lifecycle-anchor.server.ts` |
| `START_APPWRITE_MEDIA_READER_KEY` | server | yes | `<api key>` | `media-db.server.ts` |
| `START_APPWRITE_MEDIA_WRITER_KEY` | server | yes | `<api key>` | `media-db.server.ts` |
| `B2_APPLICATION_KEY_ID` | server | yes | `0031234567890000000000001` | `media-storage.server.ts` (S3 client, presigned URLs) |
| `B2_APPLICATION_KEY` | server | yes | `<application key>` | `media-storage.server.ts` |
| `B2_BUCKET_NAME` | server | yes | `nfe-media` | `media-storage.server.ts` |
| `B2_REGION` | server | yes | `eu-central-003` | `media-storage.server.ts` |
| `B2_ENDPOINT` | server | yes | `https://s3.eu-central-003.backblazeb2.com` | `media-storage.server.ts`; must match `B2_REGION` |
| `START_MEDIA_PREFIX` | server | yes | `media/` | `media-storage.server.ts` (object key prefix, must end with `/`) |
| `START_GOOGLE_ENABLED` | server | no (`false`) | `true` | `oauth.server.ts` |
| `START_GOOGLE_CLIENT_ID` | server | if Google enabled | `<client id>.apps.googleusercontent.com` | `oauth.server.ts` |
| `START_GOOGLE_CLIENT_SECRET` | server | if Google enabled | `<client secret>` | `oauth.server.ts` |
| `START_OAUTH_BROKER_KEY` | server | if Google enabled | `<api key>` | `oauth.server.ts` |
| `START_OAUTH_REDIS_URL` | server | if Google enabled | `redis://redis:6379` | `oauth-state.server.ts` |
| `START_OAUTH_REGISTRY_PATH` | server | if Google enabled | `/app/oauth-registry.json` | `oauth-registry.server.ts` |
| `START_RECOVERY_INVALIDATION_CONFIRMED` | server | no | `2.6.2` | `recovery.server.ts` (must equal the deployed Appwrite version to enable recovery invalidation) |
| `START_TRUST_PROXY` | server | no (`true`) | `true` | `server/production.ts` |
| `PORT` | server | no (`3000`) | `3000` | `server/production.ts` |
| `HOST` | server | no (`0.0.0.0`) | `0.0.0.0` | `server/production.ts` |
| `NODE_ENV` | server | no (`production`, set by the image) | `production` | `env.server.ts` |
| `START_MEDIA_MAX_VIDEO_BYTES`, `START_MEDIA_MAX_IMAGE_BYTES`, `START_MEDIA_READ_TTL_SECONDS`, `START_MEDIA_MAX_DURATION`, `START_MEDIA_PROCESS_TIMEOUT_MS` | server | no | see `media-storage.server.ts` defaults | media limits |
| `VITE_APP_NAME` | client (build time) | no | `NFE` | `env-public.ts`, `routes/$locale.tsx`; inlined by Vite, never a secret |

Refused in production (boot fails if set): `START_LOCAL_RUNTIME`, `START_FEED_TRACE`,
`START_LIFECYCLE_SYNTHETIC_PROJECT`, `START_LIFECYCLE_SYNTHETIC_PREFIX`,
`START_LIFECYCLE_FAILURE_POINT`, `START_ACCOUNT_DELETION_SYNTHETIC_PROJECT`,
`START_ACCOUNT_DELETION_FAILURE_POINT`, and `START_AUTH_ALLOW_HTTP_LOOPBACK=true`.
Every `START_APPWRITE_*_KEY` must carry a distinct value (the modules refuse shared keys).
Start does not read Resend/SMTP variables; notification delivery lives in the separate consumer.

## Coolify setup (manual, not done by this PR)

1. Project `nfe` → environment `production` → **New resource → Application → Public/GitHub repository**.
2. Repository `newfootball/nfe-webapp`, branch `main` (or a release tag), **Build pack: Dockerfile**.
3. **Base directory** `/`, **Dockerfile location** `/apps/start/Dockerfile`. Leave the build context at the base directory: the Dockerfile needs the repository root.
4. **Ports exposes** `3000`. No ports mapping (Traefik routes to the container network).
5. **Domains** `https://nfe-foot.com,https://www.nfe-foot.com`. Keep Coolify's automatic Traefik labels; the app redirects `www` to the apex itself.
6. **Health check**: path `/healthz`, port `3000`, scheme `http`, interval 30 s, timeout 5 s, retries 3, start period 20 s (the image already declares the same `HEALTHCHECK`). Do not use `/readyz` for liveness: an Appwrite outage must not restart the app.
7. **Environment variables**: every row above marked required, with `START_APP_ORIGIN=https://nfe-foot.com` and `START_APPWRITE_ENDPOINT=https://appwrite.nfe-foot.com/v1`. Mark keys as *Is build variable?* = **no**; nothing from this table is needed at build time.
8. Build variables: none required. `NFE_PRIVATE_BUNDLE_CANARY` may be overridden as a build argument; it must never hold a real secret.
9. Deploy. Boot fails fast with the list of missing names if a variable is forgotten; read the deployment log and complete the configuration.
10. After the first deploy, check `https://nfe-foot.com/healthz` (200), `https://nfe-foot.com/readyz` (200 once Appwrite is reachable) and `https://www.nfe-foot.com/fr` (308 → apex).

## Promotion and rollback

- Promotion: Coolify builds the image from the chosen commit; the artefact tested in CI (`start-image` job) is the same Dockerfile and context. Deploy from a release tag to keep the mapping commit ↔ image explicit.
- Rollback: **Application → Rollback** lists the previous images built by Coolify; selecting one restarts the container with that image without rebuilding. Environment variables are not versioned by this procedure: change them deliberately and record the change.
- Never delete the previous deployment or the Next application while Start is being validated; the public domain switch is out of scope here.

## Still missing from #64

- Smoke on the real proxy: SSR, login, Appwrite call, B2 media read and signed URL delivery behind Traefik (needs the Coolify application and real credentials).
- Redacted logs beyond the server entry, client/server error diagnostics, latency/error/storage/saturation metrics, owner and thresholds.
- Appwrite upgrade runbook and a rehearsed rollback on the production server.
- The notification consumer and the OAuth registry file are not part of this image.
- `public/icons` and `public/images` are git-ignored, so the image only ships committed public assets.
- No preproduction exists; #47 (backups/DR) and #62 (localization/PWA) remain blockers for the full acceptance.
