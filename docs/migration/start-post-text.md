# Start owner posts and text editing

Refs #56. This is the owner-list and title/description slice only. It does not
complete #56: status transitions, publication, archive, deletion, media replacement
and B2 lifecycle work remain outside this change. No production or imported-source
parity is claimed.

## Behavior

- `/fr/post/my` and `/en/post/my` list only the current session owner's posts,
  including draft, published, pending, rejected, archived and legacy null status.
  Seek pagination is bounded to 1–20 rows with owner/page-size-bound cursors.
- `/:locale/post/:id/edit` edits trimmed title (1–200 characters) and description
  (0–10000 characters). Missing identity and foreign owners are rejected at each
  server boundary. Admin status does not grant an edit bypass in this slice.
- Server-side strict input validation rejects actor, status, slug, media and
  business-date injection. POST writes enforce the accepted Origin policy.
- Appwrite transactions stage text, folded search values and business `updatedAt`
  together, then recheck owner/revision before commit. Stale/replayed or concurrent
  writes return explicit conflicts; local input remains available for correction.
  Other metadata, permissions and media rows remain unchanged.
- Private routes attach `private, no-store` and `Vary: Cookie` in route server
  middleware. This also covers canonical-search redirects occurring before loaders,
  as well as auth redirects and HTML. Private RPC responses remain uncached.
- Success cancels and invalidates affected Query families across locales/filters,
  then synchronously invalidates router loaders. Identity changes clear the cache.

The runtime requires the existing Start auth/feed/profile configuration plus
`START_APPWRITE_POST_TEXT_WRITER_KEY`, a separate server-only Appwrite key with
`rows.read` and `rows.write`. It must differ from the session, profile-writer and
feed-reader keys. No new browser credential is introduced.

## Isolated synthetic verification

Use Node 24 and Bun, with Docker and Playwright Chrome available. The launcher
owns project `nfe-post-text-56`, Appwrite 2.6.2 at loopback 18156 and the built Start
server at 3570. Preserve ports 3500/3501 and obtain the shared runtime lease first.
Private configuration lives in ignored `apps/start/scripts/.post-text-local`.

```sh
bun run build:start
bun run typecheck:start
bun run --cwd apps/start test
bun run --cwd apps/start lint
NFE_POST_TEXT_SYNTHETIC=1 bun apps/start/scripts/post-text-local.ts prepare
NFE_POST_TEXT_SYNTHETIC=1 bun apps/start/scripts/post-text-local.ts up
PLAYWRIGHT_CHANNEL=chrome NFE_POST_TEXT_SYNTHETIC=1 bun apps/start/scripts/post-text-proof.ts
NFE_POST_TEXT_SYNTHETIC=1 bun apps/start/scripts/post-text-local.ts down
```

Always run `down` after a proof and create a fresh stack before another proof.
The account-switch test intentionally revokes the original owner session; its
fixture cannot be reused. `down` removes only the owned stack, volumes and private
state. The proof runner stops its built-app process in `finally`.

The proof covers direct RPC ownership/Origin/validation, all six statuses,
raw-row/media invariants, atomic folded search, replay/concurrent conflicts and
backend failure. FR/EN browser checks warm feed/detail/author-feed/search caches in
one mounted document, edit, check invalidation before reload, navigate back, reload,
retain conflict input, and sign in as another owner without prior-owner data.
Anonymous raw responses test both canonical and auth redirects without following.

Sanitized runtime results and source/build fingerprints are recorded in
[`apps/start/evidence/post-text-runtime.json`](../../apps/start/evidence/post-text-runtime.json).
The canonical task report retains all repair attempts; independent exact-head
review, CI and merge belong to the coordinator.
