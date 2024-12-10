import { PageHeader } from "@/components/feature/page-header";
import { getPost } from "@/query/post.query";
import { notFound } from "next/navigation";
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

	return (
		<>
			<PageHeader title="Post" backLink="/" />
			<PostCard post={post} />
		</>
	);
}
