# Appwrite business schema v1 — local proof for #49

This package prepares the business schema for the Start migration. It does not
switch the Next application, import real users, or provision a permanent host.
The permanent isolated environment remains gated by **#46**. The dedicated local
proof runs Appwrite **2.6.2**, PostgreSQL and task-owned workers on loopback only.
The compatibility evidence from #45 is reused; this proof tests the actual
business schema rather than repeating the generic compatibility probe.

## Run and reproduce

```sh
cd tools/appwrite-schema
bun install --frozen-lockfile
bun run test:contract       # no network or credentials
bun run typecheck
bun run lint
bun run build
bun run prepare:local       # refuses existing task resources or occupied port
bun run up
NFE_SCHEMA_LOCAL=1 bun run provision
NFE_SCHEMA_LOCAL=1 bun run test
bun run down               # only nfe-schema-49 resources and volumes
```

The Docker project is `nfe-schema-49`, its endpoint is
`http://127.0.0.1:19549/v1`, and its network is `10.245.49.0/24`.
`local.mts` derives its reduced compose from the same pinned official release
commit as the read-only migration probe. It has no shared mounts, production
endpoint, real email integration or B2 credentials. Generated compose and console
credentials remain in ignored `.local/` with private permissions. The local
bootstrap cannot accept a remote endpoint and requires explicit opt-in.

`provision.mts` exports `provision(TablesDB, databaseId)` for a future controlled
environment runner. Its CLI intentionally targets only this disposable setup;
it is not a production deployment command. Apply with a schema-scoped server key
only after #46 establishes the intended endpoint and project.

## Versioning and safe reruns

`schema.mts` is the authoritative v1 manifest: 13 tables, typed columns, enums,
nullability and query/unique indexes. `schema_versions/v1` records its SHA-256
digest once all asynchronous columns and indexes are available. Concurrent
business writes use database uniqueness, not a read-before-write check.

Provisioning creates missing objects and awaits readiness. Existing column types,
sizes, enums, arrays, nullability, defaults and index definitions must match.
Unknown columns/indexes, table-wide grants, disabled tables or disabled row
security cause a failure. It never deletes/rebuilds tables or repairs drift by
rewriting records. A partially applied first run can resume; incompatible changes
need an explicitly reviewed migration/version. Schema operations are not inside
Appwrite row transactions. Run a single provisioner per database. On an existing
version the digest must match; do not edit an applied v1 manifest to roll forward.

The executable proof snapshots **every row and ACL in all 13 tables**, reruns
provisioning twice, and asserts exact equality, including timestamps and the
single version marker. It also verifies that an unsafe table permission stops a
rerun. A schema digest does not attest the caller's business authorization code.

## Prisma mapping and data contracts

Source: `prisma/schema.prisma`, `src/query/*`, `src/actions/*`, notably
`post.select.ts`, feed/search/cursor reads, favorite ownership, notification
recipient filters and the moderation transaction. `mapping.mts` assigns every
scalar field in all 13 Prisma models, including Auth-only or retired fields.
`contract.mts` fails if a source scalar or any of the 12 source enums is omitted.
It also checks public-field exclusions and index references.

| Prisma source | Appwrite destination / explicit mapping |
| --- | --- |
| Every business `id` | Unchanged row `$id`; User Auth ID, `profiles/$id` and `private_profiles/$id` are identical. Retain original CUIDs and public routes. IDs incompatible with Appwrite's 36-character constraint must fail migration preflight, never silently regenerate. |
| User.name, image, biography, position[], foot[], localisation, userType, isOnboarded, createdAt, updatedAt | `profiles`, same names, enum values and ordered lists. `nameFolded` adds NFC + French lowercase for case-insensitive searches. Non-onboarded profiles are owner/admin only. |
| User.birthday, fullName, license, contract, size, weight, gender, role | `private_profiles`, same names, owner/admin read only. Full name and physical/contract information are deliberately excluded from anonymous profile DTOs. |
| User.email, emailVerified, password | Appwrite Auth email, email verification flag, and bcrypt import. Never copied to public/private business rows. Nullable email/password users require an explicit import policy; this package does not invent credentials or accounts. |
| User.resetToken, resetTokenExpiry | Invalidate legacy password-reset challenges; use fresh Appwrite Auth challenges. |
| Account (all fields) | Auth migration only: preserve an audit mapping of legacy IDs if needed; provider relinking/reconsent is a separate gate. Never copy OAuth access/refresh/ID tokens or account passwords into business tables. |
| Session, Verification (all fields) | Deliberately invalidate sessions and old verification/reset secrets; require fresh login/challenge. No copy of token, IP address or user agent. |
| Follow | `follows`, unchanged followerId/followingId and dates; unique ordered pair. |
| Post | `posts`, unchanged slug/userId/title/type/status/description and all five timestamps. `spamScore` lives in admin-only `post_private/$id`. Search adds titleFolded/descriptionFolded. Only PUBLISHED grants anonymous read; null status is private. |
| Media | `media`, unchanged type/postId/mimetype/filename/label/dates; nullable Json metadata becomes nullable lossless `metadataJson` string. `url` is replaced by the B2 object tuple below. |
| Like, Favorite | `likes`, `favorites`; unchanged IDs, userId/postId and dates. Unique `(postId,userId)`. Favorites are private to their owner. |
| Comment | `comments`, unchanged userId/postId/content/dates. Server reads apply parent visibility. |
| Notification | `notifications`, unchanged userId/type/content/link/readAt/dates. Recipient-only read, including unread totals. |
| Message | `messages`, unchanged fromUserId/toUserId/content/readAt/dates. Both participants only. |
| PostSignal | `signals`, unchanged userId/postId/reason/details/status/dates. Unique `(postId,userId)`, admin-only read, including the reporter. |

