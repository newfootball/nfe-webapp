import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UserSuggestions } from "@/components/feature/user/user-suggestions";
import { getHasSeenSplash } from "@/src/actions/cookies.actions";
import { getPostsWithCursor } from "@/src/query/post.query";
import { getSuggestedUsers, getUserSessionId } from "@/src/query/user.query";
import Posts from "./posts";

export default async function Home() {
	if ((await getHasSeenSplash()) === false) {
		return redirect("/splash");
	}

	const [initialData, userId] = await Promise.all([
		getPostsWithCursor({}),
		getUserSessionId(),
	]);

	const suggestedUsers = userId ? await getSuggestedUsers(userId, 3) : [];

	return (
		<div>
			{suggestedUsers.length > 0 && (
				<Suspense fallback={null}>
					<div className="px-4 pt-4">
						<UserSuggestions
							users={suggestedUsers.map((u) => ({
								id: u.id,
								name: u.name ?? "",
								image: u.image,
								userType: u.userType ?? "",
								position: u.position,
							}))}
						/>
					</div>
				</Suspense>
			)}
			<Posts initialData={initialData} />
		</div>
	);
}
