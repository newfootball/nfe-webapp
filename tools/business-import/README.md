# Historical business import (#63)

Work in progress. A local cache is not a target import or proof of a production switch. Final reconciliation and a frozen catch-up remain required.

Use Bun 1.3.14 and Node 24. From the repository root:

```sh
bun test tools/business-import
bunx tsc -p tools/business-import/tsconfig.json
bunx biome check tools/business-import
bun tools/business-import/snapshot.ts --container nfe-database \
  --source-authorized --output /absolute/private/new-snapshot-directory
```

The source flag records an existing authorization; it does not grant one.
Snapshot creation uses read-only `pg_dump` against the named PostgreSQL 17
container. It restores into a temporary, network-isolated PostgreSQL container
with tmpfs data and no published port. The temporary container is removed in
`finally`. The original database receives no restore, migration or write query.
The destination must not exist. Its mode is 700 and output files use mode 600.

`source.dump` contains the complete database, including credentials and private
data. Keep it outside the repository and never publish it. `business-source.json`
excludes passwords, reset tokens, sessions and provider tokens; it still contains
private business data. `identity-source.json` contains the separate, protected
identity projection used by #50. `snapshot.json` records counts and the dump hash.
An incomplete attempt retains its protected output for diagnosis and cannot be
silently overwritten by another run.

The source reader validates historical fields, unique keys and references before
projection. PostgreSQL timestamps and nullable arrays are retained unchanged.
The target projection explicitly treats timezone-less Prisma timestamps as UTC.
Source media MIME types determine delivery kinds: historical `mainVideo` rows can
contain JPEG images. Every original and delivery derivative must have its own
verified, owner-associated storage entry. A media plan or fabricated manifest is
not evidence that bytes have been copied.

The import CLI requires separate protected business and identity snapshots, an
admin policy, a private configuration file and an existing private directory
outside the checkout. The configuration contains credentials and must be mode
600. Example offline inspection (exit status 2 means media is still pending):

```sh
bun tools/business-import/cli.ts --source /private/business-source.json \
  --identity /private/identity-source.json --admin-policy /private/admin-policy.json \
  --config /private/config.json --directory /private/import-run \
  --source-authorized --dry-run --offline
```

Omit `--offline` to download into the private cache. The cache is resumed with
hash, size and MIME verification; unavailable 403/404 sources are quarantined.
By default, quarantine, pending media or deferred identities yield exit status 2 and block
apply. For the isolated development target only, explicitly add
`--allow-missing-media-in-development` to omit each affected media or avatar
pair while retaining posts and relations. `omissions.json` records source and
asset IDs and missing reasons; `provenance.json` retains the complete private
source. Both are private. Available pairs still require verified uploads.
The report keeps `complete: false`, records full source and derived target counts,
and distinguishes accepted omissions and `devImportComplete`. Offline media
remains pending and exits 2. The local source currently has unavailable media; no replacement bytes
are fabricated. Apply is restricted to an isolated local Appwrite target and a
scoped development B2 prefix, with ownership preflights. It does not establish
production readiness: the private Google registry has incomplete coverage and
the final frozen catch-up, including deletions, remains gated. The report's
`isolatedRowImportComplete` only describes row reconciliation; `complete` remains
false. Do not treat `updatedAt` alone as a complete catch-up.

The synthetic proof fixture requires `ffmpeg`, `ffprobe`, and `cwebp` on PATH;
`cwebp` encodes WebP when the local FFmpeg lacks that encoder.

## Local cutover rehearsal (#65)

`bun run rehearsal` (`rehearsal.ts`) replays the whole cutover on the persistent
local runtime (#94, project `nfe-local` on `127.0.0.1:18464`) with synthetic data:
cold volume backup, write freeze, identity/media/row import plus replay,
reconciliation, Start smoke on `127.0.0.1:3564` (HTTP matrix and Playwright FR/EN,
desktop and Pixel 7), direct ACL matrix, B2 failure cases, then a full rollback.
Rows go to a fresh `nfe-local-rehearsal` database; the allowlist accepts that
project only on that loopback port. The run needs the B2 development keys in
`.env.local` (mode 600) and Chrome. Sanitized evidence lives in
`evidence/local-rehearsal.json`; the procedure and go/no-go checklist are in
[docs/migration/local-rehearsal.md](../../docs/migration/local-rehearsal.md).
