# Project Rule Maintenance

Selected host: Codex. Root and nested `AGENTS.md` files explicitly instruct
agents to read applicable rules. No Claude rules setup was selected; no
`.claude/rules` or `.codex/rules` link is needed. Filesystem verification does
not prove a fresh host session loaded the instructions.

Rules are reviewed local adaptations of the `peaklab.sync-ai-docs` bundled
templates. Regeneration must preserve the project sections, actual paths and
installed versions. Repeated renderer output and adapted candidates were checked
for stability during this sync; do not overwrite adaptations with raw templates.

On 2026-10-29, all 30 shared templates were reviewed against primary sources:
14 updated, 16 retained, plus one Start template added. Seven of the eight root
rules received the applicable template changes without losing their local
sections. Start's new rule lives at its package boundary. The shared skill's
`references/template-review.md` records every verdict and official source.

| Template ID | Rule | Selected scope |
| --- | --- | --- |
| `validation-auth/better-auth` | [better-auth.md](better-auth.md) | Unscoped security rule; Next auth/session integration |
| `patterns/server-actions` | [server-actions.md](server-actions.md) | Unscoped security rule; private reads and mutation boundaries |
| `data/prisma` | [prisma.md](prisma.md) | `prisma/**`, `prisma.config.ts`, `src/query/**`, `src/actions/**`, `src/lib/*prisma*.ts`, `src/lib/database-url.ts` |
| `frameworks/nextjs-app-router` | [nextjs-app-router.md](nextjs-app-router.md) | `app/**`, `components/**`, `next.config.ts` |
| `frameworks/tanstack-start` | [tanstack-start.md](../../apps/start/.agents/rules/tanstack-start.md) | Package-relative: `src/**`, `vite.config.ts`, `server.ts`, `scripts/check-client.ts`, `tests/**` |
| `frontend/next-intl` | [next-intl.md](next-intl.md) | `app/**`, `components/**`, `src/i18n/**`, `src/actions/**`, `messages/**` |
| `frontend/tanstack-query` | [tanstack-query.md](tanstack-query.md) | `src/hooks/**`, `components/**`, `app/**`, `apps/start/src/**` |
| `validation-auth/zod` | [zod.md](zod.md) | `src/schemas/**`, `src/lib/onboarding.schemas.ts`, `src/lib/env.ts`, `src/actions/**`, `app/api/**`, `app/(home)/(auth)/**`, `app/(home)/(private)/**`, `components/feature/**`, `apps/start/src/lib/env*.ts` |
| `frontend/tailwind-v4` | [tailwind-v4.md](tailwind-v4.md) | `app/**/*.css`, `app/**/*.tsx`, `components/**/*.tsx`, `apps/start/src/**/*.css`, `apps/start/src/**/*.tsx` |

## Intentionally Skipped

- Biome, TypeScript, shadcn and Zustand: relevant conventions are already in the
  root guide; separate templates would add duplication.
- Resend: a narrow password-reset email helper; server secrecy is in the root
  guide. Docker: local database/probe topology is documented at its own scope.
- Vitest, Stripe, Redis application integration, Hono/Mastra, multi-tenancy and
  clean architecture: no matching root application pattern. Probe service
  dependencies do not imply adoption by the production application.
- Appwrite/B2 have no dedicated catalogue templates; use their nested guide and
  evidenced package documentation. Start now has its own framework template;
  do not apply the Next rule to it.

## Sources for Project Changes

- Start: [execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model),
  [server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions),
  [import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)
  and [Query SSR](https://tanstack.com/start/latest/docs/framework/react/guide/tanstack-query).
  Cross-check with installed Start 1.169.4: it uses `.validator(...)`.
- Next 16: [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
  and [updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag).
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management),
  [Zod parsing](https://zod.dev/basics),
  [next-intl rendering contexts](https://next-intl.dev/docs/environments/server-client-components),
  [Tailwind detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)
  and [Zustand v5 selectors](https://github.com/pmndrs/zustand/blob/main/docs/reference/migrations/migrating-to-v5.md).

This is a documentation review, not a dependency update. Newer online APIs do
not override the installed versions. Filesystem checks do not prove that a fresh
Codex session loaded the rules, and no application behavior change is claimed.

## Guide Placement

| Directory | Has AGENTS.md after sync | Distinct value | Action |
| --- | --- | --- | --- |
| Repository root | Yes | Shared commands, security, architecture, rule routing | Updated |
| `apps/start` | Yes | Independent runtime, SSR isolation and import boundaries | Added |
| `tools/migration-probe` | Yes | Probe isolation, credentials, external effects | Added |
| `src/actions`, `src/query`, `src/lib`, `app/api`, `prisma`, `components` | No | Covered by root instructions and selected rules | No duplicate guides |

The former root Claude guide's useful conventions were merged into `AGENTS.md`.
Outdated claims were corrected against manifests/configuration/source: Prisma 7,
50mb action limit, actual session-helper location, locale negotiation and Bun
tests. Its destructive `make sync` PR prerequisite was superseded by explicit
non-mutating validation; the root guide already identifies that reset as
destructive. Historical `.claude/tasks` records remain unchanged.
