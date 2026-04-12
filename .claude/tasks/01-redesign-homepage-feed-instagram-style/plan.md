# Implementation Plan: Redesign Homepage Feed - Instagram-Style with Infinite Scroll

## Overview

Redesign the homepage post feed with an Instagram-inspired UX: smooth infinite scroll using cursor-based pagination, skeleton loading states, fade-in animations, and improved post card design. Keep the existing yellow/stone color palette.

**Strategy**: Add new cursor-based query function (keep existing `getPosts` for backward compat since `my-last-post.tsx` and `post/my/page.tsx` depend on it), migrate `usePosts` to `useInfiniteQuery`, simplify Zustand store, redesign UI using Gemini Design MCP.

## Dependencies

- Install `react-intersection-observer` (`bun add react-intersection-observer`)
- Existing: `@tanstack/react-query`, `zustand`, `shadcn/ui` (Skeleton component already available)

## File Changes

### 1. `src/query/post.query.ts`

- Add new exported function `getPostsWithCursor` alongside existing `getPosts` (do NOT modify `getPosts` - it's used by `my-last-post.tsx:12`, `post/my/page.tsx:17`)
- New function signature: `getPostsWithCursor({ userId?, cursor?, limit? })` returns `{ posts: PostWithUserAndMedias[], nextCursor: string | null }`
- Use Prisma cursor-based pagination: `take: limit + 1` then slice to detect `hasMore`
- When `cursor` provided: `skip: 1, cursor: { id: cursor }`
- Keep same `include` (user, medias, _count) and `orderBy: { createdAt: "desc" }`
- Add `where: { status: "PUBLISHED" }` filter (currently missing from `getPosts` - only show published posts in feed)

### 2. `src/types/post.types.ts`

- Add new type `PostsPage` for the cursor pagination response: `{ posts: PostWithUserAndMedias[], nextCursor: string | null }`

### 3. `src/hooks/use-posts.ts`

- Replace `useQuery` with `useInfiniteQuery` from `@tanstack/react-query`
- Import and call `getPostsWithCursor` instead of `getPosts`
- Configure: `initialPageParam: null`, `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined`
- Return flattened posts from `data.pages.flatMap(page => page.posts)`
- Return `{ posts, isLoading, isFetchingNextPage, error, hasNextPage, fetchNextPage, refetch }`
- Remove all Zustand pagination state dependencies (`setPagination`, `pagination.page`)
- Remove `loadMore` callback (replaced by `fetchNextPage`)
- Keep syncing to Zustand for optimistic updates: when `data` changes, call `setPosts` with flattened array
- Keep `useUserPosts` export for backward compat

### 4. `src/store/posts.store.ts`

- Remove `pagination` from `PostsState` interface (no longer needed - TanStack Query handles this)
- Remove `setPagination` from `PostsActions`
- Remove `pagination` from `initialState`
- Remove `setPagination` action implementation
- Keep everything else: `posts`, `isLoading`, `error`, `filters`, `setPosts`, `addPosts`, `addPost`, `updatePost`, `removePost`, `likePost`, `unlikePost`, `setLoading`, `setError`, `setFilters`, `reset`
- Update `setFilters` to not reference `pagination`
- Keep `usePostsActions` and `usePostsSelectors` exports (used by `post-actions.tsx:19`, `post-create-form.tsx:9`, `use-post-actions.ts:6`)
- Remove `pagination` from `usePostsSelectors` return

### 5. `components/feature/post/post-skeleton.tsx` (NEW FILE)

- Create skeleton component matching the post card layout shape
- Use existing `Skeleton` from `components/ui/skeleton.tsx`
- Structure: avatar circle + username line + timestamp line + full-width media rectangle + action buttons row
- Export `PostSkeleton` component and `PostSkeletonList` (renders 3 skeletons)

### 6. `app/globals.css`

- Add `@keyframes fadeInUp` animation: from `opacity: 0; transform: translateY(8px)` to `opacity: 1; transform: translateY(0)`
- Add `.animate-fade-in-up` class with `animation: fadeInUp 0.3s ease-out forwards`

### 7. Use Gemini Design MCP (`mcp__gemini-design-mcp__modify_frontend`)

- Before modifying post card components, use Gemini Design MCP to generate an improved Instagram-style post card design
- Provide current component code and color palette as context
- Request: Instagram-like card with subtle borders, proper spacing, full-width media, compact header, icon-based actions
- Keep yellow primary, stone base colors
- Apply the generated design to the components below

### 8. `components/feature/post/post-details.tsx`

- Replace current `Card` with flat design: remove `border-x-0 border-t-0 rounded-none`
- Use `border-b border-border` for Instagram-style card separation (thin bottom border only)
- Add `data-post` attribute for identification
- Wrap in `div` with `animate-fade-in-up` class
- Add `pb-2` padding for visual breathing room between posts

### 9. `components/feature/post/post-header.tsx`

- Make header more compact and Instagram-like
- Reduce avatar size from `h-14 w-14` to `h-10 w-10`
- Move "suggestion" label and menu to same row as avatar/username
- Put username and timestamp on a single row: `username · timestamp`
- Remove location from header (or make it subtle)
- Align dropdown menu (three dots) to the right of the header row
- Remove the `border-b mx-4` separator above the header

### 10. `components/feature/post/post-content.tsx`

- Remove outer padding, make media full-width within card (no `rounded-lg` on media container)
- Keep `aspect-video` ratio for consistency
- Move post title below actions section (Instagram puts caption after likes)
- Add `object-cover` on images for consistent sizing

### 11. `components/feature/post/post-actions.tsx`

- Rearrange action layout to Instagram pattern:
  - Row 1: Like (left), Comment (left), Share (left) | Bookmark (right-aligned)
  - Row 2: Like count in bold (e.g., "42 likes")
  - Row 3: Post title/caption
  - Row 4: "View all X comments" link
- Replace `ThumbsUp` icon with `Heart` from lucide-react (Instagram uses hearts)
- Remove text labels on mobile (keep icons only), show on larger screens
- Make like button fill red when liked (`text-red-500 fill-red-500`)
- Remove the `border-b` separator between counts and buttons

### 12. `app/(home)/(public)/posts.tsx`

- Remove manual `window.addEventListener("scroll")` logic entirely
- Import `useInView` from `react-intersection-observer`
- Update `usePosts` destructuring: `{ posts, isLoading, isFetchingNextPage, error, hasNextPage, fetchNextPage }`
- Remove `usePostsActions`/`setPosts`/`useEffect` for initial posts sync (handled in hook)
- Add sentinel `div` at bottom with `ref` from `useInView`
- `useEffect` on `inView`: when `inView && hasNextPage && !isFetchingNextPage`, call `fetchNextPage()`
- Show `PostSkeletonList` when `isLoading` (initial load)
- Show single `PostSkeleton` when `isFetchingNextPage` (loading more)
- Show "no more posts" text when `!hasNextPage && posts.length > 0`
- Wrap each post in a div (for fade-in animation)
- Accept `initialData` prop and pass to `usePosts` for SSR hydration

### 13. `app/(home)/(public)/page.tsx`

- Update `getPosts` call to use `getPostsWithCursor` for initial data
- Pass initial data to `Posts` component for SSR hydration with `useInfiniteQuery`'s `initialData` option

## Testing Strategy

- Manual: Run `make dev` and verify infinite scroll loads new posts
- Manual: Verify skeleton loading appears during initial load and subsequent fetches
- Manual: Verify fade-in animation on new posts
- Manual: Verify like/unlike still works (optimistic updates)
- Manual: Verify creating a new post still adds it to the feed
- Manual: Verify dark mode colors are preserved
- Manual: Test on mobile viewport sizes
- Run `make check` (lint + build) to ensure no type/lint errors

## Rollout Considerations

- No breaking changes to `getPosts` function (used by other pages)
- Zustand store simplification removes `pagination` state - verify no other components depend on it
- `useUserPosts` still works via `usePosts` with userId param
- i18n keys: may need to add new keys for "no more posts" text in `messages/fr.json` and `messages/en.json`
