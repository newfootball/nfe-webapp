# Implementation Plan: App Completion — Bugs, Profile, Admin Modération

## Overview

3 sprints ordered by value-to-effort ratio. No schema migration required for Sprints 1 & 2 — all DB fields/models already exist. Sprint 3 adds new features.

**Sprint 1 — Bugs & Quick Wins**: Fix dead links, remove phantom tabs, show post statuses, enrich profile display and edit form.  
**Sprint 2 — Admin Modération**: Exploit the existing `PostSignal` model to give admins a full moderation workflow.  
**Sprint 3 — Product Completion**: Contact page, user suggestions on the feed, explore filters.

---

## Dependencies (Logical Order)

1. i18n files (`messages/en.json`, `messages/fr.json`) must be updated **first** — all other files depend on translation keys.
2. `user.schema.ts` and `edit-user.action.ts` before `user-form.tsx` (schema drives form + action).
3. `src/query/signal.query.ts` before the admin signals page.
4. `src/actions/signal.action.ts` before the admin signals list component.
5. Admin signals page before updating `admin/page.tsx` (needs to know the route).

---

## Sprint 1 — Bugs & Quick Wins

### `messages/en.json`

- Add under `posts.my-posts`: keys `status-published`, `status-draft`, `status-pending`, `status-rejected`, `status-archived` — short labels shown as colored badges on My Posts.
- Add under `feature.user.profile`: keys `biography`, `localisation`, `position`, `foot`, `age` — labels for the new profile info rows.
- Add under `profile.edit-user`: keys `localisation`, `position`, `foot`, `localisation-placeholder`, `position-placeholder`, `foot-placeholder` — labels/placeholders for the new edit form fields.

### `messages/fr.json`

- Mirror every new key added in `en.json` with French translations.
- `status-published` → "Publié", `status-draft` → "Brouillon", `status-pending` → "En attente", `status-rejected` → "Rejeté", `status-archived` → "Archivé".
- `localisation` → "Ville", `position` → "Poste", `foot` → "Pied préféré", `age` → "Âge".

---

### `app/(home)/(public)/about-us/page.tsx`

- Replace `<Link href="/contact">` wrapping the "Contact Us" Button with `<a href="mailto:contact@nfe-foot.com">`. Keep the `Button` child unchanged so styling is identical.
- Remove the unused `Link` import if it becomes unused.

---

### `app/(home)/(public)/explore/explore-header.tsx`

- Remove the two `TabsTrigger` blocks for `value="hashtags"` and `value="events"` entirely.
- Keep only: `top`, `users`, `posts` triggers.
- The `navigateTo` function and debounce logic remain unchanged.

---

### `app/(home)/(public)/explore/page.tsx`

- Remove the `tab === "hashtags"` condition from the `Promise.all` array (it resolves to `[]` anyway — removal is cleanup only).
- Remove the `tab === "events"` condition similarly.
- The existing `tab === "top" || tab === "posts"` logic for `searchPosts` and `tab === "top" || tab === "users"` for `searchUsers` remain correct after the above removals.

---

### `app/(home)/(private)/post/my/page.tsx`

- Fix the incorrect redirect: change `redirect("/login")` to `redirect("/sign-in")` (line 15 — consistent with all other private routes).
- After the `<h1>` title, add a status badge for each post before rendering `<PostDetails>`.
- Create a `PostStatusBadge` function/component inline in this file (not worth a separate file for a single use): maps `post.status` to a label from `t("status-{status}")` and a `variant` color class — `DRAFT`=gray muted, `PENDING`=amber, `REJECTED`=red destructive, `PUBLISHED`=hidden (default, no badge needed), `ARCHIVED`=gray.
- Use `useTranslations("posts.my-posts")` — already imported via `getTranslations`.

---

### `components/feature/user/user-suggestions.tsx`

- Fix bug: both `<Link href={\`/profile/${user.id}\`}>` occurrences (lines 51, 59) must become `/user/${user.id}` — the correct public profile route.
- The "Connect" button (`t("connect")`) currently does nothing — wrap it with `<FollowButton userId={user.id} showText={true} />` and remove the static Button. Import `FollowButton` from `@/components/feature/follow/follow-button`.

