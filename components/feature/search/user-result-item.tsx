"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { UserType } from "@/src/generated/prisma/client";

interface UserResultItemProps {
	user: {
		id: string;
		name: string | null;
		image: string | null;
		userType: UserType;
		position?: string[];
	};
}

export function UserResultItem({ user }: UserResultItemProps) {
	const t = useTranslations("feature.search");
	const isPlayer = user.userType === "PLAYER";

	return (
		<div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors gap-3">
			<Link
				href={`/user/${user.id}`}
				className="flex items-center gap-3 min-w-0"
			>
				<Avatar className="h-12 w-12 shrink-0 border border-border">
					<AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
					<AvatarFallback className="bg-muted text-muted-foreground">
						{user.name?.[0] ?? "?"}
					</AvatarFallback>
				</Avatar>

				<div className="flex flex-col gap-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="font-medium text-sm truncate">{user.name}</span>
						<Badge
							variant={isPlayer ? "default" : "outline"}
							className="text-[9px] h-4 px-1 leading-none font-bold shrink-0"
						>
							{t(`user-types.${user.userType}`)}
						</Badge>
					</div>
					{user.position && user.position.length > 0 && (
						<span className="text-xs text-muted-foreground truncate">
							{user.position.join(" · ")}
						</span>
					)}
				</div>
			</Link>

			<div className="shrink-0">
				<FollowButton userId={user.id} showText={false} />
			</div>
		</div>
	);
}
