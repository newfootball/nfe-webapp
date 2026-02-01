import { notFound } from "next/navigation";
import { getPost } from "@/src/query/post.query";
import { PostCard } from "./post-card";

export default async function page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const post = await getPost(id);

	if (!post) {
		return notFound();
	}

	return <PostCard post={post} />;
}
