import { Layout } from "@/components/layouts/layout";
import { getPost } from "@/src/query/post.query";
import { notFound } from "next/navigation";

export default async function page({
	params,
}: {
	params: Promise<{
		id: string;
	}>;
}) {
	const { id } = await params;

	const post = await getPost(id);

	if (!post) {
		return notFound();
	}

	return (
		<Layout>
			<div>
				<h1>Edit Post</h1>
			</div>
		</Layout>
	);
}
