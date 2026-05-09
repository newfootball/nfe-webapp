"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllNotificationsRead } from "@/src/actions/notification.action";

export function MarkAllReadButton({ label }: { label: string }) {
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	const handleClick = () => {
		startTransition(async () => {
			await markAllNotificationsRead();
			router.refresh();
		});
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={isPending}
			className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50 transition-colors"
		>
			{label}
		</button>
	);
}