---

### `components/feature/user/user-profile.tsx`

- Below `<p className="text-muted-foreground mb-4">@{user.email}</p>`, add a new section that conditionally renders profile metadata:
  - **Biography**: if `user.biography`, show as a `<p>` with `text-sm text-center max-w-xs mx-auto mb-2`.
  - **Info row**: a `<div className="flex flex-wrap gap-2 justify-center mb-4">` containing pill badges for:
    - Localisation: if `user.localisation` — show with a MapPin icon.
    - Age: if `user.birthday` — calculate `Math.floor((Date.now() - new Date(user.birthday).getTime()) / (1000*60*60*24*365))` years.
    - Position: if `user.position.length > 0` — show each position as a badge; convert enum value to display by replacing underscores with spaces and title-casing.
    - Foot: if `user.foot.length > 0` — join as "Left / Right" etc.
  - Use `<Badge variant="secondary">` from `@/components/ui/badge` for the pills.
  - No translation keys needed for the data values themselves; use the label keys added to `feature.user.profile.*` for aria or screen-reader labels only.

---

### `app/(home)/(private)/profile/edit-user/user.schema.ts`

- Add to the `userSchema` object:
  - `localisation: z.string().optional().nullable()` — city text field.
  - `position: z.array(z.nativeEnum(Position)).optional().default([])` — import `Position` from `@prisma/client`.
  - `foot: z.array(z.nativeEnum(Foot)).optional().default([])` — import `Foot` from `@prisma/client`.
- Update `UserDataForm` type (inferred from schema — no manual change needed).
- Update `createUserSchema` function to add the same fields (without translations since no validation messages needed for these optional fields).

---

### `app/(home)/(private)/profile/edit-user/edit-user.action.ts`

- The current `updateUser` action uses `prisma.user.update` with `parsedData.data` — since `userSchema` now includes `localisation`, `position`, `foot`, they will automatically be included in the update.
- No logic change needed; the schema extension propagates automatically.
- Consider: Prisma accepts `Position[]` and `Foot[]` arrays natively since these are defined as array fields in the schema.

---

### `app/(home)/(private)/profile/edit-user/user-form.tsx`

- Add three new form fields after the `biography` textarea and before the Save button:
  - **Localisation**: `<Input type="text">` bound to `user.localisation`, using `t("localisation")` label and `t("localisation-placeholder")` placeholder.
  - **Position**: A `<Select>` (shadcn) or checkbox group allowing multiple selection. Since `user.position` is an array, use checkboxes for each Position enum value: GOALKEEPER, CENTRE_BACK, FULL_BACK, LIBERO, DEFENSIVE_MIDFIELDER, MIDFIELDER, ATTACKING_MIDFIELDER, WINGER, STRIKER. Update `user.position` on change.
  - **Foot**: A `<Select>` with options: LEFT, RIGHT, and a "BOTH" option that sets `foot: ["LEFT", "RIGHT"]`. Derive the displayed value: if foot has both → "BOTH", else show the single value.
- Import `Position` and `Foot` enums from `@prisma/client` for the option lists.
- Consider: the form currently uses `useState<User>` — `user.position` and `user.foot` are already typed as `Position[]` and `Foot[]` on the Prisma User type, so `setUser({ ...user, position: [...] })` works correctly.

---

## Sprint 2 — Admin Modération

### `messages/en.json`

- Add namespace `admin.signals`:
  - `title`: "Reported Posts", `description`: "Posts flagged by users for review"
  - `pending`: "Pending", `reviewed`: "Reviewed", `dismissed`: "Dismissed"
  - `reason`: "Reason", `reporter`: "Reported by", `reported-at`: "Reported at", `post`: "Post"
  - `keep-post`: "Keep Post", `reject-post`: "Reject Post", `dismiss`: "Dismiss"
  - `post-kept`: "Post kept, signal marked reviewed", `post-rejected`: "Post rejected"
  - `signal-dismissed`: "Signal dismissed"
  - `no-signals`: "No reports in this category"
  - Signal reason labels: `reason-inappropriate`, `reason-spam`, `reason-offensive`, `reason-misleading`, `reason-other`
