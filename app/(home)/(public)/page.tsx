import { redirect } from "next/navigation";
import { getHasSeenSplash } from "@/src/actions/cookies.actions";
import { getPostsWithCursor } from "@/src/query/post.query";
import Posts from "./posts";

export default async function Home() {
	if ((await getHasSeenSplash()) === false) {
		return redirect("/splash");
	}

	const initialData = await getPostsWithCursor({});

	return (
		<div>
			<Posts initialData={initialData} />
		</div>
	);
}
