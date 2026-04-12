import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ExploreUserGrid } from "@/components/feature/search/suggested-user-card";
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

	const showUsers = !!q && (tab === "top" || tab === "users");
	const showPosts = !!q && (tab === "top" || tab === "posts");
	const showSuggested = !q;

	const [users, posts] = await Promise.all([
		showUsers ? searchUsers(q) : Promise.resolve([]),
		showPosts ? searchPosts(q) : Promise.resolve([]),
	]);

	const suggestedUsers = showSuggested
		? await getSuggestedUsers(await getUserSessionId(), 10)
		: [];

	const hasNoResults = !!q && users.length === 0 && posts.length === 0;

	return (
		<div>
			<Suspense>
				<ExploreHeader />
			</Suspense>

			<div className="px-4 pb-4 pt-4">
				{showSuggested && suggestedUsers.length > 0 && (
					<div>
						<h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
							{t("suggested-users")}
						</h2>
						<ExploreUserGrid users={suggestedUsers} />
					</div>
				)}

				{showSuggested && suggestedUsers.length === 0 && (
					<p className="text-sm text-muted-foreground text-center py-12">
						{t("empty-state")}
					</p>
				)}

				{hasNoResults && (
					<p className="text-sm text-muted-foreground text-center py-12">
						{t("no-results", { query: q })}
					</p>
				)}

				{showUsers && users.length > 0 && (
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

				{showPosts && posts.length > 0 && (
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
