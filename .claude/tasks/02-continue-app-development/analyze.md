# Task: Continue App Development — NFE Feature Roadmap

## Codebase Context

### Feature Status Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Home feed (infinite scroll) | ✅ COMPLETE | Instagram-style, cursor pagination |
| Post create/publish/delete | ✅ COMPLETE | Draft→Published flow |
| Post edit | ❌ MISSING | Page exists (`/post/[id]/edit`), no server action |
| Post detail page | ✅ COMPLETE | Video, likes, comments, bookmark, share |
| Likes toggle | ✅ COMPLETE | Toggle with count, Zustand sync |
| Favorites/Bookmarks | 🟡 PARTIAL | Toggle works, no "My Favorites" page |
| Comments create | ⚠️ BUG | Works but userId from client input (#15) |
| Comments delete/edit | ❌ MISSING | No action, no UI |
| Follow/Unfollow | ✅ COMPLETE | Toggle, works on profile page |
| Followers/Following lists | ❌ MISSING | StatsUser shows counts, no list pages |
| Messages (send/receive) | 🟡 PARTIAL | Functional but NOT real-time |
| Messages (real-time) | ❌ MISSING | No WebSocket/polling/SSE |
| Notifications | ❌ STUB | Schema only, zero logic or UI |
| Search/Explore | ❌ STUB | UI only, no query wired up |
| Onboarding flow | ⚠️ CRITICAL BUG | `/api/onboarding` endpoint DOES NOT EXIST — data never saved |
| User type profiles | 🟡 PARTIAL | Types selected in onboarding but profile not customized per type |
| Change password | ⚠️ BUG | Always fails — double-hash comparison (#16) |
| Admin dashboard | ⚠️ UNSECURED | No auth check — anyone can access `/admin` |
| Post signals/reports | 🟡 PARTIAL | Action+form exist, no admin UI to review |

---

## Critical Bugs (Fix First)

### Bug #15 — Comment userId from client input
- **File:** `src/actions/comment.action.ts:11`
- **Schema:** `src/schemas/comment.schema.ts` — `userId` field is client-supplied
- **Risk:** Any authenticated user can post comments as any other user
- **Fix:** Remove `userId` from `CommentSchema`, get it from `getUserSessionId()` in action

### Bug #16 — Double-hash in change-password
- **File:** `app/(home)/(private)/profile/change-password/change-password.action.ts:32`
- **Bug:** `hashPassword(currentPassword)` then `comparePassword(hash, storedHash)` — always false
- **Fix:** Pass plaintext directly: `comparePassword(validatedData.currentPassword, user.password)`

### Critical Bug — Onboarding API missing
- **File:** `app/(home)/(private)/onboarding/onboarding-steps.tsx` — submits to `/api/onboarding`
- **Problem:** Route `/api/onboarding` doesn't exist → form silently fails → user type/data never saved
- **Impact:** All onboarding data (player position, coach info, club details) is lost

### Security Bug — Admin unprotected
- **File:** `app/(home)/(private)/admin/page.tsx` — no role check
- **Risk:** Any authenticated user can access `/admin`
- **Fix:** Check `session.user.role === "ADMIN"` and redirect otherwise

---

## Key Files

### Actions
- `src/actions/comment.action.ts` — saveComment (⚠️ Bug #15)
- `src/actions/like.action.ts` — toggleLike (complete)
- `src/actions/favorite.action.ts` — toggleFavorite (complete)
- `src/actions/post.action.ts` — publishPost, deletePost, signalPost
- `src/actions/user.action.ts` — deleteUserAccount
- `app/(home)/(private)/messages/[user_id]/actions.ts` — sendMessage
- `app/(home)/(private)/profile/change-password/change-password.action.ts` — (⚠️ Bug #16)

### Queries
- `src/query/post.query.ts` — cursor-based feed, single post
- `src/query/comment.query.ts` — getCommentsByPost (count + last 5)
- `src/query/like.query.ts` — isLiked check
- `src/query/follow.query.ts` — follower/following counts, isFollowing
- `src/query/favorite.query.ts` — isFavorited check
- `src/query/message.query.ts` — full conversation system
- `src/query/user.query.ts` — getUserSessionId, role check

### UI — Explore (stub)
- `app/(home)/(public)/explore/page.tsx` — empty page
- `app/(home)/(public)/explore/explore-header.tsx` — search bar + tabs (Top/Users/Hashtags/Posts/Events), not wired

### UI — Notifications (missing)
- `prisma/schema.prisma` — `Notification` model exists with `userId`, `type`, `postId`, `read` fields

### Onboarding
- `app/(home)/(private)/onboarding/onboarding-steps.tsx` — multi-step form (492 lines)
- Posts to `/api/onboarding` which doesn't exist

---

## Patterns to Follow

- **Server actions:** `"use server"`, auth guard first (`getUserSessionId()`), return `{ success }` or `{ error }`
- **i18n:** Server `getTranslations(ns)`, Client `useTranslations(ns)`, add keys to both `messages/en.json` and `messages/fr.json`
- **Queries:** `"use server"`, use `prisma` singleton from `@/lib/prisma`
- **TanStack Query:** v5 patterns — `useQuery({ queryKey: [...], queryFn: () => ... })`
- **Biome:** tab indentation, double quotes, `import type` for type-only imports
- **Auth guard:** always `getUserSessionId()` before any DB mutation, never trust client-provided userId

---

## Prioritized Development Backlog

### P0 — Blockers (fix before anything else)
1. **Fix Bug #15** — comment.action.ts userId from client
2. **Fix Bug #16** — change-password double-hash
3. **Fix Onboarding API** — create `/api/onboarding` or convert to server action
4. **Fix Admin auth** — protect `/admin` with role check

### P1 — High Impact
5. **Notifications system** — create on like/comment/follow events, show in UI (bell icon)
6. **Search/Explore** — wire up user and post search queries to the existing UI stub
7. **Favorites page** — "My bookmarks" view (data already saved, just needs a page)
8. **Comment delete** — add `deleteComment` action + UI button

### P2 — Medium Impact
9. **Followers/Following list pages** — modal or page showing who follows/is followed
10. **Post edit** — add `updatePost` server action, wire to existing edit page
11. **Real-time messages** — polling (setInterval) as quick win before WebSocket
12. **User type-based profile** — show player position/foot, coach specialty, etc.

### P3 — Nice to Have
13. **Admin moderation** — view/manage post signals, user suspension
14. **Hashtag system** — tag posts, filter feed by tag
15. **Analytics for players** — profile view count, video plays

---

## Dependencies

- **`better-auth`** — session handling via `getUserSessionId()` (`src/lib/auth-server.ts`)
- **Prisma schema:** `Notification` model ready, `PostSignal` model ready, `UserType` enum with PLAYER/COACH/RECRUITER/CLUB/USER
- **Zustand store:** `src/store/posts.store.ts` — used for feed state
- **TanStack Query:** v5, `src/providers/react-query-provider.tsx`
- **next-intl:** `messages/en.json` + `messages/fr.json` — both must be updated for any new UI strings
