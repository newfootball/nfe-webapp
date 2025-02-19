import { PostDetails } from "@/components/feature/post/post-details";
import { getPosts } from "@/src/query/post.query";
import { getUserSession } from "@/src/query/user.query";
import { redirect } from "next/navigation";

export default async function MyPostsPage() {
	const user = await getUserSession();

	if (!user?.id) {
		redirect("/login");
	}

	const posts = await getPosts({
		userId: user.id,
		limit: 5,
	});

	return (
		<div className="container mx-auto py-8">
			<h1 className="text-2xl font-bold mb-6">My Posts</h1>
			{posts.length === 0 && (
				<p className="text-muted-foreground">You have no posts</p>
			)}
			{posts.map((post) => (
				<div key={post.id} data-post className="mb-4">
					<PostDetails post={post} />
				</div>
			))}
		</div>
	);
}
