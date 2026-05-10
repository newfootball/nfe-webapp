"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getUnreadNotificationCount } from "@/src/query/notification.query";

export function NotificationBell() {
	const { data: count = 0 } = useQuery({
		queryKey: ["notifications-count"],
		queryFn: () => getUnreadNotificationCount(),
		refetchInterval: 30000,
	});

	const prevCountRef = useRef(count);
	const [isWiggling, setIsWiggling] = useState(false);

	useEffect(() => {
		if (count > prevCountRef.current) {
			setIsWiggling(true);
			const t = setTimeout(() => setIsWiggling(false), 600);
			return () => clearTimeout(t);
		}
		prevCountRef.current = count;
	}, [count]);

	return (
		<Link
			href="/notifications"
			className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-accent transition-colors"
			aria-label="Notifications"
		>
			<motion.div
				animate={
					isWiggling
						? { rotate: [0, -18, 18, -12, 12, -6, 6, 0] }
						: { rotate: 0 }
				}
				transition={{ duration: 0.55, ease: "easeInOut" }}
			>
				<Bell className="h-5 w-5" />
			</motion.div>

			<AnimatePresence>
				{count > 0 && (
					<motion.span
						key="badge"
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0 }}
						transition={{ type: "spring", stiffness: 500, damping: 20 }}
						className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
					>
						{count >= 10 ? "9+" : count}
					</motion.span>
				)}
			</AnimatePresence>
		</Link>
	);
}
