"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getFollowers, getFollowing } from "@/src/query/follow.query";

interface FollowListDialogProps {
	userId: string;
	type: "followers" | "following";
	count: number;
	label: string;
}

function FollowList({
	userId,
	type,
}: {
	userId: string;
	type: "followers" | "following";
}) {
	const { data: users, isPending } = useQuery({
		queryKey: [type, userId],
		queryFn: () =>
			type === "followers" ? getFollowers(userId) : getFollowing(userId),
	});

	if (isPending) {
		return (
			<div className="space-y-3 py-2">
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-20" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (!users || users.length === 0) {
		return <p className="text-center text-muted-foreground text-sm py-6">—</p>;
	}

	return (
		<div className="space-y-3 py-2 max-h-80 overflow-y-auto">
			{users.map((user) => (
				<div key={user.id} className="flex items-center gap-3">
					<Link href={`/user/${user.id}`}>
						<Avatar className="h-10 w-10">
							<AvatarImage src={user.image ?? undefined} />
							<AvatarFallback>
								{user.name?.charAt(0).toUpperCase() ?? "?"}
							</AvatarFallback>
						</Avatar>
					</Link>
					<Link href={`/user/${user.id}`} className="flex-1 min-w-0">
						<p className="font-medium text-sm truncate">{user.name}</p>
						<p className="text-xs text-muted-foreground">{user.userType}</p>
					</Link>
					<FollowButton userId={user.id} showText={false} />
				</div>
			))}
		</div>
	);
}

export function FollowListDialog({
	userId,
	type,
	count,
	label,
}: FollowListDialogProps) {
	const t = useTranslations("feature.user.stats");

	return (
		<Dialog>
			<DialogTrigger asChild>
				<button
					type="button"
					className="text-center cursor-pointer hover:opacity-70 transition-opacity"
				>
					<div className="font-bold">{count}</div>
					<div className="text-sm text-muted-foreground">{label}</div>
				</button>
			</DialogTrigger>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{type === "followers" ? t("followers-list") : t("following-list")}
					</DialogTitle>
				</DialogHeader>
				<FollowList userId={userId} type={type} />
			</DialogContent>
		</Dialog>
	);
}
