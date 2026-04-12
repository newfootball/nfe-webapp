# Implementation Plan: Continue App Development

## Overview

Three-phase execution in priority order:

1. **Phase 1 — Bug Fixes** (P0): 3 real bugs blocking users right now
2. **Phase 2 — Feature Completion** (P1): Finish half-built features already in the DB schema
3. **Phase 3 — Engagement** (P1/P2): Notifications + Search — the two highest-impact missing features

> Note: Admin layout is **already protected** (`app/(home)/(private)/admin/layout.tsx:14-21` has `getUserRole` check + redirect). That analysis finding was a false alarm.
> 
> Note: `change-password.action.ts` appears to be dead code — the form uses `authClient.changePassword()` from better-auth instead. Bug still gets fixed but has no runtime impact on users.

---

## Phase 1: Bug Fixes

### `src/schemas/comment.schema.ts`
- Remove the `userId` field from `CommentSchema` entirely — it should never come from the client
- Keep `postId` and `content` fields only
- Update `CommentFormData` type accordingly (now inferred from the smaller schema)

### `src/actions/comment.action.ts`
- Add `getUserSessionId()` call as the first line of `saveComment`
- If `getUserSessionId()` returns null, return `{ success: false, error: [{ message: t("unauthorized") }] }`
- Build the data object for `prisma.comment.create` using the server-side userId, not from `validatedData`
- Add `"actions.comment.unauthorized"` key to translations usage (add key to en.json + fr.json)
- Remove `type CommentFormData` re-export if it was only used with the old schema shape

### `components/feature/post/post-form-comment.tsx`
- Remove `userId` from the `saveComment(...)` call argument object — only pass `{ postId, content: comment.trim() }`
- Remove `userId` from the `CommentSchema.parse({...})` call — only validate `{ postId, content: comment }`
- Remove the `if (!userId)` guard that returns early (the action now handles auth server-side)
- Keep the `useSession()` call only for showing the avatar image — not for auth logic

### `app/(home)/(private)/profile/change-password/change-password.action.ts`
- Delete line 32: `const hashCurrentPassword = await hashPassword(validatedData.currentPassword);`
- On line 34-36: replace first argument to `comparePassword` from `hashCurrentPassword` to `validatedData.currentPassword` (plaintext goes in, stored hash second)
- Replace `throw new Error(...)` pattern with returns of `{ success: false, error: "..." }` to match the rest of the codebase

### Create `app/(home)/(private)/onboarding/onboarding.action.ts`
- New server action file with `"use server"` directive
- Export `saveOnboarding(data: { userType: UserType; birthDate?: string; city?: string; position?: string; foot?: "LEFT" | "RIGHT" | "BOTH"; license?: string; clubName?: string; clubSize?: number; clubPosition?: string })`
- Auth guard: `getUserSessionId()` — if null, return `{ success: false, error: "Unauthorized" }`
- Map incoming data to Prisma User fields:
  - `userType` → `userType`
  - `birthDate` → `birthday: new Date(birthDate)`
  - `city` → `localisation`
  - `position` → `position: [position]` (Position enum array)
  - `foot` → `foot: [foot]` (Foot enum array, note: schema has `LEFT | RIGHT` only, not `BOTH`)
  - `license` → `license`
  - `clubName` → stored in `fullName` (closest field for club/coach name)
- Always set `isOnboarded: true`
- Call `prisma.user.update({ where: { id: userId }, data: {...} })`
- Call `revalidatePath("/feed")` and `revalidatePath("/profile")`
- Return `{ success: true }` or `{ success: false, error: string }`

### `app/(home)/(private)/onboarding/onboarding-steps.tsx`
- Import `saveOnboarding` from `./onboarding.action`
- Replace the `onFinalSubmit` function body: remove the `fetch("/api/onboarding", ...)` call
- Call `const result = await saveOnboarding({ userType, ...data })` instead
- Check `result.success` — on success `router.push("/feed")`, on error `toast.error(t("something-went-wrong"))`
- Remove the `response.ok` check and JSON pattern entirely

---

## Phase 2: Feature Completion