SQL nulls remain explicit nulls, distinct from empty arrays, empty strings or
missing values. Required source fields stay required; optional source enums do
not receive defaults that would overwrite nulls. Source defaults (e.g. new Post
DRAFT/video/NONE) and `@updatedAt` are the future trusted writer's responsibility;
imports supply original values. Preserve source timestamps in explicit datetime
columns rather than replacing them with Appwrite `$createdAt`/`$updatedAt`.
DTOs expose UTC ISO-8601 strings with millisecond precision, not JS Date/Prisma
types. `publicProfile` uses an explicit transport allowlist. The proof verifies
an original timestamp, nullable type/date and ordered enum arrays.

String limits are explicit in the manifest: names/slugs 128, reference IDs and
ordinary metadata 255, titles/object keys 1024, URLs 2048, content/description/
biography/JSON 65535. PostgreSQL unconstrained strings/JSON beyond those limits
must be reported by the eventual import preflight; do not truncate. Username
uniqueness retains exact stored names, not a new case-insensitive uniqueness
rule; folded names are a query aid. Slugs remain exact and globally unique.

## B2 stable object metadata

`media` stores `provider=B2`, `bucket`, `objectKey`, nullable `versionId`,
`byteSize`, algorithm-qualified `checksum`, `ownerId`, and
`state=PENDING|READY|QUARANTINED|DELETED`. There is **no canonical URL column**.
The original Media ID and post link remain unchanged. An import must resolve a
legacy URL to an actual B2 object and version, read its size/type/checksum, and
reject unresolved or expiring signed URLs; the fixture uses synthetic metadata,
not an assertion that an object was uploaded.

All B2 buckets stay private. Appwrite ACLs cannot enforce B2 access. Media rows
are owner/admin only, even for public posts. A future Start media resolver checks
the actor, current parent post visibility, media owner and READY state before
returning a safe descriptor and issuing a short-lived B2 signature. It must not
return storage metadata for drafts to unrelated actors. Profile images likewise
need a resolver policy before replacing legacy image strings with B2 objects.
This package signs no URLs and uses no B2 secrets.

## Executed permission matrix

Table permissions are always `[]`; `rowSecurity=true` is mandatory. ACL grants
are read-only; **no actor, including the admin session, can directly create,
update or delete business rows**. Trusted server mutations must authenticate,
verify ownership/parent references/status and choose ACLs; API keys bypass ACLs.
There is no client-writable administrator role. The administrator ACL uses the
server-issued Auth label `admin`, not preferences or the profile role string.
The proof uses real Auth sessions, including for the administrator, without a
server key on visibility checks; it also rejects label escalation via Users API.

| Resource fixture (owner A) | Anonymous | A | B | Admin session |
| --- | --- | --- | --- | --- |
| Onboarded public profile / follow | read | read | read | read |
| Private profile / media object | denied | read | denied | read |
| PUBLISHED post | read | read | read | read |
| DRAFT/PENDING/REJECTED/ARCHIVED/null-status post | denied | read | denied | read |
| Favorite / notification addressed to A | denied | read | denied | denied |
| Message A → B | denied | read | read | denied |
| Unrelated admin → admin message | denied | denied | denied | read |
| PostSignal / post moderation metadata | denied | denied | denied | read |
| Like / comment / schema version | denied | denied | denied | denied |

