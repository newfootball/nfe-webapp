import { getTranslations } from "next-intl/server";
import { UserResultItem } from "@/components/feature/search/user-result-item";
import { searchPosts } from "@/src/query/post.query";
import {
	getSuggestedUsers,
	getUserSessionId,
	searchUsers,
} from "@/src/query/user.query";
import { ExploreHeader } from "./explore-header";
import { ExplorePostResults } from "./explore-post-results";

export default async function Explore({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; tab?: string }>;
}) {
	const { q = "", tab = "top" } = await searchParams;
	const t = await getTranslations("explore");

	const [users, posts] = await Promise.all([
		q && (tab === "top" || tab === "users")
			? searchUsers(q)
			: Promise.resolve([]),
		q && (tab === "top" || tab === "posts")
			? searchPosts(q)
			: Promise.resolve([]),
	]);

	let suggestedUsers: Awaited<ReturnType<typeof getSuggestedUsers>> = [];
	if (!q) {
		const uid = await getUserSessionId();
		if (uid) suggestedUsers = await getSuggestedUsers(uid, 10);
	}

	return (
		<div>
			<ExploreHeader />
			<div className="px-4 pb-4">
				{!q && suggestedUsers.length > 0 && (
					<div>
						<h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
							{t("suggested-users")}
						</h2>
						<div className="divide-y divide-border">
							{suggestedUsers
								.filter((u) => u.userType !== null)
								.map((user) => (
									<UserResultItem
										key={user.id}
										user={{
											id: user.id,
											name: user.name,
											image: user.image,
											// biome-ignore lint/style/noNonNullAssertion: filtered above
											userType: user.userType!,
										}}
									/>
								))}
						</div>
					</div>
				)}

				{!q && suggestedUsers.length === 0 && (
					<p className="text-sm text-muted-foreground text-center py-12">
						{t("empty-state")}
					</p>
				)}

				{q && users.length === 0 && posts.length === 0 && (
					<p className="text-sm text-muted-foreground text-center py-12">
						{t("no-results", { query: q })}
					</p>
				)}

				{q && (tab === "top" || tab === "users") && users.length > 0 && (
					<div className="mb-6">
						{tab === "top" && (
							<h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
								{t("tabs.users")}
							</h2>
						)}
						<div className="divide-y divide-border">
							{users.map((user) => (
								<UserResultItem key={user.id} user={user} />
							))}
						</div>
					</div>
				)}

				{q && (tab === "top" || tab === "posts") && posts.length > 0 && (
					<div>
						{tab === "top" && (
							<h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
								{t("tabs.posts")}
							</h2>
						)}
						<ExplorePostResults posts={posts} />
					</div>
				)}
			</div>
		</div>
	);
}
