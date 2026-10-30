# Start OAuth broker and account recovery

Related #52 / mission #43. This **draft integration** includes accepted #53/PR82
from main `15a94af46c7d9bab03d8d0dda46c2979dbbbe052`. It does not activate Google
on any real domain. The `c77b515` context extraction was accepted through #53;
this change leaves common auth/profile/locale helpers unchanged. The existing
account-security page now links to the real #52 forms and reads its own email
through the protected account API, independently of business-profile storage.

## Identity contract

Google uses a server-side authorization-code broker with pinned `openid-client
6.8.8`, RS256 signature verification explicitly enabled, fixed Google metadata,
exact issuer `https://accounts.google.com`, exact single audience, azp when present,
expiry/iat, nonce and PKCE S256. No browser-supplied issuer, JWKS, target ID, email
or return URL determines identity. Scopes are `openid email`; provider tokens are
not persisted. An email change from Google cannot change the selected account,
its email or its imported verification flag.

Only an owner-controlled registry `(issuer, google, sub) -> imported Appwrite ID`
can resolve a login. Missing/duplicate subjects, duplicate target mappings, absent
or disabled targets, MFA-enabled targets and session A with subject B are denied
before session issuance. Unknown subjects never enroll: this remains true even
if registry coverage is later declared complete. OAuth-only source users absent
from Auth stay deferred until a separately authorized source import preserves
their original IDs. Recovery can set a password for an already existing
OAuth-only target only after its actual fresh mailbox challenge; a session alone
cannot add its first password through this application.

The broker key has **users.read + sessions.write**, never users.write; the general
SSR key stays sessions.write only. `Users.createSession` and compensating
`Users.deleteSession` support those scopes on actual Appwrite **2.6.2**. Before
publishing a cookie, the broker rechecks `Account.get`, current session and target
status/MFA/ID/expiry. Failure compensates with the broker key; failures never
publish a session. This is not a distributed transaction: a backend outage can
prevent compensation, leaving an unexposed expiring session. Existing cookies
are HttpOnly, Secure, SameSite=Lax, Path=/ and rotate through the #51 contract.

**Keep Appwrite's native Google provider disabled at the backend.** Hiding its
button is insufficient. Native 2.6.2 email linking mutates identities and can revoke
imported credentials before an application callback, so it cannot implement this
migration invariant. The isolated fixture explicitly checks the native endpoint
returns provider-disabled. Enabling native Google is outside this contract.

## Private configuration and shared state

Use the existing #51 server configuration, plus these **server-only** variables:

| Variable | Meaning |
| --- | --- |
| `START_GOOGLE_ENABLED` | Default off; `true` only after all activation gates below. |
| `START_GOOGLE_CLIENT_ID`, `START_GOOGLE_CLIENT_SECRET` | Environment-specific Google client, only in broker secrets. |
| `START_OAUTH_BROKER_KEY` | Separate key with users.read + sessions.write; cannot equal the general key. |
| `START_OAUTH_REGISTRY_PATH` | Owner-owned regular file, mode exactly 0600, symlinks rejected. |
| `START_OAUTH_REDIS_URL` | Private authenticated TLS Redis shared by every replica; loopback plaintext only with the existing synthetic HTTP opt-in. |
| `START_RECOVERY_INVALIDATION_CONFIRMED` | Set to `2.6.2` only after checking target session-invalidation policy and A/B proof. Without it, reset/change requests fail closed. |

Google callback is exactly `${START_APP_ORIGIN}/oauth/callback`, configured in
that environment's Google client. The Google start is an exact-Origin POST.
Recovery/verification mutate only through validated exact-Origin POST RPCs;
callback GETs only capture proof or process the OIDC callback. No secret belongs
in `VITE_*`, a query loader, hydration data or browser analytics.

Redis owns the independently namespaced `nfe:auth52:<origin/project digest>:` keys;
no schema-v1 tables or #53 migrations change. OIDC transactions expire in five
minutes; challenge handles expire in one hour. SET NX/EX plus atomic GETDEL make
handles single-use across replicas. OIDC state is bound to an HttpOnly browser
cookie and the starting session digest. Concurrent login starts in one browser
invalidate the older browser binding. No state uses a process-local Map.

Limits use atomic shared counters: global 100/minute, recovery/email and
password/verification/user 5/15 minutes; OIDC starts 5/15 minutes globally;
challenge capture/finish 100/minute globally. These deliberately conservative
budgets remain deployment tuning criteria. Key material contains hashes rather
than plaintext email/subjects. Redis still contains private challenge material:
use TLS, dedicated ACL/namespace, restricted operators, TTLs and no public dump.
Redis loss denies actions; connection attempts time out without retry loops.
No arbitrary X-Forwarded-For value is trusted. Public no-key Appwrite recovery
limits remain enabled; no privileged key bypass is used for email challenges.
Generic recovery responses share a minimum 700ms floor, including rate-limit and
delivery failures; this is not a claim of perfect network timing indistinguishability.

## Source registry procedure

An authorized source owner must produce a minimal private projection containing
only `version:1`, users' `id`, and each account's `providerId` and `accountId`.
Select those fields explicitly from User/Account; do not export whole rows.
Email, passwords, access/refresh/ID tokens, sessions, reset and verification
fields are rejected by the strict projection schema.

Run `bun tools/identity-import/oauth-registry.ts <private-source> <private-output>
--authorized-private-source` as one command. Both files remain outside version
control; output must be outside the checkout, is created exclusively mode 0600,
never overwrites a file, and rejects subject/target collisions. The source reader
rejects symlinks, other owners and group/world permissions. No actual source
export was accessed in this implementation.

