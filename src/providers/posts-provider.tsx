"use client";

import { usePostsStore } from "@/src/store/posts.store";
import { useEffect } from "react";

interface PostsProviderProps {
  children: React.ReactNode;
}

export const PostsProvider = ({ children }: PostsProviderProps) => {
  const { reset } = usePostsStore();

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Optional: reset store on page unload to prevent stale data
      // reset();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [reset]);

  return <>{children}</>;
};
