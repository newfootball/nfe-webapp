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
import type { PostWithUserAndMedias } from "@/src/query/post.query";
import { formatDistanceToNow } from "date-fns";
import {
	EyeClosed,
	FileEdit,
	FileText,
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface PostHeaderProps {
	post: PostWithUserAndMedias;
}

export function PostHeader({ post }: PostHeaderProps) {
	const { data: session } = useSession();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
				toast.success("Post supprimé avec succès");
				redirect("/post/my");
			}
		} catch (error) {
			console.error(error);
			toast.error("Échec de la suppression du post");
		}
	};

	return (
		<>
			<CardTitle className="leading-none tracking-tight py-0">
				<div className="flex items-start justify-between p-4 pb-2 border-b mx-4 text-gray-500 font-light text-sm">
					<div>Suggestion</div>
					<div className="flex items-center gap-2">
						<Link href={`/post/${post.id}`}>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<MoreHorizontal className="h-4 w-4" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link href={`/post/${post.id}`}>
											<FileText className="mr-2 h-4 w-4" /> Show
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem className="cursor-not-allowed">
										<EyeClosed className="mr-2 h-4 w-4" /> Hide
									</DropdownMenuItem>
									{isOwner && (
										<>
											<DropdownMenuItem asChild>
												<Link href={`/post/${post.id}/edit`}>
													<FileEdit className="mr-2 h-4 w-4" /> Edit
												</Link>
											</DropdownMenuItem>
											<DropdownMenuItem
												className="text-destructive"
												onClick={openDeleteDialog}
											>
												<Trash2 className="mr-2 h-4 w-4" /> Delete
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</Link>
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
						<AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
						<AlertDialogDescription>
							Êtes-vous sûr de vouloir supprimer ce post ? Cette action est
							irréversible.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Annuler</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground"
						>
							Supprimer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
