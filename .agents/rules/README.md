# Project Rule Maintenance

Selected host: Codex. Root and nested `AGENTS.md` files explicitly instruct
agents to read applicable rules. Rules are reviewed local adaptations of the
`peaklab.sync-ai-docs` bundled templates; regeneration must preserve the project
sections, actual paths and installed versions.

The Next.js app was removed: its rules (better-auth, server actions, Prisma,
Next App Router, next-intl) were deleted and the remaining rules scoped to Start.

| Template ID | Rule | Selected scope |
| --- | --- | --- |
| `frameworks/tanstack-start` | [tanstack-start.md](../../apps/start/.agents/rules/tanstack-start.md) | Package-relative: `src/**`, `vite.config.ts`, `server.ts`, `scripts/check-client.ts`, `tests/**` |
| `frontend/tanstack-query` | [tanstack-query.md](tanstack-query.md) | `apps/start/src/**` |
| `validation-auth/zod` | [zod.md](zod.md) | `apps/start/src/lib/**`, `tools/**` |
| `frontend/tailwind-v4` | [tailwind-v4.md](tailwind-v4.md) | `apps/start/src/**/*.css`, `apps/start/src/**/*.tsx` |

## Intentionally Skipped

- Biome and TypeScript: conventions are in the root guide.
- Appwrite/B2 have no dedicated catalogue templates; use their nested guide and
  evidenced package documentation.

## Guide Placement

| Directory | Has AGENTS.md | Distinct value |
| --- | --- | --- |
| Repository root | Yes | Shared commands, layout, rule routing |
| `apps/start` | Yes | Runtime, SSR isolation and import boundaries |
| `tools/migration-probe` | Yes | Probe isolation, credentials, external effects |
