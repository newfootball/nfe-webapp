import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readLocale, storeLocale } from "./locale.server";
import { validate } from "./profile-input";
export const getPreferredLocale = createServerFn({ method: "GET" }).handler(
	() => readLocale(),
);
export const setPreferredLocale = createServerFn({ method: "POST" })
	.validator((value: unknown) =>
		validate(z.strictObject({ locale: z.enum(["fr", "en"]) }), value),
	)
	.handler(({ data }) => storeLocale(data));
