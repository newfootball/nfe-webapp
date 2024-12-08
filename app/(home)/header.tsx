"use client";

import { LogInIcon, UserIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

export const Header = () => {
	const { data: session } = useSession();

	return (
		<header className="w-full border-b border-border shadow-sm px-2">
			<div className="flex items-center justify-between max-w-5xl w-full mx-auto h-16 py-2">
				<h1 className="flex-1">
					<Link href="/">
						<Image
							src="/logo.svg"
							alt="logo"
							width={72}
							height={72}
							className="absolute left-2 top-2 z-50 rounded-full shadow-lg"
						/>
					</Link>
				</h1>
				<div className="flex items-center gap-2 mr-4">
					{session?.user ? (
						<Link href="/profile">
							<UserIcon className="w-6 h-6" />
						</Link>
					) : (
						<Link href="/sign-in" className="text-sm flex items-center gap-2">
							Sign In <LogInIcon className="w-6 h-6" />
						</Link>
					)}
				</div>
			</div>
		</header>
	);
};
