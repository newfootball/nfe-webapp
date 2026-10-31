# Start private notifications (#58)

The local synthetic implementation is verified on reviewed source
`9dd65647b962a79e61675039abc755d4748b452d`: all five notification scenarios pass,
including atomic MESSAGE production from accepted #59. Its six-scenario messaging
regression passed on `e263b7b58abd8ebc4dd251e48a7593b1462d2e1d`; independent
review approved reuse because the final correction changes only notification
test cookie decoding/redaction, docs and evidence. Production, representative
source import and legacy retirement remain outside this work. Final review and
merge of draft PR #92 belong to the coordinator; #19/#32 are referenced, not closed.

## Data and privacy

`notification-v1` adds `notifications_v1`, `notification_outbox_v1` and
`notification_recovery_v1`; v1/profile/media applied manifests are unchanged.
Provision baseline first, then `provisionNotificationV1`; the latter validates
its prerequisite, version digest, schema and ACLs and refuses applied drift.
Notifications grant recipient read only. No app-admin override exists.
Direct SDK updates cannot forge actor/type/recipient; read mutations go through
an independently authenticated server boundary with strict Origin validation.
A `viewerId` assertion rejects stale account operations, including mark-all.
No title, comment content, message text, auth credential or localized prose is
stored in event metadata. Rendering resolves actor names keylessly and checks
current public post/profile visibility; hidden/deleted targets get an explicit
unavailable fallback. MESSAGE linking additionally reads the actual message using
the current session, requiring the viewer to equal both recipients and the peer
target to equal the sender. Missing, mismatched or deleted messages stay unavailable;
there is no privileged message lookup or content in notification DTOs.

Routes: `/fr/notifications`, `/en/notifications`. Pages use recipient-scoped
business-date/ID cursors (20 items), an unread total across all pages, individual
read and mark-all in bounded batches. An explicit mark-all UI invocation continues bounded20-row RPC batches until
there are no unread rows; errors or identity-cache replacement stop it.
Existing account changes cancel and clear
Query state; keys also include identity and late mutations check cache ownership.

## Atomic delivery and recovery

LIKE/COMMENT creation stages an internal event **inside the existing parent
anchored transaction**. FOLLOW creation stages inside its new edge transaction.
MESSAGE stages the validated accepted `messageEvent` inside the same transaction
as its quota, message and conversation update, before commit. Its recipient is the
business `toUserId`, peer target is the sender and entity is the actual message ID.
A staging failure rolls all writes back; same-request replay returns the existing
message without creating another event or consuming quota.
Imported arbitrary edge IDs, unique pairs and existing event return DTOs remain
intact. `stageNotification(transactionId,event)` is internal, runtime validates
its DTO and cannot be called through RPC. FAVORITE/removal/self events do not
notify. Business success requires durable outbox staging; a staging error rolls
back the business write. Configure a separate server-only
`START_APPWRITE_NOTIFICATION_WRITER_KEY` with rows.read/rows.write, distinct from
the session key, after provisioning the additive schema. Missing configuration
fails closed. Historical social/follow proof artifacts retain their old scope;
the combined notification proof configures the new staging prerequisite.

An explicit consumer reads at most20 due events. Claims have transaction revision
fences, a random claim token and60s expiry. Each event has at most5 delivery
attempts, exponential nextAttemptAt backoff, and a terminal FAILED state.
Notification IDs are SHA256-derived from stable event IDs; creation and ack share
a transaction. Existing notifications are never updated on replay, preserving
readAt. A process failure after business commit and before delivery leaves a
recoverable event. An expired claim may be reclaimed; stale claim commits fail
closed. Failed-event recovery explicitly journals the reason/prior attempts and
resets retry state transactionally. There is no cron, realtime or implicit worker.

## Legacy mapping (#19 / #32)

| Trusted old enum | New type | Actor fallback |
| --- | --- | --- |
| LIKE | LIKE | unknown |
| COMMENT | COMMENT | unknown |
| FOLLOW | FOLLOW | unknown |
| MESSAGE | MESSAGE | unknown |

