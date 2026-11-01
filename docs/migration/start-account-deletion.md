# Account deletion in Start

This lot implements the account-deletion behavior for the isolated local migration environment. It does not activate production deletion or import historical records.

## User behavior

The account security page offers an irreversible confirmation in French and English. Deletion removes all sent and received private messages, including the other participant’s copy. A successful initial response acknowledges a durable request; it does not claim that cleanup has finished. The browser leaves the private application and discards its Query and Router caches.

A shared account anchor prevents new Start writes involving a withdrawn actor or owner. Public profile, feed, directory, sitemap and media signing reject withdrawn identities, including the signing recheck. Withdrawal is progressive: existing SDK-readable rows keep their existing ACLs until cleanup removes them. Already signed media links retain their recorded expiration.

## Recovery and limits

An admin-only journal records claims, leases, checkpoints and exact storage inventories before destructive effects. Recovery uses a separate server credential and remains possible after the target Auth identity and sessions disappear. The foreground local runtime processes pending requests; an authenticated administrator can also resume a request from the admin page. Only DONE means reconciliation finished.

The storage primitive enumerates exact keys, versions, delete markers and multipart uploads. It never issues an unversioned object delete. Foreign references prevent destruction. Truncated provider inventories and uncertain INITIALIZING/FINALIZING effects remain blocked for explicit reconciliation; lease expiry alone is not evidence that remote I/O has stopped. Removing the uncertainty allows a privileged re-evaluation.

Notification contention with a successfully recorded release does not consume the delivery budget. A release that could not be persisted and then expires is an ambiguous backend failure or worker crash and counts toward the bounded budget.

## Isolated verification

Use Node 24 and Bun, with frozen dependencies installed in the root, Start and schema tool. From apps/start:

```sh
bun scripts/moderation-local.ts prepare
bun scripts/moderation-local.ts up
NFE_MODERATION_SYNTHETIC=1 NFE_ACCOUNT_DELETION_SYNTHETIC=1 bun scripts/account-deletion-proof.ts
bun scripts/moderation-local.ts down
```

The proof uses its own Appwrite namespace on loopback ports 18160/3574 and exact pre-recorded B2 development keys. Credentials, fixture identities and raw diagnostics belong only in the private ignored .moderation-local directory. Preserve the manifest and diagnostics before down if a check fails. Do not reuse this recipe for production.

The test source covers a real confirmation click, two-key transactional exclusion, both-direction messages and social relations, public/session withdrawal, exact version and multipart cleanup, foreign data retention, and recovery after process crashes and real lease expiry. Execution results must be recorded separately; source and passing unit checks do not prove these service scenarios.
