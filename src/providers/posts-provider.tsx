"use client";

interface PostsProviderProps {
	children: React.ReactNode;
}

export const PostsProvider = ({ children }: PostsProviderProps) => {
	return <>{children}</>;
};
