import { PostWithUserAndMedias } from "@/src/types/post.types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PostsState {
  posts: PostWithUserAndMedias[];
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
  filters: {
    userId?: string;
    status?: string;
  };
}

interface PostsActions {
  setPosts: (posts: PostWithUserAndMedias[]) => void;
  addPosts: (posts: PostWithUserAndMedias[]) => void;
  addPost: (post: PostWithUserAndMedias) => void;
  updatePost: (id: string, updates: Partial<PostWithUserAndMedias>) => void;
  removePost: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFilters: (filters: Partial<PostsState["filters"]>) => void;
  setPagination: (pagination: Partial<PostsState["pagination"]>) => void;
  reset: () => void;
  likePost: (postId: string) => void;
  unlikePost: (postId: string) => void;
}

const initialState: PostsState = {
  posts: [],
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    hasMore: true,
  },
  filters: {},
};

export const usePostsStore = create<PostsState & PostsActions>()(
  devtools(
    (set) => ({
      ...initialState,

      setPosts: (posts) => set(() => ({ posts }), false, "posts/setPosts"),

      addPosts: (newPosts) =>
        set(
          (state) => ({
            posts: [...state.posts, ...newPosts],
            pagination: {
              ...state.pagination,
              hasMore: newPosts.length === state.pagination.limit,
            },
          }),
          false,
          "posts/addPosts",
        ),

      addPost: (post) =>
        set(
          (state) => ({ posts: [post, ...state.posts] }),
          false,
          "posts/addPost",
        ),

      updatePost: (id, updates) =>
        set(
          (state) => ({
            posts: state.posts.map((post) =>
              post.id === id ? { ...post, ...updates } : post,
            ),
          }),
          false,
          "posts/updatePost",
        ),

      removePost: (id) =>
        set(
          (state) => ({
            posts: state.posts.filter((post) => post.id !== id),
          }),
          false,
          "posts/removePost",
        ),

      setLoading: (isLoading) =>
        set(() => ({ isLoading }), false, "posts/setLoading"),

      setError: (error) => set(() => ({ error }), false, "posts/setError"),

      setFilters: (filters) =>
        set(
          (state) => ({
            filters: { ...state.filters, ...filters },
            posts: [], // Reset posts when filters change
            pagination: { ...state.pagination, page: 1 },
          }),
          false,
          "posts/setFilters",
        ),

      setPagination: (pagination) =>
        set(
          (state) => ({
            pagination: { ...state.pagination, ...pagination },
          }),
          false,
          "posts/setPagination",
        ),

      reset: () => set(() => initialState, false, "posts/reset"),

      likePost: (postId) =>
        set(
          (state) => ({
            posts: state.posts.map((post) =>
              post.id === postId
                ? {
                    ...post,
                    _count: {
                      ...post._count,
                      likes: post._count.likes + 1,
                    },
                  }
                : post,
            ),
          }),
          false,
          "posts/likePost",
        ),

      unlikePost: (postId) =>
        set(
          (state) => ({
            posts: state.posts.map((post) =>
              post.id === postId
                ? {
                    ...post,
                    _count: {
                      ...post._count,
                      likes: Math.max(0, post._count.likes - 1),
                    },
                  }
                : post,
            ),
          }),
          false,
          "posts/unlikePost",
        ),
    }),
    { name: "posts-store" },
  ),
);

export const usePostsActions = () => {
  const store = usePostsStore();
  return {
    setPosts: store.setPosts,
    addPosts: store.addPosts,
    addPost: store.addPost,
    updatePost: store.updatePost,
    removePost: store.removePost,
    setLoading: store.setLoading,
    setError: store.setError,
    setFilters: store.setFilters,
    setPagination: store.setPagination,
    reset: store.reset,
    likePost: store.likePost,
    unlikePost: store.unlikePost,
  };
};

export const usePostsSelectors = () => {
  const store = usePostsStore();
  return {
    posts: store.posts,
    isLoading: store.isLoading,
    error: store.error,
    pagination: store.pagination,
    filters: store.filters,
  };
};
