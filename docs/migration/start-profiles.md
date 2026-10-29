# Start profiles and onboarding

Related #53, migration mission #43. This implements Start profiles against the
versioned Appwrite business schema, on top of #51 SSR sessions. It does not close
#53's inherited email-edit parity, establish production deployment, import real
source data, or complete the migration.

## Behavior and routes

| Account | Onboarding |
| --- | --- |
| USER | Unique public name, city, optional biography; a usable completion path |
| PLAYER | Above, birthday, one or more football positions, preferred foot, optional license |
| COACH / RECRUITER | Public fields, birthday, private club name |
| CLUB | Public fields, private club name, club size and club position; no invented birthday requirement |

Onboarding has account-type selection and a details/confirmation step. Initialization
is an explicit POST when starting the form, rather than a write during a GET/SSR
loader. The authenticated account ID is used for both business row IDs. Auth's
signup name is not copied into a public username: users explicitly choose a
unique public name. `BOTH` maps to `[LEFT, RIGHT]`; all eleven target positions and
legacy DEFENDER/MIDFIELDER/FORWARD aliases are validated and normalized.

`/{fr|en}/onboarding`, `/profile`, `/profile/edit-user`, `/profile/account-security`
and `/user/:id` are the locale-prefixed routes. Legacy `/onboarding`, `/profile`,
`/profile/edit-user`, `/profile/account-security`, and `/user/:id` redirect to the
corresponding localized route and preserve the user ID. `/` also detects locale.
Explicit locale URLs take precedence. Aliases resolve a valid `NEXT_LOCALE`
cookie, then the signed-in account's validated `prefs.nfeLocale`, then weighted
`Accept-Language`, then French. Saving the profile form's language choice stores
both cookie and account preference; prefs never establish identity or authority.
Aliases vary on Cookie and Accept-Language and remain private/no-store.

Own and edit views require a current enabled session on every server call. The
public route uses an anonymous SDK client, so an unpublished profile is a 404
for everyone on that route, including its owner/admin; the owner uses their own
private view. Public views expose exactly the v1 public DTO allowlist: id, name,
image, biography, positions, feet, city, account type, completion flag and business
timestamps. No birthday/age, private full name, license, email, password, private
role, dimensions, contract, or club details enter this DTO. The fixture logo is
rendered as the avatar until #55; there are no fabricated posts, feed or statistics.

The edit form preserves multi-position/foot validation and edits only explicit
profile fields. It cannot change account type, role, IDs, ACLs or completion.
Unedited import fields such as contract, dimensions, gender and private role are
not overwritten. Business dates and nullable fields survive initialization.
After a successful edit Router loaders are invalidated; private loaders have
zero stale/GC retention. Existing identity-switch Query cancellation/clearing and
per-request QueryClient ownership remain intact. Locale choice does not replace
a locale explicitly selected in the current URL.

## Security and persistence

`auth-context.server.ts` mechanically extracts the original #51 server helpers;
`auth.server.ts` retains its previous contracts. Profiles reuse the verified
session context, including current-session expiry/status and protected admin labels.
Private `role` is informational, initialized to USER only on missing private rows;
an imported ADMIN value is preserved and never grants privileged authority.

Every POST checks the exact configured Origin and Fetch Metadata, authenticates
again, and validates unknown input using strict Zod schemas. There is no target
ID in profile mutations. Foreign IDs, email, role, labels, prefs, permissions,
account type in edits, and unknown fields are rejected. SDK errors are reduced
to generic localized results, including a collision/retry message.

Reads use a keyless anonymous or current-session SDK client, never a user/admin
API key. Required private runtime variables, in addition to #51 configuration:

- `START_APPWRITE_DATABASE`: the versioned business database ID.
- `START_APPWRITE_PROFILE_WRITER_KEY`: a distinct server-only key with **rows.write
  only**. It must differ from the sessions.write key. Do not expose either key in
  VITE variables. The disposable provisioning/fixture key is never used by Start.

