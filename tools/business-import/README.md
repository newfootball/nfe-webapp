# Historical business import (#63)

A local cache is not a target import or proof of a production switch. The
production run itself, its storage bucket and the cutover are owned by #66.

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
By default, quarantine, pending media or deferred identities yield exit status 2
and block apply.

## Accepted media loss

Quarantined sources are never replaced by fabricated bytes. When their loss has
been decided (the 168 unavailable Cloudinary objects of the current source are
test data), the decision is recorded in a private accepted-loss manifest bound
to the exact source file. Each dry run with quarantine writes
`quarantine.json` (mode 600) into the private directory: a candidate manifest
listing every quarantined media or avatar pair with its asset IDs and reasons.
Copy it, replace `reference` with the decision reference (the placeholder is
rejected), keep it outside the checkout and pass it with
`--accepted-loss /private/accepted-loss.json`.

The manifest only applies when its `sourceDigest` equals the SHA-256 of the
business snapshot file and when every entry matches a currently quarantined
pair exactly. Apply is blocked by any quarantined pair missing from the manifest
(`unaccepted`), by any manifest entry that is no longer quarantined or unknown
(`stale`), and by an incomplete derived media set. Accepted pairs are omitted
whole (media row and both assets, or the avatar and both assets) while posts
and relations are retained; `omissions.json` and `provenance.json` keep the
private detail. The report lists them under `acceptedLoss` and, in the private
`report.json` only, as `quarantine` entries with status `missing_accepted`,
`missing_unaccepted` or `stale`. The manifest digest is part of the row
checkpoint snapshot, so changing the decision changes the import. This replaces
the former development-only flag: the same explicit, reviewable artefact works
for every allowed target, including production.

## Frozen rebuild and final catch-up

`--apply --rebuild --freeze-confirmed` reconstructs the target from a new frozen
snapshot after a first import. It only touches what the importer owns:

- rows: entries whose source row disappeared are deleted, entries whose
  normalized content changed are deleted then recreated, unchanged entries are
  kept; a row whose current content differs from the checkpointed hash is never
  deleted (`owned_row_changed`), an interrupted pass resumes from the `retire`
  state and plain runs refuse to continue it (`rebuild_in_progress`);
- storage: objects of assets no longer planned or whose bytes changed are
  removed version by version after re-verifying their ownership token, pending
  multipart uploads are aborted, then missing objects are uploaded;
- identities: owned users absent from the new identity snapshot are deleted,
  the remaining ones are re-marked for the new binding, foreign users still fail
  the preflight. The catch-up does not cover an email change of an existing
  user between snapshots: the owned user no longer matches its source email
  and the preflight fails closed (`foreign_target_identity`). Such a change
  needs a manual decision before the frozen run.

The run is resumable and idempotent: a replay creates, deletes and uploads
nothing. `updatedAt` is never used as a change signal; every row is compared by
content hash. Unit tests cover rows (`runner.test.ts`), storage
(`upload.test.ts`) and identities (`identities.test.ts`); the SDK proof in
`evidence/synthetic.json` predates the identity and storage freeze paths.

## Reconciliation report

After the rows are written, the CLI lists every contract table on the target and
produces `reconciliation` in the private `report.json`: per source entity and
per table volumes (source, active after omissions, expected, actual), missing,
foreign and changed rows, orphan references, unique-index duplicates, derived
counters (likes, comments and media per post, followers, following and posts
per user, favorites, unread notifications and messages per recipient),
effective read rights recomputed per row type, deterministic functional samples
(up to 25 rows per table with field-level differences) and the identity count.
Every difference is categorized: `accepted_loss` (manifest),
`intended_transformation` (entity splits, derived conversations, hashed
notification IDs, identities owned by the identity import) or `unexplained`.
Any unexplained difference yields exit status 2, as does an `--apply` run that
was refused (`applied: false`, `refused` names the reason: `offline`,
`deferred_identities`, `stale_manifest`, `unaccepted_loss`,
`derived_incomplete`). Standard output carries counts only; identifiers and
samples stay in the private file.

`complete` is true only when the rows import, the reconciliation and
`--freeze-confirmed` all hold, i.e. the final catch-up ran on a frozen source
without unexplained difference. `isolatedRowImportComplete` still describes the
rows alone.

## Target binding

By default apply is restricted to an isolated loopback Appwrite project
(`nfe-import-63-*`, or `nfe-local` on `127.0.0.1:18464`). A production target
needs two explicit agreements: the `--production-target` flag and a
`production` block in the private configuration repeating the same `endpoint`,
`project` and `database`. One without the other, or any difference between the
block and the top-level values, is rejected (`production_target_mismatch`). The
endpoint must be a named public HTTPS host serving exactly `/v1`, without port,
credentials, query or fragment; raw IPs, `localhost` and `.local` names are
refused (`explicit_production_target_required`). The same ownership preflights
apply: foreign rows, identities or objects fail closed.

Storage is still bound to the development bucket and scoped `nfe-import-63/`
prefix; a production apply with that bucket or prefix is refused
(`production_storage_binding_required`). The production bucket, DNS, Coolify
and the cutover execution itself belong to #66. The private Google registry still has incomplete coverage.

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
