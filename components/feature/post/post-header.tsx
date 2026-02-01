"use client";

import { formatDistanceToNow } from "date-fns";
import {
	EyeClosed,
	FileEdit,
	FileText,
	Flag,
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePost } from "@/src/actions/post.action";
import { useSession } from "@/src/lib/auth-client";
import type { PostWithUserAndMedias } from "@/src/types/post.types";
import { PostSignalForm } from "./post-signal-form";

interface PostHeaderProps {
	post: PostWithUserAndMedias;
}

export function PostHeader({ post }: PostHeaderProps) {
	const { data: session } = useSession();
	const t = useTranslations("posts.post-header");
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showSignalDialog, setShowSignalDialog] = useState(false);

	const isOwner = session?.user?.id === post.user.id;

	const handleDelete = async () => {
		try {
			const result = await deletePost(post.id);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success(t("post-deleted-successfully"));
				redirect("/post/my");
			}
		} catch (error) {
			console.error(error);
			toast.error(t("post-deletion-failed"));
		}
	};

	return (
		<>
			<div className="flex items-center gap-3 px-4 py-3">
				<Link href={`/user/${post.user.id}`}>
					<Avatar className="h-10 w-10">
						<AvatarImage
							src={post.user?.image ?? ""}
							alt={post.user.name ?? ""}
						/>
						<AvatarFallback>
							{post.user?.name?.[0]?.toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</Link>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<Link
							href={`/user/${post.user.id}`}
							className="text-sm font-semibold hover:underline truncate"
						>
							{post.user.name}
						</Link>
						<span className="text-xs text-muted-foreground">·</span>
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{formatDistanceToNow(new Date(post.createdAt), {
								addSuffix: true,
							})}
						</span>
					</div>
					{post.user.localisation && (
						<p className="text-xs text-muted-foreground truncate">
							{post.user.localisation}
						</p>
					)}
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="h-8 w-8">
							<MoreHorizontal className="h-5 w-5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link href={`/post/${post.id}`}>
								<FileText className="mr-2 h-4 w-4" /> {t("show")}
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem className="cursor-not-allowed">
							<EyeClosed className="mr-2 h-4 w-4" /> {t("hide")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setShowSignalDialog(true)}>
							<Flag className="mr-2 h-4 w-4" /> {t("signal")}
						</DropdownMenuItem>
						{isOwner && (
							<>
								<DropdownMenuItem asChild>
									<Link href={`/post/${post.id}/edit`}>
										<FileEdit className="mr-2 h-4 w-4" /> {t("edit")}
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-destructive"
									onClick={() => setShowDeleteDialog(true)}
								>
									<Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("confirm-deletion")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("confirm-deletion-description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground"
						>
							{t("delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<PostSignalForm
				postId={post.id}
				open={showSignalDialog}
				onOpenChange={setShowSignalDialog}
			/>
		</>
	);
}
