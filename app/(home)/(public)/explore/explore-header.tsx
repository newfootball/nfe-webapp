"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const ExploreHeader = () => {
	const t = useTranslations("explore");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [, startTransition] = useTransition();
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	const q = searchParams.get("q") ?? "";
	const tab = searchParams.get("tab") ?? "top";

	const navigateTo = (newQ: string, newTab: string) => {
		const params = new URLSearchParams();
		if (newQ) params.set("q", newQ);
		params.set("tab", newTab);
		startTransition(() => {
			router.replace(`/explore?${params.toString()}`);
		});
	};

	const handleSearchChange = (value: string) => {
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => navigateTo(value, tab), 400);
	};

	return (
		<header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
			<div className="px-4 pt-4 pb-3">
				<h1 className="text-2xl font-semibold mb-3">{t("title")}</h1>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder={t("placeholder")}
						className="pl-9 bg-muted border-none"
						defaultValue={q}
						onChange={(e) => handleSearchChange(e.target.value)}
					/>
				</div>
			</div>

			{q && (
				<Tabs
					value={tab}
					onValueChange={(value) => navigateTo(q, value)}
					className="w-full"
				>
					<TabsList className="w-full justify-between h-auto bg-transparent p-0 px-4">
						<TabsTrigger
							value="top"
							className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
						>
							{t("tabs.top")}
						</TabsTrigger>
						<TabsTrigger
							value="users"
							className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
						>
							{t("tabs.users")}
						</TabsTrigger>
						<TabsTrigger
							value="posts"
							className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
						>
							{t("tabs.posts")}
						</TabsTrigger>
					</TabsList>
				</Tabs>
			)}
		</header>
	);
};
