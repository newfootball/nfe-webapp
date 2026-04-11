"use client";

import type { Media } from "@prisma/client";
import { BookmarkX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type FavoritePost = {
	id: string;
	title: string;
	medias: Media[];
	user: { id: string; name: string | null; image: string | null };
	_count: { likes: number; comments: number };
};

interface FavoritesListProps {
	posts: FavoritePost[];
	emptyLabel: string;
}

export function FavoritesList({ posts, emptyLabel }: FavoritesListProps) {
	if (posts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
				<BookmarkX className="h-10 w-10" />
				<p className="text-sm">{emptyLabel}</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-3 gap-1">
			{posts.map((post) => {
				const coverImage = post.medias.find((m) => m.type === "landingImage");
				return (
					<Link
						key={post.id}
						href={`/post/${post.id}`}
						className="relative aspect-square overflow-hidden"
					>
						{coverImage?.url ? (
							<Image
								src={coverImage.url}
								alt={post.title}
								fill
								className="object-cover hover:opacity-80 transition-opacity"
							/>
						) : (
							<div className="w-full h-full bg-muted flex items-center justify-center">
								<span className="text-xs text-muted-foreground text-center px-2 line-clamp-2">
									{post.title}
								</span>
							</div>
						)}
					</Link>
				);
			})}
		</div>
	);
}
