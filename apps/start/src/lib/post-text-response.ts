import { createMiddleware } from "@tanstack/react-start";

// Runs before Router's canonical-search redirect, which precedes route loaders
// and their headers. Apply privacy to every response from these private routes.
export const privatePostTextResponse = createMiddleware().server(
	async ({ next }) => {
		const result = await next();
		result.response.headers.set("Cache-Control", "private, no-store");
		const vary = new Set(
			(result.response.headers.get("Vary") ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
		vary.add("Cookie");
		result.response.headers.set("Vary", [...vary].join(", "));
		return result;
	},
);
