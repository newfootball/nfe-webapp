"use client";

import type { UserType } from "@prisma/client";
import Link from "next/link";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserResultItemProps {
	user: {
		id: string;
		name: string | null;
		image: string | null;
		userType: UserType;
	};
}

export function UserResultItem({ user }: UserResultItemProps) {
	return (
		<div className="flex items-center gap-3 py-2">
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
	);
}
