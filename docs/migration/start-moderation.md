# Start administration and reporting core (#60, partial)

This bounded slice started from accepted main `8160720` and integrates accepted
messaging main `a36136c`. Issue #60 stays open:
account deletion, business/message cleanup, B2 object/version purge, Auth/session
revocation and resumable account lifecycle acceptance remain excluded and depend
on #56/#59. No production retention policy or production deployment is introduced.

## Server boundary and data

- `/{fr|en}/admin` provides dashboard counts, user prefix search, report exact-post-ID
  search, three status tabs and pages capped at 20 rows. Each SSR loader calls
  independently protected RPCs. Auth labels loaded by `identity()` authorize admin
  reads and mutations; private profile roles and browser payloads grant no access.
- Public post detail includes a localized report form. Every mutation repeats
  identity/origin checks and strict runtime validation. Reports retain the five
  legacy reasons, unique `signals.signal_pair`, and thresholds five → `SUSPECT`,
  ten → `SPAM`. Scores remain admin-only in `post_private`.
- Existing accepted #49 tables, indexes and permissions are reused. No schema
  migration, Auth label rewrite or account import is required.
- A report transaction writes the parent anchor, new signal and threshold score
  together. Admin decisions bind signal ID to post ID and both `$updatedAt`
  revisions. Reject stages `REJECTED`, removes public read access (retaining
  owner/admin read), and marks the signal `REVIEWED` in one transaction. A
  parent anchor and fresh revision comparison detect lifecycle/edit contention;
  commit conflicts and write errors roll back and return a controlled failure.
  IDs, slug, text and business dates are preserved.
- Public reads already require keyless visible `PUBLISHED` parents. Asset signing
  now checks its current parent before and after signing, denying `REJECTED`
  even for the owner and a previously known asset ID. The owner-only helper
  remains owner-only; archived preview policy is unchanged. Already issued
  capabilities remain usable until their configured read TTL expires; this slice
  neither purges B2 versions nor invalidates an external cache.
- Responses are `private, no-store`. Moderation cancels outstanding queries,
  clears cached public variants and invalidates Router loaders. Existing account
  switching cancels/clears Query data and invalidates Router state.

Required server-only keys: `START_APPWRITE_MODERATION_READER_KEY` (`rows.read`)
and `START_APPWRITE_MODERATION_WRITER_KEY` (`rows.write`), distinct from each
other and the session key, plus the existing database/auth/media configuration.
No browser write ACLs are granted. The client scan forbids both key names.

## Verification

From the root, Bun 1.3.14 / Node 24:

```sh
bun run --cwd apps/start test
bun run build:start
bun run typecheck:start
bun run --cwd apps/start lint
```

The first isolated runtime attempt stopped on a test-helper mismatch: Start
correctly returned HTTP 403 for a cross-origin RPC, while the helper expected
a serialized HTTP 200 response. The repaired assertion checks HTTP 403 explicitly,
checks the denial body for secrets, and verifies that no report was created.
The remaining runtime matrix is **not yet proven**. An exclusive
backend lease from the coordinator is required before prepare/up/proof. It owns
only compose project `nfe-moderation-60`, backend loopback `18160`, test app `3574`
and ignored mode-600 credential/fixture files in `scripts/.moderation-local`.
Next `3500`, the existing `3501` service and other projects remain untouched.

After the lease and source review:

```sh
bun apps/start/scripts/moderation-local.ts prepare
bun apps/start/scripts/moderation-local.ts up
NFE_MODERATION_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/moderation-proof.ts
bun apps/start/scripts/moderation-local.ts down
```

The test runner preloads a synthetic external signer into its own Bun server process: it can suspend the asynchronous signing boundary while real Appwrite parent checks run. It never contacts B2 or creates a real signed capability; this does not prove object access or TTL expiration. Product RPCs and signing code have no test hook.

The Playwright harness exercises A/B/admin/anonymous SSR and direct RPC guards,
profile/payload spoofing, unique reports, five/ten thresholds, bounded search and
pagination, direct SDK confidentiality, review/dismiss/reject, real Appwrite
transaction conflict and injected commit failure rollback, parent IDs/dates/ACL, stale-before-stage parent and concurrent signal revisions,
revocation of an admin label on an existing session, rejected asset signing
(including a held asynchronous signer), preserved owner ARCHIVED preview, FR/EN
and account switching. Its targeted browser context
blocks service workers to keep test traffic deterministic; the product worker is
unchanged. Node-run Playwright modules use `fileURLToPath(import.meta.url)`.

This is synthetic local evidence only. It cannot establish full account deletion,
source import, B2 retention/purge, production acceptance or #60 closure. Independent
review and exact-head CI remain mandatory before merge (coordinator-owned).
