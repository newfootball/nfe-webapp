import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { getSession } from "@/src/lib/auth-server";
import { getPost } from "@/src/query/post.query";
import { PostEditForm } from "./post-edit-form";

export default async function page({
	params,
}: {
	params: Promise<{
		id: string;
	}>;
}) {
	const { id } = await params;
	const t = await getTranslations("posts.edit");

	const [session, post] = await Promise.all([getSession(), getPost(id)]);

	if (!post) {
		return notFound();
	}

	if (!session?.user?.id || post.userId !== session.user.id) {
		return notFound();
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto p-4">
				<h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
				<PostEditForm
					post={{
						id: post.id,
						title: post.title,
						description: post.description,
					}}
				/>
			</div>
		</Layout>
	);
}
