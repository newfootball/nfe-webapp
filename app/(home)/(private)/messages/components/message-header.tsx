import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function MessageHeader() {
	return (
		<header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container p-4">
				<div className="flex justify-between items-center mb-4">
					<h1 className="text-xl font-semibold">Messages</h1>
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
	);
}
