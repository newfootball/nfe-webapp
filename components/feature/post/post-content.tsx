import type { PostWithUserAndMedias } from "@/src/query/post.query";
import Link from "next/link";

interface PostContentProps {
	post: PostWithUserAndMedias;
}

export function PostContent({ post }: PostContentProps) {
	const image = post.medias.find((media) => media.mimetype.includes("image"));
	const video = post.medias.find((media) => media.mimetype.includes("video"));

	return (
		<>
			{video && (
				<div className="relative aspect-video overflow-hidden rounded-lg">
					<Link href={`/post/${post.id}`}>
						<video
							muted={false}
							className="w-full h-full object-cover"
							poster={image?.url}
							controls={false}
							autoPlay={false}
						>
							<source src={video.url} type={video.mimetype} />
						</video>
					</Link>
				</div>
			)}
			<div>
				<h3 className="font-semibold pl-2">{post.title}</h3>
			</div>
		</>
	);
}
