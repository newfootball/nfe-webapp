import { Bell } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Layout } from "@/components/layouts/layout";
import { markAllNotificationsRead } from "@/src/actions/notification.action";
import { getSession } from "@/src/lib/auth-server";
import { getNotifications } from "@/src/query/notification.query";

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

export default async function NotificationsPage() {
	const session = await getSession();

	if (!session?.user?.id) {
		redirect("/sign-in");
	}

	const t = await getTranslations("notifications");
	const notifications = await getNotifications();

	await markAllNotificationsRead();

	return (
		<Layout>
			<div className="py-4">
				<h1 className="text-xl font-bold mb-6">{t("title")}</h1>

				{notifications.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
						<Bell className="h-10 w-10" />
						<p className="text-sm">{t("empty")}</p>
					</div>
				) : (
					<div className="space-y-1">
						{notifications.map((notif) => (
							<div
								key={notif.id}
								className={`flex items-start gap-3 p-3 rounded-lg ${!notif.readAt ? "bg-accent/40" : ""}`}
							>
								<div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
									<Bell className="h-4 w-4 text-muted-foreground" />
								</div>
								<div className="flex-1 min-w-0">
									{notif.link ? (
										<Link
											href={notif.link}
											className="text-sm hover:underline line-clamp-2"
										>
											{notif.content}
										</Link>
									) : (
										<p className="text-sm line-clamp-2">{notif.content}</p>
									)}
									<p className="text-xs text-muted-foreground mt-0.5">
										{timeAgo(new Date(notif.createdAt))}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</Layout>
	);
}
