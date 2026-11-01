# Start owner post lifecycle (#56)

The remaining owner lifecycle supports publication, archival, READY media
replacement and resumable deletion. Transactions preserve parent identity,
business dates and ACLs. Durable leases and checkpoints fence competing workers;
B2 cleanup targets exact recorded object versions and protects shared references.
Previously issued read capabilities remain valid until their configured TTL.

## Local verification — 2026-11-01

The complete isolated Appwrite 2.6.2 and real development B2 proof passed with
Bun 1.3.14 / Node 24: eight normal scenarios plus five failure/recovery scenarios.
It covers server authorization, exact ACLs, residual signed URL expiry, media
hashes/versions, multi-page child cleanup, social transaction races, FR/EN mounted
replacement/playback/cache withdrawal, transaction rollback, process death and
recovery after actual lease expiry. No artificial clock or forced lease expiry
is used for the crash recovery proof.

[Sanitized evidence](../../apps/start/evidence/post-lifecycle-synthetic.json)
records all six phases exiting successfully, cleanup of 22 known synthetic keys
(including two residual versions) and restoration of the original CORS rules.
The notification-v1 schema and a separate row read/write key are required by
accepted social mutations and are provisioned by the isolated harness.

After obtaining the exclusive local backend slot, from the repository root:

```sh
bun run build:start
bun run typecheck:start
bun apps/start/scripts/post-lifecycle-local.ts prepare
bun apps/start/scripts/post-lifecycle-local.ts up
NFE_LIFECYCLE_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/post-lifecycle-proof.ts
bun apps/start/scripts/post-lifecycle-local.ts down
```

Use a fresh isolated backend for each proof. The dedicated namespace is
`nfe-lifecycle-56`, with backend 19566 and built app 3556. Its private credentials
and logs stay under the ignored `scripts/.post-lifecycle-local` directory.
The runner cleans its exact B2 fixtures and restores CORS in its finalizer;
`down` then removes only the dedicated backend and private local state.
The development bucket configuration is read from the existing root local
configuration without printing or committing credentials.

This is synthetic local acceptance. Native CI on the delivered commit,
integration into the persistent runtime, whole-app parity, account deletion,
representative imports and production cutover remain separate gates.
