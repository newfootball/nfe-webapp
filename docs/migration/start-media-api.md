# Start media API (#55)

Stable client contract: `apps/start/src/lib/media.ts` exports the following
TanStack server functions. Every call uses `{ data: input }` and returns
`MediaResult<T>` from `media-contract.ts`; failures contain only controlled codes.

| Function | Input | Success value |
| --- | --- | --- |
| `allocateAsset` | `AllocateAsset` | `UploadAsset` |
| `resumeAsset` | `{ assetId }` | `UploadAsset` |
| `signAssetPart` | `{ assetId, partNumber }` | `{ url: string }` |
| `finalizeAsset` | `{ assetId }` | `UploadAsset` |
| `cancelAsset` | `{ assetId }` | `{ cancelled: true }` |
| `publishPost` | `PublishPost` | `{ id: string, slug: string }` |
| `replaceAvatar` | `{ assetId }` | `{ image: string }` |
| `readAsset` | `{ assetId }` | `MediaRead` |
| `readPostMedia` | `{ postId, kind: "video" \| "thumbnail" }` | `MediaRead` |

All mutations and resume use POST; reads use GET. Resume can recover initiation and is therefore a mutation. Only allocation IDs enter
subsequent operations; clients cannot choose bucket, object key, uploadId, ETags,
version, post status or owner. `requestId` makes allocation and publication
retries idempotent; a different file gets a new UUID. Hash the selected bytes
with browser SHA-256 before allocation. Videos are MP4 H.264/yuv420p + optional
AAC, validated server-side; images must be WebP (canvas quality 0.85).

Multipart upload uses sequential 5 MiB slices, with a possibly smaller last
part. Use `resumeAsset.parts` to skip already received matching parts and obtain
a fresh signature for each remaining part. PUT the raw slice with XHR for
progress and real `abort()`. On pause or retry retain allocation ID and file
fingerprint; on cancel also invoke `cancelAsset`. Finalization inspects B2 parts,
checks exact sizes and hashes the actual immutable version before READY.
Finalizing may require retry after a transient failure; it never grants attach
rights before validation. Terminal CANCELLED/REJECTED allocations cannot resume.

`mediaPath(id)` is a stable canonical image route. `postMediaPath(postId, kind)`
resolves current post media without changing feed DTO query/cursor semantics.
Read routes authorize current parent/profile visibility and redirect to a
120-second version-pinned GET capability, with private/no-store and no-referrer.
`readAsset` returns that capability explicitly for players that renew before
expiry, retaining currentTime and play/pause state; use Range/seek normally.
Already issued capabilities have up to 120 seconds of residual access after
withdrawal. Never persist or log a signed URL.

Backend ownership: media-contract.ts, media.ts, media*.server.ts, media routes,
additive schema, backend proof and docs. A separately dispatched UI helper may
own components/media/**, publishing routes, thumbnail/client transfer helpers,
FR/EN media messages and integration into existing profile/feed components,
once the coordinator explicitly assigns those paths.
