"use client";

import { UserProfile } from "@/components/feature/user/user-profile";
import { Layout } from "@/components/layouts/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { type PostWithUserAndMedias, getPosts } from "@/src/query/post.query";
import { getUser } from "@/src/query/user.query";
import type { User } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ProfilePage() {
	const { data: session } = useSession();
	const [user, setUser] = useState<User | null>(null);
	const [myPosts, setMyPosts] = useState<PostWithUserAndMedias[] | null>(null);

	if (!session?.user?.id || session?.user?.id === null) {
		toast.error("User not found");
		redirect("/sign-in");
	}

	useEffect(() => {
		const fetchUser = async () => {
			const user = await getUser(session?.user?.id ?? "");
			setUser(user);
		};

		const fetchPosts = async () => {
			const posts = await getPosts({
				userId: session?.user?.id ?? "",
				limit: 5,
			});
			setMyPosts(posts);
		};

		fetchUser();
		fetchPosts();

		return () => {};
	}, [session?.user?.id]);

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{user && (
				<UserProfile user={user} userIdSession={session?.user?.id ?? ""} />
			)}

			<Layout>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold">Videos</h2>
					<Button variant="ghost" size="sm" className="text-muted-foreground">
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
				<div className="grid grid-cols-3 gap-1">
					{myPosts?.map((post) => (
						<div
							key={post.id}
							className="aspect-square relative rounded-lg overflow-hidden"
						>
							<Link href={`/post/${post.id}`}>
								<Image
									src={
										post.medias[0]?.url ??
										"https://images.unsplash.com/photo-1526494661200-9d7cfd4b2404?q=80&w=200&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
									}
									alt={post.title ?? ""}
									className={cn("object-cover", {
										"opacity-50": post.medias.length === 0,
									})}
									fill
								/>
							</Link>
						</div>
					))}
					<div className="aspect-square relative rounded-lg overflow-hidden bg-muted flex items-center justify-center">
						<span className="text-lg font-medium">+49</span>
					</div>
				</div>
			</Layout>
		</div>
	);
}
