import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { markNotifications, readNotifications } from "./notification.server";
import {
	validateNotificationMark,
	validateNotificationPage,
} from "./notification-input";
export const getNotifications = createServerFn({ method: "GET" })
	.validator(validateNotificationPage)
	.handler(({ data }) => readNotifications(data));
export const setNotificationsRead = createServerFn({ method: "POST" })
	.validator(validateNotificationMark)
	.handler(({ data }) => markNotifications(data));
export const notificationOptions = (viewerId: string) =>
	infiniteQueryOptions({
		queryKey: ["notifications", viewerId],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam, signal }) => {
			const r = await getNotifications({
				data: { viewerId, cursor: pageParam },
			});
			signal.throwIfAborted();
			if (!r.ok) throw new Error(r.error);
			if (r.value.viewerId !== viewerId) throw new Error("forbidden");
			return r.value;
		},
		getNextPageParam: (p) => p.nextCursor,
		staleTime: 0,
		gcTime: 0,
		retry: false,
	});