- Add under `admin`: `signals`: "Reported Posts" — navigation label for the admin page link.

### `messages/fr.json`

- Mirror all `admin.signals.*` keys in French.

---

### `src/query/signal.query.ts` _(NEW FILE)_

- Mark `"use server"` at top.
- Import `prisma` from `@/lib/prisma`, `SignalStatus` from `@prisma/client`, `getUserSessionId` and `getUserRole` from `@/src/query/user.query`.
- Export `getSignals(status?: SignalStatus)`: fetches `PostSignal` records ordered by `createdAt desc`; includes `post` (select `id`, `title`, `status`, first media url), `user` (select `id`, `name`, `image`). If `status` provided, filter by it; otherwise return all.
- Export `getPendingSignalCount()`: `prisma.postSignal.count({ where: { status: "PENDING" } })` — used for the admin badge.
- Consider: no auth check in queries (called from server components guarded by admin layout).

---

### `src/actions/signal.action.ts` _(NEW FILE)_

- Mark `"use server"` at top.
- Import `revalidatePath`, `getTranslations`, `prisma`, `getUserSessionId`, `getUserRole`.
- Export `reviewSignal(signalId: string)`: resolves userId, checks `role === "ADMIN"`, updates `PostSignal.status` to `"REVIEWED"`, calls `revalidatePath("/admin/signals")`. Returns `{ success: true }` or `{ error: string }`.
- Export `dismissSignal(signalId: string)`: same auth check, updates status to `"DISMISSED"`, revalidates.
- Export `rejectSignaledPost(postId: string, signalId: string)`: same auth check, updates `Post.status` to `"REJECTED"` and `PostSignal.status` to `"REVIEWED"` in a `prisma.$transaction`. Revalidates `/admin/signals` and `/post/${postId}`.
- Pattern: follow `src/actions/post.action.ts` auth guard pattern with `getUserSessionId()` first.

---

### `app/(home)/(private)/admin/signals/page.tsx` _(NEW FILE)_

- Server component, no `"use client"`.
- Import `getTranslations` from `next-intl/server`, `Layout`, `getSignals` from `src/query/signal.query`.
- Read `searchParams` for `status` param (defaults to `"PENDING"`).
- Fetch signals with the provided status.
- Render: title, status tab links (Pending / Reviewed / Dismissed as `<Link>` tabs styled like explore tabs), then `<SignalList signals={signals} />`.

---

### `app/(home)/(private)/admin/signals/_components/signal-list.tsx` _(NEW FILE)_

- `"use client"` component.
- Props: `signals` array (type matching `getSignals` return shape).
- Renders each signal as a card: post title (link to `/post/${postId}`), reporter name + avatar, signal reason (translated via `t("reason-{reason.toLowerCase()}")`), details if present, formatted date.
- For `status === "PENDING"` signals: show two buttons:
  - "Keep Post" → calls `reviewSignal(signal.id)` → toast success.
  - "Reject Post" → calls `rejectSignaledPost(signal.postId, signal.id)` → toast + card disappears.
- For non-pending: render status badge only, no action buttons.
- On action: use `useTransition` for pending state, disable buttons during transition.
- Pattern: follow `components/feature/notifications/notification-bell.tsx` for client-side action calling pattern.

---

### `app/(home)/(private)/admin/page.tsx`

- Import `getPendingSignalCount` from `src/query/signal.query`.
- Make the page async and `await getPendingSignalCount()`.
- Add a second link button alongside the Users button: `<Link href="/admin/signals">` with a `FlagIcon` icon and label from `t("signals")`.
- If `pendingCount > 0`: render a red badge `<span>` with the count overlaid on the button (pattern: copy from `notification-bell.tsx` relative positioning).
- Add `getTranslations("admin")` for the new label.

---

## Sprint 3 — Product Completion

### `app/(home)/(public)/contact/page.tsx` _(NEW FILE)_

