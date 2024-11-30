import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Square } from "lucide-react";

export default function Component() {
	const users = [
		{
			id: 1,
			username: "marlio5",
			image: "https://api.dicebear.com/9.x/adventurer/svg?seed=marlio5",
		},
		{
			id: 2,
			username: "lea.98",
			image: "https://api.dicebear.com/9.x/big-ears-neutral/svg?seed=lea.98",
		},
		{
			id: 3,
			username: "loco_cafe",
			image: "https://api.dicebear.com/9.x/big-ears-neutral/svg?seed=loco_cafe",
		},
		{
			id: 4,
			username: "gabriel.g",
			image: "https://api.dicebear.com/9.x/adventurer/svg?seed=gabriel.g",
		},
	];

	const messages = [
		{
			id: 1,
			user: "marlio5",
			image: "https://api.dicebear.com/9.x/adventurer/svg?seed=marlio5",
			message: "You owe me money! Respond!",
			time: "Just now",
		},
		{
			id: 2,
			user: "lea.98",
			image: "https://api.dicebear.com/9.x/big-ears-neutral/svg?seed=lea.98",
			message: "You: I'm afraid he will sue me for that but wh...",
			time: "12 min",
		},
		{
			id: 3,
			user: "gabriel.g",
			image: "https://api.dicebear.com/9.x/adventurer/svg?seed=gabriel.g",
			message: "Hello, can you answer? What's wrong with",
			time: "1 d",
		},
	];

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container p-4">
					<div className="flex justify-between items-center mb-4">
						<h1 className="text-xl font-semibold">Messages</h1>
						<Square className="h-5 w-5" />
					</div>
					<div className="relative mb-4">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search here"
							className="pl-9 bg-muted border-none"
						/>
					</div>
				</div>
			</header>

			<main className="container p-4 flex-grow">
				<ScrollArea className="w-full whitespace-nowrap mb-6">
					<div className="flex gap-4">
						<div className="flex flex-col items-center gap-1">
							<div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
								<Plus className="h-6 w-6 text-muted-foreground" />
							</div>
							<span className="text-xs text-muted-foreground">New</span>
						</div>
						{users.map((user) => (
							<div key={user.id} className="flex flex-col items-center gap-1">
								<Avatar className="w-14 h-14">
									<AvatarImage src={user.image} alt={user.username} />
									<AvatarFallback>{user.username[0]}</AvatarFallback>
								</Avatar>
								<span className="text-xs text-muted-foreground">
									{user.username}
								</span>
							</div>
						))}
					</div>
					<ScrollBar orientation="horizontal" />
				</ScrollArea>

				<Tabs defaultValue="messages" className="w-full mb-6">
					<TabsList className="w-full grid grid-cols-2 h-11 p-1 bg-muted">
						<TabsTrigger
							value="messages"
							className="data-[state=active]:bg-background rounded-sm"
						>
							Messages
						</TabsTrigger>
						<TabsTrigger
							value="favorites"
							className="data-[state=active]:bg-background rounded-sm"
						>
							Favorites
						</TabsTrigger>
					</TabsList>
				</Tabs>

				<div className="space-y-4">
					{messages.map((message) => (
						<div
							key={message.id}
							className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 shadow-sm"
						>
							<Avatar className="w-12 h-12">
								<AvatarImage src={message.image} alt={message.user} />
								<AvatarFallback>{message.user[0]}</AvatarFallback>
							</Avatar>
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">{message.user}</span>
									<span className="text-xs text-muted-foreground whitespace-nowrap">
										{message.time}
									</span>
								</div>
								<p className="text-sm text-muted-foreground truncate">
									{message.message}
								</p>
							</div>
						</div>
					))}
				</div>
			</main>
		</div>
	);
}
