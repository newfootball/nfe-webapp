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

## Follow-up evidence — 2026-10-29

The initial results above remain historical evidence for their original revision and configuration. This follow-up adds observations; issue #44 remains **partial**, with no production verification or migration-readiness signoff. Sources are the sanitized operator reports `media-baseline.json` (generated 2026-10-29 07:34:54 UTC, source HEAD `7b284f689493badafc37231348ee01f975321c2f`) and `infrastructure-discovery.json` (generated 2026-10-29 07:29:02 UTC). These are external task artifacts, not committed raw API responses. The media report records a source checkout with pre-existing profile edits; its observations are not evidence of a clean production deployment.

### Scoped Cloudinary observation

Authenticated read-only Admin API requests confirmed dynamic folder mode and enumerated the configured asset folder and its descendants. One folder was discovered and inventoried; folder enumeration and resource pagination were complete. The resource listing used `/resources/by_asset_folder` with `max_results=500`, returned two resources on one page and no remaining `next_cursor`, covering all resource/delivery types returned by that endpoint. No resource had missing byte metadata.

| Scoped original resources | Count | Original bytes | Maximum observed original bytes |
| --- | ---: | ---: | ---: |
| Image | 1 | 492,631 | 492,631 |
| Video resource type | 1 | 62,559 | 62,559 |
| Raw | 0 | 0 | Not observed |
| Other | 0 | 0 | Not observed |
| Total | 2 | 555,190 | — |

The sole video resource was classified as visual video from positive width and height; audio and unclassified video counts were both zero. Cloudinary's `video` resource type also includes audio. Classification used returned metadata, without downloading or probing media. The maximum observed visual video was **62,559 bytes**, not an upload limit or capacity guarantee.

A separate legacy public-ID-prefix comparison queried `image`, `video` and `raw` with delivery type `upload`, one complete page per type. It returned the same counts and bytes; these are comparison sets and **must not be added** to the dynamic-folder totals. Six GET requests were used in total (configuration, descendant enumeration, dynamic listing and three legacy listings), all HTTP 200, within the collector's 20-request bound. Account usage was not requested by this collector; account-wide counters from the infrastructure audit are not NFE volumes.

The configured folder is a candidate NFE namespace, not proof of database ownership or production representativeness. There was no join against PostgreSQL media/avatar references. Assets outside the folder, moved assets, deleted assets, old environments or legacy providers may be absent; dynamic asset folders and public-ID prefixes are independent. Read requests are not an atomic snapshot. Bytes sum returned originals only, excluding derived assets, versions, backups and bandwidth. No identifiers, URLs, folder values, credentials or personal data are included here. The report's source inventory identifies browser image conversion to WebP (quality 0.85 with fallback), WebP/automatic-quality delivery and MP4 video delivery with source fallback; transformation parity and media performance remain untested.

### Reference build with existing private configuration

Reference revision: `b51652c4eefac7439adc811ca6a91a2d7ded77f0` (HEAD and `origin/main` at capture), clean task worktree before this documentation change. macOS, Bun 1.3.14, Node 24.22.1; dependencies and generated client were reused. The approved private source was the main checkout's existing `.env.local`, loaded into process memory only after the worktree's baseline `.env`. Neither file was copied, overwritten or committed; this worktree had no `.env.local`. No service or database was started, seeded, reset or reconfigured.

Generic reproduction command from the worktree root:

```sh
bun --env-file=.env --env-file="<approved-private-env-file>" run build
```

The collector loaded those ordered files into its Bun process, verified required variables were nonempty without printing values, and spawned `bun run build` with the inherited environment. Raw build output was captured only in memory; the durable evidence records sanitized stage/error categories. A preliminary collector attempt loaded only the private file in a child whose parent had already auto-loaded the baseline `.env`; inherited empty variables took precedence, so it still failed page-data collection with missing configuration (exit 1, 10 s). That setup attempt is superseded by the explicit ordered process load, not a code fix.

At **2026-10-29 07:41:59 UTC**, the correctly configured build exited **0 in 10 s**: compilation, TypeScript and static page generation completed. **Prisma/database connection errors were still logged**; successful build exit does not prove database-backed pages or data reads worked. The multiple-lockfile/workspace-root warning also persisted. The infrastructure audit independently found the local loopback PostgreSQL connection refused (`ECONNREFUSED`), with the declared container absent; no database volume query executed. No representative database volume, runtime journey, p50/p95 or numerical non-regression budget is established by this build.

### Remaining operational evidence

The checked sources contained no established Appwrite endpoint/project/server access or tested release, no B2 bucket/region/restricted key, and no confirmed self-host deployment target/topology/access. No request against these absent targets was attempted. These are bounded discovery findings, not proof that infrastructure exists nowhere; Coolify is optional. Hosting resources, owners, budget, maintenance window, RPO/RTO and retention still require confirmed operational decisions. A reachable authorized representative source database, reconciled media ownership, live FR/EN parity and performance measurements, and isolated target compatibility evidence remain necessary before #44 can be accepted.
