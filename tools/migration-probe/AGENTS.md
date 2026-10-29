# Migration Probes

Isolated experiments for Appwrite and B2, with their own Bun manifest, lockfile
and TypeScript boundary. These results do not establish production parity or
authorize changing the root application's backend.

Before changing or running a probe, read its instructions and evidence limits:
[Appwrite](../../docs/migration/appwrite-probe.md) and
[B2](../../docs/migration/b2-probe.md).

## Checks

From this directory:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test:b2
```

These checks need no cloud credentials and do not prove runtime integration.
Do not run live probes as part of documentation checks.

## Isolation and Secrets

- Appwrite uses pinned 2.6.2 with `appwrite` 29.2.0 and `node-appwrite` 31.1.0.
  Use the dedicated Compose project `nfe-migration-probe`, loopback port 19445
  and generated `.local` state. Do not repurpose existing containers or volumes.
- For an authorized Appwrite run: `prepare:local`, `up`,
  `NFE_PROBE_LOCAL=1 bun run probe`, then `down` even after failure.
  `down` removes probe resources/volumes and invalidates its local key.
- B2 uses AWS SDK S3 3.1159.0. Without `--run`, `probe:b2` reports `not_run`;
  live runs and `--configure-cors` have external effects. Follow the B2 guide's
  explicit run procedure rather than treating them as ordinary unit tests.
- Environment input must be a gitignored file in mode `600`. Never print or
  commit credentials, copy them into evidence, or expose them to the browser.
  Keep bucket/endpoint restrictions, nonce/origin checks and per-run object
  ownership guards intact. Cleanup must stay within resources owned by the run.
- Keep Playwright drivers named `*.pw.ts` and evidence sanitized. Distinguish
  guard tests, local service checks and real browser/cloud observations.
