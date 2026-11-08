import { createServerFn } from "@tanstack/react-start";
import { googleAvailable } from "./oauth.server";
export const getGoogleAvailability = createServerFn({ method: "GET" }).handler(
	() => googleAvailable(),
);
