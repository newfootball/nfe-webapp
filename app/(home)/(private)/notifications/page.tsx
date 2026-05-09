import { MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { getSession } from "@/src/lib/auth-server";
import { getNotifications } from "@/src/query/notification.query";
import { MarkAllReadButton } from "./_components/mark-all-read-button";
import { NotificationItem } from "./_components/notification-item";

function splitContent(content: string): { name: string; action: string } {
	const m = content.match(/^(.*?)\s+((?:a |te |t'a ).*)$/);
	if (m?.[1] && m[2]) return { name: m[1], action: m[2] };
	return { name: content, action: "" };
}

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}j`;
}

export default async function NotificationsPage() {
	const session = await getSession();

	if (!session?.user?.id) {
		redirect("/sign-in");
	}

	const t = await getTranslations("notifications");
	const notifications = await getNotifications();
	const unreadCount = notifications.filter((n) => !n.readAt).length;

	return (
		<Layout>
			<div className="py-4">
				<div className="flex items-center justify-between mb-5">
					<h1 className="font-oswald text-2xl font-bold tracking-wide uppercase">
						{t("title")}
					</h1>
					<div className="flex items-center gap-3">
						{unreadCount > 0 && (
							<>
								<MarkAllReadButton label={t("mark-all-read")} />
								<span className="text-xs font-semibold bg-primary text-primary-foreground px-2.5 py-1 rounded-full">
									{t("unread-count", { count: unreadCount })}
								</span>
							</>
						)}
					</div>
				</div>

				{notifications.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
						<MessageCircle className="h-10 w-10" />
						<p className="text-sm">{t("empty")}</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{notifications.map((notif) => {
							const { name, action } = splitContent(notif.content);
							return (
								<NotificationItem
									key={notif.id}
									notifId={notif.id}
									link={notif.link}
									isUnread={!notif.readAt}
									name={name}
									action={action}
									rawContent={notif.content}
									timeAgo={timeAgo(new Date(notif.createdAt))}
								/>
							);
						})}
					</div>
				)}
			</div>
		</Layout>
	);
}
