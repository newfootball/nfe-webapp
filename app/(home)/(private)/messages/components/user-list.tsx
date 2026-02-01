"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { MessageUser } from "../types";
import { SearchUsersDialog } from "./search-users-dialog";

interface UserListProps {
	users: MessageUser[];
	onUserSelect?: (user: MessageUser) => void;
}

export function UserList({ users }: UserListProps) {
	return (
		<ScrollArea className="w-full whitespace-nowrap mb-6">
			<div className="flex gap-4">
				<div className="flex flex-col items-center gap-1">
					<SearchUsersDialog />
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
	);
}
