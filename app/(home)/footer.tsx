"use client";

import { Layout } from "@/components/layouts/layout";
import { Home, MessageSquare, Plus, Search, User } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type NavItemProps = {
	href: string;
	icon: React.ReactNode;
	label: string;
	className?: string;
};

const NavItem = ({ href, icon, label, className = "" }: NavItemProps) => (
	<li className="flex justify-center">
		<Link
			href={href}
			className={`flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors ${className}`}
		>
			{icon}
			<span className="text-xs">{label}</span>
		</Link>
	</li>
);

const CreatePostButton = () => (
	<li className="flex justify-center relative">
		<Link
			href="/post/new"
			className="flex flex-col items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-primary rounded-full shadow-md hover:bg-primary/90 transition-colors absolute -top-12 md:-top-14"
		>
			<Plus className="h-6 w-6 text-primary-foreground" />
		</Link>
	</li>
);

export const Footer = () => {
	const t = useTranslations("footer");
	const { data: session } = useSession();

	const navItems = [
		{ href: "/", icon: <Home className="h-6 w-6" />, label: t("home") },
		{
			href: "/explore",
			icon: <Search className="h-6 w-6" />,
			label: t("search"),
		},
		{
			href: "/messages",
			icon: <MessageSquare className="h-6 w-6" />,
			label: t("messages"),
		},
		{
			href: session?.user ? "/profile" : "/sign-in",
			icon: <User className="h-6 w-6" />,
			label: session?.user ? t("profile") : t("sign-in"),
		},
	];

	return (
		<footer className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t h-20 md:h-20 pb-4 shadow-sm">
			<Layout>
				<nav className="h-full px-4 relative">
					<ul className="grid grid-cols-5 items-center h-full w-full">
						{navItems.slice(0, 2).map((item, index) => (
							<NavItem key={index} {...item} />
						))}
						<CreatePostButton />
						{navItems.slice(2).map((item, index) => (
							<NavItem key={index + 2} {...item} />
						))}
					</ul>
				</nav>
			</Layout>
		</footer>
	);
};