- Static server component (no contact form — avoids Resend complexity; just an info page).
- Display: email `contact@nfe-foot.com` as a `mailto:` link, social media links if any exist, office hours note.
- Use `getTranslations("contact")` and add the namespace to both i18n files.
- Add `"contact"` namespace to `messages/en.json` and `messages/fr.json` with keys: `title`, `email-label`, `description`.

### `messages/en.json` + `messages/fr.json` (Sprint 3 additions)

- Add `contact` namespace for the contact page.
- Add under `explore`: `suggested-users` — "Suggested users" section heading shown when no search query is active.

---

### `src/query/user.query.ts`

- Add `getSuggestedUsers(currentUserId: string, limit = 5)`: fetches users who are:
  1. `isOnboarded: true`
  2. Not the current user (`id: { not: currentUserId }`)
  3. Not already followed by the current user (use a subquery: `followers: { none: { followerId: currentUserId } }`)
  - Order by `createdAt desc` (newest members first) — simple heuristic, not algorithmic.
  - Select: `id`, `name`, `image`, `userType`, `position`.
  - `take: limit`.
- Add `searchUsersWithFilters(query: string, filters: { userType?: string; position?: string; localisation?: string }, limit = 10)`:
  - Builds `where` clause conditionally: name contains `query`, plus optional `userType`, `position` (contains in array), `localisation` contains.
  - Replaces current `searchUsers` or called alongside it depending on whether filters are empty.

---

### `app/(home)/(public)/explore/explore-header.tsx`

- Add filter controls below the search input and above the tabs:
  - A row of `<Select>` dropdowns: User Type (All / Player / Coach / Recruiter / Club) and Position (All / Goalkeeper / Defender / Midfielder / Forward).
  - On change, append `userType` and `position` as URL params via `navigateTo`.
  - Only show filters when the `users` or `top` tab is active.

### `app/(home)/(public)/explore/page.tsx`

- Read additional `searchParams`: `userType` and `position`.
- Pass them to `searchUsers` (now using `searchUsersWithFilters`).
- When no query and no filters, call `getSuggestedUsers` and render as "Suggested users" section before the tabs.

---

### Feed integration: `app/(home)/(public)/page.tsx` (or the feed component)

- After determining the current user session, call `getSuggestedUsers(userId, 3)`.
- Pass the result to a `<UserSuggestions>` component rendered in a dismissable card below the first 3 posts in the feed (similar to how Instagram injects "Suggested for you" cards mid-feed).
- If unauthenticated, skip the suggestions entirely.
- Consider: wrap `<UserSuggestions>` in a `<Suspense>` with `null` fallback so it doesn't block the feed render.

---

## Testing Strategy

- **Manual verification — Sprint 1**:
  - Navigate to `/about-us`: click "Contact Us" → verify mailto opens, no 404.
  - Navigate to `/explore`: verify only 3 tabs (Top, Users, Posts) appear.
  - Navigate to `/post/my`: verify DRAFT/PENDING posts show colored status badge, PUBLISHED posts show no badge.
  - Navigate to `/user/{id}`: verify biography, localisation, position, foot, age appear when set.
  - Navigate to `/profile/edit-user`: verify localisation, position, foot fields are editable and saved.

- **Manual verification — Sprint 2**:
  - Signal a post as a regular user → verify it appears in `/admin/signals?status=PENDING`.
  - Click "Keep Post" → verify signal moves to REVIEWED.
  - Click "Reject Post" → verify post status becomes REJECTED + signal becomes REVIEWED.
  - Admin dashboard at `/admin` → verify signal button shows pending count badge.

- **Manual verification — Sprint 3**:
  - Navigate to `/contact` → verify no 404, shows email address.
  - Navigate to `/explore` with no query → verify suggested users section appears.
  - Use position/userType filters → verify results filter correctly.

## Rollout Considerations

- **No schema migration needed for Sprints 1 & 2** — all fields and models already exist in `prisma/schema.prisma`.
- **Sprint 3 filters** do not require schema changes — queries use existing fields.
- **Hashtag support** (if added later) will require a Prisma migration — not in this plan.
- **Breaking changes**: none. All changes are additive UI improvements or bug fixes.
- Ship Sprint 1 and Sprint 2 together in one PR (related scope). Ship Sprint 3 as a separate PR.