The output is v1 with a source digest, `coverageComplete:false`, and only the
issuer/provider/subject/ID mappings. Have the source owner reconcile coverage,
resolve collisions without email matching, and transfer the registry privately
to each broker deployment. Do not put real registry files, subjects, emails,
tokens or raw SMTP/test logs in git, public CI artifacts or PR bodies. Registry
coverage does not automatically authorize enrollment or import of absent users.

## Email and session policy

`/fr/recovery` and `/en/recovery` expose forgot/reset, current-password change,
verification request/confirmation and live verification state. Password recovery
uses fresh Appwrite challenges, never legacy tokens. Requests return the same
message for absent, existing, disabled and OAuth-only accounts. A reset marks
Appwrite email verified and invalidates **all** sessions with session-invalidation
enabled; reconnect afterward. A password change requires the current credential,
keeps its current session ID and revokes every other session. OAuth-only users
must use recovery; the application does not mirror Appwrite's permissive
first-password-on-session behavior. Direct Appwrite clients must not be exposed
as an application account-management interface with different guarantees.

Fresh challenge links first reach `/recovery/callback`, then immediately redirect
to an ordinary localized URL with an opaque HttpOnly handle. No userId/secret is
rendered, hydrated or kept in the displayed URL; the handle is consumed before
calling Appwrite. Bad, used, mismatched and expired challenges produce generic
FR/EN failures. No analytics runs on these routes. Responses are private/no-store
and callback redirects set no-referrer. Configure hosting/proxies to omit query
strings from callback access logs; application catches never log upstream errors.

Legacy `/forgot-password`, `/reset-password`, `/change-password`, `/verify-email`
redirect through #53’s server locale helper (French fallback). Legacy `token` query values are discarded. Fresh
links must use the new callback, not those legacy aliases. No email-edit feature
is implemented: a separately designed, strongly proven email-change challenge
remains an explicit partial criterion, not an unguarded account update.

## Reproduce the isolated proofs

Use Bun 1.3.14 / Node 24. No source or production credentials are needed.

```sh
bun test apps/start/tests/oauth-protocol.test.ts tools/identity-import/oauth-registry.test.ts
bun run --cwd apps/start build
bun run --cwd apps/start typecheck
bun run --cwd apps/start lint
bun run --cwd apps/start oauth:check-client
# Acquire the shared local-runtime slot from the coordinator before these:
bun run --cwd apps/start recovery:prepare
bun run --cwd apps/start recovery:up
NFE_AUTH_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start recovery:proof
NFE_AUTH_SYNTHETIC=1 bun run --cwd apps/start oauth:broker-proof
bun run --cwd apps/start recovery:down
# Fixture-free public shell proof:
PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start smoke
```

The disposable project is `nfe-auth-recovery-52`, Appwrite2.6.2 at19562, SMTP
capture18052, auth-state Redis19652, built Start3522 and replica3523. Loopback
bindings only; no B2, production services or baseline `nfe-database` resource is
used. The runner stops its two servers in finally; `recovery:down` removes only
its compose volumes and private synthetic state. If bootstrap/test fails, run
that same down command before releasing the slot. A fresh attempt needs prepare
again. Repeated tests can trigger actual Appwrite limits; recreate only these
fixtures, never disable abuse protection. The expiry test modifies only its
synthetic token row in this disposable project's PostgreSQL, then invalidates the
fixture user cache; it does not weaken production clocks or token validation.

Actual evidence lives in `apps/start/evidence/recovery-synthetic.json` and
`oauth-broker-synthetic.json`. Four production-built browser/RPC suites cover
SMTP absent/existing/OAuth-only requests, old/new passwords, A/B invalidation,
verification, replay/mismatch/invalid/expired backend challenges, state binding,
expiry and replay, native-provider disabled and two-replica shared counters.
Controlled signed OIDC tests prove signature/issuer/audience/azp/nonce/expiry
rejection and mapping invariants; **they are not actual Google on staging or
production**. The additional broker proof checks target disabled/MFA rejection,
least-privilege issue/delete and Account/current-session post-checks on2.6.2.

## Remaining activation / merge gates

- Independent auth/security review of this exact #52 head and green CI. #53 common
  context is accepted and integrated; route generation retains both branches’ routes
  and all profile/oauth/recovery scripts. Email editing remains explicitly deferred.
- Actual authorized, reconciled source subject registry and secure source-authorized
  import path for OAuth-only identities currently absent from Auth.
- Real Google clients/consent/testers/TLS/domains and exact callbacks for staging
  and production; actual imported ID/no-duplicate/browser cancellation/failure proof.
- Permanent SMTP/domain verification, private Redis/ACL, log-query redaction and
  target Appwrite native-provider-disabled/session-invalidation settings proven
  on that deployment, plus production abuse budgets.
- Separately authorized strong email-change challenge and broader mission43
  cutover rehearsal. Old sessions/challenges are not migrated: announce mandatory
  reconnection and issue new Appwrite recovery/verification links after cutover.

Official, version-backed references consulted (Context7 unavailable):
[openid-client6.8.8 signature checks](https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/enableNonRepudiationChecks.md),
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[node-redis6.3.1 configuration](https://github.com/redis/node-redis/blob/redis%406.3.1/docs/client-configuration.md),
[Appwrite2.6.2 session create](https://github.com/appwrite/appwrite/blob/2.6.2/src/Appwrite/Platform/Modules/Users/Http/Users/Sessions/Create.php),
[session delete](https://github.com/appwrite/appwrite/blob/2.6.2/src/Appwrite/Platform/Modules/Users/Http/Users/Sessions/Delete.php),
[account challenges/password policy](https://github.com/appwrite/appwrite/blob/2.6.2/app/controllers/api/account.php),
[session-invalidation policy](https://github.com/appwrite/appwrite/blob/2.6.2/src/Appwrite/Platform/Modules/Project/Http/Project/Policies/Get.php).
