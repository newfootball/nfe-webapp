# Private media publication in Start

Related #55 / mission #43. The production Next application and historical
Cloudinary objects are unchanged. This is a new-media contract, not an import,
production activation, CDN or representative production performance verdict.

## Runtime configuration

Use Node 24 / Bun 1.3.14 and Start's own private environment directory. Never
prefix these values with `VITE_`. In addition to the existing SSR auth/database
configuration, provide:

- `START_APPWRITE_MEDIA_WRITER_KEY`: a distinct server-only key with
  `rows.read` + `rows.write` for transaction reads/writes. No `users.write` or
  session scope. Appwrite keys are project-scoped, so every operation still
  enforces identity, onboarding, ownership and allowed fields on the server.
- `START_APPWRITE_MEDIA_READER_KEY`: another distinct `rows.read` key, used only
  after current parent/profile checks. Never reuse session/profile writer keys.
- `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_REGION`,
  `B2_ENDPOINT`: private B2 S3 configuration. The bucket stays private.
- `START_MEDIA_PREFIX`: an application-owned prefix ending in `/`. Allocations
  append a server-generated random directory and allocation UUID; clients
  cannot choose storage locations.
- Local FFmpeg and ffprobe (proof uses 9.0.1), reachable on the server PATH.
  Neither binary nor B2 SDK credentials enter the browser bundle.

| Limit | Default | Maximum configurable value |
| --- | --- | --- |
| `START_MEDIA_MAX_VIDEO_BYTES` | 100 MiB | 512 MiB |
| `START_MEDIA_MAX_IMAGE_BYTES` | 2 MiB | 10 MiB |
| `START_MEDIA_MAX_DURATION` | 180 seconds | 600 seconds |
| `START_MEDIA_PROCESS_TIMEOUT_MS` | 60 seconds per subprocess/download | 120 seconds |
| `START_MEDIA_READ_TTL_SECONDS` | 120 seconds | 120 seconds (minimum 2) |

Parts are exactly 5 MiB except the last; at most 103 parts. The owner has a
bounded pending-allocation listing and an advisory cap of 20 pending assets.
Multipart signatures last 120 seconds and only authorize one allocated upload
and part number. Finalization obtains parts/ETags from B2, validates exact sizes,
then validates the actual exact B2 version, Content-Type, byte count and SHA-256.
ETag is never treated as a content hash. Completion consumes the multipart
upload; replayed part PUTs cannot overwrite a completed published object.

## Video and image behavior

Accepted videos are MP4 with H.264/yuv420p and optional AAC audio, up to
3840×2160. Unsupported encodings fail before publication; B2 performs no
transcoding. The server probes and decodes the local downloaded file using
forced MP4/WebP demuxers and a `file`-only input protocol whitelist, without
untrusted remote fetches. Subprocess timeouts, one decode thread, 64 MiB maximum
individual FFmpeg allocation and at most two concurrent validators per process
bound processing. Deployment resource isolation remains a hosting concern.

Images must be WebP and at most 2048×2048. The UI uses canvas WebP quality 0.85,
including manually selected images. Thumbnail choices preserve 10/25/50/75/90%
positions, first selected by default, plus manual override. The former
Cloudinary image format/quality URL transformation is replaced for new assets
by actual WebP bytes and server content validation. Existing historical media
are not rewritten or deleted.

## Persistence, publication and reads

Run `provisionMediaV3(db, databaseId)` from
`tools/appwrite-schema/media-v3.mts` against an explicitly selected environment.
It verifies the applied v1 digest and adds only `media_assets` and its version
marker. Applied v1 and profile v2 definitions/digests remain unchanged.
`media_assets` represents unattached uploads and avatars independently of the
required `media.postId`; no fake post is created for an avatar.

