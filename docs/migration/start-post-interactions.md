# Start post interactions (Refs #57)

This slice adds desired-state like/unlike, idempotent comment creation, author/admin
comment deletion and private favorites in the shared feed/detail/profile PostCard.
`/{fr,en}/profile/favorites` is an authenticated, paginated own list; there is no
caller-supplied owner selector. Follow/unfollow remains the accepted PR #87 contract.

## Server and storage boundary

All mutations validate strict inputs, trusted Origin and an active server session.
Actor IDs and admin capability come solely from Appwrite Auth, preserving #15/#18.
A keyless read must find a PUBLISHED post and its onboarded public author, even
for an owner/admin. Draft, archived, ACL-private and orphan posts fail closed.
Reads recheck parent visibility before projecting their result. Public comment
DTOs contain only content, business date, public author identity and canDelete.
Likes/comments have no direct row grants; favorites grant read only to their owner.
No browser mutation permission or secret projection is added. Accepted IDs, slugs,
business dates and imported arbitrary pair IDs are preserved.

Each child write also stages a parent status-preserving write in an Appwrite
transaction and rechecks its live revision. A concurrent parent lifecycle change
uses bounded retries with fresh visibility/revision checks and must conflict rather than leave a newly accepted orphan. Pair uniqueness uses the
accepted schema indexes, not synthetic IDs; comments derive a stable ID from the
server actor, post ID and client logical request UUID. Comments retain the legacy 1000-character limit and date-descending
ordering with a stable, post-scoped composite cursor. A replay with different
content fails. Explicit desired states avoid double-click toggling.

A test-runner-owned transparent loopback proxy controls actual parent-anchor and
commit interleavings; production code has no test hooks.

Runtime requires `START_APPWRITE_INTERACTION_WRITER_KEY` (rows.write, separate
from the session key), `START_APPWRITE_FEED_READER_KEY` (rows.read), and existing
server Appwrite/session configuration. Neither belongs in VITE_* variables.
The parent write grants no business ownership and preserves business timestamps.

## Client and event contract

TanStack Query owns state, comments and favorites. Optimistic changes cancel
conflicting reads, snapshot prior state, restore on rejection, then reconcile
interactions plus feed/detail/explore counts. Existing identity clearing cancels
all reads. Mutation callbacks additionally check Query object identity, so an
in-flight result cannot restore an old cache even during A→B→A switches.

`InteractionEvent` is a version-1 unlocalized return-only contract for #58 with
actor, recipient, post, entity, event ID, type and timestamp. Replays emit null.
Favorite recipients are their owner. There is no durable outbox/delivery claim.
The accepted FollowEvent contract is unchanged.

## Reproducible isolated proof

Only after a coordinator runtime lease:

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun run build:start
bun run typecheck:start
bun run --cwd apps/start test
bun run lint
bun apps/start/scripts/interactions-local.ts prepare
bun apps/start/scripts/interactions-local.ts up
NFE_INTERACTIONS_SYNTHETIC=1 bun apps/start/scripts/interactions-proof.ts
bun apps/start/scripts/interactions-local.ts down
```

The dedicated project is `nfe-interactions-57`, Appwrite loopback 18157 and Start
loopback 3571. Credentials and raw logs remain in ignored, permission-restricted
`.interactions-local`; the redacted evidence records test exit, bundle scan and
build digest. Proof uses synthetic A/B/admin/anonymous identities, direct RPC/ACL
checks, concurrency, rollback, reloading, FR/EN and same-tab account switching.
No Vercel, production, real import, B2 or external active service is involved.

## Outstanding acceptance gate

Issue #56's complete post deletion/lifecycle acceptance is not delivered by its
accepted text-only PR #89. A direct synthetic parent revocation/deletion test is
not a proof of that future application workflow. Keep #57 open until deleting a
post with likes, comments and favorites through the real #56 action is proven,
including child cleanup and concurrent writes. This PR only references #57.

## Executed proof and cleanup

On 2026-10-30, the complete real Appwrite 2.6.2/browser/RPC matrix passed at
`ef771e4` against the integrated accepted media/public base `12f88c0`: one test,
zero failures/skips/retries, 9.5 seconds. This includes 12-way pair/comment replay,
controlled two-actor parent transactions, archive/ACL/deletion races, 25 imported
comments, 23 favorites, delayed draft preservation, and SPA A→B→A with an old
mutation response delivered after the new A state. The same browser document is
asserted throughout that account-switch section. The 1000/1001 boundary and
private favorites ACLs, including denial to a different admin, are exercised.

The final build's source tree is identical to the reviewed `aaf20e4` source tree;
only test synchronization and evidence/state changed for `ef771e4`. The redacted
[evidence](../../apps/start/evidence/interactions-synthetic.json) records both
heads, the source tree and build digest. Local verification: 85 Start unit tests,
504 assertions; six built shell/public smoke tests; build/client scan (61 files),
Start/root typechecks and lints pass. Lint has warnings. Independent full initial
review requested changes; all R1–R5 plus integration and final test-driver deltas
were approved by the coordinator's independent review before final handover.

Three repair passes are retained in the canonical state, including two honest
failed runtime checkpoints; there is no reset or hidden retry. The final proof
passed after explicit fulfillment-before-unroute synchronization. Its synthetic
posts do not claim media/B2 acceptance; the accepted #55 proof remains separate.

The proof process, Start server and ephemeral transparent proxy exited. Docker
`down --volumes` removed the exact task project: zero containers, volumes and
networks, both loopback ports free, ignored credentials/raw state removed.
The runtime lease was returned to the coordinator. No backend restart is pending.

## Contract handed to #56

Lifecycle writes must touch the same parent `posts` row transactionally before
purging children, so social transactions either commit before purge or conflict.
The child tables are `likes`, `comments`, `favorites`, with `postId` and `userId`;
like/favorite pairs use accepted unique `[postId,userId]` indexes. IDs imported
from legacy are arbitrary and must be preserved. Likes/comments have empty ACLs;
favorites grant only owner read. Hidden-parent own favorites are filtered at once.
An archive/delete purge must use its independently authorized privileged boundary:
the interactive comment deletion RPC deliberately rejects already hidden posts.
This handoff is not acceptance of the future lifecycle workflow.
