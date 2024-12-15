"use client";

import { UserProfile } from "@/components/feature/user/user-profile";
import { Button } from "@/components/ui/button";
import { getUser } from "@/query/user.query";
import type { User } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ProfilePage() {
	const { data: session } = useSession();
	const [user, setUser] = useState<User | null>(null);

	if (!session?.user?.id || session?.user?.id === null) {
		toast.error("User not found");
		redirect("/sign-in");
	}

	useEffect(() => {
		const fetchUser = async () => {
			const user = await getUser(session?.user?.id ?? "");
			setUser(user);
		};

		fetchUser();

		return () => {};
	}, [session?.user?.id]);

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{user && (
				<UserProfile user={user} userIdSession={session?.user?.id ?? ""} />
			)}

			<div>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold">Videos</h2>
					<Button variant="ghost" size="sm" className="text-muted-foreground">
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
				<div className="grid grid-cols-3 gap-1">
					<div className="aspect-square relative rounded-lg overflow-hidden">
						<Image
							src="/placeholder.svg?height=150&width=150"
							alt="Video 1"
							className="object-cover"
							fill
						/>
					</div>
					<div className="aspect-square relative rounded-lg overflow-hidden">
						<Image
							src="/placeholder.svg?height=150&width=150"
							alt="Video 2"
							className="object-cover"
							fill
						/>
					</div>
					<div className="aspect-square relative rounded-lg overflow-hidden">
						<Image
							src="/placeholder.svg?height=150&width=150"
							alt="Video 3"
							className="object-cover"
							fill
						/>
					</div>
					<div className="aspect-square relative rounded-lg overflow-hidden">
						<Image
							src="/placeholder.svg?height=150&width=150"
							alt="Video 4"
							className="object-cover"
							fill
						/>
					</div>
					<div className="aspect-square relative rounded-lg overflow-hidden bg-muted flex items-center justify-center">
						<span className="text-lg font-medium">+49</span>
					</div>
				</div>
			</div>
		</div>
	);
}
