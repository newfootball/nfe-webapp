# Start private notifications (#58)

This is a local implementation checkpoint, **not completed acceptance** of #58,
#19, #32 or the combined #58/#59 acceptance. Accepted #59 core (main a36136c)
is integrated normally; MESSAGE now stages on its business transaction. Accepted
moderation main021b2f9 is also integrated without changing its contracts. The new
combined runtime matrix still requires independent review and an exclusive lease.
Production, representative import and legacy retirement remain outside this work.

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
The first real matrix on prior head2dc0549 passed COMMENT/FOLLOW and durability
but failed two scenarios with ICU date/hydration differences; it is not a full pass.
On reviewed head513fa8e the real matrix passed4/5 scenarios: all existing
notification privacy/pagination/read, COMMENT/FOLLOW, crash/recovery, deterministic
FR/EN hydration, delayed SPA and hidden/deleted fallbacks passed. MESSAGE staging
rollback, concurrent send dedupe/quota1, durable-only delivery and nonrecipient
denials passed before recipient listing encountered an old fixture session
revoked by scenario1 logout (independent Account.get returned401). The test now
obtains a fresh session through the real application sign-in and also asserts
that the revoked original session is denied. This corrected matrix, including
FR/EN MESSAGE peer link, read receipt replay and mismatched/deleted-message
fallback, is **not rerun yet** at this checkpoint. Original accepted messaging
regression passed all6 scenarios against513fa8e with new notification setup;
its evidence records that exact source/build and does not establish the new head.
The next matrix on reviewed e263b7b again passed4/5: MESSAGE current-recipient
RPC membership passed, then its SDK check received the encoded HTTP cookie and
failed. The test now decodes that value exactly once for SDK.setSession only,
retains the encoded cookie for HTTP, and redacts both forms. Its SDK positive and
all negative/link/replay assertions remain. This final correction has not been
rerun at this checkpoint. Original messaging regression again passed6/6 on
e263b7b; product/business/config remain unchanged by this fixture-only correction. Unit parity uses actual Bun and Node subprocesses under UTC/Cairo/New
York; the runtime matrix still requires independent review and a fresh lease.
Both the distinct messaging rows.read/rows.write key and notification writer key
must be configured; provision accepted `messaging-v1` alongside `notification-v1`.
