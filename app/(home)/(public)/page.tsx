import { getHasSeenSplash } from "@/src/actions/cookies.actions";
import { getPosts } from "@/src/query/post.query";
import { redirect } from "next/navigation";
import Posts from "./posts";

export default async function Home() {
	if ((await getHasSeenSplash()) === false) {
		return redirect("/splash");
	}

	const posts = await getPosts({});

	return (
		<>
			<Posts posts={posts} />
		</>
	);
}
