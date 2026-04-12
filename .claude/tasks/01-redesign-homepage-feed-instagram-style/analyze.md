# Task: Redesign Homepage Feed - Instagram-Style with Infinite Scroll

## Objective

Redesign the homepage post feed to be more visually appealing and fluid, inspired by Instagram's social media UX. Implement smooth infinite scroll with proper loading states. Keep the existing color palette (yellow primary, stone base).

---

## Codebase Context

### Current Architecture

The feed system follows a clear pattern:
1. **Server Component** fetches initial posts → passes to client
2. **Client Component** renders posts with infinite scroll
3. **TanStack Query** manages server state, **Zustand** manages client state
4. **Server Actions** handle mutations

### Key Files to Modify

| File | Purpose | Lines |
|------|---------|-------|
| `app/(home)/(public)/page.tsx` | Homepage server component - fetches initial posts | ~10 lines |
| `app/(home)/(public)/posts.tsx` | Feed client component with infinite scroll | ~60 lines |
| `components/feature/post/post-details.tsx` | Post card container | ~20 lines |
| `components/feature/post/post-header.tsx` | User info + menu | ~100 lines |
| `components/feature/post/post-content.tsx` | Media + title display | ~80 lines |
| `components/feature/post/post-actions.tsx` | Like, comment, share, save | ~150 lines |
| `src/hooks/use-posts.ts` | Custom hook combining TanStack Query + Zustand | ~60 lines |
| `src/query/post.query.ts` | Database queries with offset pagination | ~30 lines |
| `src/store/posts.store.ts` | Zustand store for posts state | ~80 lines |

### Current Issues

1. **Basic scroll detection**: Uses `window.addEventListener("scroll")` with manual `getBoundingClientRect()` - not optimal
2. **Text-only loading indicator**: Just shows "Chargement..." text - no skeleton loading
3. **Flat card design**: Cards use `border-b border-x-0 border-t-0 rounded-none` - no visual separation
4. **No animations**: Posts appear instantly without fade-in transitions
5. **Offset-based pagination**: Uses `skip/take` which can miss posts or show duplicates when new posts are added

### Current Color Theme

```css
/* Light Mode */
--background: hsl(0 0% 100%);        /* White */
--foreground: hsl(20 14.3% 4.1%);    /* Dark brown */
--primary: hsl(47.9 95.8% 53.1%);    /* Bright yellow */
--primary-foreground: hsl(26 83.3% 14.1%); /* Dark brown on yellow */
--border: hsl(20 5.9% 90%);          /* Light gray */
--muted-foreground: hsl(25 5.3% 44.7%); /* Gray text */

/* Dark Mode */
--background: hsl(20 14.3% 4.1%);    /* Dark brown */
--foreground: hsl(60 9.1% 97.8%);    /* Off-white */
--primary: hsl(47.9 95.8% 53.1%);    /* Same yellow */
```

### Current Layout

```
app/(home)/layout.tsx:
  Header (top nav)
  main.pb-28.md:max-w-2xl.max-w-md.mx-auto.mt-4.px-2
    {children}  ← Feed renders here
  Footer (bottom nav with Home, Explore, Create, Messages, Profile)
```

---

## Documentation Insights

### TanStack Query useInfiniteQuery (Recommended Upgrade)

Current implementation uses `useQuery` with manual page tracking in Zustand. Should migrate to `useInfiniteQuery` which handles pagination natively:

```typescript
const {
  data,           // { pages: Page[], pageParams: unknown[] }
  fetchNextPage,  // Function to load next page
  hasNextPage,    // Boolean - more data available
  isFetchingNextPage, // Loading state for next page specifically
} = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: ({ pageParam }) => fetchPosts(pageParam),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
```

### Cursor-Based Pagination (Recommended Upgrade)

Replace offset-based (`skip/take`) with cursor-based pagination:

```typescript
const posts = await prisma.post.findMany({
  take: LIMIT + 1,  // +1 to check if more exist
  ...(cursor && { skip: 1, cursor: { id: cursor } }),
  orderBy: { createdAt: 'desc' },
})
```

Benefits: No missed/duplicate posts when new content is added.

### Intersection Observer (Recommended Upgrade)

Replace manual scroll listener with `react-intersection-observer`:

```typescript
const { ref, inView } = useInView({ threshold: 0.5 })
useEffect(() => {
  if (inView && hasNextPage) fetchNextPage()
}, [inView, hasNextPage])
```

---

## Research Findings

### Instagram Feed UX Patterns

1. **Single column layout** - max-width container, centered
2. **Card separation** - subtle borders or gaps between posts
3. **Full-width media** - images/videos span the full card width
4. **Compact header** - avatar (small), username, timestamp, menu
5. **Action bar** - heart, comment, share, bookmark icons in a row
6. **Like count + caption** below actions
7. **Comment preview** - "View all X comments" link + 1-2 recent comments
8. **Skeleton loading** - content-shaped placeholders while loading
9. **Smooth fade-in** - posts animate in subtly
10. **Pull-to-refresh** on mobile (optional)

### Design Improvements Needed

- Add proper card spacing/gaps instead of just border-bottom
- Add skeleton loading components matching post card shape
- Add fade-in animation for new posts
- Improve media display (aspect ratio consistency)
- Better visual hierarchy for post actions
- Smooth scroll behavior

---

## Dependencies

### Already Installed
- `@tanstack/react-query` - Server state management
- `zustand` - Client state management
- `shadcn/ui` components (Card, Button, Avatar, Skeleton, etc.)
- `lucide-react` - Icons
- `next-intl` - Internationalization

### Need to Install
- `react-intersection-observer` - For proper infinite scroll detection (`bun add react-intersection-observer`)

### Optional (For Later)
- `@tanstack/react-virtual` - Virtualization for 1000+ posts
- `framer-motion` - Advanced animations (but Tailwind CSS animations may suffice)

---

## Patterns to Follow

1. **File naming**: kebab-case (`post-skeleton.tsx`)
2. **Component naming**: PascalCase (`PostSkeleton`)
3. **Hooks**: `use` prefix in `/src/hooks/`
4. **Queries**: `*.query.ts` in `/src/query/`
5. **Store**: Separate `usePostsActions()` and `usePostsSelectors()`
6. **i18n**: Use `useTranslations("posts")` for all user-facing text
7. **Styling**: Tailwind v4 + shadcn/ui, stone color palette
8. **No comments**: Clean code without unnecessary comments (per CLAUDE.md)

---

## Implementation Plan Summary

### Phase 1: Backend - Cursor-Based Pagination
- Update `getPosts` query to support cursor-based pagination
- Return `{ posts, nextCursor }` format

### Phase 2: Frontend - useInfiniteQuery Migration
- Install `react-intersection-observer`
- Rewrite `usePosts` hook to use `useInfiniteQuery`
- Simplify Zustand store (keep UI state only, remove pagination state)

### Phase 3: UI - Instagram-Style Post Cards
- Use Gemini Design MCP to generate improved post card design
- Create `PostSkeleton` loading component
- Add fade-in animations via Tailwind CSS
- Improve post card visual hierarchy

### Phase 4: Feed Container
- Implement Intersection Observer sentinel element
- Add skeleton loading grid while fetching
- Smooth transitions between states

### Use Gemini Design MCP
- Generate improved card design keeping yellow/stone palette
- Get responsive layout suggestions
- Create skeleton loading component designs
