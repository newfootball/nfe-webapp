# Start follow/unfollow slice

Refs #57 — partial social acceptance only. This slice adds follow/unfollow on
public profiles and bounded, authenticated own follower/following lists at
`/{fr,en}/profile/follows`. Existing feed author links lead to these profiles;
follow changes invalidate personalized explore suggestions and follow caches.
Likes, comments, favorites, post lifecycle, media and full #57 acceptance remain
outside this slice.

The actor comes exclusively from the current server session. Mutations require
an exact trusted Origin, strict `{ id, following: boolean }` input, a published
actor/target profile and a different target. Reads and responses use the existing
public profile DTO allowlist; a server function independently authorizes own
lists. Anonymous users can read public counts, but cannot mutate or read own
lists. There is no admin bypass for hidden profiles or actor identity.

Follow rows retain the accepted schema's public read ACL; no client write grants
or table permissions are added. `START_APPWRITE_FOLLOW_WRITER_KEY` is a separate
server-only rows.write key, distinct from the sessions.write key. Runtime
credentials never enter the client bundle. Database/project/endpoint/session
configuration is shared with existing Start authentication.

A unique `(followerId, followingId)` database index prevents duplicate rows,
including imported rows with arbitrary IDs. Requests express desired state;
replays are no-ops. Overlapping opposing requests may linearize in either order;
the returned snapshot and subsequent reload reconcile against persisted edges.
Counters use exact database totals rather than client increments. Own lists use
21-row keyset reads, return at most 20 public profiles, and continue even when a
page contains hidden/deleted profiles. They never accept a foreign list owner.

The UI cancels conflicting state reads, updates the counter optimistically,
restores its snapshot on failure and refetches authoritative state on settlement.
Existing auth sign-in/sign-out cancels and clears Query state; late mutation
callbacks cannot restore a removed prior-account follow snapshot.

`FollowEvent` is a versioned typed business contract for #58. Only the winning
create/delete emits an event, identified by transition plus edge ID; replays
return null. It contains actor, recipient, edge, timestamp and event type, with
no localized text. This return contract does **not** establish durable event
delivery or a notification outbox; #58 must persist/deliver events atomically
before claiming notification acceptance.

## Validation and isolated synthetic proof

```sh
bun run --cwd apps/start test
bun run build:start
bun run typecheck:start
bun run --cwd apps/start lint
PLAYWRIGHT_CHANNEL=chrome bun run smoke:start
```

The synthetic proof owns ports 3570/18156 and compose project `nfe-follow-57`.
Acquire the shared local proof slot before starting services. It installs no
production integration, creates no imported real data and never reuses another
proof's resources. Schema tooling dependencies must be installed first:

```sh
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun apps/start/scripts/follow-local.ts prepare
bun apps/start/scripts/follow-local.ts up
NFE_FOLLOW_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/follow-proof.ts
bun apps/start/scripts/follow-local.ts down
```

The replayable browser/RPC proof covers A, B, admin and anonymous callers,
forged identity/role/Origin, self-follow, private/missing targets, concurrent
creates/deletes/opposing requests, structured transition events, exact reload
counts, rejected-write rollback, FR/EN, own-list pagination, foreign-owner
rejection, direct Appwrite write denial, public DTO redaction and same-tab
sign-out/account switch. `apps/start/evidence/follow-synthetic.json` records the
observed result and build fingerprint; its existence alone is not a pass.
Independent exact-head review and CI are coordinator merge gates. No production,
representative graph import, notification delivery or full social acceptance is
claimed.
