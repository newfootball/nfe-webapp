"use client";

import { Layout } from "@/components/layouts/layout";
import { Home, MessageSquare, Plus, Search, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export const Footer = () => {
	const { data: session } = useSession();

	return (
		<footer className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t h-20 md:h-20 pb-4 shadow-sm">
			<Layout>
				<nav className="h-full px-4 relative">
					<ul className="grid grid-cols-5 items-center h-full w-full">
						<li className="flex justify-center">
							<Link
								href="/"
								className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
							>
								<Home className="h-6 w-6" />
								<span className="text-xs">Home</span>
							</Link>
						</li>
						<li className="flex justify-center">
							<Link
								href="/explore"
								className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
							>
								<Search className="h-6 w-6" />
								<span className="text-xs">Search</span>
							</Link>
						</li>
						<li className="flex justify-center relative">
							<Link
								href="/post/new"
								className="flex flex-col items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-primary rounded-full shadow-md hover:bg-primary/90 transition-colors absolute -top-12 md:-top-14"
							>
								<Plus className="h-6 w-6 text-primary-foreground" />
							</Link>
						</li>
						<li className="flex justify-center">
							<Link
								href="/messages"
								className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
							>
								<MessageSquare className="h-6 w-6" />
								<span className="text-xs">Messages</span>
							</Link>
						</li>
						{session?.user ? (
							<li className="flex justify-center">
								<Link
									href="/profile"
									className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
								>
									<User className="h-6 w-6" />
									<span className="text-xs">Profile</span>
								</Link>
							</li>
						) : (
							<li className="flex justify-center">
								<Link
									href="/sign-in"
									className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
								>
									<User className="h-6 w-6" />
									<span className="text-xs">Sign In</span>
								</Link>
							</li>
						)}
					</ul>
				</nav>
			</Layout>
		</footer>
	);
};
