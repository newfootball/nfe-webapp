# Production cutover record (Refs #66)

Record of the TanStack Start + Appwrite + B2 cutover on `nfe-production`. Procedure and thresholds:
[start-release-runbook.md](start-release-runbook.md). Owner: Fahari (`mkldevops`).

## Done

| Step | When (UTC) | Evidence |
|---|---|---|
| Private backup of production rows and accounts before import | 2026-11-06 | kept outside the repository |
| Business import applied to Appwrite `nfe` + B2 `nfe-webapp-prod/media/business-import/` | 2026-11-06 | `applied: true`, reconciliation `ok: true`, `unexplained: 0`, identities 22/22 ([#66 comment](https://github.com/newfootball/nfe-webapp/issues/66#issuecomment-6709518939)) |
| Accepted media loss: 170 test media unavailable at source (403/404) | 2026-11-06 | signed manifest, owner decision |
| DNS `nfe-foot.com` and `www` on `nfe-production` (2.24.50.72) | 2026-11-07 | `www` → 308 to apex |
| Smoke account and public test post recreated after the import wipe | 2026-11-07 | post `3775d263-0ac4-44e1-a3db-576df80277d7` |
| Import key `nfe-import-66` (29 scopes) revoked | 2026-11-07 18:54 | console `DELETE` 204; key now answers 401 |
| Release `5609076` deployed on Coolify `nfe-start` | 2026-11-07 18:54 | deployment `finished` |
| `prod:smoke` on `https://nfe-foot.com` | 2026-11-07 18:54 | `pass 12, fail 0, notRun []` |
| `prod:smoke:login` with the smoke account | 2026-11-07 18:55 | 1 passed |

Imported actives: User 22 · Post 157 · Media 146 · Follow 87 · Like 354 · Favorite 40 · Comment 236 ·
Message 69 · Notification 227 · PostSignal 11; 332 B2 objects.

## Rollback path

- App: Coolify → `nfe-start` → **Rollback** to `1d38ed5` (previous finished deployment), then `prod:smoke`.
- Data: restore the pre-import backup only with the owner's decision; writes made since the
  cutover are lost by that restore, so export them first. Schema changes are additive.
- B2: never delete new objects or versions in `nfe-webapp-prod`; keep Cloudinary, historical
  buckets and their recovery keys for the retention period.

## Still open

- Previous system (Vercel): maintenance mode, server writes blocked, kept read-only with its
  database and media for the retention period.
- Tell imported users to sign in with their original credentials or reset their password.
- Authenticated public checks not covered by `prod:smoke:login`: video publication, interaction,
  messages, admin.
