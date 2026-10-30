# Start public feed and explore (Related #54)

This implements the local fixture scope of migration #43. It does **not** establish
production readiness, representative-source parity, media delivery, or acceptance
against approved numerical performance budgets. The reviewed #53 profile/API
prerequisite is delivered in main at `15a94af`; #53 remains open for its explicit
email/media follow-ups. Next, Prisma and the source database are unchanged.

## Routes and contracts

- `/fr` and `/en` hydrate the first public feed alongside the existing shell.
  `/fr/feed` and `/en/feed` provide the focused feed.
- `/:locale/post/:id` is the public post detail. Hidden and absent rows have the
  same 404 HTML and RPC result, including for owners/admins.
- `/:locale/user/:id` preserves the public profile and hydrates its PUBLISHED posts.
- `/:locale/explore?q=…&tab=top|users|posts` preserves URL state, a 400 ms debounce,
  and FR/EN navigation. `top` runs both requested searches concurrently; the other
  tabs do not launch the hidden search branch. Empty/blank search shows user
  suggestions and no posts. Unknown tabs fall back to `top`.
- `/post/:id`, `/user/:id`, `/explore` redirect using the existing locale policy,
  preserving IDs and query/tab. `/` retains the existing locale redirect.

Server inputs are strict Zod schemas: page size 1–20, default 10, search at most
128 characters, validated IDs and versioned filter-bound cursors. All public reads
use a new keyless client per request, even when a session cookie belongs to an
owner or admin. Status is always filtered to PUBLISHED; expiry is unchanged.

Feed/profile sort by business `createdAt DESC, $id DESC`; post search uses
`publishedAt DESC, $id DESC`. Appwrite 2.6.2/PostgreSQL puts null publication dates
first. The seek cursor handles that partition explicitly before non-null dates.
It carries the exact timestamp, ID, order/filter identity and page size, without
looking up a pivot. Removing or depublishing the pivot therefore preserves the
continuation. Inserts before the cursor do not reappear; this is live pagination,
not a historical snapshot under arbitrary edits to sort keys.

Search is literal case-insensitive **substring** matching on NFC/French-folded
fields, using `contains`, not full-text search. The union of title/description is
performed by the backend. New onboarding/edit writes now normalize `nameFolded`
without modifying the display name, uniqueness or ACL rules. #63 must apply the
same deterministic normalization to imported folded fields; this work never
rewrites source records.

## Authorization, exact counters and bounded requests

`feed.server.ts` projects DTOs explicitly. SDK metadata, email, birthday,
`spamScore`, comments text and private storage identifiers never enter the DTO.
Profile images are restricted to the known public fixture asset. Post previews
are the explicitly labelled `/logo.svg` fixture; actual media resolution remains
#55, with no B2 bucket, signing, upload or storage change here. Reactions and
viewer-specific flags/writes belong to later interaction work.

The isolated runtime proves native `groupBy + count` on Appwrite 2.6.2 with
Node SDK 31.1.0, including more than one page of private edges. No statistics table
or applied v1/profile-v2 manifest was changed. Counts are grouped in the database,
not obtained by downloading the first page of edges or by issuing per-card totals.
A missing group means exact zero only after a successful native aggregate;
a failed aggregate fails the read and never fabricates zeros.

`START_APPWRITE_FEED_READER_KEY` is a **separate** server-only `rows.read` key.
Appwrite's scope is project-wide, not a row-level credential: the application
boundary restricts its use to likes/comments for IDs obtained from the immediately
preceding keyless PUBLISHED-parent query. Authors are fetched keylessly in one
batch. Parent status, owner, visibility and update timestamp are rechecked before
emitting any DTO/count. An inaccessible/changed parent fails the page rather
than returning its counters or a misleading partial page. The key cannot be
supplied through an RPC input and is forbidden in client build artifacts.

A nonempty feed page has five Appwrite requests: posts, authors, grouped likes,
grouped comments, parent recheck. This is independent of page size and transferred
edge cardinality. Detail also has five, including its initial `getRow`; absent or
hidden detail has only that read and no privileged child request. Empty pages
stop after the first query. Public profile SSR adds its existing single keyless
profile read (six Appwrite calls total with a nonempty post page). Native database aggregation still performs database
work proportional to the relevant indexed data; constant call count does not
claim constant database CPU/latency.

User search batches profiles plus grouped public post/follower counts. Suggestions
exclude self and followed profiles on the server, testing only the current
candidate IDs against the actual session. They use batches of 20, at most eight
candidate batches, and return up to ten results or prove exhaustion. Hitting the
bound is an explicit unavailable error, never a false empty result. No exhaustive
browser join or full follow-edge download occurs. Session suggestions also incur
two account/session reads; instrumentation includes these rather than hiding them.

## SSR, cache and error behavior

