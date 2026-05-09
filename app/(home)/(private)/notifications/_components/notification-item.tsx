"use client";

import {
	Heart,
	MessageCircle,
	MessageSquare,
	UserRoundPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "@/src/actions/notification.action";

type Props = {
	notifId: string;
	link: string | null;
	isUnread: boolean;
	name: string;
	action: string;
	rawContent: string;
	timeAgo: string;
};

function NotificationIcon({ rawContent }: { rawContent: string }) {
	const cls = "h-4 w-4 text-stone-500";
	if (rawContent.includes("aimé")) return <Heart className={cls} />;
	if (rawContent.includes("commenté") || rawContent.includes("commentaire"))
		return <MessageCircle className={cls} />;
	if (rawContent.includes("suit")) return <UserRoundPlus className={cls} />;
	return <MessageSquare className={cls} />;
}

export function NotificationItem({
	notifId,
	link,
	isUnread,
	name,
	action,
	rawContent,
	timeAgo,
}: Props) {
	const router = useRouter();

	const handleClick = async () => {
		if (isUnread) await markNotificationRead(notifId);
		if (link) router.push(link);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className={`relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 overflow-hidden text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
				isUnread
					? "bg-white border-transparent shadow-sm"
					: "bg-stone-50 border-stone-100"
			}`}
		>
			{isUnread && (
				<div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl" />
			)}

			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100">
				<NotificationIcon rawContent={rawContent} />
			</div>

			<div className="flex-1 min-w-0">
				<p
					className={`text-sm font-semibold leading-tight ${isUnread ? "text-stone-900" : "text-stone-400"}`}
				>
					{name}
				</p>
				{action && (
					<p
						className={`text-sm leading-tight mt-0.5 ${isUnread ? "text-stone-600" : "text-stone-400"}`}
					>
						{action}
					</p>
				)}
			</div>

			<div className="flex flex-col items-end gap-1.5 shrink-0">
				<span
					className={`text-xs font-medium tabular-nums ${isUnread ? "text-amber-600" : "text-stone-300"}`}
				>
					{timeAgo}
				</span>
				{isUnread && <div className="h-2 w-2 rounded-full bg-primary" />}
			</div>
		</button>
	);
}
