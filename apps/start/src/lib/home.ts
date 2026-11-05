import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FeedIdSchema } from "./feed-input";
import { pinFeatured, readBadge, readHome, recordView } from "./home.server";
import { validate } from "./profile-input";

const ViewSchema = z.strictObject({ id: FeedIdSchema });
const PinSchema = z.strictObject({ id: FeedIdSchema.nullable() });
export const getHome = createServerFn({ method: "GET" }).handler(() =>
	readHome(),
);
export const markViewed = createServerFn({ method: "POST" })
	.validator((v: unknown) => validate(ViewSchema, v))
	.handler(({ data }) => recordView(data));
export const setFeatured = createServerFn({ method: "POST" })
	.validator((v: unknown) => validate(PinSchema, v))
	.handler(({ data }) => pinFeatured(data));
// Personalized: cleared with the identity cache like explore suggestions.
export const homeOptions = (locale: string) =>
	queryOptions({
		queryKey: ["home", locale],
		queryFn: async () => {
			const r = await getHome();
			if (!r.ok) throw new Error(r.error);
			return r.value;
		},
		staleTime: 60_000,
		retry: false,
		networkMode: "always",
		refetchOnReconnect: false,
	});
export const getBadge = createServerFn({ method: "GET" }).handler(() =>
	readBadge(),
);
// Signed-in identity for the top bar; signed-out readers resolve to null.
export const badgeOptions = queryOptions({
	queryKey: ["home-badge"],
	queryFn: async () => {
		const r = await getBadge();
		return r.ok ? r.value : null;
	},
	staleTime: 300_000,
	retry: false,
});