Likes/comments are server-mediated because granting them public reads would leak
draft existence and content through direct ID/list calls. Future public DTO reads
must filter their parents before exposing engagement rows/counts. Admins have no
blanket permission to read personal favorites or unrelated messages. Every fixture
is tested via **both get and list/total**, so hidden rows cannot leak via counts.
The proof also tests forged public ACLs, status updates, deletion and role writes.
Appwrite can return success for an unchanged PATCH without an update grant;
denial tests therefore change the status or ACL and assert that stored values
remain unchanged. Session secrets are issued by the privileged Users API, then
`Account.get()` confirms each identity before all keyless ACL requests.

## Queries, counts, transactions and deletion

Indexes mirror all source compound uniques and query indexes. Additional indexes
cover folded profile names, media owner/state, and signals by post. References
stay plain IDs rather than Appwrite relationships: a feed page fetches posts,
then profiles/media/engagement through batched `equal(field, ids)` calls. Retain
cursor order with an ID tie-breaker in the future reader; do not translate Prisma
include trees into per-item network calls. Substring searches use folded fields
and bounded queries; their cost must be measured on a production-sized dataset.

There are no denormalized counters to drift. Exact likes/comments/follower/unread/
pending-signal counts come from authoritative rows (`total=true`) under the same
authorization predicate. Personal flags query the unique pairs. The proof checks
batched engagement counts, published ordering, unread filtering and conversation
indexes. Do not aggregate private rows with a server key into a public total
without first validating the parent and the requested scope.

Moderation rejection must atomically change Post status **and read permissions**
plus PostSignal state in an Appwrite transaction. Updating status alone retains
the old public grant. The proof commits that actual business transition and
verifies revoked anonymous/B access, retained owner/admin access, and rollback
of a staged publish/ACL change. It also stages conflicting changes to one comment
in two transactions and proves one commit conflicts with HTTP 409.

Unique indexes, not a preflight lookup, arbitrate name/slug and follow/like/
favorite/signal pair collisions. The proof launches eight simultaneous writes
per constraint and requires exactly one success and seven HTTP 409 responses.
Two null username rows succeed, preserving nullable uniqueness. Future toggle
APIs should use idempotent desired state and interpret a pair conflict correctly;
blind retries of a toggle can invert the user's intent.

There are **no automatic foreign keys or cascades** with these plain references.
This is explicit preparation, not a claim that a deletion API is implemented:

- Source User → Account/Session/Follow/Post and Post → Media have Prisma Cascade.
- Other source business references default to restrictive deletes; the existing
  delete-post comment claiming all engagement cascades does not match Prisma.
- The future server must check referenced users/posts on create; null/missing
  references never become publicly readable. All writes remain server-only.
- Preserve restrictive deletion unless a reviewed product policy expands it.
  For permitted cascades, enumerate related records, update/delete within bounded
  transactions, and fail closed or use a resumable tombstone workflow for large
  graphs. Never delete only a profile and leave messages/notifications visible.
- Deleting B2 objects is outside database atomicity: first revoke media access/
  mark DELETED, commit the DB change, then idempotently delete the specific B2
  version through a retryable outbox implemented by the later service. Auth user
  deletion/session revocation likewise needs an explicit cross-service workflow.

## Evidence and remaining gates

`tools/appwrite-schema/evidence/appwrite-2.6.2.json` is the sanitized runtime
report. Runtime failures return nonzero and are never silently marked skipped.
The contract check and child typecheck/build run in CI after their own frozen
dependency install; Docker runtime writes require the explicit local opt-in.
The package uses `.mts` entrypoints and is excluded from root TypeScript; no
SDK-dependent `*.test.*` file participates in root Bun discovery.

Remaining work belongs to later gates: permanent #46 hosting, actual migration
preflight/import and Auth reconciliation, trusted Start repositories/mutations,
large-graph deletion/outbox, production-volume search/count performance and
end-to-end product journeys. This local proof does not mark those gates passed.

Official references: [row/table permissions](https://appwrite.io/docs/products/databases/tablesdb/permissions),
[transactions](https://appwrite.io/docs/products/databases/tablesdb/transactions),
[Appwrite 2.6.2 source](https://github.com/appwrite/appwrite/tree/54581f9698f9de23cf4b1432e353b3ee9b0012d5).
