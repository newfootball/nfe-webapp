# Start public pages and SEO — issue #61

Status: **partial / draft, do not merge**. Resumes `fbc89c7` without replacing
its seven localized content/component files. No production, Vercel, real import,
OAuth #52 or B2 #55 changes are included. Issue #56 is still open.

## Implemented boundaries

- Historical `/about-us`, `/contact`, `/privacy`, `/terms`, `/splash` paths render
  FR/EN from the existing locale policy (cookie, account preference, accepted
  language). These pages receive no new locale prefix. Legal copy/dates remain
  those of the original helper commit.
- Splash persists `seen_splash` through `/splash/continue` and a 303 back to `/`;
  its anchor works without JavaScript. Hydration starts the historical 10-second
  continuation and 3-second image rotation, with effect cleanup.
- Literal `/players`, `/coaches`, `/recruiters`, `/clubs`, the 11 supported
  `/players/{position}` paths and 10 `/players/city/{city}` paths use keyless
  Appwrite reads restricted to onboarded profiles. Unknown filters return 404.
  Pagination projects 21 public rows, renders 20 and accepts pages 1–50, bounding
  the offset to 980. It never reads `private_profiles.fullName` or auth records.
  Directory cards intentionally use the existing public author DTO; historical
  follower ranking, biography, counters and recent-video card enrichment are
  not established as equivalent by this lot.
- Existing `/user/{id}` and `/post/{id}` locale redirects remain unchanged.
  Localized detail routes gain titles, descriptions, canonical and social tags
  from their existing authorized loaders. No slug alias is invented: inspected
  historical routes resolve IDs, not the stored post slug.
- The sitemap uses keyless PUBLISHED rows (maximum 1,000), onboarded profiles
  (maximum 500), and bounded author-eligibility checks in batches of 100. There
  is no complete-table scan or shared stale snapshot. Backend failure returns
  503 rather than a successful incomplete sitemap. Historical ID links remain.
- This migration remains non-indexable: document robots metadata, deny-all
  `/robots.txt`, and noindex/no-store headers on the new public reads/sitemap.
  Production indexability and a trusted permanent canonical origin are gates
  for the future permanent host, not enabled environment switches in this PR.

## Known blocking URL defect

TanStack Router serializes the default `page: 1` returned by `validateSearch`.
Consequently `/players`, `/coaches`, `/recruiters`, `/clubs` and filtered
annuary paths return **307** to the same path plus `?page=1`. Explicit
`?page=1` and `?page=2` return 200. The canonical for page 1 omits that query.
This is a demonstrated URL-contract blocker, not an accepted permanent
redirect. The full isolated proof correctly fails at this point. Repair budget
is **3/3**, retained in the canonical task artifact; no fourth batch was made.

## Local verification (30 October 2026)

Node 24.22.1, Bun 1.3.14, macOS arm64. Both frozen installs and the isolated
schema-tool frozen install passed, without dependency/lockfile changes.

| Verification | Result |
| --- | --- |
| `bun run build:start` including client-boundary scan | Passed, 39 client JS artifacts |
| `bun run typecheck:start` after build | Passed |
| `bun run --cwd apps/start lint` | Exit 0; existing and new warnings/infos remain |
| `bun run --cwd apps/start test` | 17 tests, 135 assertions passed |
| `START_SMOKE_PORT=3562 PLAYWRIGHT_CHANNEL=chrome bun run smoke:start` | 5 browser tests passed |
| `NFE_PUBLIC_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/public-proof.ts` | **Failed:** `/players` 307 instead of expected 200 |

Browser smoke covers both languages without JavaScript, one h1, document lang,
canonical/social tags, splash cookie after a no-JS click, hydrated automatic
continuation, shell navigation/theme, concurrent synthetic-reader isolation,
and the existing recoverable error boundary. The host's port 3501 belongs to
PostgreSQL and was not stopped; the optional smoke-port override preserves the
default 3501 for existing consumers.

Additional actual Appwrite **2.6.2/PostgreSQL** diagnostics on the isolated
`nfe-public-61` instance verified:

- 25 eligible public players, one unonboarded profile, one ACL-hidden profile;
  both `Paris` and `PARIS` match the lower-case city query; goalkeeper filtering
  returns the eligible profiles.
- HTTP 200 for four directories and position/city filters with explicit
  `?page=1`, and for `/players?page=2`; hidden/unonboarded profiles are absent.
- Published post and profile content/metadata render in initial HTTP HTML.
  Sitemap omits DRAFT/ARCHIVED/hidden/unonboarded entries.
- Direct synthetic status + ACL revocation removes the post from the next
  sitemap response and returns detail 404; fixture state was restored afterward.
  This is **not** a test of the unimplemented #56 mutation/cache lifecycle.

Ten diagnostic HTTP reads measured 5.56–61.52 ms and 3,476–11,982 HTML/XML bytes
on a tiny synthetic dataset. These are individual observations, **not** p50/p95,
production budgets or representative performance acceptance. No numeric budgets
were approved in the baseline, and none are invented here.

The source route inventory and static translated copy were compared by
inspection; there was **no live before/after Next-versus-Start crawl**. A
representative source database/import, real shared-media parity, directory
ranking/card parity, historical signup links supplied by #52, and withdrawal
through #56 remain unverified. Issue #61 must remain open.

## Reproduction and resource ownership

From the repository root, with Docker and local Chrome:

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun run build:start
bun run typecheck:start
bun apps/start/scripts/public-local.ts prepare
bun apps/start/scripts/public-local.ts up
NFE_PUBLIC_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/public-proof.ts
bun apps/start/scripts/public-local.ts down
```

`prepare` refuses existing owned resources/state. The proof uses only a fresh
synthetic project on loopback 19571, subnet `10.245.71.0/24`, app port 3561;
compose, credentials and server logs are gitignored with private file modes.
The known full-proof failure above is expected until the URL defect is fixed.
Its server is stopped in `finally`; run `down` after a failure to remove only
this instance's containers, network, volumes and private synthetic state.
No existing source database, #52/#55 state or deferred monitoring is touched.
