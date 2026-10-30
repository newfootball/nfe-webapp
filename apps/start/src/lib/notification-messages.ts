import type { Locale } from "./messages";
import type { Notification, NotificationType } from "./notification-contract";
export const notificationMessages = {
	fr: {
		title: "Notifications",
		empty: "Aucune notification",
		loading: "Chargement…",
		error: "Impossible de charger les notifications",
		retry: "Réessayer",
		more: "Voir plus",
		mark: "Marquer comme lue",
		all: "Tout marquer comme lu",
		unknown: "Quelqu’un",
		unavailable: "Cible indisponible",
		unread: "Non lues",
	},
	en: {
		title: "Notifications",
		empty: "No notifications",
		loading: "Loading…",
		error: "Unable to load notifications",
		retry: "Retry",
		more: "Load more",
		mark: "Mark as read",
		all: "Mark all as read",
		unknown: "Someone",
		unavailable: "Target unavailable",
		unread: "Unread",
	},
};
const actions: Record<
	Locale,
	Record<NotificationType, (name: string) => string>
> = {
	fr: {
		LIKE: (n) => `${n} a aimé votre publication`,
		COMMENT: (n) => `${n} a commenté votre publication`,
		FOLLOW: (n) => `${n} vous suit`,
		MESSAGE: (n) => `${n} vous a envoyé un message`,
	},
	en: {
		LIKE: (n) => `${n} liked your post`,
		COMMENT: (n) => `${n} commented on your post`,
		FOLLOW: (n) => `${n} started following you`,
		MESSAGE: (n) => `${n} sent you a message`,
	},
};
export function notificationText(
	locale: Locale,
	item: Pick<Notification, "type" | "actor">,
) {
	return actions[locale][item.type](
		item.actor.name ?? notificationMessages[locale].unknown,
	);
}

export function formatNotificationDate(locale: Locale, value: string) {
	return `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
}