### `src/query/comment.query.ts`
- Update `CommentWithUser` type: add `userId: string` to the inline user select shape AND expose `id` of the comment's owning user (needed so UI can compare with `session.user.id`)
- In `getLastComments`, update the `include.user.select` to also include `id: true`
- This allows the `PostCommentsList` component to show a delete button only to the comment author

### `src/actions/comment.action.ts`
- Add new export `deleteComment(commentId: string)`
- Auth guard: `getUserSessionId()` — if null return `{ success: false, error: t("unauthorized") }`
- Fetch comment: `prisma.comment.findUnique({ where: { id: commentId }, select: { userId: true, postId: true } })`
- If `comment.userId !== currentUserId` return `{ success: false, error: t("unauthorized") }`
- `prisma.comment.delete({ where: { id: commentId } })`
- `revalidatePath(...)` for the post page
- Return `{ success: true }` or `{ success: false, error: string }`
- Add i18n keys: `"actions.comment.unauthorized"`, `"actions.comment.delete-comment-error"`

### `components/feature/post/post-comments-list.tsx`
- Accept optional `currentUserId?: string | null` prop
- For each comment in the list, show a `Trash2` icon button if `comment.user.id === currentUserId`
- On delete button click: call `deleteComment(comment.id)`, on success invalidate `commentKeys.list(postId)` and `commentKeys.count(postId)`
- Show loading state on the button while deleting (use local `useState<string | null>` for `deletingId`)
- Add i18n key usage: `t("delete-comment")` for aria-label
- Import `deleteComment` from `@/src/actions/comment.action`

### `app/(home)/(public)/post/[id]/post-card.tsx`
- Add `useSession()` to get current user id
- Pass `currentUserId={session?.user?.id}` to `<PostCommentsList>`

### `src/actions/post.action.ts`
- Add new export `updatePost(postId: string, data: { title: string; description: string })`
- Auth guard: `getUserSessionId()`
- Fetch post ownership: `prisma.post.findUnique({ where: { id: postId }, select: { userId: true } })`
- If `post.userId !== userId` return `{ error: t("unauthorized") }`
- `prisma.post.update({ where: { id: postId }, data: { title, description } })`
- `revalidatePath(`/post/${postId}`)` and `revalidatePath("/")`
- Return `{ success: true }` or `{ error: string }`
- Add i18n key: `"actions.post.update-post-error"`, `"actions.post.post-updated-successfully"`

### Create `app/(home)/(private)/post/[id]/edit/post-edit-form.tsx`
- Client component (`"use client"`)
- Accept `post: { id: string; title: string; description: string }` prop
- Use `useForm` with `zodResolver` for a schema with `title: z.string().min(1)` and `description: z.string().min(1)`
- Two fields: title input, description textarea
- On submit: call `updatePost(post.id, data)`. On success: `toast.success(t("post-updated-successfully"))` + `router.push(`/post/${post.id}`)`
- Follow the exact pattern from `app/(home)/(private)/profile/edit-user/user-form.tsx`

### `app/(home)/(private)/post/[id]/edit/page.tsx`
- Import `PostEditForm` from `./post-edit-form`
- Replace the stub `<h1>Edit Post</h1>` with `<PostEditForm post={post} />`
- Add a back link to `/post/${id}`

### `src/query/favorite.query.ts`
- Add `getFavoritesByUser(userId: string)` that returns posts with medias and user
- Use `prisma.favorite.findMany({ where: { userId }, include: { post: { include: { medias: true, user: { select: { id, name, image } } } } }, orderBy: { createdAt: 'desc' } })`
- Return `PostWithUserAndMedias[]` (extract from the Favorite.post relation)

### Create `app/(home)/(private)/profile/favorites/page.tsx`
- Async server component
- Get session with `getSession()`, redirect to `/sign-in` if none
- Call `getFavoritesByUser(userId)`
- Render a `<PageHeader title={t("favorites")} />` + a grid of `<PostDetails>` components (same component used in the feed)
- Import `Layout` from `@/components/layouts/layout`
- Add i18n keys: `"profile.favorites.title"`, `"profile.favorites.empty"`

### `components/feature/user/user-profile.tsx`
- Add a "Saved posts" / bookmarks button under the profile actions (only for `isCurrentUser`)
- Render as `<Link href="/profile/favorites">` with a `Bookmark` icon — follow the style of the existing Edit Profile button
- Add i18n key: `"feature.user.profile.saved-posts"`

