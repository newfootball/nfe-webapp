"use client";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Layout } from "@/components/layouts/layout";
import { Button } from "@/components/ui/button";
import { publishPost } from "@/src/actions/post.action";
import { MediaType, PostStatus } from "@/src/generated/prisma/enums";
import { cn } from "@/src/lib/utils";
import type { PostWithMedias } from "@/src/types/post.types";

const MAX_POSTS = 3;

export const LastPostBox = ({
	posts,
	count,
	title,
	isLoading,
	showPublishButton,
}: {
	posts?: PostWithMedias[];
	count?: number;
	title: string;
	isLoading?: boolean;
	showPublishButton?: boolean;
}) => {
	return (
		<Layout>
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold">{title}</h2>
				<Button variant="ghost" size="sm" className="text-muted-foreground">
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>
			<div className="grid grid-cols-3 gap-1">
				{isLoading ? (
					<PostCardSkeleton text="..." />
				) : (
					posts?.map((post) =>
						showPublishButton ? (
							<PublishablePostCard key={post.id} post={post} />
						) : (
							<PostCard key={post.id} post={post} />
						),
					)
				)}
				{count && count > MAX_POSTS && (
					<PostCardSkeleton text={count.toString()} />
				)}
			</div>
		</Layout>
	);
};

const PostCardSkeleton = ({ text }: { text: string }) => {
	return (
		<div className="aspect-square relative rounded-lg overflow-hidden bg-muted flex items-center justify-center">
			<span className="text-lg font-medium">{text}</span>
		</div>
	);
};

const PostCard = ({ post }: { post: PostWithMedias }) => {
	const image = post.medias.find(
		(media) => media.type === MediaType.landingImage,
	);

	return (
		<div className="aspect-square relative rounded-lg overflow-hidden">
			<Link href={`/post/${post.id}`}>
				<Image
					src={
						image?.url ??
						"https://images.unsplash.com/photo-1526494661200-9d7cfd4b2404?q=80&w=200&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
					}
					alt={post.title ?? ""}
					className={cn("object-cover", {
						"opacity-50": post.medias.length === 0,
					})}
					fill
				/>
			</Link>
		</div>
	);
};

const PublishablePostCard = ({ post }: { post: PostWithMedias }) => {
	const t = useTranslations("actions.post");
	const router = useRouter();
	const [isPublishing, setIsPublishing] = useState(false);
	const isDraft = post.status === PostStatus.DRAFT;

	const handlePublish = async (e: React.MouseEvent) => {
		e.preventDefault();
		setIsPublishing(true);
		const result = await publishPost(post.id);
		setIsPublishing(false);
		if (result.error) {
			toast.error(result.error);
		} else {
			toast.success(t("publish-post"));
			router.refresh();
		}
	};

	return (
		<div className="aspect-square relative rounded-lg overflow-hidden">
			<PostCard post={post} />
			{isDraft && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
					<span className="text-white text-xs font-medium px-2 py-0.5 bg-white/20 rounded-full">
						{t("draft")}
					</span>
					<Button
						size="sm"
						className="text-xs h-7 px-3"
						onClick={handlePublish}
						disabled={isPublishing}
					>
						{isPublishing ? "..." : t("publish-post")}
					</Button>
				</div>
			)}
		</div>
	);
};
