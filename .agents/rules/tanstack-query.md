---
paths:
  - "src/hooks/**"
  - "components/**"
  - "app/**"
  - "apps/start/src/**"
---

# TanStack Query

Scope: src/hooks/**, components/**, app/**, apps/start/src/**

- Follow the installed major version's API. In v5, use the single object form with a stable array `queryKey` and a `queryFn` that returns or throws.
- Make query keys describe every input that changes the result. Keep key construction close to the feature or centralize it consistently.
- Render pending, error, and success states deliberately; distinguish an initial load from a background refresh when that changes the UI.
- Model server-changing operations as mutations. On success, update or invalidate the smallest affected cache scope.
- Do not treat client-cache state as authorization. The server remains the authority for every read and mutation.
- In SSR, create a QueryClient per request and preserve the framework's dehydration/hydration integration; a module-level server cache can expose one user's data to another. Partition or remove private client cache data when the authenticated identity changes.
- Choose `staleTime`, retry and refetch behavior deliberately for the feature instead of disabling defaults globally to hide repeated requests. Optimistic mutations need cancellation of conflicting refetches, a rollback path on failure and reconciliation with server state.

## Existing state boundaries

- Root feed pagination lives in `src/hooks/use-posts.ts` and bridges into
  `src/store/posts.store.ts` for optimistic UI. Preserve that behavior when
  updating queries; do not expand Zustand into a second general server cache.
- Start creates its QueryClient inside `getRouter()` per router/SSR request in
  `apps/start/src/router.tsx` and integrates SSR hydration. Never move it into
  module-global state that can leak one reader's cached data to another.
