"use client";

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
import { CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePost } from "@/src/actions/post.action";
import type { PostWithUserAndMedias } from "@/src/types/post.types";
import { formatDistanceToNow } from "date-fns";
import {
	EyeClosed,
	FileEdit,
	FileText,
	Flag,
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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

	const openDeleteDialog = () => {
		setShowDeleteDialog(true);
	};

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
			<CardTitle className="leading-none tracking-tight py-0">
				<div className="flex items-start justify-between p-4 pb-2 border-b mx-4 text-gray-500 font-light text-sm">
					<div>{t("suggestion")}</div>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<MoreHorizontal className="h-4 w-4" />
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
											onClick={openDeleteDialog}
										>
											<Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</CardTitle>

			<CardHeader className="flex-row items-center space-x-4 py-2 space-y-0 pb-4">
				<div className="flex items-start space-y-2 text-left">
					<Avatar className="flex h-14 w-14">
						<AvatarImage
							src={post.user?.image ?? ""}
							alt={post.user.name ?? ""}
						/>
						<AvatarFallback>
							{post.user?.name?.[0]?.toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col pl-4">
						<Link
							href={`/user/${post.user.id}`}
							className="font-semibold hover:underline"
						>
							{post.user.name}
						</Link>
						<span className="text-xs text-muted-foreground">
							{formatDistanceToNow(new Date(post.createdAt), {
								addSuffix: true,
							})}
						</span>
						{post.user.localisation && (
							<p className="text-sm text-muted-foreground">
								{post.user.localisation}
							</p>
						)}
					</div>
				</div>
			</CardHeader>

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