### `src/query/follow.query.ts`
- Add `getFollowers(userId: string)` — returns `{ id, name, image, userType }[]` of users who follow `userId`
  - `prisma.follow.findMany({ where: { followingId: userId }, include: { follower: { select: { id, name, image, userType } } } })`
  - Map to extract `.follower` from each result
- Add `getFollowing(userId: string)` — returns `{ id, name, image, userType }[]` of users that `userId` follows
  - `prisma.follow.findMany({ where: { followerId: userId }, include: { followed: { select: { id, name, image, userType } } } })`
  - Map to extract `.followed`

### Create `components/feature/user/follow-list-dialog.tsx`
- Client component
- Accept `userId: string`, `type: "followers" | "following"`, `count: number`
- Renders a clickable trigger element (the count + label text from StatsUser)
- Uses `Dialog` from `@/components/ui/dialog` (already installed)
- On open: fetches the list with `useQuery({ queryKey: ["followers"|"following", userId], queryFn: ... })`
- Renders a list of users: avatar + name + `<FollowButton userId={u.id} />` for each
- Show skeleton while loading
- Follow the `FollowButton` import from `@/components/feature/follow/follow-button`

### `components/feature/user/stats-user.tsx`
- Replace the plain `<div>` for followers and following with `<FollowListDialog>` components
- Pass `userId`, `type`, and `count` props
- Posts count stays as a plain non-clickable div (no list page needed yet)

---

## Phase 3: Engagement Features

### `prisma/schema.prisma`
- No changes needed — `Notification` model already has `userId`, `content`, `link?`, `readAt?`
- Notification content will be stored as a pre-formatted string (e.g., "John liked your post") for MVP

### Create `src/query/notification.query.ts`
- `"use server"` directive
- `getNotifications(userId: string)` — `prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 })`
- `getUnreadNotificationCount(userId: string)` — `prisma.notification.count({ where: { userId, readAt: null } })`
- Return typed results

### Create `src/actions/notification.action.ts`
- `"use server"` directive
- `createNotification(userId: string, content: string, link?: string)` — internal helper (not exported as user-callable action); called from other actions. Creates a `prisma.notification.create(...)`. Does NOT call `getUserSessionId()` since it's called internally by other server actions passing an explicit userId.
- Export `markNotificationRead(notifId: string)` — auth guard, verify `notification.userId === currentUserId`, set `readAt: new Date()`
- Export `markAllNotificationsRead()` — auth guard, `prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })`

