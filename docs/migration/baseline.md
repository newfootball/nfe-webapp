# Migration baseline (issue #44, partial)

This is an independently collected baseline, not a production capacity report. Reference checkout: `7b284f689493badafc37231348ee01f975321c2f`, 2026-10-29. Commands run from the repository root on macOS, Bun 1.3.14 (package manager declared: 1.3.3), Node 24.22.1. The lockfile is `bun.lock`; use `bun install --frozen-lockfile` and do not silently change it. The checks below describe this checkout and environment, not a deployment.

## Verification

`bun install --frozen-lockfile` completed with an isolated Bun cache in 138.72 s; Prisma Client 7.8.0 was generated. The lockfile was unchanged. Effective versions: Next 16.2.3, React 19.2.5, TypeScript 5.7.2, Biome 2.4.13, Prisma and Prisma Client 7.8.0, Cloudinary 2.10.0. Commands below ran on the base revision before documentation changes; times are wall-clock seconds rounded to whole seconds.

| Command | Exit | Time | Result |
| --- | ---: | ---: | --- |
| `bun test` | 0 | <1 s | 11 passed, 0 failed across 4 files. |
| `bun run typecheck` | 0 | 4 s | Passed. |
| `bun run lint` | 0 | <1 s | Passed with two existing cognitive complexity warnings in `video-uploader.tsx` and `prisma/seeds/notifications.ts`. |
| `bun run build` | 1 | 12 s | Compilation and TypeScript succeeded; page data collection for `/_not-found` failed because `RESEND_API_KEY` was absent. Next also inferred the parent checkout as workspace root due to multiple lockfiles. No successful production build is claimed. |

The first run preceded installation: test passed, typecheck exited 2 with missing modules and generated client, and lint/build exited 127 because their executables were missing. Those setup failures were superseded by the results above. To reproduce a complete build, provide the required configuration through an approved local secret mechanism, verify the workspace root, and rerun; do not publish values. The missing key is an environment limitation, not evidence of a code regression or a successful production build.

## Data and media: measurement protocol

No production credentials, database snapshot, Cloudinary inventory or representative traffic were supplied. Database volume, asset counts and bytes, largest stored video and journey percentiles are **not measured**. Do not substitute local fixture sizes for production. Obtain an authorized, timestamped, representative read-only snapshot and record its source, age, schema revision, scope, exclusions and permissions. Avoid exporting rows, identifiers, URLs, credentials or personal data; publish aggregate results only.

For PostgreSQL, use a dedicated read-only role against the snapshot, with connection credentials supplied securely (not in command history). In `psql`, run the following inside a read-only transaction; database size includes free space and is not an export size. Relation sizes include indexes and TOAST. `n_live_tup` is an estimate, not a reconciled exact count; record statistics freshness and use carefully scoped `COUNT(*)` on each business table when exact counts are required, subject to load approval.

```sql
BEGIN READ ONLY;
SELECT pg_database_size(current_database()) AS database_bytes;
SELECT schemaname, relname, n_live_tup AS estimated_rows,
       pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables ORDER BY total_bytes DESC;
COMMIT;
```

For Cloudinary, an authorized operator can use the [Admin API resources endpoint](https://cloudinary.com/documentation/admin_api#get_resources) in read-only mode. Enumerate `image`, `video` and `raw` and every delivery type actually used, following `next_cursor` until exhausted (`max_results` up to 500). Aggregate asset count and original `bytes` by resource/delivery type; separately record derived storage, versions and account usage where available, avoiding double counting. Filter actual videos by format/resource metadata because Cloudinary's video resource type includes audio. Record maximum original video bytes, missing byte/type fields, incomplete pages, sampling time and rate limits. Reconcile counts and references against PostgreSQL `Media` and user avatars; a cloud-wide total may include unrelated assets. Listing is not a transactionally consistent snapshot if assets change: record the window and repeat/reconcile changes. Keep raw responses and credentials out of Git; API access may incur limits or costs and requires authorization.

The current upload flow accepts browser video files and uploads directly to Cloudinary (`components/feature/post/video-uploader.tsx`, `src/lib/cloudinary-client-upload.ts`); no application byte-size limit was identified in that flow. This is not evidence of a provider limit or the largest stored video. `Media.metadata` is optional and must not be assumed complete. Determine provider/account limits separately and distinguish them from the observed maximum.

## Journey latency protocol

On an isolated representative copy with production-like data, hardware, region and configuration, record the revision, dataset size, browser/device, network, concurrency, cache state, date and sample count. Measure the same FR and EN public feed, explore and post detail journeys, plus authenticated sign-in, profile and notification reads, with representative users and permissions. Define start as navigation or submit and end as the relevant content visibly usable; also record server response time separately. Avoid mutations on shared services: use isolated test accounts and data for upload or other write journeys, or mark them unmeasured. Separate cold/warm runs, failures and redirects; do not discard failures or mix routes/locales. Use at least 100 successful observations per route/locale/cache cohort over multiple runs, report failure counts and sample size, and compute nearest-rank p50/p95 from sorted milliseconds (rank `ceil(p × n)`, one-based). Repeat the identical protocol on the target and report uncertainty and environment differences.

No p50/p95 or non-regression budgets are approved yet. After representative measurement, owners must set numeric budgets for each journey and error rate before go/no-go; do not infer budgets from an empty or synthetic dataset. Upload duration must be reported by file size and connection class, separately from page navigation.

References: [PostgreSQL object size functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-DBOBJECT), [Cloudinary Admin API pagination](https://cloudinary.com/documentation/admin_api#pagination).
