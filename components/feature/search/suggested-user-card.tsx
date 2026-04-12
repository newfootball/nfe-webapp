"use client";

import type { UserType } from "@prisma/client";
import Link from "next/link";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/src/lib/auth-client";

const USER_TYPE_LABELS: Record<UserType, string> = {
	USER: "Utilisateur",
	PLAYER: "Joueur",
	COACH: "Entraîneur",
	RECRUITER: "Recruteur",
	CLUB: "Club",
};

interface SuggestedUser {
	id: string;
	name: string | null;
	image: string | null;
	userType: UserType;
	position?: string[];
	_count?: {
		followeds: number;
		posts: number;
	};
}

export function SuggestedUserCard({ user }: { user: SuggestedUser }) {
	const { data: session } = useSession();
	const isPlayer = user.userType === "PLAYER";
	const isLoggedIn = !!session?.user;

	return (
		<Card className="overflow-hidden transition-all duration-200 hover:border-primary/50 group bg-card border-border shadow-sm">
			<CardContent className="p-4 flex flex-col items-center text-center gap-3">
				<Link href={`/user/${user.id}`}>
					<Avatar className="h-14 w-14 border-2 border-transparent group-hover:border-primary/20 transition-colors">
						<AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
						<AvatarFallback className="bg-muted text-muted-foreground uppercase">
							{user.name?.[0] ?? "?"}
						</AvatarFallback>
					</Avatar>
				</Link>

				<div className="space-y-1 w-full">
					<Link href={`/user/${user.id}`}>
						<p className="font-semibold text-sm truncate leading-none hover:underline">
							{user.name}
						</p>
					</Link>
					<Badge
						variant={isPlayer ? "default" : "secondary"}
						className="text-[10px] uppercase tracking-wider px-1.5 py-0"
					>
						{USER_TYPE_LABELS[user.userType]}
					</Badge>
				</div>

				{user._count && (
					<div className="flex items-center justify-center gap-4 w-full text-xs text-muted-foreground">
						<div className="flex flex-col items-center gap-0.5">
							<span className="font-semibold text-foreground tabular-nums">
								{user._count.followeds}
							</span>
							<span>abonnés</span>
						</div>
						<div className="w-px h-6 bg-border" />
						<div className="flex flex-col items-center gap-0.5">
							<span className="font-semibold text-foreground tabular-nums">
								{user._count.posts}
							</span>
							<span>posts</span>
						</div>
					</div>
				)}

				<div className="w-full">
					{isLoggedIn ? (
						<FollowButton userId={user.id} showText={true} />
					) : (
						<Button variant="outline" size="sm" className="w-full" asChild>
							<Link href={`/user/${user.id}`}>Voir le profil</Link>
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

export function ExploreUserGrid({ users }: { users: SuggestedUser[] }) {
	return (
		<div className="grid grid-cols-2 gap-3">
			{users.map((user) => (
				<SuggestedUserCard key={user.id} user={user} />
			))}
		</div>
	);
}
