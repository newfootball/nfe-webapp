import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

export const ExploreHeader = () => {
	return (
		<header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="px-4 py-4">
				<h1 className="text-2xl font-semibold mb-4">Explore</h1>
				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search here"
						className="pl-9 bg-muted border-none"
					/>
				</div>
			</div>
			<Tabs defaultValue="top" className="w-full">
				<TabsList className="w-full justify-between h-auto bg-transparent p-0 px-4">
					<TabsTrigger
						value="top"
						className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
					>
						Top
					</TabsTrigger>
					<TabsTrigger
						value="users"
						className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
					>
						Users
					</TabsTrigger>
					<TabsTrigger
						value="hashtags"
						className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
					>
						Hashtags
					</TabsTrigger>
					<TabsTrigger
						value="posts"
						className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
					>
						Posts
					</TabsTrigger>
					<TabsTrigger
						value="events"
						className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
					>
						Events
					</TabsTrigger>
				</TabsList>
			</Tabs>
		</header>
	);
};
