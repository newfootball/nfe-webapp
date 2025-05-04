"use client";

import { Layout } from "@/components/layouts/layout";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	LayoutDashboard,
	LogInIcon,
	LogOutIcon,
	UserIcon,
	VideoIcon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

export const Header = () => {
	const { data: session } = useSession();

	return (
		<header className="w-full border-b border-border shadow-sm px-2">
			<Layout>
				<div className="flex items-center justify-between h-16 py-2">
					<h1 className="flex-1 relative">
						<Link href="/" className="absolute left-0 -top-6 z-50">
							<Image
								src="/logo.svg"
								alt="logo"
								width={86}
								height={86}
								className="rounded-full shadow-lg"
							/>
						</Link>
					</h1>
					<div className="flex items-center gap-2 mr-4">
						{session?.user ? (
							<DropdownMenu>
								<DropdownMenuTrigger className="focus:outline-none">
									{session.user.image ? (
										<Image
											src={session.user.image}
											alt={session.user.name ?? ""}
											width={24}
											height={24}
											className="rounded-full shadow-lg"
											onError={(e) => {
												e.currentTarget.src = "/images/avatar-placeholder.svg";
											}}
										/>
									) : (
										<UserIcon className="w-6 h-6" />
									)}
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link href="/profile" className="flex items-center gap-2">
											<UserIcon className="w-4 h-4" />
											Profile
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/post/my" className="flex items-center gap-2">
											<VideoIcon className="w-4 h-4" />
											My Videos
										</Link>
									</DropdownMenuItem>
									{session.user.role === "ADMIN" && (
										<DropdownMenuItem asChild>
											<Link href="/admin" className="flex items-center gap-2">
												<LayoutDashboard className="w-4 h-4" />
												Admin
											</Link>
										</DropdownMenuItem>
									)}
									<DropdownMenuItem
										onClick={() => signOut()}
										className="flex items-center gap-2 text-destructive"
									>
										<LogOutIcon className="w-4 h-4" />
										Logout
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Link href="/sign-in" className="text-sm flex items-center gap-2">
								Sign In <LogInIcon className="w-6 h-6" />
							</Link>
						)}
					</div>
				</div>
			</Layout>
		</header>
	);
};
