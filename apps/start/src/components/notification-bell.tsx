import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSession } from "../lib/auth";
import type { Locale } from "../lib/messages";
import { notificationOptions } from "../lib/notification";
import { notificationMessages } from "../lib/notification-messages";
export function NotificationBell({ locale }: { locale: Locale }) {
	const session = useQuery({
		queryKey: ["notification-session"],
		queryFn: async ({ signal }) => {
			const r = await getSession();
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
	return (
		<Link to="/$locale/notifications" params={{ locale }}>
			{notificationMessages[locale].title}
			{query.data && (
				<span>
					{notificationMessages[locale].unread}: (
					{query.data.pages[0]?.unread ?? 0})
				</span>
			)}
		</Link>
	);
}
