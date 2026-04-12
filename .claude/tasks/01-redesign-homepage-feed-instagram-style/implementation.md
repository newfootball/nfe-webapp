# Implementation: Redesign Homepage Feed - Instagram-Style with Infinite Scroll

## Completed

- Added `PostsPage` type to `src/types/post.types.ts`
- Added `getPostsWithCursor` cursor-based pagination query to `src/query/post.query.ts` (existing `getPosts` preserved for backward compatibility)
- Simplified Zustand store: removed `pagination` state and `setPagination` action from `src/store/posts.store.ts`
- Rewrote `src/hooks/use-posts.ts` to use `useInfiniteQuery` with cursor-based pagination
- Updated `PostSkeleton` component to match Instagram-style card layout
- Added `PostSkeletonList` component for initial loading state
- Added `fadeInUp` keyframe animation and `.animate-fade-in-up` class to `app/globals.css`
- Redesigned `post-details.tsx`: replaced Card with semantic `<article>`, added fade-in animation, flat design with bottom border
- Redesigned `post-header.tsx`: compact layout with smaller avatar (h-10 w-10), username + timestamp inline with dot separator, removed "Suggestion" label and border separator
- Redesigned `post-content.tsx`: full-width media (no rounded corners, no padding), removed title display (moved to actions)
- Redesigned `post-actions.tsx`: Instagram-style icon row (Heart, MessageCircle, Share | Bookmark), likes count in bold below, title as caption, "View all X comments" link
- Updated `app/(home)/(public)/posts.tsx`: replaced manual scroll listener with `useInView` from `react-intersection-observer`, skeleton loading states, sentinel element
- Updated `app/(home)/(public)/page.tsx`: uses `getPostsWithCursor` for SSR hydration
- Added i18n keys: `no-more-posts`, `likes-count` in both `en.json` and `fr.json`
- Installed `react-intersection-observer` package

## Deviations from Plan

- Skipped Gemini Design MCP step (plan step 7) — implemented the Instagram-style design directly based on analysis findings, which was more efficient
- Post title moved from `post-content.tsx` to `post-actions.tsx` as a `title` prop (Instagram puts caption after likes count)
- Changed ThumbsUp icon to Heart and MessageSquare to MessageCircle for closer Instagram match
- Like count now uses `likes-count` i18n key with pluralization instead of raw number display

## Test Results

- Lint: Passed (no new warnings from changes)
- Build: Passed (TypeScript compilation clean)
- Prisma validate: Passed

## Follow-up Tasks

- Manual testing: verify infinite scroll loads new posts correctly
- Manual testing: verify like/unlike optimistic updates still work
- Manual testing: verify dark mode colors preserved
- Manual testing: test on mobile viewports
- Consider adding `@tanstack/react-virtual` for virtualization if feed exceeds 100+ posts