Tables have no global grants, with row security enabled. Client sessions,
including admin sessions, have no direct create/update/delete grants. Server
transactions initialize only absent rows and update both profile rows and their
ACLs atomically. An incomplete profile stays owner/admin-readable; publication
occurs only with validated complete data and the committed pair. Races retry by
reading existing rows after a duplicate conflict, never by upserting imported
records. Unique names are enforced by the database's existing exact-name index.
Conflicting updates either commit a complete pair or fail without mixing halves.

## Additive schema v2

`tools/appwrite-schema/profile-v2.mts` adds optional `private_profiles.clubSize`
(integer) and `private_profiles.clubPosition` (string, 255). Both are private;
club name continues to map to private fullName. Existing clubs' null values stay
null until explicitly edited. No data backfill or required birthday is invented.

The v1 manifest, digest and applied version row are unchanged. The v2 provisioner
requires that v1 marker, validates private-table ACL/row security, checks extension
column definitions, and writes its own digest marker `v2-club-profile`. It fails
on applied-v2 drift, and reruns preserve all rows and ACLs. On a fresh database,
apply v1 and then v2; on an existing v1 database, call `provisionProfileV2` with an
authorized provisioning client. Do not run the v1-only reconciler after v2: it
intentionally rejects unrecognized extension columns. Permanent application of
v2 and representative source/import/backup compatibility remain separate gates;
this run provisions only a disposable synthetic database.

## Reproducible isolated proof

Use Node 24 and Bun 1.3.14, root and Start dependencies installed. The schema
package is a tooling dependency for this proof only. The opt-in runner loads its
provisioners dynamically through a typed adapter; Start compilation and pure
contract tests require no installation of the schema package dependencies:

```sh
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun run --cwd apps/start test
bun run build:start
bun run typecheck:start
bun run --cwd apps/start lint
bun run smoke:start
bun run --cwd tools/appwrite-schema typecheck
bun run --cwd tools/appwrite-schema test:contract
bun run --cwd apps/start profile:prepare
# Always run profile:down after up/proof, including a failure.
bun run --cwd apps/start profile:up
NFE_PROFILE_SYNTHETIC=1 bun run --cwd apps/start profile:proof
bun run --cwd apps/start profile:down
```

The proof requires Playwright Chromium installed from `apps/start`, or
`PLAYWRIGHT_CHANNEL=chrome` with local Chrome. It uses the production build,
Appwrite **2.6.2**, a new database for each pass, project **nfe-profile-53**,
loopback API **19563**, built server **3513**, and a dedicated Compose network
**10.245.63.0/24**. Preparation refuses collisions and host binds. Secrets and
synthetic credentials/logs stay in a 0700 ignored directory with files 0600.
The proof stops its built server in finally; `profile:down` removes only its own
Compose resources/volumes and private fixture files. It never touches baseline
PostgreSQL, shared B2 or permanent infrastructure.

Evidence: `apps/start/evidence/profile-synthetic.json`, plus
`apps/start/tests/profile.pw.ts`. The passing browser test covers actual signup
for all five account types, onboarding, private/public profile, edit and reload;
fresh eight-way initialization; unique-name publication/update rollback;
concurrent pair updates; imported IDs/dates/nulls/role preservation; A/B/admin/
anonymous ACLs and direct SDK write denial; forged RPC fields/origins; disabled
and revoked sessions; concurrent private SSR isolation; public HTML redaction;
FR/EN aliases/preferences/URL priority; least-scope keys; and two v2 replays with
unchanged records/ACLs. Fixtures are synthetic and are destroyed after proof.
The client scan rejects profile key/database identifiers and server imports;
the proof additionally scans actual key/session/password values in assets/logs.
The ordinary three-test shell smoke stays fixture-free.

## Remaining acceptance and mission gates

**Partial criterion: email editing.** Email is displayed read-only with an
explicit account-security route. No unverified email change is invented; secure
challenge/reauthentication belongs to #52. All other profile fields described
above are persisted and exercised on the isolated backend. This PR uses
`Related #53`, not an automatic closing keyword.

No claim is made for real Google, authorized representative source import,
permanent hosting/TLS, real mail delivery, B2 uploads, production rollout or
mission-43 cutover. No automatic Vercel deployment is required by this change;
mandatory configured GitHub CI and independent review still gate delivery.