The existing router owns one QueryClient per SSR request. Loaders and components
share Query options and a 30-second stale interval, so successful SSR hydration
reuses the first batch. Public keys contain locale, author, search and page size;
private suggestions are removed on actual sign-in/sign-out by the existing
`clearIdentityCache`. Responses remain `private, no-store` with `Vary: Cookie`.

Localized loading, empty, end, error and manual retry states are separate.
Pagination retains current cards while loading or failing. Feed RPC queries use
`networkMode: always`, no automatic retries/reconnect refetch, and manual retry
so offline failures are visible and a successful retry does not append duplicates.
Backend failures are unavailable/5xx UI errors, not empty lists or hidden-post 404s.
The fixture-free shell remains usable with an explicit unavailable feed when no
backend is configured.

## Reproduce the isolated proof

Node 24, Bun 1.3.14, Docker >=2 CPUs/8 GiB, and Playwright Chromium or local Chrome:

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun run build:start
bun run typecheck:start
bun run --cwd apps/start test
bun run --cwd apps/start lint
bun run smoke:start
bun run --cwd apps/start feed:prepare
bun run --cwd apps/start feed:up
NFE_FEED_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start feed:proof
# Only in a declared uncontended benchmark window:
NFE_FEED_SYNTHETIC=1 NFE_FEED_BENCHMARK=1 NFE_FEED_PROOF_PHASE=performance PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start feed:proof
bun run --cwd apps/start feed:down
```

The fixture proof requires an explicit opt-in and its own prepared compose.
It uses only `nfe-feed-54`, loopback backend 19564 / measurement bridge 19565 / built app 3554 and subnet
`10.245.64.0/24`. The source compose is pinned to Appwrite 2.6.2 commit
`54581f9698f9de23cf4b1432e353b3ee9b0012d5`; credentials and raw logs remain in
ignored mode-600 local files. On interruption/failure, always run `feed:down`;
restart an interrupted capability setup with a fresh stack. No existing
`nfe-database`, source export, other task resource or production host is used.
Optional schema tooling is dynamically loaded only by the proof, outside Start's
TypeScript compilation graph. `feed:down` removes only this project's resources.

Durable expurgated evidence is under `apps/start/evidence/feed-*.json`: exact
capability requests/results, production-build fingerprint, ACL/browser/RPC proof,
structural Appwrite calls/rows/bytes (actual response-body bytes through a loopback
bridge, excluding headers/TLS; decoded DTO bytes labelled separately), hardware/cache/distribution metadata and raw
synthetic request timings. The final validation/criteria matrix is below.

## Final synthetic measurements

The uncontended run has 700 successful RPC requests (100 for each of seven
scenarios) and 800 successful SSR document requests (100 per route/language),
with zero failures. RPC p95 is 22.4 ms (feed size 1), 24.3 ms (feed size 10),
22.2 ms (detail), 29.0 ms (profile posts), 24.3 ms (post search), 19.0 ms
(user search), and 57.0 ms (actor A suggestions). SSR p95 ranges from 31.2 to
57.8 ms across the declared routes/locales. These are warm loopback fixture
request timings, not browser navigation-to-usable-content or production budgets.

The observed call counts are exactly five for nonempty feed/detail/profile-posts
and post-search RPCs, three for user search, and ten for actor A suggestions
(including two session reads and three candidate/follow batches). The functional
proof also compares sizes 1/10/20 and zero versus 131 likes/101 comments, without
per-card reads or transferred edge scans. See raw timings, actual response-body
bytes, per-file hashes, Appwrite image digest, Docker capacity and background
snapshots in the linked evidence. The overlapping earlier timing run was excluded
and replaced after the coordinator granted an uncontended window.

## Acceptance and remaining gates

| #54 criterion | Local fixture result | Remaining external gate |
| --- | --- | --- |
| Feed/detail/profile posts/explore/deep links | Implemented; production-built RPC/browser proof | Global SEO/URL parity remains #61 |
| Authorized statuses and guessed IDs/children | Keyless public parent guards, direct SDK ACL and all actors | Real imported ACL/source validation |
| Stable cursor/filter/search/empty | Equal-time groups, 1/2/10/20 pages, pivot removal/depublication, NFC/case | Imported folded-field reconciliation at #63 |
| SSR/hydration/network/FR/EN/cache | Shared Query cache and production-built browser proof | Permanent host/runtime parity |
| Calls and p95 against representative approved budget | Synthetic distributions only; structural calls bounded | **Unmet:** source p95, representative approved dataset, numerical budgets/approver |
| Actual media | Safe labelled public fixture preview | **Unmet:** #55 |

Keep this PR `Related #54`, not `Closes #54`. A local synthetic measurement cannot
be promoted to a representative-source or production performance go/no-go.
