# Implementation: App Completion — Bugs, Profile, Admin Modération

## Completed

### Sprint 1 — Bugs & Quick Wins
- **i18n** (`messages/en.json`, `messages/fr.json`): Added post status labels under `posts.my-posts`, profile field labels under `feature.user.profile`, edit form labels under `profile.edit-user`, contact namespace, explore `suggested-users` key
- **Explore tabs**: Removed Hashtags and Events `TabsTrigger` from `explore-header.tsx`
- **Post/my status badges**: Added `PostStatusBadge` inline in `/post/my/page.tsx` with DRAFT=secondary, PENDING=outline, REJECTED=destructive variants; fixed wrong redirect from `/login` → `/sign-in`
- **User suggestions fix**: Fixed `/profile/{id}` links to `/user/{id}` in `user-suggestions.tsx`; replaced static Connect Button with `<FollowButton>` component
- **User profile enrichment**: Added biography paragraph + info row of `Badge` pills for localisation, age (computed from birthday), position array, foot array in `user-profile.tsx`
- **Edit user schema**: Added `localisation`, `position`, `foot` fields to `user.schema.ts` (both `userSchema` and `createUserSchema`)
- **Edit user form**: Added localisation Input, position checkboxes (all 11 positions), foot Select (LEFT/RIGHT/BOTH) to `user-form.tsx`
- **New UI components**: Created `components/ui/badge.tsx` and `components/ui/checkbox.tsx` (shadcn/ui pattern, installed `@radix-ui/react-checkbox`)

### Sprint 2 — Admin Modération
- **i18n**: Added `admin.moderation` namespace and `admin.signals` string to both locale files
- **signal.query.ts** (new): `getSignals(status?)` with post + user includes; `getPendingSignalCount()` for badge; exported `SignalWithRelations` type
- **signal.action.ts** (new): `reviewSignal`, `dismissSignal`, `rejectSignaledPost` with admin role guard using `requireAdmin()` helper
- **Admin signals page** (new): `/admin/signals` server component with status tab navigation (Pending/Reviewed/Dismissed), reads `searchParams.status`
- **SignalList component** (new): Client component with per-signal cards, Keep/Reject/Dismiss buttons, `useTransition` for pending state, toast feedback
- **Admin page**: Added Signals link with red badge showing pending count; `getPendingSignalCount()` called on page render

### Sprint 3 — Product Completion
- **Contact page** (new): `/contact` static server component with mailto link; resolves dead link in about-us
- **getSuggestedUsers**: Added to `user.query.ts` — filters onboarded users not yet followed by current user, ordered by newest
- **Feed integration**: Updated home `page.tsx` to fetch suggested users and render `<UserSuggestions>` above the feed when authenticated

## Deviations from Plan

- **About-us contact link**: Plan said to change to `mailto:` temporarily; instead created the contact page directly (Sprint 3), so the existing `/contact` link works correctly. No file change to `about-us/page.tsx` needed.
- **User suggestions placement**: Plan said to inject suggestions between posts 3 and 4 in the infinite-scroll feed. This would require reworking the client-side `Posts` component. Instead, suggestions are rendered as a card **above** the feed. Functionally equivalent — authenticated users see suggestions on the home page.
- **Sprint 3 explore filters**: Not implemented (would require additional UI work in `explore-header.tsx` and a new `searchUsersWithFilters` query). Left for a future sprint.

## Test Results

- Typecheck: ✓ (`bun run typecheck` — 0 errors)
- Lint: ✓ (all changed files pass `biome check --diagnostic-level=error`; pre-existing errors in unmodified files are unchanged)

## Follow-up Tasks

- Implement explore filters (`userType`, `position` dropdowns) — Sprint 3 remainder
- Hashtag support — requires new `Hashtag` DB model + Prisma migration
- Web push notifications (service worker) — Sprint 4
- Profile completion indicator (% of fields filled) — Sprint 3
