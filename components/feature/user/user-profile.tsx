"use client";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteUserAccount } from "@/src/actions/user.action";
import type { User } from "@prisma/client";
import { Loader, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { StatsUser } from "./stats-user";

export const UserProfile = ({
	user,
	userIdSession,
}: {
	user: User | null;
	userIdSession?: string | null | undefined;
}) => {
	const t = useTranslations("feature.user.profile");

	if (!user) {
		return <div>{t("loading")}</div>;
	}

	const isCurrentUser = userIdSession === user?.id;

	return (
		<>
			<div className="relative">
				<div className="h-48 w-full relative">
					<Image
						src="https://images.unsplash.com/photo-1516567727245-ad8c68f3ec93?q=80&w=384&h=192&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
						alt={t("cover-image")}
						className="object-cover"
						fill
					/>
				</div>
				<div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
					<Avatar className="w-32 h-32 border-4 border-background">
						<AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
						<AvatarFallback>
							{user.name
								?.split(" ")
								.map((n: string) => n[0])
								.join("")}
						</AvatarFallback>
					</Avatar>
				</div>
			</div>

			<main className="pt-20 px-4">
				<div className="text-center mb- 6">
					<h1 className="text-2xl font-bold mb-1">{user.name}</h1>
					<p className="text-muted-foreground mb-4">@{user.email}</p>

					{isCurrentUser && (
						<div className="flex justify-center gap-2">
							<Link href="/profile/edit-user">
								<Button variant="outline" className="flex-1 max-w-[200px]">
									{t("edit-profile")}
								</Button>
							</Link>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="icon">
										<Settings className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										className="text-destructive"
										onClick={async () => {
											const confirmed = window.confirm(
												t("confirm-delete-account"),
											);
											if (confirmed) {
												try {
													await deleteUserAccount();
													toast.success(t("account-deleted-successfully"));
													redirect("/sign-in");
												} catch (error) {
													toast.error(t("failed-to-delete-account"));
													console.error(error);
												}
											}
										}}
									>
										{t("delete-account")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}

					{!isCurrentUser && userIdSession && (
						<FollowButton userId={user.id} showText={true} />
					)}
				</div>

				<Suspense fallback={<Loader className="animate-spin" />}>
					<StatsUser userId={user.id} />
				</Suspense>
			</main>
		</>
	);
};
