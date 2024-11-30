import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getUser } from "@/query/user.query";
import { Loader, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { StatsUser } from "./stats-user";

export const UserProfile = async ({ userId }: { userId: string }) => {
	const user = await getUser(userId);

	if (!user) {
		throw new Error("User not found");
	}

	return (
		<>
			<div className="relative">
				<div className="h-48 w-full relative">
					<Image
						src="https://images.unsplash.com/photo-1516567727245-ad8c68f3ec93?q=80&w=384&h=192&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
						alt="Cover"
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

			<main className="flex-grow pt-20 px-4">
				<div className="text-center mb- 6">
					<h1 className="text-2xl font-bold mb-1">{user.name}</h1>
					<p className="text-muted-foreground mb-4">@{user.email}</p>
					<div className="flex justify-center gap-2 mb-4">
						{["art", "music", "uidesign"].map((tag) => (
							<span
								key={tag}
								className="px-3 py-1 bg-muted rounded-full text-sm"
							>
								#{tag}
							</span>
						))}
					</div>
					<div className="flex justify-center gap-2">
						<Link href="/profile/edit-user">
							<Button variant="outline" className="flex-1 max-w-[200px]">
								Edit profile
							</Button>
						</Link>
						<Button variant="outline" size="icon">
							<Settings className="h-4 w-4" />
						</Button>
					</div>
				</div>

				<Suspense fallback={<Loader className="animate-spin" />}>
					<StatsUser userId={user.id} />
				</Suspense>
			</main>
		</>
	);
};
