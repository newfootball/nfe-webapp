import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { getServerEnv } from "./env.server";

// Synthetic, non-authenticated preference: exercises SSR isolation without a backend.
export const getReader = createServerFn({ method: "GET" }).handler(() => {
	getServerEnv();
	setResponseHeader("Cache-Control", "private, no-store");
	const value = getCookie("nfe-shell-reader");
	return value && /^[a-zA-Z0-9_-]{1,40}$/.test(value) ? value : "visitor";
});
export const readerOptions = queryOptions({
	queryKey: ["shell-reader"],
	queryFn: () => getReader(),
});