### `src/actions/like.action.ts`
- After creating a like (in the `else` branch where like is created), check if `userId !== post.userId`
- Fetch the liker's name: `prisma.user.findUnique({ where: { id: userId }, select: { name: true } })`
- Fetch the post's owner id: `prisma.post.findUnique({ where: { id: postId }, select: { userId: true } })`
- Call `createNotification(post.userId, `${liker.name} liked your post`, `/post/${postId}`)` 
- This is a fire-and-forget (don't await, or await without blocking the response)
- Import `createNotification` from `@/src/actions/notification.action`

### `src/actions/comment.action.ts`
- After successful comment creation in `saveComment`, fetch the post's `userId`
- Fetch commenter name from session (already available via `getUserSessionId` + user query, or store name in a variable)
- If `comment.userId !== post.userId`, call `createNotification(post.userId, `${commenterName} commented on your post`, `/post/${postId}`)`
- Import `createNotification`

### `components/feature/follow/follow.action.ts`
- In `addFollow`, after creating the follow record, call `createNotification(followingId, `${followerName} started following you`, `/user/${followerId}`)`
- Fetch the follower's name from `prisma.user.findUnique({ where: { id: followerId }, select: { name: true } })`
- Import `createNotification`

### Create `components/feature/notifications/notification-bell.tsx`
- Client component (`"use client"`)
- Accept `userId: string` prop
- Use `useQuery` with `queryKey: ["notifications-count", userId]` and `queryFn: () => getUnreadNotificationCount(userId)` with `refetchInterval: 30000` (poll every 30s)
- Render a `Bell` icon (from lucide-react) wrapped in a `Link href="/notifications"`
- If unread count > 0, show a red badge `<span>` positioned absolutely over the bell with the count (or `9+` if >= 10)
- Follow the same button style as `LanguageSwitcher`

### `app/(home)/header.tsx`
- Import `NotificationBell` from `@/components/feature/notifications/notification-bell`
- In the `HeaderDropdown` component (or directly in `Header`), add `<NotificationBell userId={userId} />` in the `<div className="flex items-center gap-2 mr-4">` — place it between `<LanguageSwitcher />` and the avatar dropdown

### Create `app/(home)/(public)/notifications/page.tsx`
- Async server component
- Get session — redirect to `/sign-in` if none
- Call `getNotifications(userId)` and `markAllNotificationsRead()` (so visiting the page clears the badge)
- Render `<Layout>` with a list of notifications
- Each notification: icon (bell), content text, time ago, link to related content
- Use `Link` for the `notification.link` field
- Show "No notifications" empty state
- Add `<PageHeader title={t("notifications")} />`

### `app/(home)/(public)/explore/explore-header.tsx`
- Convert to client component (`"use client"`)
- Add `searchQuery: string` and `setSearchQuery` state
- Add `activeTab: string` and `setActiveTab` state  
- Wire `<Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />`
- On tab change: update `activeTab` state
- Move the `<Tabs>` to control the selected value via `value={activeTab} onValueChange={setActiveTab}`
- Accept a `onSearch: (query: string, tab: string) => void` callback prop to lift state up, OR use URL search params (`useSearchParams` + `useRouter`) so search results are shareable
- Recommend URL params approach: on input change, call `router.replace(`/explore?q=${query}&tab=${tab}`)` with `useTransition` + `startTransition` for non-blocking navigation

### `app/(home)/(public)/explore/page.tsx`
- Convert to client component or keep as server component reading `searchParams`
- If server component: accept `searchParams: Promise<{ q?: string; tab?: string }>` and pass `q` and `tab` to `ExploreHeader` and results
- Call `searchUsers(q)` and `searchPosts(q)` based on active tab (or for "Top": both)
- Render results under `ExploreHeader` based on active tab
- "Users" tab: list of `<UserResultItem>` components
- "Posts" tab: list of `<PostDetails>` components (already exists)
- "Top" tab: mix of both (3 users + unlimited posts)
- Show "Search for players, coaches, clubs..." empty state when no query
- Show "No results for {query}" when empty results

### `src/query/user.query.ts`
- Add `searchUsers(query: string, limit = 10)` export
- `prisma.user.findMany({ where: { isOnboarded: true, OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] }, select: { id, name, image, userType }, take: limit })`
- Return `{ id: string; name: string | null; image: string | null; userType: UserType }[]`

### `src/query/post.query.ts`
- Add `searchPosts(query: string, limit = 10)` export
- `prisma.post.findMany({ where: { status: 'PUBLISHED', OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] }, include: { medias: true, user: { select: { id, name, image } }, _count: { select: { likes: true, comments: true } } }, take: limit, orderBy: { publishedAt: 'desc' } })`

### Create `components/feature/search/user-result-item.tsx`
- Client component
- Accept `user: { id: string; name: string | null; image: string | null; userType: UserType }`
- Render: `Avatar` + name + userType badge + `<FollowButton userId={user.id} showText={false} />`
- Link the entire row to `/user/${user.id}`
- Follow the style from `components/feature/user/user-suggestions.tsx` if it exists

---

## i18n Changes (apply to BOTH `messages/en.json` AND `messages/fr.json`)

All new keys grouped by file section to add them to:

```
actions.comment:
  unauthorized: "Unauthorized"
  delete-comment-error: "Failed to delete comment"

posts.post-comments-list:
  delete-comment: "Delete comment"

actions.post:
  update-post-error: "Failed to update post"
  post-updated-successfully: "Post updated successfully"

posts.edit:
  title: "Edit Post"
  save: "Save changes"
  saving: "Saving..."
  back: "Back to post"

profile.favorites:
  title: "Saved posts"
  empty: "No saved posts yet"

feature.user.profile:
  saved-posts: "Saved posts"

feature.user.stats:
  followers-list: "Followers"
  following-list: "Following"

notifications:
  title: "Notifications"
  empty: "No notifications yet"
  mark-all-read: "Mark all as read"
  liked-your-post: "{name} liked your post"
  commented-on-post: "{name} commented on your post"
  started-following: "{name} started following you"

explore:
  title: "Explore"
  placeholder: "Search players, clubs..."
  no-results: "No results for \"{query}\""
  empty-state: "Search for players, coaches, clubs..."
  tabs:
    top: "Top"
    users: "Users"
    posts: "Posts"
    hashtags: "Hashtags"
    events: "Events"
```

French equivalents in `messages/fr.json`:
```
actions.comment.unauthorized: "Non autorisé"
actions.comment.delete-comment-error: "Impossible de supprimer le commentaire"
posts.post-comments-list.delete-comment: "Supprimer le commentaire"
actions.post.update-post-error: "Impossible de mettre à jour la publication"
actions.post.post-updated-successfully: "Publication mise à jour"
posts.edit.title: "Modifier la publication"
posts.edit.save: "Enregistrer"
posts.edit.saving: "Enregistrement..."
posts.edit.back: "Retour à la publication"
profile.favorites.title: "Publications sauvegardées"
profile.favorites.empty: "Aucune publication sauvegardée"
feature.user.profile.saved-posts: "Publications sauvegardées"
notifications.title: "Notifications"
notifications.empty: "Aucune notification"
notifications.mark-all-read: "Tout marquer comme lu"
notifications.liked-your-post: "{name} a aimé votre publication"
notifications.commented-on-post: "{name} a commenté votre publication"
notifications.started-following: "{name} a commencé à vous suivre"
explore.title: "Explorer"
explore.placeholder: "Rechercher des joueurs, clubs..."
explore.no-results: "Aucun résultat pour « {query} »"
explore.empty-state: "Recherchez des joueurs, entraîneurs, clubs..."
```

---

## Dependency Order

Execute in this strict order to avoid broken imports:

1. `comment.schema.ts` → `comment.action.ts` → `post-form-comment.tsx`
2. `change-password.action.ts` (independent)
3. `onboarding.action.ts` → `onboarding-steps.tsx`
4. `comment.query.ts` → `comment.action.ts` (deleteComment) → `post-comments-list.tsx` → `post-card.tsx`
5. `post.action.ts` (updatePost) → `post-edit-form.tsx` → `edit/page.tsx`
6. `favorite.query.ts` → `favorites/page.tsx` → `user-profile.tsx`
7. `follow.query.ts` → `follow-list-dialog.tsx` → `stats-user.tsx`
8. `notification.action.ts` → (hook into like.action + comment.action + follow.action) → `notification.query.ts` → `notification-bell.tsx` → `header.tsx` → `notifications/page.tsx`
9. `user.query.ts` (searchUsers) + `post.query.ts` (searchPosts) → `explore-header.tsx` + `explore/page.tsx` + `user-result-item.tsx`

---

## Testing Strategy

Manual verification steps per feature:

- **Comment security fix**: Open DevTools Network, POST to saveComment with a different userId in payload — verify the stored comment has the session userId, not the spoofed one
- **Change password**: Log in with credentials, go to change password, verify it now succeeds (previously always failed)
- **Onboarding**: Create a new test account, complete onboarding — verify `isOnboarded: true` and `userType` set in DB via Prisma Studio
- **Comment delete**: Post a comment, verify delete button appears for own comments but not others'
- **Post edit**: Edit a post title, verify updated on post detail page
- **Favorites page**: Bookmark several posts, visit `/profile/favorites` — verify they appear
- **Followers list**: Follow a user, visit their profile, click "X followers" — verify dialog shows follower
- **Notifications**: Like a post you don't own — verify the post owner gets a notification. Check bell badge appears. Visit `/notifications` — verify badge clears.
- **Search**: Visit `/explore`, type "player" — verify user and post results appear

---

## Rollout Considerations

- **No schema migrations needed** — `Notification` model, `Follow` model, all fields already exist in Prisma schema
- **No breaking changes** — all changes are additive (new exports, new pages, new components)
- **The `CommentFormData` type change** is the only breaking interface change — `post-form-comment.tsx` must be updated in the same commit as `comment.schema.ts` to avoid TypeScript errors
