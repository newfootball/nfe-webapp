import Image from "next/image";
import Link from "next/link";
import type { Media } from "@/src/generated/prisma/client";

type SearchPost = {
	id: string;
	title: string;
	medias: Media[];
	user: { id: string; name: string | null; image: string | null };
	_count: { likes: number; comments: number };
};

export function ExplorePostResults({ posts }: { posts: SearchPost[] }) {
	return (
		<div className="grid grid-cols-3 gap-1">
			{posts.map((post) => {
				const cover = post.medias.find((m) => m.type === "landingImage");
				return (
					<Link
						key={post.id}
						href={`/post/${post.id}`}
						className="relative aspect-square overflow-hidden"
					>
						{cover?.url ? (
							<Image
								src={cover.url}
								alt={post.title}
								fill
								className="object-cover hover:opacity-80 transition-opacity"
							/>
						) : (
							<div className="w-full h-full bg-muted flex items-center justify-center p-2">
								<span className="text-xs text-muted-foreground text-center line-clamp-3">
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
