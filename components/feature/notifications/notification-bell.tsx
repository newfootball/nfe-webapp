"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { getUnreadNotificationCount } from "@/src/query/notification.query";

export function NotificationBell() {
	const { data: count = 0 } = useQuery({
		queryKey: ["notifications-count"],
		queryFn: () => getUnreadNotificationCount(),
		refetchInterval: 30000,
	});

	return (
		<Link
			href="/notifications"
			className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-accent transition-colors"
			aria-label="Notifications"
		>
			<Bell className="h-5 w-5" />
			{count > 0 && (
				<span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
					{count >= 10 ? "9+" : count}
				</span>
			)}
		</Link>
	);
}
