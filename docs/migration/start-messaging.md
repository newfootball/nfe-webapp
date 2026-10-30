# Start private messaging core (#59, #33)

This is the independently reviewable core of #59. Full acceptance stays open
until #58 provides durable, private, localized notification delivery. The returned
`MessageEvent` is a versioned, unlocalized `MESSAGE` contract with deterministic
`message:<messageId>` identity, actor, recipient, message and business date.
Returning this event is **not** notification persistence or delivery.

## Behavior and security

- `/fr/messages` and `/en/messages` list participant-only conversations, newest
  first, with 20-row pagination and unread counts from received messages.
  `/messages` and `/messages/:id` redirect using the preferred locale.
- `/fr/messages/:id` and `/en/messages/:id` show history, newest pages first;
  explicit “load more” reveals older messages. Equal dates use ID tie-breaking.
  Business dates and arbitrary valid Appwrite IDs from imports are preserved.
- Every RPC resolves the current session server-side. Reads use its Appwrite
  session, plus explicit participant filters/DTO checks; admins have no bypass.
  Responses use `private, no-store`. Mutations also enforce the accepted Origin
  guard. Payloads cannot supply an owner, role or ACL.
- Opening/sending requires distinct, existing, onboarded profiles and either a
  follow in **either** direction or an existing message between the participants.
  Historical messages remain readable if a profile later becomes incomplete.
  Search uses only onboarded public profile names (2–80 characters, ten results),
  never email. Search visibility does not grant permission to send.
- Content is trimmed and bounded to 1–2,000 characters. A UUID request token is
  scoped to the verified sender and hashes to a deterministic message ID.
  Identical retries return the same message/event, consume no quota, and preserve
  read state; changing recipient/content with the same token returns `conflict`.
- A transaction commits message, conversation index and durable sender quota
  together. Quota is 20 committed messages per server-clock UTC minute (fixed
  windows); it is shared by tabs/sessions/processes, not browser state.
  Conflicting transactions have four bounded attempts, then return `conflict`;
  retries retain the same token. A failed transaction leaves no partial message.
- Only recipients may mark an explicit batch of up to 30 received IDs read.
  All rows are authorized before the transaction; newer arrivals are untouched.
  There is no aggregate unread reset that could lose a concurrent arrival.
- Query keys include the verified account. Delayed query results check abort and
  returned owner. Existing sign-in/sign-out cache cancellation is reused.
  Optimistic sends cancel history refetches, roll back on failure, preserve text
  and token for retry, and do not restore cache after unmount/account clearing.
  There is no realtime subscription; explicit refresh/reload is supported.

## Additive schema and configuration

`tools/appwrite-schema/messaging.mts` owns the `messaging-v1` namespace. It leaves
v1, profile-v2 and media-v3 manifests/digests unchanged. Provisioning checks the
v1 marker and creates only `message_conversations` (participant read ACLs, no
client writes) and `message_limits` (no client ACLs). Existing `messages` ACLs
remain sender/recipient read-only. Deployment must provision this additive
namespace before enabling these routes. Quota rows may be retained for audit;
no scheduled cleanup or production changes are introduced by this slice.

`indexImportedConversations` is an explicit **offline** projection after an
authorized import; it reads all authorized imported messages and builds their
conversation index without rewriting messages or dates. Run it with ingestion
paused; it is not an online backfill and must not race live sends. It is used
only on synthetic fixtures here, not real legacy data.

In addition to accepted auth/database configuration, supply a dedicated private
`START_APPWRITE_MESSAGING_WRITER_KEY` with `rows.read` and `rows.write` for quota
reads and validated transactions. It must differ from session/profile/feed/follow/
post writers. Keep it server-only, never in `VITE_*` or tracked files. Participant
reads never use that key. Appwrite project API keys have project-wide row scopes;
server checks, secret custody and separation remain required.

## Validation and isolated replay

Static checks require Node 24 and Bun only:

```sh
bun test apps/start/tests/messaging-input.test.ts
bun run build:start
bun apps/start/scripts/messaging-check-client.ts
bun run typecheck:start
bun run --cwd apps/start lint
```

After the coordinator grants the exclusive runtime lease (no other fixture
backend/service may run concurrently):

```sh
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun apps/start/scripts/messaging-local.ts prepare
bun apps/start/scripts/messaging-local.ts up
NFE_MESSAGING_SYNTHETIC=1 bun apps/start/scripts/messaging-proof.ts
```

The dedicated Appwrite 2.6.2 stack uses loopback 18159, project
`nfe-messaging-59`, subnet `10.245.159.0/24`, and built Start on loopback 3590.
Private compose/credentials/fixtures/logs live outside the checkout under
`~/.agents/tasks/nfe-start-appwrite-2026-10-29/orchestration/messaging/runtime`
(or explicitly configured `NFE_MESSAGING_STATE`). They are never tracked/printed.
The fixture creates A/B/C/admin/incomplete accounts, 45 imported messages with
identical 1998 dates and 24 conversations. Tests cover direct SDK confidentiality,
RPC guards, pagination, opening policy, read/send races, duplicate and distinct
concurrent sends, quota, FR/EN reload, denied-send rollback and a delayed history
response across SPA sign-out/sign-in. The runner redacts secrets and writes a
source/build fingerprint to `apps/start/evidence/messaging-runtime.json` only
after execution; a script alone is not runtime evidence.

Fixture-free `bun run smoke:start` also starts a local server, so it waits for
the same runtime authorization. No production/Vercel or real-data proof exists.

## Isolated acceptance evidence (2026-10-30)

Source head `ed8fdbd38b10cefb52144159b897b7784a0c0074` passed all six
SDK/RPC/browser scenarios against fresh synthetic Appwrite 2.6.2 in 10.0 seconds
with zero failures, skips or retries. The source/build fingerprint is recorded in
`apps/start/evidence/messaging-runtime.json`. Units passed 89/89 (529 assertions);
both typechecks, build, both 66-artifact client scans and all six CI checks passed.
Lint exited zero with 121 warnings and 24 infos; fixture-free smoke passed 6/6.

The delayed-history scenario alone blocks service workers in its browser context
and asserts a null controller and zero workers before intercepting the GET. This
keeps the real server response pending across SPA sign-out/sign-in. Playwright
cannot intercept service-worker-owned requests with `page.route`; a separate
default browser context measured the active `/sw.js` controller. Production worker
behavior is unchanged, and the other scenarios retain their normal contexts.
See the [Playwright network documentation](https://playwright.dev/docs/network#missing-network-events-and-service-workers).

All owned containers, volumes and networks were removed, ports 18159/3590/3591
were verified free, and private runtime files were deleted after the proof.
These results cover the private messaging core only; durable notification
production/delivery remains gated on #58, so full #59 stays open.
