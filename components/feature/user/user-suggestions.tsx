"use client";

import { MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UserSuggestion {
	id: string;
	name: string;
	image: string | null;
	userType: string;
	position?: string[];
}

interface UserSuggestionsProps {
	users: UserSuggestion[];
	onClose?: () => void;
}

export function UserSuggestions({ users, onClose }: UserSuggestionsProps) {
	const t = useTranslations("feature.user.suggestions");

	return (
		<Card className="p-4">
			<div className="flex items-center justify-between mb-4">
				<h2 className="font-semibold">{t("suggestions")}</h2>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" title={t("more-options")}>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
					{onClose && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onClose}
							title={t("close")}
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			<div className="space-y-4">
				{users.map((user) => (
					<div key={user.id} className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<Link href={`/profile/${user.id}`}>
								<Avatar>
									<AvatarImage src={user.image || ""} alt={user.name} />
									<AvatarFallback>{user.name[0]}</AvatarFallback>
								</Avatar>
							</Link>
							<div>
								<Link
									href={`/profile/${user.id}`}
									className="font-semibold hover:underline"
								>
									{user.name}
								</Link>
								<p className="text-sm text-muted-foreground">{user.userType}</p>
								{user.position && (
									<p className="text-sm text-muted-foreground">
										{user.position.join(", ")}
									</p>
								)}
							</div>
						</div>
						<Button variant="outline" size="sm">
							{t("connect")}
						</Button>
					</div>
				))}
			</div>
		</Card>
	);
}
