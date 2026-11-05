import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSession } from "../lib/auth";
import type { Locale } from "../lib/messages";
import { notificationOptions } from "../lib/notification";
import { notificationMessages } from "../lib/notification-messages";
import { Icon } from "./home/icon";
export function NotificationBell({ locale }: { locale: Locale }) {
	const session = useQuery({
		queryKey: ["notification-session"],
		queryFn: async ({ signal }) => {
			const r = await getSession({ signal });
			signal.throwIfAborted();
			return r.ok ? r.value : null;
		},
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
	const viewerId = session.data?.id;
	const query = useInfiniteQuery({
		...notificationOptions(viewerId ?? "anonymous"),
		enabled: !!viewerId,
	});
	if (!viewerId) return null;
	const t = notificationMessages[locale],
		unread = query.data?.pages[0]?.unread ?? 0;
	return (
		<Link
			to="/$locale/notifications"
			params={{ locale }}
			aria-label={query.data ? `${t.title}, ${t.unread}: ${unread}` : t.title}
			className="relative text-foreground/80 transition-colors hover:text-foreground"
		>
			<Icon name="bell" className="size-[22px]" />
			{unread > 0 && (
				<span
					aria-hidden="true"
					className="absolute min-w-4 rounded-full px-1 text-center leading-4 font-semibold bg-primary text-[10px] text-primary-foreground -top-1 -right-1.5 tabular-nums"
				>
					{unread > 9 ? "9+" : unread}
				</span>
			)}
		</Link>
	);
}
