# Start public pages and SEO — issue #61

Status: **partial issue #61; isolated public proof passed**. Resumes `fbc89c7` without replacing
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

## Historical URL and signup repairs

Historical directory URLs now return **200 without a redirect**. Search validation
preserves an absent `page`; only loader dependencies default to page 1. Explicit
`?page=1` also returns 200 and canonicalizes to the historical query-free path;
`?page=2` keeps its own canonical. All six directory route variants are exercised
through actual Appwrite reads, with manual redirect handling in the proof.

The historical About-us Join CTA reaches `/sign-up` directly with HTTP 200.
That route selects the existing request locale and renders the shared auth form
in signup mode. Existing `signUp`, session creation, cache clearing and
`safeReturnPath` are reused; no new authentication mechanism is introduced.
The original localized sign-in route keeps its prior behavior. Optional string
`returnTo` is preserved and the existing allowlist still controls navigation.

The shared credential form explicitly uses POST. Without JavaScript, submitting
it does not expose credentials in the URL; it does not implement no-JS account
creation. The smoke test submits synthetic values with JavaScript disabled and
asserts a navigation POST to `/sign-up` with no query string. Actual account
creation is tested separately through the hydrated form against isolated Appwrite.

The original three repair attempts remain recorded, including the failed 307
proof on `d770635`. The explicit user grant on 30 October extended the limit
from 3 to 6. Batches 4–6 fixed URL defaults/splash test timing, the missing signup
entry, and the no-JS credential GET respectively. The budget is **6/6**; this
record does not reset or authorize further repairs.

## Local verification (30 October 2026)

Node 24.22.1, Bun 1.3.14, macOS arm64. Frozen installs passed without dependency
or lockfile changes in this lot. Accepted main `96c0819` was integrated normally;
final runtime source is `ea13dad` (later changes only document the evidence).

| Verification | Result |
| --- | --- |
| `bun run build:start` including client-boundary scan | Passed, 56 client JS artifacts |
| `bun run typecheck:start` after build | Passed |
| `bun run --cwd apps/start lint` | Exit 0; 72 warnings and 23 infos remain |
| `bun run --cwd apps/start test` | 56 tests, 371 assertions passed |
| `START_SMOKE_PORT=3562 PLAYWRIGHT_CHANNEL=chrome bun run smoke:start` | 6 browser tests passed |
| `NFE_PUBLIC_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/public-proof.ts` | Passed: 37 HTTP requests (28 HTTP 200, nine expected 404), plus FR/EN browser flows |

The [sanitized runtime evidence](../../apps/start/evidence/public-synthetic.json)
records individual HTTP observations and the source/base commits. The same full
proof also passed before the final credential-form repair and was rerun afterward.
Actual Appwrite **2.6.2/PostgreSQL** verification covers:

- FR/EN initial HTML for the five static pages, canonical/social metadata and
  private no-store responses; browser smoke also verifies one h1/document lang,
  no-JS splash persistence and the real 10-second automatic continuation.
- Four directories plus position/city filters, with and without explicit page 1;
  pagination to page 2, eligible-profile visibility and nine expected 404 cases.
  Fixtures include 25 eligible players, an unonboarded player and an ACL-hidden
  profile; alternating `Paris`/`PARIS` values match the lower-case city query.
- Initial published post/profile content and metadata; keyless sitemap exclusion
  of DRAFT, ARCHIVED, hidden and unonboarded entries.
- Direct synthetic status + ACL revocation removes the post from the next
  sitemap response and returns detail 404; the fixture is restored afterward.
  This is **not** acceptance of #56's withdrawal/deletion/cache mutation workflow.
- No-JS FR/EN directory pagination and historical user/post shared links.
- Hydrated About-us CTA → historical signup → real synthetic account creation
  → the localized private page in both FR and EN, with the expected account name.

All 37 timings/byte sizes are individual observations on a tiny synthetic dataset
and include expected error responses. They are **not** p50/p95, representative
performance acceptance or production budgets; no numeric budget is invented.

The source route inventory and static translated copy were compared by
inspection; there was **no live before/after Next-versus-Start crawl**. A
representative source database/import, real shared-media parity, directory
ranking/card parity, full #56 lifecycle integration and approved performance
budgets remain unverified. Signup-path repair is not whole #52/#53 acceptance.
Issue #61 must remain open; production indexability remains disabled.

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
Its server is stopped in `finally`; run `down` after a failure to remove only
this instance's containers, network, volumes and private synthetic state.
No existing source database, #52/#55 state or deferred monitoring is touched.

After the final proof, the owned instance was removed: zero `nfe-public-61`
containers, volumes or networks; ports 19571, 3561 and smoke port 3562 were free,
and private state/credentials were removed. Existing unrelated services were
preserved. Source review passed; the coordinator owns final evidence review,
exact-head CI acceptance and any PR merge. No deferred monitoring is armed.