Stored enum/type is authoritative; neither English/French keywords nor username
regexes select type or reconstruct identity. `legacyNotification` creates a
stable `legacy:<oldId>` event with actorId:null; an audited importer may supply
trusted typed target metadata, otherwise targetId:null is persisted and rendered unavailable, even when the recipient has a public profile.
`stageLegacyNotification` is a separate offline seam, enforcing unknown actor
and the legacy namespace, and marks source:legacy. Localized content is not
parsed or copied. Names such as `a aimé te t’a <script>` remain plain React text.
No real source rows were imported, and these issues must remain open until the
combined acceptance and representative migration proof are independently verified.

## Reproducible checks and runtime gate

Bun1.3.14 / Node24. Frozen installs at root, apps/start and tools/appwrite-schema;
Start unit tests, lint, build/client scan and typecheck; schema typecheck.

Only after independent source review and an **explicit exclusive backend lease**:

```sh
bun apps/start/scripts/notification-local.ts prepare
bun apps/start/scripts/notification-local.ts up
NFE_NOTIFICATIONS_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/notification-proof.ts
bun apps/start/scripts/notification-local.ts down
```

The runner owns only Compose project `nfe-notifications-58`, loopback18158,
Start3588 and private ignored `scripts/.notifications-local` state. It leaves
Next3500/Postgres3501 and existing environments alone. `down` is mandatory even
after failure. Credentials stay in mode600 files and are scanned from diagnostics
and client assets. Evidence is written only after a real test execution.

The authored Playwright matrix covers actual producer staging failure/rollback,
SIGKILL of a private runner after business commit/claim with real lease expiry,
SIGKILL after staged create before ack with transaction rollback, prior read receipt
preservation, and a stale anchored transaction losing to a real concurrent reclaim
(the latter shortens a synthetic lease explicitly). Internal runner callbacks are
never RPC hooks. A runner-owned origin proxy controls backend staging failure and
holds a real private read response, leaving the product service worker untouched.
The SPA A→B→A test compares the original Query object to its replacement before
releasing that response. FR/EN browser timezone America/New_York differs from
server TZ=UTC; initial date rendering uses deterministic ISO UTC numeric fields to avoid Bun/Node/browser ICU differences. Hidden/deleted actors,
deleted targets and historical FOLLOW without target have explicit fallback checks.
Actual isolated Appwrite 2.6.2 results:

- All five notification scenarios pass on `9dd6564`, including recipient-only
  anonymous/A/B/admin SDK and RPC checks, strict Origin, pagination, one/all read
  and badge updates, FR/EN hydration, and delayed SPA A→B→A cancellation.
- MESSAGE staging failure rolls back quota/message/conversation/outbox; concurrent
  same-request sends use one message/event/quota unit. Delivery reads durable state,
  yields one notification and preserves readAt on replay. The recipient follows the
  FR/EN peer link to the real message; mismatched/deleted messages are unavailable.
- Real SIGKILL after business commit/claim with actual 60-second lease expiry,
  create-before-ack rollback, prior read receipt and stale-fence reclaim pass.
- Original accepted messaging regression passes all six scenarios on `e263b7b`,
  covering privacy, imported IDs, pagination, races, persistent quota, FR/EN,
  optimistic rollback and delayed account switches. The reviewed fixture-only
  correction leaves its source/configuration unchanged.

[Notification evidence](../../apps/start/evidence/notifications-synthetic.json)
records the executed source SHA, relevant source hashes, build SHA256,
durability/MESSAGE outcomes and 71 client artifacts with zero sensitive matches.
[Messaging evidence](../../apps/start/evidence/messaging-runtime.json) retains its
actual source hashes and build fingerprint. Unit/date parity uses actual Bun and
Node subprocesses under UTC/Cairo/New York. Static validation passes 106 tests /
633 assertions, Start and schema typechecks, build/client scan and lint (warnings
remain). Root/Start/schema frozen installs pass; lockfiles are unchanged.

The real application sign-in provides a current recipient cookie. HTTP retains
its encoded value, while direct SDK.setSession receives exactly one decoded
value; both forms are kept in the private redaction list. The revoked original
fixture session remains explicitly denied. Both Compose projects, including
stopped containers, volumes, networks, listeners and private state, are removed
at the end of the proof; no backend or delivery scheduler is left running.

Both the distinct messaging rows.read/rows.write key and notification writer key
must be configured; provision accepted `messaging-v1` alongside `notification-v1`.
Typed legacy mapping and fallback satisfy the local migration contracts of #19
and #32 without parsing names or storing localized text. The legacy Next/Prisma
driver behavior and representative real-source migration are not changed or
claimed by this isolated Start lot.
