"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Message } from "../types";

interface MessageListProps {
	messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
	const router = useRouter();

	return (
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
					<div
						className="flex-1 min-w-0"
						onClick={() => {
							router.push(`/messages/${message.user}`);
						}}
					>
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
	);
}