Durable states are ALLOCATED → INITIALIZING → UPLOADING → FINALIZING → READY →
ATTACHED, with CANCELLED/REJECTED terminal states. Transactional state claims
serialize cancel/finalize/attach. A ten-minute lease prevents a live external
operation from being concurrently cancelled; failed operations are replayable,
and a lost initialization/completion response is recovered by its exact random
allocated key. An expired lease can be retried explicitly. A finalization error
never makes an asset attachable. A request UUID binds allocation retry to the
same owner, kind, type, byte count and hash.

Publication accepts only READY allocated IDs, verifies the onboarded owner,
and creates the PUBLISHED post, unique server-generated slug, both v1 media
rows and ATTACHED asset states in one Appwrite transaction. The slug includes
the publication UUID, so equal titles do not race on a title-derived counter.
Repeating a successful publication UUID is idempotent. Avatar replacement
atomically updates the current profile image and attaches its validated asset;
the previous avatar loses read eligibility immediately.

Canonical rows/DTOs store stable descriptors, not signed URLs. A canonical
`/media/:assetId` image route or `/post-media/:postId/:kind` route checks current
READY/ATTACHED state and parent/profile visibility. Anonymous access requires
a currently published parent or current onboarded profile avatar; own READY
previews require a live owner session. Post ID validation preserves the feed's
legacy internal-dot grammar. Read signatures pin the validated B2 version, so
another version under the same object key cannot change published bytes.

Responses use `private, no-store`, `Vary: Cookie` and `no-referrer`; signed URLs
must never be logged or persisted. B2 GET capabilities last at most 120 seconds:
withdrawal prevents renewal immediately but an already issued URL can retain
access for its remaining TTL. Range/206 and seeking operate directly against
B2. The player renews through an authorized read and retains playback position.
Public DTOs contain no bucket/key/version, session credential or raw row spread.

## Explicit orphan recovery

No cron, monitoring routine or scheduled cleanup is armed. After loading the
explicit runtime environment, inspect only known allocation UUIDs:

```sh
cd apps/start
bun scripts/media-recover.ts --asset <allocation-uuid>
bun scripts/media-recover.ts --asset <allocation-uuid> --execute --journal /private/path/new-journal.json
```

Dry-run is the default. Execution requires a new mode-600 journal and records
exact allocated object versions/upload IDs before deletion/abort. The command
requires an expired operation lease and either CANCELLED state, or 24 hours
without activity; it never cleans attached post media or the current avatar.
Only the configured bucket/prefix and exact allocated random key are inspected.
Partial cleanup can be replayed with the same IDs and a new journal; unrelated
bucket data and historical Cloudinary objects are outside this command.

## Isolated verification

```sh
bun install --frozen-lockfile
bun install --cwd apps/start --frozen-lockfile
bun install --cwd tools/appwrite-schema --frozen-lockfile
bun apps/start/scripts/media-local.ts prepare
bun apps/start/scripts/media-local.ts up
NFE_MEDIA_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun apps/start/scripts/media-proof.ts
bun apps/start/scripts/media-local.ts down
```

Build Start before the proof. The dedicated project is `nfe-media-55`, backend
19565, frontend 3555, subnet `10.245.65.0/24`; preparation verifies local
collisions and never reuses `nfe-database` or another project's resources. The
proof selects only the six authorized B2 fields from the baseline root
`.env.local` into a new ignored mode-600 configuration. It uses a UUID-owned
prefix, generated assets measured in MiB, and journals/deletes only exact owned
versions/uploads. Its own 3555 CORS rule is appended while preserving existing
rules, verified, then removed without altering unrelated rules. Protected local
diagnostics are under `apps/start/scripts/.media-local/`; do not commit them.

The durable task state records final exact-head outcomes and any incomplete
external criteria. Chrome desktop / Android emulation and an available WebKit
engine are distinct claims; none establishes physical iOS/Android coverage.
Source/production browser budgets and production cutover remain unspecified.

Official references: [B2 S3 API](https://www.backblaze.com/docs/cloud-storage-call-the-s3-compatible-api),
[multipart initiation](https://www.backblaze.com/apidocs/s3-create-multipart-upload),
[CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules).
