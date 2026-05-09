import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PostDetails } from "@/components/feature/post/post-details";
import { Badge } from "@/components/ui/badge";
import type { PostStatus } from "@/src/generated/prisma/client";
import { getPosts } from "@/src/query/post.query";
import { getUserSession } from "@/src/query/user.query";

export const dynamic = "force-dynamic";

type StatusVariant = "secondary" | "outline" | "destructive";

const STATUS_CONFIG: Record<
	Exclude<PostStatus, "PUBLISHED">,
	{ variant: StatusVariant; key: string }
> = {
	DRAFT: { variant: "secondary", key: "status-draft" },
	PENDING: { variant: "outline", key: "status-pending" },
	REJECTED: { variant: "destructive", key: "status-rejected" },
	ARCHIVED: { variant: "secondary", key: "status-archived" },
};

export default async function MyPostsPage() {
	const [t, user] = await Promise.all([
		getTranslations("posts.my-posts"),
		getUserSession(),
	]);

	if (!user?.id) {
		redirect("/sign-in");
	}

	const posts = await getPosts({
		userId: user.id,
		limit: 5,
	});

	return (
		<div className="container mx-auto py-8">
			<h1 className="text-2xl font-bold mb-6">{t("my-posts")}</h1>
			{posts.length === 0 && (
				<p className="text-muted-foreground">{t("you-have-no-posts")}</p>
			)}
			{posts.map((post) => {
				const statusConfig =
					post.status && post.status !== "PUBLISHED"
						? STATUS_CONFIG[post.status]
						: null;
				return (
					<div key={post.id} data-post className="mb-4">
						{statusConfig && (
							<div className="mb-1 px-1">
								<Badge variant={statusConfig.variant}>
									{t(statusConfig.key as Parameters<typeof t>[0])}
								</Badge>
							</div>
						)}
						<PostDetails post={post} />
					</div>
				);
			})}
		</div>
	);
}
