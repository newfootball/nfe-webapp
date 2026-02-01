"use client";

import { Plus, Search } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { searchUsers } from "../actions/search-users.action";
import type { MessageUser } from "../types";

export function SearchUsersDialog() {
	const [searchQuery, setSearchQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [searchResults, setSearchResults] = useState<MessageUser[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const router = useRouter();

	const handleSearch = async (query: string) => {
		setSearchQuery(query);
		setIsSearching(true);

		try {
			const results = await searchUsers(query);
			setSearchResults(results);
		} catch (error) {
			console.error("Erreur lors de la recherche:", error);
			setSearchResults([]);
		} finally {
			setIsSearching(false);
		}
	};

	const handleUserSelect = (user: MessageUser) => {
		setIsOpen(false);
		router.push(`/messages/${user.id}`);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center"
				>
					<Plus className="h-6 w-6 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Rechercher des utilisateurs</DialogTitle>
				</DialogHeader>
				<div className="relative">
					<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un utilisateur..."
						className="pl-8"
						value={searchQuery}
						onChange={(e) => handleSearch(e.target.value)}
					/>
				</div>
				<ScrollArea className="h-[300px] mt-4">
					{isSearching ? (
						<div className="flex items-center justify-center h-full">
							<p className="text-muted-foreground">Recherche en cours...</p>
						</div>
					) : searchResults.length > 0 ? (
						<div className="space-y-2">
							{searchResults.map((user) => (
								<button
									key={user.id}
									className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-lg transition-colors"
									onClick={() => {
										handleUserSelect(user);
									}}
								>
									<Image
										src={user.image}
										alt={user.username}
										width={40}
										height={40}
										className="w-10 h-10 rounded-full"
									/>
									<span>{user.username}</span>
								</button>
							))}
						</div>
					) : searchQuery ? (
						<div className="flex items-center justify-center h-full">
							<p className="text-muted-foreground">Aucun utilisateur trouvé</p>
						</div>
					) : null}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
